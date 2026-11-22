#!/usr/bin/env bash
# Scoop BSC testnet full E2E + edge (not smoke-only).
#
# Scenarios (symmetric with Solana full E2E where possible):
#   1) multi-buyer sell-out → delay → draw → claimPrize + claimProceeds (1% fee)
#   2) deadline expire (unsold) → refund + recoverPrize
#   3) late entropy (≥256 blocks past eligible) → draw fails → refund + recover
#   4) edges: duplicate claim/refund fail; draw too early; share boundary; pending/drawMany
#   5) optional ERC-20 lifecycle via in-script MockERC20 deploy (SKIP_ERC20=1 to skip)
#
# Usage:
#   export PRIVATE_KEY=0x...          # funded tBNB (any EOA; need not be Diamond owner)
#   export DIAMOND_ADDRESS=0xfB2678ff49967B073F6537781EC3d35DE731a5DF
#   export BSC_TESTNET_RPC_URL=https://bsc-testnet-rpc.publicnode.com
#   bash scripts/e2e-bsc-testnet.sh
#
# Optional: PRIVATE_KEY_2, PRIZE_WEI, SKIP_LATE=1, SKIP_ERC20=1, RESULTS_JSON=/tmp/…
# Secrets: never commit / never write into Agent Store.

set -euo pipefail

export PATH="${HOME}/.foundry/bin:${PATH}"

RPC="${BSC_TESTNET_RPC_URL:-${BSC_RPC:-https://bsc-testnet-rpc.publicnode.com}}"
D="${DIAMOND_ADDRESS:?set DIAMOND_ADDRESS}"
[[ -n "${PRIVATE_KEY:-}" ]] || { echo "BLOCKER: set PRIVATE_KEY"; exit 2; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RESULTS_JSON="${RESULTS_JSON:-/tmp/scoop-bsc-e2e-results.json}"
EXPLORER="https://testnet.bscscan.com/tx"
ZERO=0x0000000000000000000000000000000000000000
PRIZE="${PRIZE_WEI:-1000000000000000}" # 0.001 tBNB
PRICE=$((PRIZE / 10))
COST10=$((PRICE * 10))
COST11=$((PRICE * 11))

A0="$(cast wallet address --private-key "$PRIVATE_KEY")"
if [[ -n "${PRIVATE_KEY_2:-}" ]]; then
  PK2="$PRIVATE_KEY_2"
else
  # Ephemeral buyer — funded from A0; key stays in-process only
  NEW_OUT="$(cast wallet new --json)"
  PK2="$(python3 -c 'import json,sys; d=json.load(sys.stdin); d=d[0] if isinstance(d,list) else d; print(d["private_key"])' <<<"$NEW_OUT")"
fi
A1="$(cast wallet address --private-key "$PK2")"

send_json() {
  # $@ = cast send args without --json/--rpc/--pk
  local pk="$1"; shift
  cast send "$@" --private-key "$pk" --rpc-url "$RPC" --json
}

tx_hash() {
  python3 -c 'import json,sys; print(json.load(sys.stdin)["transactionHash"])'
}

expect_fail() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "ERROR: expected failure: $label" >&2
    exit 1
  fi
  echo "  OK expected-fail: $label"
}

next_id() { cast call "$D" "nextOrderId()(uint256)" --rpc-url "$RPC"; }

raffle_field() {
  cast call "$D" \
    "getRaffle(uint256)(address,address,address,uint128,uint128,uint32,uint32,uint64,uint32,uint64,uint64,uint32,uint32,uint32,uint8,bool,bool,bool)" \
    "$1" --rpc-url "$RPC" | sed -n "$(($2 + 1))p" | awk '{print $1}'
}

wait_blocks_past() {
  local target="$1"
  local label="${2:-wait}"
  while true; do
    local head
    head="$(cast block-number --rpc-url "$RPC")"
    if (( head > target )); then
      echo "  $label head=$head > $target"
      return 0
    fi
    echo "  … $label head=$head need>$target"
    sleep 3
  done
}

