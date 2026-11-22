# Hardening from research (SCO-12)

[中文](hardening-from-research.zh.md)

**Date:** 2026-11-21  
**Based on:** [`github-similar-raffles.md`](github-similar-raffles.md), [`invariants-evm-solana.md`](invariants-evm-solana.md) three priority recommendations

---

## What changed

### 1. Anchored draw + late cannot draw → refund

| Chain | Behavior |
|---|---|
| EVM | `resolveDrawBlock` uses **only** `blockhash(soldOut+N)`; roll out of ~256 window → `DrawEntropyExpired`; `refund`/`recoverPrize` can move SoldOut→Expired and dequeue pending |
| Solana | `resolve_draw_slot` takes **only** `slot == eligible`; roll out → `DrawEntropyExpired`; refund gate `slot > eligible + 512`; `refund`/`recover_prize` need `pending` account |
| Both | Winner via **keccak expansion**: EVM `keccak256(h \|\| orderId)`; Solana `keccak(h \|\| raffle_id_le)` |
| Keeper | Solana tick **skips** entropy-expired raffles; no longer stubbornly draws |
| Docs | `PROTOCOL.md` records publicly verifiable formula; crosswalk S1/S5/D4/D5 synced |

### 2. Malicious assets & reconciliation

- EVM `LibAsset.pull`: ERC-20 **balance-delta** accounting; under-delivery → `TransferAmountMismatch` (FoT / tax tokens)
- Solana `pull_spl_checked`: same balance delta; Token-2022 still `UnsupportedTokenProgram`
- Docs list unsupported classes; unit test `FeeOnTransferERC20`

### 3. dRaffle paired reading landed

- Entropy expansion (above)
- `close_share_board` / `close_buyer_record` rent reclaim
- PendingDraws: dequeue on entropy expiry; keeper duties documented (`keeper/README.md`)

---

## What was tested

| Suite | Result |
|---|---|
| `contracts/` `forge test` | **45 passed** |
| `programs/scoop` `cargo test` | **16 passed** (incl. randomness anchor/expansion) |
| `scripts/e2e-local.sh` (Anvil) | **ALL E2E PASSED** (incl. late entropy → refund) |
| `cargo build-sbf` | `target/deploy/scoop.so` succeeded |
| `anchor build` IDL stage | Existing `anchor-spl`/`token_2022` feature noise (unrelated to this work); sbf artifact usable |
| Full Solana `e2e-solana-local.sh` | **Not re-run this round** (late segment needs ~512+ slots); script already changed to “draw fails + refund” |

Key cases: `Draw.t.sol` (anchor / late refund), `Expire.t.sol`, `LibAsset.t.sol` (FoT), Solana `late_window_entropy_expired` / `expire_refund_path`.

---

## Still intentionally not doing

- No Chainlink / Switchboard VRF
- No Token-2022 / fee-on-transfer support (reject; under-delivery reverts under balance-delta accounting)
- No per-address share cap (product undecided)
- No auto wrap/unwrap wSOL
- No keeper-initiated refunds on behalf of users (only skip expired draws; refunds stay permissionless user path)
- No fix for `anchor build` IDL friction with `token_2022` feature (out of scope this round)

---

## Remaining risks

1. Solana refund gate uses a **conservative 512 bound** (when no SlotHashes account); occasional mismatch with actual sysvar length can briefly mean “draw already failed but refund still early” — wait a few more slots.
2. Winner formula is the single current spec: `keccak(h ‖ orderId/raffle_id)` then mod (no historical on-chain deployment; no coexisting “old formula”).
3. Full Solana late e2e not green-run this round; recommend a long localnet run next time.
4. Paused ERC-20s still rely on transfer revert; no separate pause probe.
