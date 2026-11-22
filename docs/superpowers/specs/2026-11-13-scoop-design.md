# Scoop Design Spec

**Date:** 2026-11-13  
**Status:** Approved (contracts MVP implemented)  
**Network:** BNB Smart Chain (BSC)  
**Repo:** `~/Code/active/scoop` (new monorepo)

## 1. Product summary

Scoop is an on-chain “share raffle” (一元夺宝-style):

- Anyone can create a raffle by escrowing a prize (any ERC20 or native BNB) and selling a fixed number of shares at a fixed price in a payment asset (any ERC20 or native BNB; may differ from the prize asset).
- Buyers may purchase multiple shares.
- When all shares sell out, after `N` blocks anyone may `draw` using that block’s `blockhash`.
- Exactly one share index wins the prize; the creator receives the payment proceeds.
- Protocol takes **1% only from creator proceeds** (buy-side raised amount), transferred **directly to `feeRecipient` during `claimProceeds`**. Winner receives **100% of the prize** — no fee on the prize / buyer-winner side.

Example: prize = 100_000 TOKEN, 11 shares × 10_000 PAY.

- Winner receives 100_000 TOKEN (full prize).
- Creator receives 108_900 PAY; feeRecipient receives 1_100 PAY.

## 2. Goals and non-goals

### Goals (MVP)

- Permissionless create / buy / draw / claim / refund on a single Diamond.
- Dual asset support: native BNB + ERC20 for both prize and payment.
- Deterministic indexing for browse UX and efficient draw.
- Frontend aligned with forkwiki/fork information architecture (not a visual clone).

### Non-goals (MVP)

- Chainlink VRF or other external randomness.
- Fee-on-transfer / rebasing tokens.
- Social features, charts, cross-chain.
- Heavy indexer required for MVP (events + view facets suffice).

## 3. Architecture choice

**Single EIP-2535 Diamond; each raffle is an `orderId` in shared storage** (not per-raffle contracts).

Rationale: matches grid9 patterns, lower create/buy gas on BSC, one address for the frontend, upgradeable facets.

Rejected:

- Factory + per-raffle clones (higher create cost, diverges from Diamond reference).
- Diamond + per-raffle escrow vaults (extra complexity for MVP).

Monorepo layout (planned):

```text
scoop/
  contracts/   # Foundry + Diamond
  web/         # Next.js App Router
  docs/
```

Contract patterns reference: `~/Code/active/grid9`  
Frontend IA reference: https://github.com/forkwiki/fork

## 4. Lifecycle and state machine

Statuses: `Created` is not a long-lived public state; create lands in `Selling`.

```text
Selling → SoldOut → Drawn
Selling → Expired
```

| Action | Preconditions | Effects |
|---|---|---|
| `createRaffle` | Creator escrows full prize; params valid | `Selling`; assign `orderId` + secondary indexes |
| `buyShares(orderId, count)` | `Selling`, before deadline, enough remaining shares, payment paid | Credit shares; if full → `SoldOut`, set `soldOutBlock`, enqueue pending draw |
| `refund` / `recoverPrize` | Past deadline, not sold out → mark `Expired` (lazy) | Each buyer refunds their own paid amount once (`buyerRefunded` flag); creator recovers full prize once (no fee either side) |
| `draw(orderId)` | `SoldOut`, `block.number >= soldOutBlock + N`, not yet drawn | Compute winner share index; `Drawn`; dequeue pending draw |
| `claimPrize` | `Drawn`, not yet claimed | 100% prize → winner (no fee) |
| `claimProceeds` | `Drawn`, not yet claimed | 99% raised → creator; 1% → `feeRecipient` |

### Randomness (anchored blockhash — current only)

