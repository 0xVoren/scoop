# Scoop Invariants Crosswalk (EVM ↔ Solana)

[中文](invariants-evm-solana.zh.md)

**Date:** 2026-11-20  
**Phase:** Phase 0 (rules locked)  
**Principle:** One product rule set; chain differences stay at the mechanism layer only — do not change fees, state machine, draw callability, or asset semantics.  
**Rule sources:** [`PROTOCOL.md`](PROTOCOL.md), [`superpowers/specs/2026-11-13-scoop-design.md`](superpowers/specs/2026-11-13-scoop-design.md), `contracts/src/` (`LibRaffleDraw`, `LibRaffleClaim`, `LibConstants`, `AppStorage`, `IScoopRaffle`)

---

## 0. Phase 0 decision summary

| Decision | Conclusion |
|---|---|
| Randomness source | **Resolve inside the SlotHashes window** (counterpart of EVM `blockhash`): record `sold_out_slot` on sell-out; after N slots anyone may `draw`; **forbid** Chainlink / Switchboard VRF |
| Asset model | **Native SOL + SPL Token** (counterpart of BNB + ERC-20); prize and payment may differ; native path escrow lamports; do **not** force wrap to wSOL |
| Structure | Solana uses program ID + `Raffle` PDA; do **not** port Diamond / facet |

---

## 1. Randomness scheme (product-equivalent, no external VRF)

### 1.1 EVM status quo (implemented)

- `eligible = soldOutBlock + drawDelayBlocks`; first callable when: `block.number > eligible`.
- `resolveDrawBlock`: uses **only** `blockhash(eligible)`; if zero → `DrawEntropyExpired` (**forbid** switching to a newer block hash).
- `winnerShareIndex = uint256(keccak256(abi.encodePacked(blockhash(eligible), orderId))) % totalShares`.
- Anyone may `draw` / `drawMany`; if late and the hash rolls out of the ~256 window → cannot draw; use `refund`/`recoverPrize`.
- `drawDelayBlocks ∈ [1, 128]` (`LibConstants`).

### 1.2 Solana mapping (Phase 0 final)

| Item | Value |
|---|---|
| Time unit | **slot** (counterpart of EVM block) |
| Sell-out anchor | On sell-out write `sold_out_slot = Clock::get().slot` |
| Drawable | `Clock::get().slot > sold_out_slot + draw_delay_slots` |
| Delay bounds | `draw_delay_slots ∈ [1, 128]` (same numeric bounds as EVM) |
| Random bytes | Read sysvar **`SlotHashes`**: the entry hash where **exactly** `slot == eligible` |
| Late | eligible rolls out of window → `DrawEntropyExpired`; do **not** switch to the latest slot. Refund gate: `slot > eligible + 512` (`SLOT_HASHES_RETENTION`) or equivalent |
| Winner formula | `winner = u64::from_le_bytes(keccak(hash \|\| raffle_id_le)[0..8]) % total_shares` |
| Callability | Anyone may call `draw` / `draw_many`; no permission, no mandatory keeper |
| **Forbid** | Silently swap to Chainlink VRF, Switchboard, oracle callbacks, off-chain signed randomness; drawing with “latest hash at submit time” |

### 1.3 Differences vs EVM (still rule-consistent)

| Difference | Notes | Why still equivalent |
|---|---|---|
| Window length | EVM ~256 blocks; Solana SlotHashes ~512 slots | Product semantics are the same: “anchor eligible hash; roll out → refund”; window size is a chain capability |
| Block/slot cadence | BSC ~0.75s; Solana ~0.4s | `N` is still “delay slot count”; user-perceived time differs slightly; rule fields and bounds match |
| Hash API | `blockhash(n)` vs SlotHashes lookup | Both are “on-chain commitment hash for that slot/block”, not external entropy |
| Program must pass sysvar account | Solana account model requires explicit `SlotHashes` | UX / instruction layout difference; no rule change for buyers/creators |

