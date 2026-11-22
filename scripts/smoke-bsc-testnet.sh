#!/usr/bin/env bash
# Scoop EVM: BSC testnet smoke — createRaffle (BNB) → buyShares(1).
#
# Usage:
#   export PRIVATE_KEY=0x...
#   export DIAMOND_ADDRESS=0x...
#   export BSC_TESTNET_RPC_URL=https://bsc-testnet-rpc.publicnode.com
#   bash scripts/smoke-bsc-testnet.sh
#
# Launch locks: totalShares=11, pricePerShare=prize/10, drawDelayBlocks=5.
# Default prize = 0.001 tBNB (override with PRIZE_WEI).

set -euo pipefail

export PATH="${HOME}/.foundry/bin:${PATH}"

RPC="${BSC_TESTNET_RPC_URL:-${BSC_RPC:-https://bsc-testnet-rpc.publicnode.com}}"
D="${DIAMOND_ADDRESS:?set DIAMOND_ADDRESS}"
[[ -n "${PRIVATE_KEY:-}" ]] || { echo "BLOCKER: set PRIVATE_KEY"; exit 2; }

ADDR="$(cast wallet address --private-key "$PRIVATE_KEY")"
ZERO=0x0000000000000000000000000000000000000000
PRIZE="${PRIZE_WEI:-1000000000000000}"   # 0.001 ether
PRICE=$(( PRIZE / 10 ))
DEADLINE=$(( $(date +%s) + 86400 ))

echo "== smoke BSC testnet =="
echo "diamond=$D rpc=$RPC deployer=$ADDR"
echo "prize=$PRIZE price=$PRICE"

OWNER="$(cast call "$D" "owner()(address)" --rpc-url "$RPC")"
echo "owner=$OWNER"
NEXT_BEFORE="$(cast call "$D" "nextOrderId()(uint256)" --rpc-url "$RPC")"

CREATE_JSON="$(cast send "$D" "createRaffle(address,address,uint128,uint128,uint32,uint64,uint32)" \
  "$ZERO" "$ZERO" "$PRIZE" "$PRICE" 11 "$DEADLINE" 5 \
  --value "$PRIZE" --private-key "$PRIVATE_KEY" --rpc-url "$RPC" --json)"
CREATE_TX="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["transactionHash"])' <<<"$CREATE_JSON")"
OID=$(( $(cast call "$D" "nextOrderId()(uint256)" --rpc-url "$RPC") - 1 ))
echo "create_tx=$CREATE_TX orderId=$OID explorer=https://testnet.bscscan.com/tx/$CREATE_TX"

BUY_JSON="$(cast send "$D" "buyShares(uint256,uint32)" "$OID" 1 --value "$PRICE" \
  --private-key "$PRIVATE_KEY" --rpc-url "$RPC" --json)"
BUY_TX="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["transactionHash"])' <<<"$BUY_JSON")"
SOLD="$(cast call "$D" \
  "getRaffle(uint256)(address,address,address,uint128,uint128,uint32,uint32,uint64,uint32,uint64,uint64,uint32,uint32,uint32,uint8,bool,bool,bool)" \
  "$OID" --rpc-url "$RPC" | sed -n '7p' | awk '{print $1}')"
COUNT="$(cast call "$D" "shareCount(uint256,address)(uint32)" "$OID" "$ADDR" --rpc-url "$RPC")"

echo "buy_tx=$BUY_TX soldShares=$SOLD shareCount=$COUNT"
echo "explorer_buy=https://testnet.bscscan.com/tx/$BUY_TX"
test "$SOLD" = "1"
test "$COUNT" = "1"
echo "OK create→buy smoke (orderId=$OID; nextOrderId was $NEXT_BEFORE)"
