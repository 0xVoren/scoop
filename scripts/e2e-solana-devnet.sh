#!/usr/bin/env bash
# Scoop Solana devnet/testnet smoke wrapper (no airdrop).
#
# Prerequisites:
#   1) Program deployed + initialized (scripts/deploy-solana-devnet.sh)
#   2) Funded authority keypair (path via SOLANA_AUTHORITY_KEYPAIR)
#
# Usage:
#   export SOLANA_AUTHORITY_KEYPAIR=~/.config/solana/id.json
#   bash scripts/e2e-solana-devnet.sh
#
# Optional: RUN_KEEPER=1 SKIP_CLAIM=1 SOLANA_RPC_URL=… SOLANA_PROGRAM_ID=…

set -euo pipefail

export PATH="${HOME}/.local/share/solana/install/active_release/bin:${HOME}/.avm/bin:${PATH}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
PROGRAM_ID="${SOLANA_PROGRAM_ID:-FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT}"
AUTH_KP="${SOLANA_AUTHORITY_KEYPAIR:-$HOME/.config/solana/id.json}"
WORKDIR="${SCOOP_E2E_WORKDIR:-/tmp/scoop-e2e-work}"

need() { command -v "$1" >/dev/null || { echo "missing: $1"; exit 1; }; }
need solana
need node
need pnpm

[[ -f "$AUTH_KP" ]] || {
  echo "missing $AUTH_KP — create/fund a keypair outside the Agent Store"
  exit 1
}

if ! solana program show "$PROGRAM_ID" --url "$RPC" >/dev/null 2>&1; then
  echo "BLOCKER: program $PROGRAM_ID not found on $RPC"
  echo "Run: bash scripts/deploy-solana-devnet.sh"
  exit 2
fi

mkdir -p "$WORKDIR/scripts" "$WORKDIR/src"
cp -a "$ROOT/keeper/package.json" "$WORKDIR/"
cp -a "$ROOT/keeper/src/." "$WORKDIR/src/"
cp -a "$ROOT/scripts/e2e-solana-devnet.ts" "$WORKDIR/scripts/"
# Script imports from ../keeper/src → remap like local e2e
if sed --version >/dev/null 2>&1; then
  sed -i "s|from '../keeper/src/solana/index'|from '../src/solana/index'|" \
    "$WORKDIR/scripts/e2e-solana-devnet.ts"
else
  sed -i '' "s|from '../keeper/src/solana/index'|from '../src/solana/index'|" \
    "$WORKDIR/scripts/e2e-solana-devnet.ts"
fi
if [[ ! -d "$WORKDIR/node_modules/@solana/web3.js" ]]; then
  (cd "$WORKDIR" && pnpm install --store-dir /tmp/pnpm-store)
fi

cd "$WORKDIR"
SOLANA_RPC_URL="$RPC" \
SOLANA_PROGRAM_ID="$PROGRAM_ID" \
SOLANA_AUTHORITY_KEYPAIR="$AUTH_KP" \
SOLANA_EXPLORER_CLUSTER="${SOLANA_EXPLORER_CLUSTER:-devnet}" \
RUN_KEEPER="${RUN_KEEPER:-0}" \
SKIP_CLAIM="${SKIP_CLAIM:-0}" \
  pnpm exec tsx scripts/e2e-solana-devnet.ts
