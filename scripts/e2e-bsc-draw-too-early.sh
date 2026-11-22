#!/usr/bin/env bash
# BSC testnet: DrawTooEarly with a large custom drawDelay (avoids delay=5 race on public RPC).
#
# Temporarily unlocks allowCustomDrawDelay via OWNER_PRIVATE_KEY, creates with DRAW_DELAY
# (default 32), single-tx sell-out, expects draw to revert while head <= eligible, then
# restores launch protocol config and finishes the raffle with a normal draw.
#
# Usage:
#   export PRIVATE_KEY=0x...            # funded actor (creator/buyer)
#   export OWNER_PRIVATE_KEY=0x...      # Diamond owner (setProtocolConfig)
#   export DIAMOND_ADDRESS=0xfB2678ff49967B073F6537781EC3d35DE731a5DF
#   export BSC_TESTNET_RPC_URL=https://bsc-testnet-rpc.publicnode.com
#   bash scripts/e2e-bsc-draw-too-early.sh
#
# Optional: DRAW_DELAY=32  RESULTS_JSON=/tmp/scoop-bsc-draw-too-early.json
# Secrets: never commit / never write into Agent Store.

set -euo pipefail

export PATH="${HOME}/.foundry/bin:${PATH}"

RPC="${BSC_TESTNET_RPC_URL:-${BSC_RPC:-https://bsc-testnet-rpc.publicnode.com}}"
D="${DIAMOND_ADDRESS:?set DIAMOND_ADDRESS}"
[[ -n "${PRIVATE_KEY:-}" ]] || { echo "BLOCKER: set PRIVATE_KEY"; exit 2; }
[[ -n "${OWNER_PRIVATE_KEY:-}" ]] || { echo "BLOCKER: set OWNER_PRIVATE_KEY (Diamond owner)"; exit 2; }

RESULTS_JSON="${RESULTS_JSON:-/tmp/scoop-bsc-draw-too-early.json}"
DRAW_DELAY="${DRAW_DELAY:-32}"
ZERO=0x0000000000000000000000000000000000000000
PRIZE="${PRIZE_WEI:-1000000000000000}"
PRICE=$((PRIZE / 10))
COST11=$((PRICE * 11))

A0="$(cast wallet address --private-key "$PRIVATE_KEY")"
OWNER="$(cast wallet address --private-key "$OWNER_PRIVATE_KEY")"
ONCHAIN_OWNER="$(cast call "$D" "owner()(address)" --rpc-url "$RPC")"
OWNER_LC="$(printf '%s' "$OWNER" | tr '[:upper:]' '[:lower:]')"
ONCHAIN_LC="$(printf '%s' "$ONCHAIN_OWNER" | tr '[:upper:]' '[:lower:]')"
if [[ "$OWNER_LC" != "$ONCHAIN_LC" ]]; then
  echo "BLOCKER: OWNER_PRIVATE_KEY address $OWNER != on-chain owner $ONCHAIN_OWNER"
  exit 2
fi

send_json() {
  local pk="$1"; shift
  cast send "$@" --private-key "$pk" --rpc-url "$RPC" --json
}
tx_hash() { python3 -c 'import json,sys; print(json.load(sys.stdin)["transactionHash"])'; }
next_id() { cast call "$D" "nextOrderId()(uint256)" --rpc-url "$RPC"; }
raffle_field() {
  cast call "$D" \
    "getRaffle(uint256)(address,address,address,uint128,uint128,uint32,uint32,uint64,uint32,uint64,uint64,uint32,uint32,uint32,uint8,bool,bool,bool)" \
    "$1" --rpc-url "$RPC" | sed -n "$(($2 + 1))p" | awk '{print $1}'
}

expect_fail() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "ERROR: expected failure: $label" >&2
    exit 1
  fi
  echo "  OK expected-fail: $label"
}

wait_blocks_past() {
  local target="$1"
  while true; do
    local head
    head="$(cast block-number --rpc-url "$RPC")"
    if (( head > target )); then
      return 0
    fi
    echo "  waiting head=$head target>$target"
    sleep 3
  done
}

