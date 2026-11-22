# Scoop Mainnet Canary Plan

**Status:** plan only — **execute only when the user explicitly orders canary**  
**Does not** authorize mainnet deploy, funding, or public FE cutover by itself  
**Depends on:** [`mainnet-runbook.md`](mainnet-runbook.md) · [`security-checklist-mainnet.md`](security-checklist-mainnet.md) · [`asset-policy.md`](asset-policy.md)  
**Practice evidence:** [`testnet-contracts-deploy.md`](testnet-contracts-deploy.md) · [`testnet-full-e2e.md`](testnet-full-e2e.md)

---

## 1. Goal

Prove dual-chain mainnet paths with **small** funds before public traffic:

1. Create → multi-buyer sell-out → draw → claim prize / claim proceeds (1% fee visible)  
2. Expire path: create → wait deadline → refund + recover prize  
3. Optional: late-entropy awareness (do **not** intentionally burn mainnet capital waiting full windows unless ordered)

Stop on first unexpected revert, accounting mismatch, or explorer/UI disagreement.

---

## 2. Preconditions (gate)

- [ ] Security checklist §8 complete on the release commit  
- [ ] Mainnet Diamond + Solana program deployed and verified per runbook  
- [ ] `feeRecipient` / `fee_recipient` funded-capable and recorded  
- [ ] Owner / upgrade authority / keeper keys separated  
- [ ] FE pointed at mainnet in a **private** or staging deploy (not marketed)  
- [ ] Assets: native only for first pass; optional second pass with one vanilla ERC-20 + one classic SPL mint (no FoT / Token-2022)  
- [ ] Explicit user order: “run canary” (or equivalent)

---

## 3. Budget (suggested caps — adjust when ordering)

| Chain | Per-raffle prize | Shares / price | Extra gas buffer | Notes |
|---|---|---|---|---|
| BSC | ≤ **0.01 BNB** (or ≤ **10 USDT**-class vanilla ERC-20) | Launch defaults: 11 shares, price = prize/10, N=5 | ≥ 0.005 BNB on deployer + 2–3 buyer keys | Prefer native first |
| Solana | ≤ **0.05 SOL** (or tiny classic SPL amount) | Same defaults (slots) | ≥ 0.5 SOL on authority for rent/fees; buyers funded | Prefer native first |

Total canary economic exposure target: **well under casual ops loss tolerance**; treat as write-off if a path bricks (should not — refund/recover exist).

Use **fresh** buyer keypairs where possible so “Me” / explorer reading is unambiguous.

---

## 4. Execution sequence (when ordered)

### 4.0 Record

Log in a private ops note (not this repo unless asked):

- Commit SHA · Diamond · Program ID · fee sinks · RPC endpoints · start time  

### 4.1 BSC happy path

1. `createRaffle` — native BNB prize at budget cap; launch config defaults.  
2. Buy with **≥2** distinct addresses until SoldOut (or one address buying multiple shares if keys limited — prefer multi-address).  
3. Wait `drawDelayBlocks` (launch N=5; BSC ~0.75s/block).  
4. Permissionless `draw` (keeper optional).  
5. Winner `claimPrize` — prize 100%, feeRecipient unchanged.  
6. Creator `claimProceeds` — fee = raised/100 to feeRecipient; remainder to creator.  
7. Explorer + FE agree on status, winner index, balances.

### 4.2 BSC expire path

1. New raffle; **do not** sell out; wait past `deadline`.  
2. Buyer `refund`; creator `recoverPrize`.  
3. Confirm zero protocol fee movement.

### 4.3 Solana happy path

1. `create_raffle` — native SOL at budget cap.  
2. Multi-buyer `buy_shares` → SoldOut; pending enqueue.  
3. Wait `draw_delay_slots`; `draw` with SlotHashes.  
4. `claim_prize` / `claim_proceeds` (1% to fee_recipient).  
5. Optional: `close_share_board` / `close_buyer_record` rent reclaim after Drawn.

### 4.4 Solana expire path

1. Create; miss sell-out; past deadline → `refund` + `recover_prize`.  

### 4.5 Optional token pass (same budgets)

- EVM: one standard ERC-20 (no FoT).  
- Solana: one classic SPL mint (not Token-2022).  
- Confirm create rejects Token-2022 / FoT if deliberately probed with dust (expected fail).

### 4.6 Index / UX boundary (Solana)

- Confirm Live list shows the new id via recent scan.  
- Confirm Me does **not** claim a full purchase index (`meSolanaNoIndex` / search-by-#ID).  
- No bug — product boundary per [`asset-policy.md`](asset-policy.md).

---

## 5. Pass / fail

| Result | Criteria |
|---|---|
| **PASS** | All ordered paths match PROTOCOL accounting; explorers agree; no unexpected admin intervention |
| **FAIL** | Any stuck escrow without refund/recover path; fee mis-route; wrong winner vs on-chain formula; upgrade/authority surprise |
| **ABORT** | Stop further creates; pause keeper; follow runbook §6; do not “patch live” without review |

On PASS: open public FE / keeper gradually; keep canary caps until volume playbook exists.  
On FAIL: leave FE off; incident note; no public announce of “live”.

---

## 6. Explicit non-actions (until ordered)

- No mainnet deploy from this document alone  
- No git push / GitHub release required for canary prep  
- No intentional late-entropy burn (256 blocks / ~512 slots) on mainnet unless separately ordered  
- No unlocking `allowCustom*` / `allowDifferentTokens` during first canary  
- No FoT / Token-2022 “support” experiments  

---

## 7. After canary

1. Append outcomes (tx signatures, ids) to private ops log; optionally a short public status later.  
2. If PASS and user orders: enable marketing FE + production keeper.  
3. Schedule external audit items still open from [`security-checklist-mainnet.md`](security-checklist-mainnet.md) §9 before scaling TVL.

---

## Related testnet anchors

| | Address |
|---|---|
| BSC testnet Diamond | `0xfB2678ff49967B073F6537781EC3d35DE731a5DF` |
| Solana devnet Program | `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT` |