If SlotHashes becomes unavailable or window semantics break, **stop at the spec layer and update docs** — do not rewrite into VRF while coding.

**Implementation note (keeper):** scan `PendingDraws` → `draw` only raffles where `eligible < slot ≤ eligible+512`; skip entropy-expired raffles and alert; users use `refund`/`recover` (see `keeper/README.md`).

### 1.4 Randomness test points

- After sell-out but before N: `draw` fails (TooEarly).
- `current > eligible` and anchored hash still in window: success, `drawBlock/slot == eligible`, winner in `[0, total_shares)`, state → Drawn, pending dequeued.
- Late draw (eligible already out of window): `DrawEntropyExpired`; then `refund`/`recover` → Expired.
- Same `raffle_id` cannot `draw` twice.
- `draw_many`: Solana skips TooEarly / entropy-expired when only some are ready; EVM `drawMany` is **all-or-nothing** (caller must pre-filter; matches contract plan and unit tests).

---

## 2. Asset model (SOL + SPL, including wSOL policy)

### 2.1 Crosswalk

| Role | EVM | Solana |
|---|---|---|
| Native coin | `address(0)` = BNB, `msg.value` / contract balance | **Native SOL**: sentinel mint = `Pubkey::default()` (all zeros); System Program transfers **lamports** into/out of the raffle escrow PDA |
| Fungible token | ERC-20 | **Classic SPL Token Program** (Token-2022 rejected: `UnsupportedTokenProgram`) |
| Prize ≠ payment | Supported (may be gated by `allowDifferentTokens`) | Same: `prize_mint` and `payment_mint` may differ |
| Prize = payment | Allowed | Allowed |

### 2.2 wSOL policy (default)

1. **Product “native SOL” path**: escrow **lamports**, no wrap. Counterpart of EVM BNB `address(0)`.
2. **User explicitly selects Wrapped SOL mint** (`So11111111111111111111111111111111111111112`): use the **ordinary SPL** path (ATA ↔ vault ATA), same as any other mint.
3. **Program does not auto wrap/unwrap**: create / buy / claim branch native vs SPL; if the frontend shows “SOL”, map to the native path — do not silently switch to wSOL.
4. **feeRecipient**: config account stores receiving pubkey; native fees → transfer lamports; SPL fees → corresponding ATA (if missing, instruction requires pre-create or CPI create; Phase 1 picks one approach).

### 2.3 Asset test points

- Matrix: prize×payment ∈ {SOL, SPL_A, SPL_B} (same mint and different mint).
- Native path: `msg.value` exact match; SPL path: transfer amount exact, no fee-on-transfer.
- When wSOL-as-SPL and “native SOL” raffles coexist, escrow accounts must not mix.

---

## 3. One-line invariant crosswalk

Format: **topic** — EVM status → Solana mapping → test points

### 3.1 State machine

| # | Invariant | EVM status | Solana mapping | Test points |
|---|---|---|---|---|
| S1 | Public lifecycle | `Selling → SoldOut → Drawn`; or `Selling → Expired`; or `SoldOut → Expired` (entropy expiry only) | Same four-state enum on `Raffle` PDA | Cover legal transitions; forbid Drawn→Expired; SoldOut→Expired only when anchored hash unavailable |
| S2 | Create landing | `createRaffle` goes straight to `Selling`; no long-lived `Created` | `create` initializes PDA as `Selling` and escrows prize | Readable as Selling after create; prize locked |
| S3 | Sell-out | Full buy → `SoldOut`, write `soldOutBlock`, enqueue pending | Full buy → `SoldOut`, write `sold_out_slot`, enqueue pending | Last share purchase triggers; over-buy fails |
| S4 | Lazy expiry | Timeout without sell-out; first `refund`/`recoverPrize` moves `Selling`→`Expired` | Same: compare `Clock.unix_timestamp` vs `deadline` | No refund before deadline; first refund after deadline flips state |
| S5 | Drawn never refunds; SoldOut refunds only on entropy expiry | `_ensureExpired`: Drawn rejected; SoldOut only when `blockhash(eligible)==0` | Same: Drawn rejected; SoldOut when `slot > eligible+512` (or SlotHashes lacks eligible) | SoldOut not refundable inside drawable window; refundable after entropy expiry |

