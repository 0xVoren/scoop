# Unit test coverage report

Generated from local runs on branch `cursor/coverage-draw-early-7861` (programs + keeper unit coverage pass).

## Summary

| Stack | Tool | Lines | Branches / notes |
|---|---|---|---|
| EVM (`contracts/`) | `forge coverage --summary` | **68.72%** (558/812) | Branches **49.57%** (58/117); statements 65.81% — unchanged this pass |
| Solana (`programs/scoop`) | `cargo llvm-cov -p scoop --lib` | **41.31%** (537/1300) | Regions 44.24%; lib unit tests **24/24 pass** (was 30.22% / 16 tests) |
| TypeScript (`keeper`) | `vitest run --coverage` | **87.05%** (242/278 of `src/solana`) | Statements 85.41%; funcs 94.44% (was 11.15%) |
| TypeScript (`web`) | — | n/a | No unit-test framework; `pnpm typecheck` / `pnpm run ci` green |

Deploy scripts (`script/*.s.sol`) are intentionally near 0% and drag the EVM total; core raffle libraries are high (see below).

## EVM — core libraries

| File | Lines | Statements | Branches | Funcs |
|---|---|---|---|---|
| `LibAsset.sol` | 100% | 100% | **91.67%** | 100% |
| `LibRaffle.sol` | 100% | 93.68% | 70.00% | 100% |
| `LibRaffleClaim.sol` | 98.11% | 88.89% | 66.67% | 100% |
| `LibRaffleDraw.sol` | 100% | 93.75% | **50.00%** | 100% |
| `LibRaffleViews.sol` | 93.55% | 94.44% | — | 92.86% |
| Raffle* facets | 100% | 100% | — | 100% |

### Still low / residual gaps

- **`LibRaffleClaim._ensureExpired` else** (defensive non-Selling status): ~1 line; no enum value reaches it after SoldOut/Drawn/Selling checks.
- **`LibRaffleDraw` branch %**: both branches of early-return helpers are exercised in suites, but forge’s branch metric stays ~50% on tiny functions.
- **`LibDiamond` / Loupe / Ownership**: upgrade plumbing; not product-critical for raffle math.
- **`script/Deploy*.s.sol`**: 0% (manual / integration only).

## Solana — `cargo llvm-cov`

| Area | Lines cover | Notes |
|---|---|---|
| `utils/randomness.rs` | **99.48%** | resolve / expand / parse / entropy-expired branches |
| `lib.rs` invariant helpers | **75.10%** | Fee, shares, draw window, expire, create locks, spaces |
| `state/pending.rs` | **95.45%** | add/remove + space |
| `state/shares.rs` | **87.50%** | `ShareBoard::space` |
| `constants.rs` | **100%** | fee / winner / native helpers |
| `instructions/create_raffle.rs` | **25.60%** | `enforce_create_config` unit-tested; handler needs validator |
| `instructions/draw.rs` | **44.90%** | `apply_draw` pure path |
| `instructions/refund.rs` | **36.73%** | `ensure_expired` pure path |
| `instructions/*` handlers | ~0% | CPI / Context accounts — covered by local/devnet e2e |
| `utils/asset.rs` | **2.63%** | CPI paths; e2e matrix, not host unit tests |

### Added this pass

- Randomness: short/truncated parse, zero-hash skip, empty/hole `NoSlotHash`, full `is_draw_entropy_expired` branches.
- Invariants: `enforce_create_config` lock matrix, pending/share space, native mint helpers, `apply_draw` NotSoldOut, already-Expired / uninitialized creator expire.
- Lib tests: `cargo test -p scoop --lib` → **24 passed**.

## TypeScript (`keeper`)

| File | Lines | Notes |
|---|---|---|
| `constants.ts` | 100% | |
| `pdas.ts` | 100% | |
| `decode.ts` | **100%** | pending / raffle / config / board / buyer + `eligibleSlot` |
| `instructions.ts` | **100%** | native-path builders + protocol config encode |
| `tick.ts` | **40%** | `loadKeypair` / `resolveKeypairEnv` / early `runSolanaTick` exits; RPC draw path needs e2e |
| `index.ts` | 0% | re-exports only |

### Added this pass

- `decode.test.ts`, `instructions.test.ts`, `tick.test.ts` (Vitest).
- Coverage of `src/solana`: **11% → 87%** lines.

`web/`: keep typecheck + Biome only; recommend Vitest later for pure helpers if extracted from React.

### Verification commands

```bash
# EVM
cd contracts && forge coverage --summary

# Solana
cd programs && CARGO_TARGET_DIR=/tmp/scoop-programs-target \
  cargo llvm-cov -p scoop --lib --summary-only
CARGO_TARGET_DIR=/tmp/scoop-programs-target cargo test -p scoop --lib

# Keeper TS
cd keeper && pnpm test && pnpm test:coverage && pnpm typecheck

# Web
cd web && pnpm typecheck && pnpm run ci
```

## Toolchain notes (Anchor)

| Item | Version |
|---|---|
| Anchor CLI / crates | **0.32.1** |
| `anchor-lang` / `anchor-spl` | `=0.32.1` |
| Extra | `solana-keccak-hasher = "2.2"` |
