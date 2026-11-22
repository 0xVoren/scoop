# Scoop Full Review + Local E2E (SCO-14)

[中文](full-review-e2e.zh.md)

**Date:** 2026-11-21  
**Branch work:** review/fix commits on `cursor/hardening-from-research-5ad4`  
**Cross-check:** [`PROTOCOL.md`](PROTOCOL.md) · [`invariants-evm-solana.md`](invariants-evm-solana.md) · [`hardening-from-research.md`](hardening-from-research.md)  
**Scope:** EVM `contracts/`, Solana `programs/`, `keeper/`, critical `scripts/`, frontend chain branching (critical risks only)  
**No testnet;** current latest design is authoritative.

---

## 1. Review findings

### Critical

**None.** Anchored draw, late cannot draw → refund, 1% only on `claimProceeds`, FoT balance-delta, PendingDraws, permissionless draw, and dual-chain product rules are substantially consistent.

### Medium

| # | Item | Status |
|---|---|---|
| M1 | Solana SPL paths buy/claim/refund/recover **did not check vault/ATA mint** (only create checked prize mint) — wrong mint could credit and break escrow | **Fixed this round**: each SPL path `require_keys_eq!(*.mint, payment/prize_mint)` + vault owner |
| M2 | EVM / Solana `setProtocolConfig` did not bound `defaultShares` (and Solana delay) — could brick create | **Fixed this round** + forge unit test |
| M3 | `drawMany`: docs once said “skip”; EVM is **all-or-nothing**; Solana is **skip** | **Docs aligned** (`invariants` §1.4 / P4); intentional dual-chain difference; EVM keeper must pre-filter |
| M4 | Solana SoldOut refund gate often uses `eligible+512` (refund does not pass SlotHashes) — when draw already failed, refund may briefly `NotExpired` | **Logged as remaining** (known from hardening); wait a few slots |
| M5 | PendingDraws hard capacity 64, no resize — 65th concurrent sell-out enqueue fails | **Logged as remaining** (before product load) |

### Low

| # | Item |
|---|---|
| L1 | Dead errors: `AlreadyDrawn` / `NoBlockhash` (EVM); Solana `AlreadyDrawn` unwired |
| L2 | EVM `LibAsset.push` BNB uses string require; outbound has no balance-delta (FoT already rejected on pull — acceptable) |
| L3 | Solana `close_buyer_record` any recipient can take rent (comments admit ops); keeper IX map lacks `close_*` |
| L4 | `draw_many` ignores `pending.remove` failure; remaining accounts lack defensive PDA seeds checks |
| L5 | Frontend: `family === 'solana' \| 'evm'` dual-track components; wrong-chain pill / misconfigured Diamond vs Program ID UX failures (not contract bugs) |

### Fixed this round (small issues)

1. EVM `OwnershipFacet.setProtocolConfig`: `defaultShares ∈ [MIN, MAX]`  
2. Solana `set_protocol_config`: shares + draw_delay bounds  
3. Solana SPL mint/owner binding (buy / claim_prize / claim_proceeds / refund / recover)  
4. Crosswalk `drawMany` dual-chain semantics  
5. Forge: multi-buyer different addresses, permissionless draw + keccak formula asserts, config caps  
6. Solana e2e: macOS `sed -i`, RPC readiness probe, Clock deadline wait, draw slot race, clear error when `--bpf-program` mismatches keypair  

---

## 2. Test results (ran locally)

### 2.1 `forge test` (contracts)

| | |
|---|---|
| Command | `cd contracts && forge test` |
| Result | **48 passed**, 0 failed |
| Coverage | create/buy/draw/claim/expire refund/late entropy/FoT unit/asset matrix/pending/`drawMany` all-or-nothing; **added** multi-buyer different addresses, keccak winner, config MAX |

### 2.2 `cargo test -p scoop --lib` (programs)

| | |
|---|---|
| Command | `cd programs && cargo test -p scoop --lib` |
| Result | **16 passed**, 0 failed |
| Coverage | SlotHashes anchor, late entropy, 1% fee, expire state machine, pending, delay/shares bounds, keccak LE mod |

### 2.3 EVM `scripts/e2e-local.sh` (Anvil)

| | |
|---|---|
| Command | `forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast` → `DIAMOND_ADDRESS=0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1 bash scripts/e2e-local.sh` |
| Result | **ALL E2E PASSED** |
| Coverage | ① multi-buy (PK2×10 + PK×1) → delay → draw → claimPrize/claimProceeds ② timeout expire → refund + recoverPrize ③ late mine 500 blocks → draw fails → refund/recover ④ keeper scans pending → `drawMany` + `pnpm tick` |

### 2.4 Solana `scripts/e2e-solana-local.sh`

| | |
|---|---|
| Command | `bash scripts/e2e-solana-local.sh` |
| Result | **ALL SOLANA E2E PASSED** |
| Duration | **≈ 359 s** (of which late gate ~**263 s** waiting for SlotHashes roll-out) |
| Coverage | ① **multi-buyer** (buyer×10 + authority×1) create→buy→draw→claim ② keeper `draw_many` ③ timeout without sell-out → refund + recoverPrize ④ late entropy → draw reject → refund+recover ⑤ SPL matrix: A/A, SOL/A, A/SOL, A/B |

---

## 3. Still missing (objective remaining)

1. Solana refund/recover **pass SlotHashes**, align with draw-failure moment (clear M4)  
2. Pending **resize** / capacity >64 (M5)  
3. Forge: **reentrancy attack tests**, FoT e2e through Diamond facet, dedicated double-`recoverPrize`  
4. Cargo: **FoT / Token-2022 CPI unit tests**, `close_*` rent reclaim e2e  
5. Keeper e2e: **explicit assert** skip of entropy-expired ids (logic exists; gate 4 does not assert tick skip)  
6. Frontend: no browser QA; only static chain-branch risks (wrong env / wrong chain)  
7. `scoop-keypair.json` pubkey ≠ `declare_id!` — local relies on `--bpf-program`; upgrade deploys need keypair alignment  

---

## 4. Conclusion

Anchored draw + late refund + multi-share + FoT balance-delta + Pending/keeper paths are **rule-level consistent for launch** on both chains; this round fixed config-brick-create, SPL mint binding, and docs/e2e nits, and greened forge / cargo / Anvil e2e / full Solana e2e (including late long run). Remaining items are gate precision, capacity, and deeper tests — not current fund-theft-class bugs.
