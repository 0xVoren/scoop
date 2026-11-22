#!/usr/bin/env bash
# Scoop EVM: deploy Diamond to BSC testnet (chainId 97) via DeployScoopDiamond.s.sol.
#
# Secrets: pass PRIVATE_KEY via env (never commit / never write into Agent Store).
#
# Usage:
#   export PRIVATE_KEY=0x...                 # funded tBNB deployer
#   export BSC_TESTNET_RPC_URL=https://bsc-testnet-rpc.publicnode.com
#   bash scripts/deploy-bsc-testnet.sh
#
# Optional: FEE_RECIPIENT=0x...  DRY_RUN=1

set -euo pipefail

export PATH="${HOME}/.foundry/bin:${PATH}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC="${BSC_TESTNET_RPC_URL:-${BSC_RPC:-https://bsc-testnet-rpc.publicnode.com}}"

need() { command -v "$1" >/dev/null || { echo "missing: $1"; exit 1; }; }
need forge
need cast

[[ -n "${PRIVATE_KEY:-}" ]] || {
  echo "BLOCKER: set PRIVATE_KEY (0x + 64 hex) in the environment."
  echo "Do not paste keys into chat or into Agent Store files."
  exit 2
}

ADDR="$(cast wallet address --private-key "$PRIVATE_KEY")"
BAL="$(cast balance "$ADDR" --rpc-url "$RPC" --ether)"
CHAIN="$(cast chain-id --rpc-url "$RPC")"

echo "== Scoop BSC testnet deploy =="
echo "rpc=$RPC"
echo "chainId=$CHAIN"
echo "deployer=$ADDR"
echo "balance=${BAL} tBNB"

if [[ "$CHAIN" != "97" ]]; then
  echo "BLOCKER: expected BSC testnet chainId 97, got $CHAIN"
  exit 2
fi

# Rough floor: deploy script ~0.001 tBNB + buffer for later smoke
MIN_BNB="${MIN_DEPLOY_BNB:-0.01}"
if awk "BEGIN{exit !($BAL < $MIN_BNB)}"; then
  echo "BLOCKER: deployer has ${BAL} tBNB; need ≥ ${MIN_BNB} tBNB."
  echo "Fund $ADDR on BSC testnet (Chapel), then re-run."
  echo "Explorer: https://testnet.bscscan.com/address/${ADDR}"
  exit 2
fi

cd "$ROOT/contracts"

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  forge script script/DeployScoopDiamond.s.sol --rpc-url "$RPC" -vv
  echo "DRY_RUN=1 — not broadcast"
  exit 0
fi

forge script script/DeployScoopDiamond.s.sol --rpc-url "$RPC" --broadcast -vv

BROADCAST="$ROOT/contracts/broadcast/DeployScoopDiamond.s.sol/97/run-latest.json"
if [[ -f "$BROADCAST" ]]; then
  python3 - <<PY
import json
from pathlib import Path
data=json.loads(Path("$BROADCAST").read_text())
diamond=None
diamond_tx=None
for t in data.get("transactions", []):
    if t.get("contractName") == "Diamond":
        diamond = t.get("contractAddress")
        diamond_tx = t.get("hash")
recs=data.get("receipts") or []
block = recs[0].get("blockNumber") if recs else None
if isinstance(block, str) and block.startswith("0x"):
    block = int(block, 16)
print(f"diamond={diamond}")
print(f"diamond_tx={diamond_tx}")
print(f"deploy_block={block}")
print(f"explorer_address=https://testnet.bscscan.com/address/{diamond}")
print(f"explorer_tx=https://testnet.bscscan.com/tx/{diamond_tx}")
PY
fi

echo "Next: bash scripts/smoke-bsc-testnet.sh"
echo "  DIAMOND_ADDRESS=<diamond> PRIVATE_KEY=... BSC_TESTNET_RPC_URL=$RPC"