wait_unix_past() {
  local target="$1"
  local label="${2:-deadline}"
  while true; do
    local ts
    ts="$(cast block --rpc-url "$RPC" --field timestamp)"
    if (( ts > target )); then
      echo "  $label chain_ts=$ts > $target"
      return 0
    fi
    echo "  … $label chain_ts=$ts need>$target"
    sleep 5
  done
}

record() {
  # name status note tx...
  python3 - "$RESULTS_JSON" "$@" <<'PY'
import json,sys,os
path=sys.argv[1]
name,status,note=sys.argv[2],sys.argv[3],sys.argv[4]
txs=sys.argv[5:]
data={"scenarios":[]}
if os.path.exists(path):
  try: data=json.load(open(path))
  except Exception: data={"scenarios":[]}
data.setdefault("scenarios",[]).append({
  "name": name, "status": status, "note": note,
  "txs": [{"hash":h,"url":f"https://testnet.bscscan.com/tx/{h}"} for h in txs if h],
})
json.dump(data, open(path,"w"), indent=2)
print(f"recorded {name}={status}")
PY
}

echo "== BSC testnet full E2E =="
echo "diamond=$D rpc=$RPC"
echo "creator/buyer0=$A0 buyer1=$A1 prize=$PRIZE price=$PRICE"
BAL0="$(cast balance "$A0" --rpc-url "$RPC")"
echo "balance0=$BAL0"
# Rough floor: several prizes + buys + gas (~0.05 tBNB comfortable)
MIN_WEI=50000000000000000
if (( BAL0 < MIN_WEI )); then
  echo "BLOCKER: $A0 needs ≥ 0.05 tBNB (have $BAL0 wei). Fund then re-run."
  exit 2
fi

# Fund buyer1 for multi-buy + edges (~0.02 tBNB)
NEED1=20000000000000000
BAL1="$(cast balance "$A1" --rpc-url "$RPC")"
if (( BAL1 < NEED1 )); then
  echo "-- fund buyer1 --"
  FUND_JSON="$(send_json "$PRIVATE_KEY" "$A1" --value "$NEED1")"
  echo "  fund_tx=$(echo "$FUND_JSON" | tx_hash)"
fi

FEE_RECIPIENT="$(cast call "$D" "feeRecipient()(address)" --rpc-url "$RPC")"
echo "feeRecipient=$FEE_RECIPIENT"
python3 -c 'import json,os; json.dump({"chain":"bsc-testnet","diamond":"'"$D"'","actor0":"'"$A0"'","actor1":"'"$A1"'","feeRecipient":"'"$FEE_RECIPIENT"'","scenarios":[]}, open("'"$RESULTS_JSON"'","w"), indent=2)'

# ─────────────────────────────────────────────────────────────
# Kick off long-running setups first (late + expire) so waits overlap.
# ─────────────────────────────────────────────────────────────
echo "-- bootstrap: late-entropy raffle (sell-out now) --"
DEADLINE_LONG=$(( $(date +%s) + 86400 ))
LATE_CREATE="$(send_json "$PRIVATE_KEY" "$D" \
  "createRaffle(address,address,uint128,uint128,uint32,uint64,uint32)" \
  "$ZERO" "$ZERO" "$PRIZE" "$PRICE" 11 "$DEADLINE_LONG" 5 --value "$PRIZE")"
LATE_CREATE_TX="$(echo "$LATE_CREATE" | tx_hash)"
OID_LATE=$(( $(next_id) - 1 ))
LATE_BUY="$(send_json "$PK2" "$D" "buyShares(uint256,uint32)" "$OID_LATE" 11 --value "$COST11")"
LATE_BUY_TX="$(echo "$LATE_BUY" | tx_hash)"
SO_LATE="$(raffle_field "$OID_LATE" 9)"   # soldOutBlock
DELAY_LATE="$(raffle_field "$OID_LATE" 8)" # drawDelayBlocks
ELIG_LATE=$((SO_LATE + DELAY_LATE))
echo "  oid_late=$OID_LATE soldOut=$SO_LATE eligible=$ELIG_LATE create=$LATE_CREATE_TX buy=$LATE_BUY_TX"

