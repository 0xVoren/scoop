#!/usr/bin/env bash
# Scoop Solana local E2E gates (align EVM e2e-local.sh):
#   create/buy/draw/claim + keeper + expire/refund/recover + late-draw clamp + SPL matrix
# See scripts/e2e-solana-local.ts header for the asset matrix.
set -euo pipefail

export PATH="${HOME}/.local/share/solana/install/active_release/bin:${HOME}/.avm/bin:${PATH}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROGRAM_DIR="$ROOT/programs"
SO="${SCOOP_SO:-$PROGRAM_DIR/target/deploy/scoop.so}"
KP="${SCOOP_KEYPAIR:-$PROGRAM_DIR/target/deploy/scoop-keypair.json}"
PROGRAM_ID="${SOLANA_PROGRAM_ID:-FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT}"
RPC="${SOLANA_RPC_URL:-http://127.0.0.1:8899}"
LEDGER="${SOLANA_LEDGER:-/tmp/scoop-solana-test-ledger}"
AUTH_KP="${SOLANA_AUTHORITY_KEYPAIR:-$HOME/.config/solana/id.json}"
# Local disk workdir avoids FUSE/Agent-Store issues with node_modules symlinks
WORKDIR="${SCOOP_E2E_WORKDIR:-/tmp/scoop-e2e-work}"
VALIDATOR_PID=""

cleanup() {
  if [[ -n "${VALIDATOR_PID}" ]] && kill -0 "$VALIDATOR_PID" 2>/dev/null; then
    echo "stopping solana-test-validator pid=$VALIDATOR_PID"
    kill "$VALIDATOR_PID" 2>/dev/null || true
    wait "$VALIDATOR_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

need() { command -v "$1" >/dev/null || { echo "missing: $1"; exit 1; }; }
need solana
need solana-test-validator
need solana-keygen
need node
need pnpm

if [[ ! -f "$SO" ]]; then
  echo "missing $SO — build with cargo-build-sbf first"
  exit 1
fi
if [[ ! -f "$KP" ]]; then
  echo "missing $KP"
  exit 1
fi

if [[ ! -f "$AUTH_KP" ]]; then
  mkdir -p "$(dirname "$AUTH_KP")"
  solana-keygen new --no-bip39-passphrase -o "$AUTH_KP" --force >/dev/null
fi

# Stage TS sources + deps on local disk
mkdir -p "$WORKDIR/scripts" "$WORKDIR/src"
cp -a "$ROOT/keeper/package.json" "$WORKDIR/"
cp -a "$ROOT/keeper/src/." "$WORKDIR/src/"
cp -a "$ROOT/scripts/e2e-solana-local.ts" "$WORKDIR/scripts/"
# Script lives next to src/ (not keeper/src). Portable in-place sed (GNU + BSD/macOS).
if sed --version >/dev/null 2>&1; then
  sed -i "s|from '../keeper/src/solana/index'|from '../src/solana/index'|" "$WORKDIR/scripts/e2e-solana-local.ts"
else
  sed -i '' "s|from '../keeper/src/solana/index'|from '../src/solana/index'|" "$WORKDIR/scripts/e2e-solana-local.ts"
fi
# Always refresh package.json; reinstall when web3 or spl-token missing
if [[ ! -d "$WORKDIR/node_modules/@solana/web3.js" ]] \
  || [[ ! -d "$WORKDIR/node_modules/@solana/spl-token" ]]; then
  echo "pnpm install (workdir=$WORKDIR)…"
  (cd "$WORKDIR" && pnpm install --store-dir /tmp/pnpm-store)
fi

rpc_ok() {
  # Agave may return HTTP 400 on getLatestBlockhash until fees stabilize;
  # require health + a successful getSlot before treating RPC as ready.
  local health slot
  health=$(curl -s -m 2 -X POST "$RPC" -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' || true)
  echo "$health" | grep -q '"result":"ok"' || return 1
  slot=$(curl -s -m 2 -X POST "$RPC" -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' || true)
  echo "$slot" | grep -q '"result":' || return 1
  local bh
  bh=$(curl -s -m 2 -X POST "$RPC" -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"getLatestBlockhash","params":[{"commitment":"processed"}]}' || true)
  echo "$bh" | grep -q 'blockhash' || return 1
  return 0
}

program_loaded() {
  local info
  info=$(curl -s -m 3 -X POST "$RPC" -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getAccountInfo\",\"params\":[\"$PROGRAM_ID\",{\"encoding\":\"base64\"}]}" || true)
  echo "$info" | grep -q '"executable":true'
}

# Start / reuse validator
if [[ "${SKIP_VALIDATOR:-0}" != "1" ]]; then
  if rpc_ok; then
    echo "reusing existing validator at $RPC"
  else
    rm -rf "$LEDGER"
    echo "starting solana-test-validator ledger=$LEDGER"
    solana-test-validator \
      --ledger "$LEDGER" \
      --reset \
      --bind-address 127.0.0.1 \
      --rpc-port 8899 \
      --quiet \
      --bpf-program "$PROGRAM_ID" "$SO" \
      >/tmp/scoop-solana-validator.log 2>&1 &
    VALIDATOR_PID=$!
    echo "validator pid=$VALIDATOR_PID (log /tmp/scoop-solana-validator.log)"
    ready=0
    for _ in $(seq 1 180); do
      if rpc_ok; then
        ready=1
        break
      fi
      if ! kill -0 "$VALIDATOR_PID" 2>/dev/null; then
        echo "validator died; log:"
        tail -80 /tmp/scoop-solana-validator.log || true
        exit 1
      fi
      sleep 0.5
    done
    if [[ "$ready" != "1" ]]; then
      echo "validator RPC not ready after wait; log:"
      tail -80 /tmp/scoop-solana-validator.log || true
      exit 1
    fi
  fi
fi

solana config set --url "$RPC" >/dev/null
solana config set --keypair "$AUTH_KP" >/dev/null

# Ensure fee payer funded (CLI airdrop can flake; retry)
AUTH_PUB=$(solana-keygen pubkey "$AUTH_KP")
for _ in $(seq 1 10); do
  if solana balance "$AUTH_PUB" --url "$RPC" 2>/dev/null | grep -q SOL; then
    bal=$(solana balance "$AUTH_PUB" --url "$RPC" 2>/dev/null | awk '{print $1}')
    # rough: need some SOL for txs
    awk "BEGIN{exit !($bal+0 >= 1)}" && break
  fi
  solana airdrop 100 "$AUTH_PUB" --url "$RPC" >/dev/null 2>&1 || true
  sleep 1
done

if program_loaded; then
  echo "program $PROGRAM_ID already on cluster (bpf-program / prior deploy)"
elif [[ "$(solana-keygen pubkey "$KP")" == "$PROGRAM_ID" ]]; then
  echo "deploying $SO → $PROGRAM_ID"
  solana program deploy "$SO" --program-id "$KP" --url "$RPC" --keypair "$AUTH_KP"
else
  echo "ERROR: program $PROGRAM_ID not loaded, and keypair $(solana-keygen pubkey "$KP") does not match PROGRAM_ID" >&2
  echo "Rebuild with matching keypair or start validator with --bpf-program $PROGRAM_ID $SO" >&2
  exit 1
fi

echo "running E2E lifecycle…"
cd "$WORKDIR"
SOLANA_RPC_URL="$RPC" \
SOLANA_PROGRAM_ID="$PROGRAM_ID" \
SOLANA_AUTHORITY_KEYPAIR="$AUTH_KP" \
SOLANA_KEEPER_KEYPAIR="$AUTH_KP" \
  pnpm exec tsx scripts/e2e-solana-local.ts