### 3.2 Fee 1%

| # | Invariant | EVM status | Solana mapping | Test points |
|---|---|---|---|---|
| F1 | Rate | `fee = raised / 100` (`FEE_DENOMINATOR=100`) | Same integer division | `raised=1100` → fee=11; `raised<100` → fee=0 |
| F2 | Proceeds side only | 1% only on `claimProceeds` | Same instruction semantics | feeRecipient balance unchanged around claimPrize |
| F3 | Prize 0 fee | Winner gets 100% `prizeAmount` | Same | Winner balance +prizeAmount |
| F4 | Refund/recover 0 fee | `refund` / `recoverPrize` take no cut | Same | Expired: full payment refund, full prize return |
| F5 | Create 0 fee | create only escrows prize | Same | Create does not increase fee account balance |
| F6 | Rounding | Remainder to creator (`raised - fee`) | Same | fee + creator == raised |

### 3.3 Shares 2–10000

| # | Invariant | EVM status | Solana mapping | Test points |
|---|---|---|---|---|
| H1 | Bounds | `MIN_SHARES=2`, `MAX_SHARES=10_000` | Same constants | Create fails for 1 and 10001; succeeds for 2 and 10000 |
| H2 | Indexing | Share indices `0 .. totalShares-1`, assigned in purchase order | Same | After sell-out `share_owner[i]` covers all |
| H3 | Multi-share same address | Same buyer may hold multiple indices; draw by index, not address-deduped | Same | After multi-buy can win one of those indices |
| H4 | Accounting | `raised == pricePerShare * soldShares` (at sell-out = `* totalShares`) | Same | Validate after buy; claim uses full raised |

### 3.4 Draw delay and callability

| # | Invariant | EVM status | Solana mapping | Test points |
|---|---|---|---|---|
| D1 | Delay field | `drawDelayBlocks ∈ [1,128]` | `draw_delay_slots ∈ [1,128]` | Bounds and out-of-range |
| D2 | Drawable condition | `block.number > soldOutBlock + N` | `slot > sold_out_slot + N` | N=1 and N=128 |
| D3 | Permission | Anyone `draw` | Anyone `draw` | Non-buyer / non-creator can draw |
| D4 | Randomness binding | **Only** expand `blockhash(eligible)` + `orderId` | **Only** expand SlotHash where `slot==eligible` + `raffle_id` | Recorded drawBlock/slot must equal eligible |
| D5 | Late cannot draw | Hash rolled out → `DrawEntropyExpired` → refund | Same | Late draw fails; refund succeeds |
| D6 | One-shot | No redraw after Drawn | Same | Second draw fails |

### 3.5 Refund / recover prize

| # | Invariant | EVM status | Solana mapping | Test points |
|---|---|---|---|---|
| R1 | Conditions | `timestamp > deadline` and not SoldOut/Drawn | Same unix deadline | Deadline boundary |
| R2 | Buyer refund | Once per `buyerPaid`; `buyerRefunded` prevents reentry | Map inside PDA or per-buyer account; one-shot | Double refund fails; amount = paid |
| R3 | Creator recover | `recoverPrize` once, full prize | Same | Double recover fails |
| R4 | No fees | Both sides 0 fee | Same | feeRecipient unchanged |

### 3.6 Dual assets (prize ≠ payment)

| # | Invariant | EVM status | Solana mapping | Test points |
|---|---|---|---|---|
| A1 | Independent choice | `prizeToken` / `paymentToken` may differ | `prize_mint` / `payment_mint` may differ | Full path with different assets |
| A2 | Native sentinel | `address(0)` = BNB | `Pubkey::default()` = native SOL | Combinations e.g. native prize + SPL payment |
| A3 | Escrow isolation | Each `orderId` does not subsidize others | Each raffle PDA/vault isolated | Parallel claims across two raffles do not mis-account |
| A4 | Exact transfer | pull uses balance delta; FoT → `TransferAmountMismatch` | SPL balance delta; Token-2022 rejected | FoT create/buy fails; classic token balance change = expected |