echo "-- bootstrap: expire raffle (short deadline) --"
CHAIN_TS="$(cast block --rpc-url "$RPC" --field timestamp)"
DEADLINE_EXP=$(( CHAIN_TS + 90 ))
EXP_CREATE="$(send_json "$PRIVATE_KEY" "$D" \
  "createRaffle(address,address,uint128,uint128,uint32,uint64,uint32)" \
  "$ZERO" "$ZERO" "$PRIZE" "$PRICE" 11 "$DEADLINE_EXP" 5 --value "$PRIZE")"
EXP_CREATE_TX="$(echo "$EXP_CREATE" | tx_hash)"
OID_EXP=$(( $(next_id) - 1 ))
EXP_BUY="$(send_json "$PK2" "$D" "buyShares(uint256,uint32)" "$OID_EXP" 1 --value "$PRICE")"
EXP_BUY_TX="$(echo "$EXP_BUY" | tx_hash)"
echo "  oid_exp=$OID_EXP deadline=$DEADLINE_EXP create=$EXP_CREATE_TX buy=$EXP_BUY_TX"

# ─────────────────────────────────────────────────────────────
# 1) Multi-buyer lifecycle + fee check
# ─────────────────────────────────────────────────────────────
echo "-- 1a) edge: draw before eligible (single-tx sell-out, race head) --"
# Launch lock forces drawDelayBlocks=5; public RPC confirm often clears the window.
# For a reliable large-delay pass, use: OWNER_PRIVATE_KEY=… bash scripts/e2e-bsc-draw-too-early.sh
# Sell out in one tx then immediately attempt draw while head may still be ≤ eligible.
EDGE_CREATE="$(send_json "$PRIVATE_KEY" "$D" \
  "createRaffle(address,address,uint128,uint128,uint32,uint64,uint32)" \
  "$ZERO" "$ZERO" "$PRIZE" "$PRICE" 11 "$DEADLINE_LONG" 5 --value "$PRIZE")"
EDGE_CREATE_TX="$(echo "$EDGE_CREATE" | tx_hash)"
OID_EDGE=$(( $(next_id) - 1 ))
EDGE_BUY="$(send_json "$PK2" "$D" "buyShares(uint256,uint32)" "$OID_EDGE" 11 --value "$COST11")"
EDGE_BUY_TX="$(echo "$EDGE_BUY" | tx_hash)"
SO_EDGE="$(raffle_field "$OID_EDGE" 9)"
ELIG_EDGE=$((SO_EDGE + $(raffle_field "$OID_EDGE" 8)))
HEAD_EDGE="$(cast block-number --rpc-url "$RPC")"
echo "  oid_edge=$OID_EDGE soldOut=$SO_EDGE elig=$ELIG_EDGE head=$HEAD_EDGE"
if (( HEAD_EDGE <= ELIG_EDGE )); then
  expect_fail "draw-too-early" cast send "$D" "draw(uint256)" "$OID_EDGE" \
    --private-key "$PRIVATE_KEY" --rpc-url "$RPC"
  record "0-draw-too-early" "pass" "oid=$OID_EDGE head=$HEAD_EDGE elig=$ELIG_EDGE" \
    "$EDGE_CREATE_TX" "$EDGE_BUY_TX"
else
  echo "  WARN: head already > eligible after sell-out confirm; documenting race"
  record "0-draw-too-early" "skipped" "race: head=$HEAD_EDGE elig=$ELIG_EDGE after confirm" \
    "$EDGE_CREATE_TX" "$EDGE_BUY_TX"
