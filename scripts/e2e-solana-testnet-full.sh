#!/usr/bin/env bash
# Scoop Solana devnet/testnet full E2E wrapper (no airdrop).
#
# Usage:
#   export SOLANA_AUTHORITY_KEYPAIR=~/.config/solana/id.json
#   bash scripts/e2e-solana-testnet-full.sh
#
# Optional: SKIP_LATE=1 SKIP_SPL=1 RUN_KEEPER is always on for draw_many gate.

set -euo pipefail

export PATH="${HOME}/.local/share/solana/install/active_release/bin:${HOME}/.avm/bin:${PATH}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
PROGRAM_ID="${SOLANA_PROGRAM_ID:-FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT}"
AUTH_KP="${SOLANA_AUTHORITY_KEYPAIR:-$HOME/.config/solana/id.json}"
WORKDIR="${SCOOP_E2E_WORKDIR:-/tmp/scoop-e2e-work}"
RESULTS_JSON="${RESULTS_JSON:-/tmp/scoop-solana-e2e-results.json}"

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
  exit 2
fi

mkdir -p "$WORKDIR/scripts" "$WORKDIR/src"
cp -a "$ROOT/keeper/package.json" "$WORKDIR/"
cp -a "$ROOT/keeper/src/." "$WORKDIR/src/"
cp -a "$ROOT/scripts/e2e-solana-testnet-full.ts" "$WORKDIR/scripts/"
if sed --version >/dev/null 2>&1; then
  sed -i "s|from '../keeper/src/solana/index'|from '../src/solana/index'|" \
    "$WORKDIR/scripts/e2e-solana-testnet-full.ts"
else
  sed -i '' "s|from '../keeper/src/solana/index'|from '../src/solana/index'|" \
    "$WORKDIR/scripts/e2e-solana-testnet-full.ts"
fi
if [[ ! -d "$WORKDIR/node_modules/@solana/web3.js" ]] \
  || [[ ! -d "$WORKDIR/node_modules/@solana/spl-token" ]]; then
  (cd "$WORKDIR" && pnpm install --store-dir /tmp/pnpm-store)
fi

cd "$WORKDIR"
SOLANA_RPC_URL="$RPC" \
SOLANA_PROGRAM_ID="$PROGRAM_ID" \
SOLANA_AUTHORITY_KEYPAIR="$AUTH_KP" \
SOLANA_EXPLORER_CLUSTER="${SOLANA_EXPLORER_CLUSTER:-devnet}" \
SKIP_LATE="${SKIP_LATE:-0}" \
SKIP_SPL="${SKIP_SPL:-0}" \
RESULTS_JSON="$RESULTS_JSON" \
${SCOOP_PRIZE_LAMPORTS:+SCOOP_PRIZE_LAMPORTS="$SCOOP_PRIZE_LAMPORTS"} \
  pnpm exec tsx scripts/e2e-solana-testnet-full.ts
