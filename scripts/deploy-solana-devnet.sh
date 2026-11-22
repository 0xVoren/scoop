#!/usr/bin/env bash
# Scoop Solana: deploy .so to devnet + initialize Config/PendingDraws.
#
# Prerequisites (outside this repo / Agent Store):
#   - solana CLI ≥ 2.1, funded authority keypair (≥ ~3.5 SOL recommended)
#   - programs/target/deploy/scoop.so + scoop-keypair.json
#
# Secrets: pass keypair PATHS via env. Never paste private keys into files under the store.
#
# Usage:
#   export SOLANA_AUTHORITY_KEYPAIR=~/.config/solana/id.json   # funded
#   bash scripts/deploy-solana-devnet.sh
#
# Optional:
#   SOLANA_RPC_URL=https://api.devnet.solana.com
#   SOLANA_PROGRAM_ID=FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT
#   FEE_RECIPIENT=<base58 pubkey>     # default = authority
#   SKIP_INITIALIZE=1                 # deploy only
#   DRY_RUN=1                         # print plan, no txs

set -euo pipefail

export PATH="${HOME}/.local/share/solana/install/active_release/bin:${HOME}/.avm/bin:${PATH}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROGRAM_DIR="$ROOT/programs"
SO="${SCOOP_SO:-$PROGRAM_DIR/target/deploy/scoop.so}"
KP="${SCOOP_KEYPAIR:-$PROGRAM_DIR/target/deploy/scoop-keypair.json}"
PROGRAM_ID="${SOLANA_PROGRAM_ID:-FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT}"
RPC="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
AUTH_KP="${SOLANA_AUTHORITY_KEYPAIR:-$HOME/.config/solana/id.json}"
EXPLORER_CLUSTER="${SOLANA_EXPLORER_CLUSTER:-devnet}"
WORKDIR="${SCOOP_E2E_WORKDIR:-/tmp/scoop-e2e-work}"

need() { command -v "$1" >/dev/null || { echo "missing: $1"; exit 1; }; }
need solana
need solana-keygen
need node
need pnpm

[[ -f "$SO" ]] || { echo "missing $SO — build with cargo-build-sbf first"; exit 1; }
[[ -f "$KP" ]] || { echo "missing $KP"; exit 1; }
[[ -f "$AUTH_KP" ]] || {
  echo "missing authority keypair: $AUTH_KP"
  echo "Create outside the store, fund on https://faucet.solana.com (devnet), then re-run."
  echo "  solana-keygen new -o ~/.config/solana/id.json"
  exit 1
}

KP_PUB="$(solana-keygen pubkey "$KP")"
AUTH_PUB="$(solana-keygen pubkey "$AUTH_KP")"
FEE_RECIPIENT="${FEE_RECIPIENT:-$AUTH_PUB}"

if [[ "$KP_PUB" != "$PROGRAM_ID" ]]; then
  echo "warning: keypair pubkey ($KP_PUB) != SOLANA_PROGRAM_ID ($PROGRAM_ID)"
  echo "         using keypair pubkey as program id"
  PROGRAM_ID="$KP_PUB"
fi

echo "== Scoop Solana deploy =="
echo "rpc=$RPC"
echo "program_id=$PROGRAM_ID"
echo "authority=$AUTH_PUB"
echo "fee_recipient=$FEE_RECIPIENT"
echo "so=$SO"

solana config set --url "$RPC" >/dev/null
solana config set --keypair "$AUTH_KP" >/dev/null

BAL="$(solana balance "$AUTH_PUB" --url "$RPC" 2>/dev/null | awk '{print $1}')"
echo "authority_balance=${BAL:-?} SOL"

PROGRAM_ON_CHAIN=0
if solana program show "$PROGRAM_ID" --url "$RPC" >/dev/null 2>&1; then
  PROGRAM_ON_CHAIN=1
fi

# Fresh deploy needs ~3.5 SOL; initialize-only after deploy needs a smaller buffer.
if [[ "$PROGRAM_ON_CHAIN" == "1" ]]; then
  MIN_SOL="${MIN_DEPLOY_SOL:-0.05}"
else
  MIN_SOL="${MIN_DEPLOY_SOL:-3.5}"
