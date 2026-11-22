# Scoop Dual-Chain Plan (EVM + Solana)

[中文](solana-dual-chain-plan.zh.md)

**Date:** 2026-11-20  
**Principle:** One product, one rule set; two chains each implement independently — do not force a shared runtime.  
**Rule sources:** [`PROTOCOL.md`](PROTOCOL.md), [`superpowers/specs/2026-11-13-scoop-design.md`](superpowers/specs/2026-11-13-scoop-design.md)  
**Phase 0:** ✅ Done — crosswalk [`invariants-evm-solana.md`](invariants-evm-solana.md); randomness = SlotHashes (no VRF); assets = native SOL + SPL (native not forced to wSOL)

## 1. Suggested split

| Layer | Approach |
|---|---|
| Product rules | Maintain one chain-agnostic invariant set (fees, state machine, share bounds, draw eligibility, refunds) |
| On-chain implementation | EVM continues in `contracts/`; Solana adds `programs/` (Anchor), mirroring the same state machine |
| Frontend | One `web/`, with chain adapters (wallet / RPC / read model / write txs); shared UI and routes |
| Keeper | Same “scan pending → call draw” duty; separate EVM and Solana executors, same repo `keeper/` |
| Docs & tests | Invariant crosswalk + per-chain local E2E; forbid “Solana ships first, align rules later” |

Do not hard-port Diamond / facet to Solana; express the same lifecycle with PDA + account layout.

## 2. Suggested layout (still one project)

```text
scoop/
  contracts/     # existing Foundry + Diamond (BSC)
  programs/      # new Anchor (Solana)
  web/           # shared frontend + chain adapters
  keeper/        # EVM + Solana draw triggers
  docs/          # rules and crosswalk
  scripts/       # per-chain e2e
```

## 3. Invariants that must align (write the crosswalk before shipping)

1. Lifecycle: `Selling → SoldOut → Drawn`, or timeout `Expired` (refund / recover prize)
2. Fees: **1%** only on creator proceeds via `claimProceeds`; prize and refund paths **0 fee**
3. Shares: `MIN_SHARES = 2`, `MAX_SHARES = 10_000`
4. Draw: after sell-out, delay N “slots”; anyone may call; Solana randomness needs an equivalent substitute (see next section) without changing product semantics
5. Assets: prize and payment may differ (native / SPL, counterpart of BNB / ERC-20)

Deliverable: [`invariants-evm-solana.md`](invariants-evm-solana.md) (each row: EVM status → Solana mapping → test points). **Phase 0 complete.**

## 4. Critical Solana equivalents (decided)

| EVM | Solana (Phase 0 final) |
|---|---|
| `blockhash` + `soldOutBlock + N` | Record `sold_out_slot` on sell-out; after `slot > sold_out_slot + N` anyone `draw`; take **only** the SlotHashes entry where `slot == eligible`; roll out of window → `DrawEntropyExpired` → refund/recover (~512). **Forbid** Chainlink/Switchboard VRF |
| Diamond single address + `orderId` | Program ID + `Raffle` PDA (seeds include incrementing id) |
| ERC-20 / native | SPL Token + **native SOL** (lamports escrowed in PDA); only explicit wSOL mint uses SPL. See crosswalk §2 |
| `drawMany` / pending queue | Queryable pending set + `draw_many`; default try each, skip unready |
| `feeRecipient` | Config PDA receiving pubkey (+ ATA); may later swap to a splitter without polluting the state machine |

Randomness and asset details, plus EVM differences: see crosswalk §0–§2. If SlotHashes semantics break, update the spec docs first — do not change rules while coding.

## 5. Phases (recommended order, not overturned)

### Phase 0 — Lock rules (short) ✅
- [x] Extract chain-agnostic invariant crosswalk from design / PROTOCOL
- [x] Decide Solana randomness source and asset model
- [x] Update root README: dual-chain monorepo notes

### Phase 1 — `programs/` MVP
- Anchor: create / buy / draw / claimPrize / claimProceeds / refund / recoverPrize
- Unit tests covering same semantic edges as EVM (shares, fees, expiry)
- Local validator scripts

### Phase 2 — `web/` multi-chain
- Abstractions: chain select, connect wallet, raffle read model, write ops
- Shared routes and copy; Solana wallet (e.g. Solana wallet-adapter) alongside existing wagmi
- Env vars split per chain (program ID, cluster, deploy start, etc.)

### Phase 3 — Keeper + E2E
- Solana pending scan and `draw` trigger
- Full Solana local path under `scripts/`, aligned with existing `e2e-local.sh` mental model

### Phase 4 — Parallel testnets
- Deploy one set each on BSC and Solana testnets
- Pass the same product acceptance checklist before mainnet talk
- Solana scripts/docs: [`solana-testnet-deploy.md`](solana-testnet-deploy.md); **devnet program deploy still needs a funded authority** (public faucet often unavailable)

## 6. Explicit non-goals (this stage)

- Bridging the same raffle across chains
- Forcing a unified account abstraction across chains at the cost of UX
- Shipping Scoop token / locker dividends early (still reserve fee sink per PROTOCOL)

## 7. Acceptance criteria

- Every crosswalk invariant has tests on both sides or an explicit “chain difference but product-equivalent” note
- Users can complete on both chains via the same frontend: create → buy → draw → claim prize / claim proceeds / expire refund
- Keeper can auto-advance pending draws on both chains

## 8. Next steps

1. ~~Write `docs/invariants-evm-solana.md` and decide randomness~~ ✅ Phase 0  
2. Phase 1: scaffold `programs/` (Anchor); land create/buy/draw/claim/refund per crosswalk  
3. In parallel: frontend chain adapter skeleton  
