#!/usr/bin/env bash
# Scoop local E2E: BNB lifecycle + expire/refund + late draw + keeper drawMany
set -euo pipefail

RPC="${RPC_URL:-http://127.0.0.1:8545}"
D="${DIAMOND_ADDRESS:?set DIAMOND_ADDRESS}"
PK="${PK:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
PK2="${PK2:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}"
A0=$(cast wallet address --private-key "$PK")
A1=$(cast wallet address --private-key "$PK2")
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Launch lock: pricePerShare = prizeAmount / 10
PRICE=100000000000000000    # 0.1 ether
PRIZE=1000000000000000000   # 1 ether
COST10=1000000000000000000  # 10 shares
COST11=1100000000000000000  # full sell-out
ZERO=0x0000000000000000000000000000000000000000

next_id() { cast call "$D" "nextOrderId()(uint256)" --rpc-url "$RPC"; }
raffle_field() {
  # cast prints one return value per line; $2 = 0-based field index
  cast call "$D" \
    "getRaffle(uint256)(address,address,address,uint128,uint128,uint32,uint32,uint64,uint32,uint64,uint64,uint32,uint32,uint32,uint8,bool,bool,bool)" \
    "$1" --rpc-url "$RPC" | sed -n "$(($2 + 1))p" | awk '{print $1}'
}

echo "== block=$(cast block-number --rpc-url "$RPC") diamond=$D =="

echo "-- 1) BNB create → buy → draw → claim --"
DEADLINE=$(( $(date +%s) + 86400 ))
cast send "$D" "createRaffle(address,address,uint128,uint128,uint32,uint64,uint32)" \
  "$ZERO" "$ZERO" "$PRIZE" "$PRICE" 11 "$DEADLINE" 5 \
  --value "$PRIZE" --private-key "$PK" --rpc-url "$RPC" >/dev/null
OID=$(( $(next_id) - 1 ))
echo "orderId=$OID"
cast send "$D" "buyShares(uint256,uint32)" "$OID" 10 --value "$COST10" \
  --private-key "$PK2" --rpc-url "$RPC" >/dev/null
cast send "$D" "buyShares(uint256,uint32)" "$OID" 1 --value "$PRICE" \
  --private-key "$PK" --rpc-url "$RPC" >/dev/null
STATUS=$(raffle_field "$OID" 14)
test "$STATUS" = "1"  # SoldOut
cast rpc anvil_mine 6 --rpc-url "$RPC" >/dev/null
cast send "$D" "draw(uint256)" "$OID" --private-key "$PK" --rpc-url "$RPC" >/dev/null
STATUS=$(raffle_field "$OID" 14)
test "$STATUS" = "2"  # Drawn
WSI=$(raffle_field "$OID" 11)
WINNER=$(cast call "$D" "shareOwner(uint256,uint32)(address)" "$OID" "$WSI" --rpc-url "$RPC")
echo "winner=$WINNER share=$WSI"
WIN_LC=$(printf '%s' "$WINNER" | tr '[:upper:]' '[:lower:]')
A0_LC=$(printf '%s' "$A0" | tr '[:upper:]' '[:lower:]')
if [ "$WIN_LC" = "$A0_LC" ]; then WPK=$PK; else WPK=$PK2; fi
cast send "$D" "claimPrize(uint256)" "$OID" --private-key "$WPK" --rpc-url "$RPC" >/dev/null
cast send "$D" "claimProceeds(uint256)" "$OID" --private-key "$PK" --rpc-url "$RPC" >/dev/null
echo "OK lifecycle"

echo "-- 2) expire refund + buyerRefunded --"
CHAIN_TS=$(cast block --rpc-url "$RPC" --field timestamp)
DEADLINE2=$(( CHAIN_TS + 30 ))
cast send "$D" "createRaffle(address,address,uint128,uint128,uint32,uint64,uint32)" \
  "$ZERO" "$ZERO" "$PRIZE" "$PRICE" 11 "$DEADLINE2" 5 \
  --value "$PRIZE" --private-key "$PK" --rpc-url "$RPC" >/dev/null
OID2=$(( $(next_id) - 1 ))
cast send "$D" "buyShares(uint256,uint32)" "$OID2" 1 --value "$PRICE" \
  --private-key "$PK2" --rpc-url "$RPC" >/dev/null