restore_launch_config() {
  # Launch locks: all allow_*=false, shares=11, divisor=10, delay=5
  send_json "$OWNER_PRIVATE_KEY" "$D" \
    "setProtocolConfig((bool,bool,bool,bool,uint32,uint32,uint32))" \
    "(false,false,false,false,11,10,5)" >/dev/null
  echo "  restored launch protocolConfig"
}

python3 -c 'import json; json.dump({"chain":"bsc-testnet","scenario":"0-draw-too-early","diamond":"'"$D"'","drawDelay":'"$DRAW_DELAY"',"txs":[]}, open("'"$RESULTS_JSON"'","w"), indent=2)'

echo "== BSC draw-too-early (DRAW_DELAY=$DRAW_DELAY) =="
echo "diamond=$D actor=$A0 owner=$OWNER"

echo "-- unlock allowCustomDrawDelay --"
UNLOCK_TX="$(send_json "$OWNER_PRIVATE_KEY" "$D" \
  "setProtocolConfig((bool,bool,bool,bool,uint32,uint32,uint32))" \
  "(false,false,false,true,11,10,5)" | tx_hash)"
echo "  unlock_tx=$UNLOCK_TX"
trap 'restore_launch_config || true' EXIT

CHAIN_TS="$(cast block --rpc-url "$RPC" --field timestamp)"
DEADLINE=$(( CHAIN_TS + 3600 ))

echo "-- create + single-tx sell-out --"
CREATE="$(send_json "$PRIVATE_KEY" "$D" \
  "createRaffle(address,address,uint128,uint128,uint32,uint64,uint32)" \
  "$ZERO" "$ZERO" "$PRIZE" "$PRICE" 11 "$DEADLINE" "$DRAW_DELAY" --value "$PRIZE")"
CREATE_TX="$(echo "$CREATE" | tx_hash)"
OID=$(( $(next_id) - 1 ))
BUY="$(send_json "$PRIVATE_KEY" "$D" "buyShares(uint256,uint32)" "$OID" 11 --value "$COST11")"
BUY_TX="$(echo "$BUY" | tx_hash)"
SO="$(raffle_field "$OID" 9)"
DELAY="$(raffle_field "$OID" 8)"
ELIG=$((SO + DELAY))
HEAD="$(cast block-number --rpc-url "$RPC")"
echo "  oid=$OID delay=$DELAY soldOut=$SO elig=$ELIG head=$HEAD create=$CREATE_TX buy=$BUY_TX"

if (( DELAY < 16 )); then
  echo "ERROR: expected large delay (>=16), got $DELAY" >&2
  exit 1
fi

if (( HEAD > ELIG )); then
  echo "ERROR: head already > eligible even with delay=$DELAY (head=$HEAD elig=$ELIG)" >&2
  exit 1
fi

echo "-- expect draw too early --"
expect_fail "draw-too-early" cast send "$D" "draw(uint256)" "$OID" \
  --private-key "$PRIVATE_KEY" --rpc-url "$RPC"

python3 - "$RESULTS_JSON" "$OID" "$DELAY" "$HEAD" "$ELIG" "$UNLOCK_TX" "$CREATE_TX" "$BUY_TX" <<'PY'
import json,sys
path, oid, delay, head, elig = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
txs=sys.argv[6:]
data=json.load(open(path))
data.update({
  "status":"pass",
  "oid":int(oid),
  "drawDelay":int(delay),
  "head":int(head),
  "eligible":int(elig),
  "note":f"oid={oid} delay={delay} head={head} elig={elig}",
  "txs":[{"hash":h,"url":f"https://testnet.bscscan.com/tx/{h}"} for h in txs],
})
json.dump(data, open(path,"w"), indent=2)
print("recorded pass →", path)
PY

echo "-- finish raffle after eligible --"
wait_blocks_past "$ELIG"
DRAW_TX="$(send_json "$PRIVATE_KEY" "$D" "draw(uint256)" "$OID" | tx_hash)"
echo "  draw_tx=$DRAW_TX"

restore_launch_config
trap - EXIT

echo "PASSED draw-too-early oid=$OID delay=$DELAY head=$HEAD elig=$ELIG"
echo "RESULTS_JSON=$RESULTS_JSON"