fi
if [[ -n "${BAL:-}" ]] && awk "BEGIN{exit !($BAL < $MIN_SOL)}"; then
  echo "BLOCKER: authority has ${BAL} SOL; need ≥ ${MIN_SOL} SOL for $([[ $PROGRAM_ON_CHAIN == 1 ]] && echo initialize || echo program deploy + initialize)."
  echo "Fund $AUTH_PUB on $EXPLORER_CLUSTER (faucet.solana.com), then re-run."
  echo "Explorer: https://explorer.solana.com/address/${AUTH_PUB}?cluster=${EXPLORER_CLUSTER}"
  if [[ "${DRY_RUN:-0}" != "1" && "${FORCE_DEPLOY:-0}" != "1" ]]; then
    exit 2
  fi
fi

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "DRY_RUN=1 — skipping deploy/initialize"
  exit 0
fi

DEPLOY_SIG=""
if [[ "$PROGRAM_ON_CHAIN" == "1" ]]; then
  echo "program $PROGRAM_ID already on cluster — skipping deploy"
else
  echo "deploying $SO → $PROGRAM_ID …"
  # Capture output; last signature line varies by CLI version
  DEPLOY_OUT="$(solana program deploy "$SO" \
    --program-id "$KP" \
    --url "$RPC" \
    --keypair "$AUTH_KP" 2>&1)"
  echo "$DEPLOY_OUT"
  DEPLOY_SIG="$(echo "$DEPLOY_OUT" | grep -Eo '[1-9A-HJ-NP-Za-km-z]{64,88}' | tail -1 || true)"
fi

echo "program_show:"
solana program show "$PROGRAM_ID" --url "$RPC" || true
echo "program_explorer=https://explorer.solana.com/address/${PROGRAM_ID}?cluster=${EXPLORER_CLUSTER}"
[[ -n "$DEPLOY_SIG" ]] && echo "deploy_sig_explorer=https://explorer.solana.com/tx/${DEPLOY_SIG}?cluster=${EXPLORER_CLUSTER}"

if [[ "${SKIP_INITIALIZE:-0}" == "1" ]]; then
  echo "SKIP_INITIALIZE=1 — done after deploy"
  exit 0
fi

# Stage keeper deps for initialize ix (same workdir pattern as local e2e)
mkdir -p "$WORKDIR/scripts" "$WORKDIR/src"
cp -a "$ROOT/keeper/package.json" "$WORKDIR/"
cp -a "$ROOT/keeper/src/." "$WORKDIR/src/"
cp -a "$ROOT/scripts/initialize-solana.ts" "$WORKDIR/scripts/"
# macOS BSD sed needs `sed -i ''`; GNU sed accepts `sed -i`.
if sed --version >/dev/null 2>&1; then
  sed -i "s|from '../keeper/src/solana/index'|from '../src/solana/index'|" \
    "$WORKDIR/scripts/initialize-solana.ts"
else
  sed -i '' "s|from '../keeper/src/solana/index'|from '../src/solana/index'|" \
    "$WORKDIR/scripts/initialize-solana.ts"
fi
if [[ ! -d "$WORKDIR/node_modules/@solana/web3.js" ]]; then
  (cd "$WORKDIR" && pnpm install --store-dir /tmp/pnpm-store)
fi

echo "running initialize (idempotent if Config PDA exists)…"
cd "$WORKDIR"
SOLANA_RPC_URL="$RPC" \
SOLANA_PROGRAM_ID="$PROGRAM_ID" \
SOLANA_AUTHORITY_KEYPAIR="$AUTH_KP" \
FEE_RECIPIENT="$FEE_RECIPIENT" \
  pnpm exec tsx scripts/initialize-solana.ts

echo "== deploy script finished =="
echo "Next: bash scripts/e2e-solana-devnet.sh   # requires funded authority"
echo "Web:  NEXT_PUBLIC_SOLANA_CLUSTER=devnet NEXT_PUBLIC_SOLANA_PROGRAM_ID=$PROGRAM_ID"
echo "Keeper: KEEPER_CHAIN=solana SOLANA_RPC_URL=$RPC SOLANA_PROGRAM_ID=$PROGRAM_ID"