cast rpc evm_increaseTime 60 --rpc-url "$RPC" >/dev/null
cast rpc evm_mine --rpc-url "$RPC" >/dev/null
cast send "$D" "refund(uint256)" "$OID2" --private-key "$PK2" --rpc-url "$RPC" >/dev/null
REF=$(cast call "$D" "buyerRefunded(uint256,address)(bool)" "$OID2" "$A1" --rpc-url "$RPC")
test "$REF" = "true"
cast send "$D" "recoverPrize(uint256)" "$OID2" --private-key "$PK" --rpc-url "$RPC" >/dev/null
echo "OK refund buyerRefunded=$REF"

echo "-- 3) late entropy expired → refund (no clamp-to-latest) --"
DEADLINE3=$(( $(date +%s) + 86400 ))
cast send "$D" "createRaffle(address,address,uint128,uint128,uint32,uint64,uint32)" \
  "$ZERO" "$ZERO" "$PRIZE" "$PRICE" 11 "$DEADLINE3" 5 \
  --value "$PRIZE" --private-key "$PK" --rpc-url "$RPC" >/dev/null
OID3=$(( $(next_id) - 1 ))
cast send "$D" "buyShares(uint256,uint32)" "$OID3" 11 --value "$COST11" \
  --private-key "$PK2" --rpc-url "$RPC" >/dev/null
cast rpc anvil_mine 500 --rpc-url "$RPC" >/dev/null
# draw must fail (DrawEntropyExpired) — do not use a newer blockhash
if cast send "$D" "draw(uint256)" "$OID3" --private-key "$PK" --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "ERROR: late draw should have reverted" >&2
  exit 1
fi
test "$(raffle_field "$OID3" 14)" = "1"  # still SoldOut
cast send "$D" "refund(uint256)" "$OID3" --private-key "$PK2" --rpc-url "$RPC" >/dev/null
test "$(raffle_field "$OID3" 14)" = "3"  # Expired
cast send "$D" "recoverPrize(uint256)" "$OID3" --private-key "$PK" --rpc-url "$RPC" >/dev/null
echo "OK late entropy → refund"

echo "-- 4) keeper drawMany --"
DEADLINE4=$(( $(date +%s) + 86400 ))
cast send "$D" "createRaffle(address,address,uint128,uint128,uint32,uint64,uint32)" \
  "$ZERO" "$ZERO" "$PRIZE" "$PRICE" 11 "$DEADLINE4" 5 \
  --value "$PRIZE" --private-key "$PK" --rpc-url "$RPC" >/dev/null
OID4=$(( $(next_id) - 1 ))
cast send "$D" "buyShares(uint256,uint32)" "$OID4" 11 --value "$COST11" \
  --private-key "$PK2" --rpc-url "$RPC" >/dev/null
PENDING=$(cast call "$D" "pendingDrawCount()(uint256)" --rpc-url "$RPC")
echo "pending before mine=$PENDING"
test "$PENDING" -ge 1
cast rpc anvil_mine 6 --rpc-url "$RPC" >/dev/null
# Keeper monitor: same logic as keeper/src/tick.ts (pendingDraw → drawMany)
HEAD=$(cast block-number --rpc-url "$RPC")
COUNT=$(cast call "$D" "pendingDrawCount()(uint256)" --rpc-url "$RPC")
READY=()
i=0
while [ "$i" -lt "$COUNT" ]; do
  pair=$(cast call "$D" "pendingDrawAt(uint256)(uint256,uint64)" "$i" --rpc-url "$RPC")
  oid=$(echo "$pair" | sed -n '1p' | awk '{print $1}')
  elig=$(echo "$pair" | sed -n '2p' | awk '{print $1}')
  if [ "$HEAD" -gt "$elig" ]; then READY+=("$oid"); fi
  i=$((i + 1))
done
echo "keeper ready=[${READY[*]}] head=$HEAD"
test "${#READY[@]}" -gt 0
# encode uint256[] for drawMany
ARGS=$(printf '%s,' "${READY[@]}")
ARGS="[${ARGS%,}]"
cast send "$D" "drawMany(uint256[])" "$ARGS" --private-key "$PK" --rpc-url "$RPC" >/dev/null
PENDING2=$(cast call "$D" "pendingDrawCount()(uint256)" --rpc-url "$RPC")
echo "pending after keeper=$PENDING2"
test "$PENDING2" = "0"
# Also exercise TS keeper once (should report not-ready)
cd "$ROOT/keeper"
DIAMOND_ADDRESS="$D" CHAIN=local RPC_URL="$RPC" pnpm tick
echo "OK keeper"

echo "== ALL E2E PASSED =="
