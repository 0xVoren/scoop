# Scoop Solana Programs (Anchor MVP)

[中文](README.zh.md)

Same product semantics as the EVM Diamond. Rule source: [`docs/invariants-evm-solana.md`](../docs/invariants-evm-solana.md).

**Program ID (localnet / intended devnet keypair):** `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT`

**Testnet deploy:** [`docs/solana-testnet-deploy.md`](../docs/solana-testnet-deploy.md) · summary [`docs/testnet-contracts-deploy.md`](../docs/testnet-contracts-deploy.md).  
**Already on devnet** (same Program ID; initialize + create→buy→draw smoke passed). Local verify: `bash scripts/e2e-solana-local.sh`.

```bash
# Devnet: deploy .so + initialize (key path via env; never commit secrets)
export SOLANA_AUTHORITY_KEYPAIR=~/.config/solana/id.json
bash scripts/deploy-solana-devnet.sh
# Smoke create→buy→delay→draw (no airdrop)
bash scripts/e2e-solana-devnet.sh
```

## Toolchain

| Tool | Verified version |
|---|---|
| Anchor | 0.32.1 (`avm use 0.32.1`; removed `#![allow(deprecated)]` realloc suppressions) |
| Solana / Agave | 2.1.0 (Anchor recommends 2.3.0; 2.1.0 verified for check/test/sbf/e2e) |
| Rust (host unit tests) | stable ≥ 1.85 recommended |
| Extra crate | `solana-keccak-hasher` (keccak no longer re-exported from `solana_program` since 0.32) |

```bash
# PATH
export PATH="$HOME/.avm/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"

cd programs

# Host unit tests (no validator; fees/shares/draw window/expiry)
CARGO_TARGET_DIR=/tmp/scoop-programs-target cargo test -p scoop --lib -- --nocapture

# BPF / SBF build (needs platform-tools ≥ v1.47; lockfile pins edition2024 deps)
CARGO_TARGET_DIR=/tmp/scoop-programs-target \
  cargo-build-sbf --tools-version v1.47 --manifest-path programs/scoop/Cargo.toml
# Artifact: target/deploy/scoop.so (or $CARGO_TARGET_DIR/deploy/scoop.so)

# Or Anchor wrapper (equivalent)
anchor build
```

> On Agent Store / FUSE, if `cargo` link fails with `Resource temporarily unavailable`, set `CARGO_TARGET_DIR` to a local disk path (e.g. `/tmp/scoop-programs-target`).  
> `Cargo.lock` pins: `blake3=1.5.5`, `proc-macro-crate=3.2.0`, `indexmap=2.7.1`, `zeroize=1.8.1`, `unicode-segmentation=1.12.0`, etc., for platform-tools rustc 1.84.

## Instructions

| Instruction | Notes |
|---|---|
| `initialize` | Create Config + PendingDraws |
| `set_fee_recipient` / `set_protocol_config` | authority updates |
| `create_raffle` | Escrow prize → `Selling` (0 fee) |
| `buy_shares` | Buy shares; sell-out → `SoldOut` + enqueue pending |
| `draw` / `draw_many` | Anyone; anchor `eligible` SlotHash; `draw_many` skips not-ready / entropy-expired |
| `close_share_board` / `close_buyer_record` | Terminal-state rent reclaim (dRaffle-style close_entrants) |
| `claim_prize` | Winner gets 100% prize (0 fee) |
| `claim_proceeds` | Creator proceeds; `fee = raised/100` → fee_recipient |
| `refund` / `recover_prize` | Selling past deadline, or SoldOut entropy expired → `Expired` (0 fee); needs `pending` account |

## Account model (PDA)

| Account | Seeds | Role |
|---|---|---|
| `Config` | `["config"]` | authority, fee_recipient, next_raffle_id, ProtocolConfig |
| `PendingDraws` | `["pending"]` | Enumerable `raffle_ids[]` (keeper scan entry) |
| `Raffle` | `["raffle", raffle_id_le]` | Per-raffle state; **native SOL escrowed in this account’s lamports** |
| `ShareBoard` | `["shares", raffle_id_le]` | `owners[i]` = buyer of share i |
| `BuyerRecord` | `["buyer", raffle_id_le, buyer]` | paid / share_count / refunded |
| SPL vault ATA | ATA(raffle, mint) | Prize/payment SPL; authority = Raffle PDA |

**Native sentinel mint:** `Pubkey::default()` (all zeros), passed as a `create_raffle` **instruction argument** (cannot attach the default account on-chain). Explicit wSOL mint uses ordinary SPL; program does not auto-wrap.

### How the keeper scans pending

1. Read `PendingDraws` PDA → `raffle_ids`
2. For each id read `Raffle`: `eligible_slot = sold_out_slot + draw_delay_slots`
3. If `Clock.slot > eligible_slot`, call `draw` or batch `draw_many`
4. On success that id is dequeued from pending

`draw_many` remaining_accounts layout: `[raffle_0, share_board_0, raffle_1, share_board_1, ...]`.

## Randomness (SlotHashes)

- Eligible when: `slot > sold_out_slot + draw_delay_slots`, `draw_delay_slots ∈ [1,128]`
- Resolve: **only** the entry with `slot == eligible`; rolled out of window → `DrawEntropyExpired` (must not substitute a newer slot)
- Winner: `u64::from_le_bytes(keccak(hash || raffle_id_le)[0..8]) % total_shares` (dRaffle-style entropy expand)
- **No** VRF / oracle

## Diffs vs the invariant table

**None** (product rule values and state machine align). Chain capability diffs (SlotHashes ~512 vs EVM ~256; slot cadence) are declared equivalent in the table §1.3.

Implementation notes (not rule diffs):

- MVP is classic SPL Token Program only (rejects Token-2022; `anchor-spl` default features off)
- Secondary indexes (tokenOrderId / userOrderId) are not mirrored; `raffle_id` increments from 1
- Pending account needs reserved space; clients should `AccountInfo::resize` under heavy enqueue (or add `resize_pending` later)
- Local E2E: `bash scripts/e2e-solana-local.sh` (validator + deploy; gates: lifecycle, keeper `draw_many`, expire/refund/recover, late `DrawEntropyExpired`→refund, SPL asset matrix)
- Devnet: `bash scripts/deploy-solana-devnet.sh` + `bash scripts/e2e-solana-devnet.sh` (needs funding; see testnet docs)
- `draw_many` uses full account buffers for remaining raffle/share_board `try_deserialize` / `try_serialize` (including discriminator)

## Layout

```text
programs/
  Anchor.toml
  Cargo.toml                 # workspace
  README.md
  programs/scoop/            # Anchor program
    Cargo.toml
    src/
      lib.rs                 # entry + invariant unit tests
      constants.rs / errors.rs
      state/                 # Config, Raffle, ShareBoard, Buyer, Pending
      instructions/          # create/buy/draw/claim/refund/...
      utils/                 # SlotHashes + asset pull/push
  target/deploy/scoop-keypair.json
```