- `eligibleBlock = soldOutBlock + drawDelayBlocks` (N).
- Callable iff `block.number > eligibleBlock`.
- Entropy is **only** `blockhash(eligibleBlock)` (never the caller's current head; never walk to a newer block).
- `winnerShareIndex = uint256(keccak256(abi.encodePacked(blockhash(eligibleBlock), orderId))) % totalShares`.
- Share indexes are `0 .. totalShares-1` in purchase order.
- If `blockhash(eligibleBlock) == 0` (aged out of the ~256-block window) → `DrawEntropyExpired`; use `refund` / `recoverPrize` (SoldOut → Expired). Do not open with a later hash.
- Same address may own many indexes; winning is by index, not by address dedup.

## 5. Economics and custody

### Inflows

| When | Asset | Accounting |
|---|---|---|
| create | prize token / BNB = `prizeAmount` | Locked to `orderId` |
| buy | payment token / BNB = `pricePerShare * count` | `raised` increases; buyer share indexes assigned |

Native BNB uses sentinel `address(0)`. `msg.value` must match the selected path.

### Outflows on `Drawn`

| Recipient | Amount | When |
|---|---|---|
| Winner | `prizeAmount` (100%) | `claimPrize` |
| Creator | `raised - fee` | `claimProceeds` |
| feeRecipient | `fee = raised / 100` | same tx as `claimProceeds` |

Fee math (exact, proceeds only): `fee = raised / 100` (Solidity integer division); `creatorPayout = raised - fee`. Dust from rounding stays with the creator payout. `raised < 100` yields `fee = 0` (acceptable dust edge; create constraints should keep economic sizes sane).

Fee rate is **immutable 1% of creator proceeds** for MVP. No prize-side fee. `feeRecipient` is updatable by owner and is the **protocol fee sink** (EOA or contract). Future locker-dividend / token modules attach by pointing `feeRecipient` at a splitter — see `docs/PROTOCOL.md`. Do **not** embed staking or 50/50 splits inside raffle claim logic until those rules are finalized.

No protocol fee on expiry refunds/recovery.

### Invariants

1. Per-`orderId` prize and payment balances never subsidize another raffle.
2. `raised == pricePerShare * soldShares`.
3. Prize and proceeds each claimable at most once (`prizeClaimed` / `proceedsClaimed`).
4. While active, Diamond holds at least the unclaimed prize and unclaimed payment for that raffle.

## 6. Indexing model

Primary and secondary IDs (approved):

| Index | Meaning | Use |
|---|---|---|
| `orderId` | Global auto-increment from 1 | Primary key for buy/draw/claim/events |
| `prizeToken + tokenOrderId` | Nth raffle for that **prize** token | Token browse pages |
| `creator + userOrderId` | Nth raffle created by address | User profile “created” |

Mappings (conceptual):

```text
orderId → Raffle
prizeToken → tokenOrderId → orderId
creator → userOrderId → orderId
prizeToken → tokenOrderCount
creator → userOrderCount
```

### In-raffle share ownership

- Primary for draw: `orderId + shareIndex → buyer`
- Convenience: `orderId + buyer → shareCount`
- Multi-buy by one address = multiple share indexes under the same `orderId`

## 7. Pending draw (no full scan)

Do **not** iterate all historical `orderId`s to find drawable raffles.

On sell-out:

- Add `orderId` to an on-chain **pending draw set/queue**
- Store `drawEligibleBlock = soldOutBlock + N`
- Emit `SoldOut(orderId, prizeToken, soldOutBlock, eligibleBlock)`

On successful `draw`:

- Remove from pending set
- Emit `Drawn(...)`

Views:

- `pendingDrawCount()`
- `pendingDrawAt(i) → (orderId, eligibleBlock)` (or equivalent)

Optional: `drawMany(orderId[])` for a keeper. Anyone may draw a ready raffle; result is deterministic.

## 8. Facets and storage

Thin facets + libraries (grid9 style):

| Facet | Responsibility |
|---|---|
| `RaffleCreateFacet` | `createRaffle` |
| `RaffleBuyFacet` | `buyShares` |
| `RaffleDrawFacet` | `draw`, `drawMany` |
| `RaffleClaimFacet` | `claimPrize`, `claimProceeds`, `refund`, `recoverPrize` |
| `RaffleViewsFacet` | raffle detail, indexes, pending draw, user share counts |
| Standard | `DiamondCut`, `DiamondLoupe`, `Ownership` (`feeRecipient`) |

Core `Raffle` fields:

```text
creator
prizeToken            // address(0) = BNB
paymentToken          // address(0) = BNB
prizeAmount
pricePerShare
totalShares
soldShares
deadline
drawDelayBlocks       // N
soldOutBlock
drawBlock             // block actually used for hash
winnerShareIndex
status
prizeClaimed
proceedsClaimed
tokenOrderId
userOrderId
```

### Create constraints

- `totalShares >= 2`
- `pricePerShare > 0`, `prizeAmount > 0`
- `deadline` in the future
- `drawDelayBlocks` in a bounded range (e.g. 1–128) to leave headroom for hash availability
- `prizeToken == paymentToken` allowed
- Fee-on-transfer / rebasing tokens out of scope; transfers must credit exact expected amounts

## 9. Frontend (MVP)

Stack direction: Next.js App Router, wagmi + RainbowKit, BSC, single Diamond address. IA inspired by forkwiki/fork; new visual system later.

| Route | Purpose |
|---|---|
| `/` | Active raffles, filter by prize token, progress, deadline |
| `/raffle/[orderId]` | Detail: buy, countdown, draw, claim, refund/recover |
| `/create` | Param form + approve + create |
| `/token/[prizeToken]` | Paginate via `tokenOrderId` |
| `/user/[address]` | Created via `userOrderId`; participated via events (subgraph later) |

Read path: view facets + events. Pending draws: per-detail `eligibleBlock` and/or `pendingDraw*` views. No mandatory heavy indexer for MVP.

## 10. Errors, security, testing

### Security

- Checks-Effects-Interactions on all payouts; reentrancy guard on buy/claim/refund paths as needed.
- `draw` writes winner once; no re-draw.
- Owner can update `feeRecipient` only; cannot rewrite locked raffle economics mid-flight.
- Exact-amount transfer accounting for ERC20 and BNB paths.

### Frontend error mapping

Map reverts for: buy after deadline, draw before ready, double claim/refund, wrong `msg.value`, insufficient remaining shares.

### Required tests

1. Full happy path: sell out → wait N → draw → winner gets full prize; creator claim sends 1% of raised to feeRecipient.
2. Multi-share same buyer; win lands on one of their indexes.
3. Expiry: refunds + prize recovery, zero fees.
4. Asset matrix: BNB/ERC20 × prize/payment combinations.
5. Pending draw enqueue/dequeue + `drawMany`.
6. Blockhash expiry fallback path.
7. Triple index consistency (global / prize token / creator).

## 11. Open parameters (implementation defaults)

These are approved directionally; concrete defaults can be set in the implementation plan:

- Default UI suggestion for `N` (e.g. 5–10 on BSC ~0.75s blocks)
- Exact `drawDelayBlocks` min/max
- Pagination page size for view facets
- Whether expired transition is explicit `expire(orderId)` or lazy on first refund/recover

**Decision for lazy vs explicit expire (spec choice):** lazy — first successful `refund` or `recoverPrize` after deadline+not-sold-out sets `Expired` if not already; buys already blocked by deadline check. Avoids requiring a separate keeper tick for expiry.

## 12. Approval record

Captured in brainstorming session 2026-11-13:

- Payment/prize tokens independently chosen (including cross-asset)
- Randomness: post-sellout wait N blocks + blockhash
- Fees: 1% from creator proceeds only (winner/prize untaxed); paid on `claimProceeds` to feeRecipient
- Multi-share per address allowed
- Deadline required; unsold → full refunds, no fee
- Permissionless `draw` then separate claims
- Native BNB + ERC20 for both sides
- New monorepo `scoop`, Diamond like grid9, frontend IA like forkwiki/fork
- Approach: single Diamond + orderId
- Indexes: global orderId + prizeToken orderId + creator orderId
- Pending draw set + events + optional drawMany