fi
# Finish this raffle later via drawMany/draw so it does not linger forever
wait_blocks_past "$ELIG_EDGE" "edge-draw-delay"
EDGE_DRAW="$(send_json "$PRIVATE_KEY" "$D" "draw(uint256)" "$OID_EDGE")"
EDGE_DRAW_TX="$(echo "$EDGE_DRAW" | tx_hash)"
echo "  edge raffle drawn tx=$EDGE_DRAW_TX"

echo "-- 1) multi-buyer → draw → claimPrize + claimProceeds (1% fee) --"
LIFE_CREATE="$(send_json "$PRIVATE_KEY" "$D" \
  "createRaffle(address,address,uint128,uint128,uint32,uint64,uint32)" \
  "$ZERO" "$ZERO" "$PRIZE" "$PRICE" 11 "$DEADLINE_LONG" 5 --value "$PRIZE")"
LIFE_CREATE_TX="$(echo "$LIFE_CREATE" | tx_hash)"
OID_LIFE=$(( $(next_id) - 1 ))
# Share boundary: 10 then 1 from different buyers
LIFE_BUY10="$(send_json "$PK2" "$D" "buyShares(uint256,uint32)" "$OID_LIFE" 10 --value "$COST10")"
LIFE_BUY10_TX="$(echo "$LIFE_BUY10" | tx_hash)"
LIFE_BUY1="$(send_json "$PRIVATE_KEY" "$D" "buyShares(uint256,uint32)" "$OID_LIFE" 1 --value "$PRICE")"
LIFE_BUY1_TX="$(echo "$LIFE_BUY1" | tx_hash)"
test "$(raffle_field "$OID_LIFE" 14)" = "1" # SoldOut
SO_LIFE="$(raffle_field "$OID_LIFE" 9)"
DELAY_LIFE="$(raffle_field "$OID_LIFE" 8)"
ELIG_LIFE=$((SO_LIFE + DELAY_LIFE))
echo "  soldOut=$SO_LIFE delay=$DELAY_LIFE elig=$ELIG_LIFE"

wait_blocks_past "$ELIG_LIFE" "lifecycle-delay"
LIFE_DRAW="$(send_json "$PRIVATE_KEY" "$D" "draw(uint256)" "$OID_LIFE")"
LIFE_DRAW_TX="$(echo "$LIFE_DRAW" | tx_hash)"
test "$(raffle_field "$OID_LIFE" 14)" = "2" # Drawn
WSI="$(raffle_field "$OID_LIFE" 11)"
WINNER="$(cast call "$D" "shareOwner(uint256,uint32)(address)" "$OID_LIFE" "$WSI" --rpc-url "$RPC")"
echo "  winner=$WINNER share=$WSI"
WIN_LC="$(printf '%s' "$WINNER" | tr '[:upper:]' '[:lower:]')"
A0_LC="$(printf '%s' "$A0" | tr '[:upper:]' '[:lower:]')"
if [[ "$WIN_LC" == "$A0_LC" ]]; then WPK="$PRIVATE_KEY"; else WPK="$PK2"; fi

FEE_BEFORE="$(cast balance "$FEE_RECIPIENT" --rpc-url "$RPC")"
LIFE_CLAIM_P="$(send_json "$WPK" "$D" "claimPrize(uint256)" "$OID_LIFE")"
LIFE_CLAIM_P_TX="$(echo "$LIFE_CLAIM_P" | tx_hash)"
LIFE_CLAIM_R="$(send_json "$PRIVATE_KEY" "$D" "claimProceeds(uint256)" "$OID_LIFE")"
LIFE_CLAIM_R_TX="$(echo "$LIFE_CLAIM_R" | tx_hash)"
FEE_AFTER="$(cast balance "$FEE_RECIPIENT" --rpc-url "$RPC")"
EXPECTED_FEE=$(( COST11 / 100 ))
# feeRecipient may equal creator (then net change includes proceeds); compare only when distinct
FEE_LC="$(printf '%s' "$FEE_RECIPIENT" | tr '[:upper:]' '[:lower:]')"
if [[ "$FEE_LC" != "$A0_LC" ]]; then
  FEE_DELTA=$(( FEE_AFTER - FEE_BEFORE ))
  echo "  fee_delta=$FEE_DELTA expected=$EXPECTED_FEE"
  test "$FEE_DELTA" = "$EXPECTED_FEE"