### 3.7 feeRecipient

| # | Invariant | EVM status | Solana mapping | Test points |
|---|---|---|---|---|
| E1 | Protocol fee sink | `AppStorage.feeRecipient`; owner `setFeeRecipient` | `Config` PDA field; authority can update | After update, new claims go to new address |
| E2 | Receive capability | EOA or contract that can receive BNB+ERC-20 | pubkey that can receive SOL + SPL ATA | One test each for native fee and SPL fee |
| E3 | Decoupled from state machine | Draw logic does not interpret splitter/lock | Same; future splitter only changes recipient | claimProceeds only pushes 1%; no embedded 50/50 |
| E4 | Non-zero | Cannot set `address(0)` | Cannot set default/empty pubkey | set zero address fails |

### 3.8 pending draw / drawMany

| # | Invariant | EVM status | Solana mapping | Test points |
|---|---|---|---|---|
| P1 | Enqueue | Sell-out `pendingDrawAdd` | Sell-out writes pending set (account list or enumerable index) | `pending_count` +1 |
| P2 | Dequeue | Successful `draw` → `pendingDrawRemove` | Same | After draw not in pending |
| P3 | Views | `pendingDrawCount` / `pendingDrawAt(i) → (orderId, eligibleBlock)` | Equivalent view or account fields: `raffle_id` + `eligible_slot` | Keeper can scan |
| P4 | Batch | `drawMany(orderId[])` anyone; **batch all-or-nothing** (one failure reverts all) | `draw_many` takes multiple raffle accounts; TooEarly/entropy-expired **skipped**, ready ones drawn | EVM fails whole batch if unready id mixed in; Solana same batch can partially succeed |
| P5 | No full-table-scan dependency | Must not rely solely on scanning all historical orderIds | Same: pending must be enumerable | Docs + tests assert pending path |

### 3.9 Claims and escrow

| # | Invariant | EVM status | Solana mapping | Test points |
|---|---|---|---|---|
| C1 | Claim prize | `claimPrize`: winner only, once, full prize | Same | Non-winner fails; double claim fails |
| C2 | Claim proceeds | `claimProceeds`: creator only, once, 99%+1% | Same | Non-creator fails |
| C3 | Escrow floor | While active, Diamond holds unclaimed prize and payment | raffle/vault PDA holds corresponding assets | After claims, corresponding vault side is zero |

### 3.10 Identity and indexes (product-level; implementation may vary)

| # | Invariant | EVM status | Solana mapping | Test points |
|---|---|---|---|---|
| I1 | Global id | `orderId` increments from 1 | `raffle_id` increments from 1 (or PDA seeds include id) | Create is monotonic |
| I2 | Secondary indexes | 1-based sequence under prizeToken / creator | May mirror via PDA or index accounts | Browse ids resolve |
| I3 | Single-address entry | Diamond address | Single Program ID | Frontend only configures program ID + cluster |

---

## 4. Explicit non-goals (constrained by this crosswalk)

- Cross-chain same raffle / bridged shares  
- “Ship VRF on Solana first, align rules later”  
- Embed token lockup dividends inside the raffle state machine  
- Force all native SOL into wSOL  

---

## 5. Phase 0 completion criteria

- [x] This crosswalk covers state machine, fees, shares, draw, refund, dual assets, feeRecipient, pending/drawMany  
- [x] Randomness source fixed as SlotHashes, no external VRF  
- [x] Asset model and wSOL policy documented  
- [ ] Phase 1+: each invariant hooked to on-chain/unit tests (see “Test points” columns)

**Related:** dual-chain phase order in [`solana-dual-chain-plan.md`](solana-dual-chain-plan.md).