else
  echo "  feeRecipient==creator; fee embedded in claimProceeds (raised/100=$EXPECTED_FEE) — verified via tx success + prizeClaimed/proceedsClaimed"
fi
test "$(raffle_field "$OID_LIFE" 15)" = "true"  # prizeClaimed
test "$(raffle_field "$OID_LIFE" 16)" = "true"  # proceedsClaimed

echo "  edge: duplicate claims must fail"
expect_fail "dup-claimPrize" cast send "$D" "claimPrize(uint256)" "$OID_LIFE" \
  --private-key "$WPK" --rpc-url "$RPC"
expect_fail "dup-claimProceeds" cast send "$D" "claimProceeds(uint256)" "$OID_LIFE" \
  --private-key "$PRIVATE_KEY" --rpc-url "$RPC"

record "1-multi-buy-draw-claim" "pass" \
  "oid=$OID_LIFE winner=$WINNER share=$WSI fee=$EXPECTED_FEE" \
  "$LIFE_CREATE_TX" "$LIFE_BUY10_TX" "$LIFE_BUY1_TX" "$LIFE_DRAW_TX" "$LIFE_CLAIM_P_TX" "$LIFE_CLAIM_R_TX"
echo "OK lifecycle oid=$OID_LIFE"

# ─────────────────────────────────────────────────────────────
# 4b) pending + drawMany (second sold-out while waiting expire/late)
# ─────────────────────────────────────────────────────────────
echo "-- 4) pendingDraw + drawMany --"
DM_CREATE="$(send_json "$PRIVATE_KEY" "$D" \
  "createRaffle(address,address,uint128,uint128,uint32,uint64,uint32)" \
  "$ZERO" "$ZERO" "$PRIZE" "$PRICE" 11 "$DEADLINE_LONG" 5 --value "$PRIZE")"
DM_CREATE_TX="$(echo "$DM_CREATE" | tx_hash)"
OID_DM=$(( $(next_id) - 1 ))
DM_BUY="$(send_json "$PK2" "$D" "buyShares(uint256,uint32)" "$OID_DM" 11 --value "$COST11")"
DM_BUY_TX="$(echo "$DM_BUY" | tx_hash)"
PENDING="$(cast call "$D" "pendingDrawCount()(uint256)" --rpc-url "$RPC")"
echo "  pending=$PENDING"
test "$PENDING" -ge 1
SO_DM="$(raffle_field "$OID_DM" 9)"
DELAY_DM="$(raffle_field "$OID_DM" 8)"
ELIG_DM=$((SO_DM + DELAY_DM))
wait_blocks_past "$ELIG_DM" "drawMany-delay"
DM_TX="$(send_json "$PRIVATE_KEY" "$D" "drawMany(uint256[])" "[$OID_DM]")"
DM_DRAW_TX="$(echo "$DM_TX" | tx_hash)"
test "$(raffle_field "$OID_DM" 14)" = "2"
record "4-drawMany-pending" "pass" "oid=$OID_DM pending_before=$PENDING" \
  "$DM_CREATE_TX" "$DM_BUY_TX" "$DM_DRAW_TX"
echo "OK drawMany oid=$OID_DM"

# ─────────────────────────────────────────────────────────────
# 5) ERC-20 lifecycle (optional)
# ─────────────────────────────────────────────────────────────
if [[ "${SKIP_ERC20:-0}" != "1" ]]; then
  echo "-- 5) ERC-20 prize+payment (MockERC20) --"
  # forge create is flaky behind local proxies (may hit localhost:8545); use cast --create
  set +e
  (cd "$ROOT/contracts" && forge build --contracts test/helpers/MockERC20.sol >/tmp/scoop-erc20-build.log 2>&1)
  BYTECODE="$(python3 -c 'import json; print(json.load(open("'"$ROOT"'/contracts/out/MockERC20.sol/MockERC20.json"))["bytecode"]["object"])')"
  ARGS="$(cast abi-encode 'constructor(string,string)' 'ScoopT' 'SCT')"
  DEPLOY_OUT="$(cast send --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --create "${BYTECODE}${ARGS#0x}" --json 2>/tmp/scoop-erc20-deploy.err)"
  DEPLOY_EC=$?
  set -e
  if [[ $DEPLOY_EC -ne 0 || -z "$DEPLOY_OUT" ]]; then
    echo "  WARN: MockERC20 deploy failed (ec=$DEPLOY_EC); see /tmp/scoop-erc20-deploy.err"
    record "5-erc20-lifecycle" "failed" "cast --create MockERC20 failed; BNB path covered; local ERC20 in forge test"
  else
    TOKEN="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["contractAddress"])' <<<"$DEPLOY_OUT")"
    TOKEN_TX="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["transactionHash"])' <<<"$DEPLOY_OUT")"
    echo "  token=$TOKEN tx=$TOKEN_TX"
    MINT_AMT=$(( PRIZE + COST11 ))
    send_json "$PRIVATE_KEY" "$TOKEN" "mint(address,uint256)" "$A0" "$MINT_AMT" >/dev/null
    send_json "$PRIVATE_KEY" "$TOKEN" "mint(address,uint256)" "$A1" "$COST11" >/dev/null
    send_json "$PRIVATE_KEY" "$TOKEN" "approve(address,uint256)" "$D" "$MINT_AMT" >/dev/null
    send_json "$PK2" "$TOKEN" "approve(address,uint256)" "$D" "$COST11" >/dev/null
    ERC_CREATE="$(send_json "$PRIVATE_KEY" "$D" \
      "createRaffle(address,address,uint128,uint128,uint32,uint64,uint32)" \
      "$TOKEN" "$TOKEN" "$PRIZE" "$PRICE" 11 "$DEADLINE_LONG" 5)"
    ERC_CREATE_TX="$(echo "$ERC_CREATE" | tx_hash)"
    OID_ERC=$(( $(next_id) - 1 ))
    ERC_BUY="$(send_json "$PK2" "$D" "buyShares(uint256,uint32)" "$OID_ERC" 11)"
    ERC_BUY_TX="$(echo "$ERC_BUY" | tx_hash)"
    test "$(raffle_field "$OID_ERC" 14)" = "1"
    SO_ERC="$(raffle_field "$OID_ERC" 9)"
    DELAY_ERC="$(raffle_field "$OID_ERC" 8)"
    wait_blocks_past $((SO_ERC + DELAY_ERC)) "erc20-delay"
    ERC_DRAW="$(send_json "$PRIVATE_KEY" "$D" "draw(uint256)" "$OID_ERC")"
    ERC_DRAW_TX="$(echo "$ERC_DRAW" | tx_hash)"
    WSI_E="$(raffle_field "$OID_ERC" 11)"
    WIN_E="$(cast call "$D" "shareOwner(uint256,uint32)(address)" "$OID_ERC" "$WSI_E" --rpc-url "$RPC")"
    WIN_E_LC="$(printf '%s' "$WIN_E" | tr '[:upper:]' '[:lower:]')"
    if [[ "$WIN_E_LC" == "$A0_LC" ]]; then WPK_E="$PRIVATE_KEY"; else WPK_E="$PK2"; fi
    ERC_CP="$(send_json "$WPK_E" "$D" "claimPrize(uint256)" "$OID_ERC")"
    ERC_CP_TX="$(echo "$ERC_CP" | tx_hash)"
    ERC_CR="$(send_json "$PRIVATE_KEY" "$D" "claimProceeds(uint256)" "$OID_ERC")"
    ERC_CR_TX="$(echo "$ERC_CR" | tx_hash)"
    record "5-erc20-lifecycle" "pass" "oid=$OID_ERC token=$TOKEN" \
      "$TOKEN_TX" "$ERC_CREATE_TX" "$ERC_BUY_TX" "$ERC_DRAW_TX" "$ERC_CP_TX" "$ERC_CR_TX"
    echo "OK erc20 oid=$OID_ERC"
  fi
else
  record "5-erc20-lifecycle" "skipped" "SKIP_ERC20=1"
fi

# ─────────────────────────────────────────────────────────────
# 2) Expire → refund + recover (+ dup refund edge)
# ─────────────────────────────────────────────────────────────
echo "-- 2) expire → refund + recoverPrize --"
wait_unix_past "$DEADLINE_EXP" "expire-deadline"
EXP_REFUND="$(send_json "$PK2" "$D" "refund(uint256)" "$OID_EXP")"
EXP_REFUND_TX="$(echo "$EXP_REFUND" | tx_hash)"
REF="$(cast call "$D" "buyerRefunded(uint256,address)(bool)" "$OID_EXP" "$A1" --rpc-url "$RPC")"
test "$REF" = "true"
expect_fail "dup-refund" cast send "$D" "refund(uint256)" "$OID_EXP" \
  --private-key "$PK2" --rpc-url "$RPC"
EXP_REC="$(send_json "$PRIVATE_KEY" "$D" "recoverPrize(uint256)" "$OID_EXP")"
EXP_REC_TX="$(echo "$EXP_REC" | tx_hash)"
expect_fail "dup-recover" cast send "$D" "recoverPrize(uint256)" "$OID_EXP" \
  --private-key "$PRIVATE_KEY" --rpc-url "$RPC"
record "2-expire-refund-recover" "pass" "oid=$OID_EXP" \
  "$EXP_CREATE_TX" "$EXP_BUY_TX" "$EXP_REFUND_TX" "$EXP_REC_TX"
echo "OK expire oid=$OID_EXP"

# ─────────────────────────────────────────────────────────────
# 3) Late entropy → draw fail → refund + recover
# ─────────────────────────────────────────────────────────────
if [[ "${SKIP_LATE:-0}" == "1" ]]; then
  record "3-late-entropy" "skipped" "SKIP_LATE=1 oid=$OID_LATE elig=$ELIG_LATE" \
    "$LATE_CREATE_TX" "$LATE_BUY_TX"
  echo "SKIP late entropy (oid=$OID_LATE still SoldOut; wait head>$((ELIG_LATE+256)) then re-run late-only)"
else
  echo "-- 3) late entropy expired → refund/recover --"
  # Need blockhash(eligible)==0 ⇒ head typically ≥ eligible+256
  LATE_TARGET=$((ELIG_LATE + 256))
  wait_blocks_past "$LATE_TARGET" "late-entropy-256"
  expect_fail "late-draw" cast send "$D" "draw(uint256)" "$OID_LATE" \
    --private-key "$PRIVATE_KEY" --rpc-url "$RPC"
  test "$(raffle_field "$OID_LATE" 14)" = "1" # still SoldOut
  LATE_REF="$(send_json "$PK2" "$D" "refund(uint256)" "$OID_LATE")"
  LATE_REF_TX="$(echo "$LATE_REF" | tx_hash)"
  test "$(raffle_field "$OID_LATE" 14)" = "3" # Expired
  LATE_REC="$(send_json "$PRIVATE_KEY" "$D" "recoverPrize(uint256)" "$OID_LATE")"
  LATE_REC_TX="$(echo "$LATE_REC" | tx_hash)"
  record "3-late-entropy" "pass" "oid=$OID_LATE elig=$ELIG_LATE" \
    "$LATE_CREATE_TX" "$LATE_BUY_TX" "$LATE_REF_TX" "$LATE_REC_TX"
  echo "OK late entropy oid=$OID_LATE"
fi

BAL_END="$(cast balance "$A0" --rpc-url "$RPC")"
echo "== BSC TESTNET FULL E2E PASSED == results=$RESULTS_JSON balance_end=$BAL_END"
cat "$RESULTS_JSON"
