# Scoop Protocol Notes

Canonical product and on-chain invariants for Scoop (fees, draw entropy, assets, account reclaim). Design history lives under `docs/superpowers/`.

| | |
|---|---|
| Live UI | https://0xvoren.github.io/scoop/ |
| Source | https://github.com/0xVoren/scoop |
| BSC testnet Diamond | `0xfB2678ff49967B073F6537781EC3d35DE731a5DF` |
| Solana program (devnet) | `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT` |

Cross-chain rules: [`invariants-evm-solana.md`](invariants-evm-solana.md).  
Research hardening: [`hardening-from-research.md`](hardening-from-research.md), [`github-similar-raffles.md`](github-similar-raffles.md).  
Asset policy (UI + chain): [`asset-policy.md`](asset-policy.md).

## Fee (current)

- Rate: **1% of creator proceeds only** (`fee = raised / 100` on `claimProceeds`).
- Winner / prize path: **no fee**.
- Expiry `refund` / `recoverPrize`: **no fee**.
- Destination: `feeRecipient` (owner can update via `setFeeRecipient`).

Treat `feeRecipient` as the **protocol fee sink**: an EOA **or** a contract that can receive BNB and ERC-20. Raffle facets push the fee and stop there; they do not interpret staking, dividends, or tokenomics. Prefer a receivable multi-asset address before ownership renounce.

## Draw (anchored blockhash / SlotHashes)

Externally verifiable formula (both chains):

| | EVM | Solana |
|---|---|---|
| Anchor | `eligible = soldOutBlock + drawDelayBlocks` | `eligible = sold_out_slot + draw_delay_slots` |
| Callable | `block.number > eligible` | `Clock.slot > eligible` |
| Entropy | **only** `blockhash(eligible)` | **only** SlotHashes entry with `slot == eligible` |
| Winner | `uint256(keccak256(abi.encodePacked(h, orderId))) % totalShares` | `u64::from_le_bytes(keccak(h \|\| raffle_id_le)[0..8]) % total_shares` |

- Anyone may `draw` / `drawMany`. Optional **keeper** polls pending and calls draw; FE may ping `NEXT_PUBLIC_KEEPER_URL/trigger`.
- **No clamp to “current head”.** If the anchored hash aged out of the chain window (~256 blocks / ~512 SlotHashes), `draw` reverts (`DrawEntropyExpired`) and buyers/creator use `refund` / `recoverPrize` (SoldOut → Expired, pending dequeued).
- Threat model: permissionless callers cannot abort-and-retry for a friendlier head hash (Galxe-style MEV) because entropy is fixed to `eligible`.

## Supported assets

| | Supported | Unsupported (rejected or documented) |
|---|---|---|
| EVM | BNB (`address(0)`), standard ERC-20 | Fee-on-transfer / tax tokens (balance-diff revert `TransferAmountMismatch`); rebasing that under-delivers; pause that reverts mid-transfer |
| Solana | Native SOL (`Pubkey::default()`), classic SPL Token Program | **Token-2022** (`UnsupportedTokenProgram`); fee-on-transfer style SPL (vault balance-diff check) |

Pull paths record expected amount and require vault balance increase to match exactly.

## Shares bounds

- `MIN_SHARES = 2`, `MAX_SHARES = 10_000` (caps per-share `shareOwner` writes when custom shares unlock).

## Solana account reclaim

**Permission:** only `Config.authority` may call `close_share_board` / `close_buyer_record`. Rent goes to an **authority-chosen** `recipient` (typically `fee_recipient` or authority). Buyers and strangers **cannot** close — Me listing (`BuyerRecord` GPA) must not be wiped by a buyer self-close.

| Instruction | Status gate | Who | Rent to |
|---|---|---|---|
| `close_share_board` | `Drawn` or `Expired` | Config.authority | authority-chosen recipient |
| `close_buyer_record` | buyer `refunded` **or** raffle `Drawn` | Config.authority | authority-chosen recipient |

**Retention (Me / SCO-34):** prefer **not** reclaiming `BuyerRecord` rent while the product relies on on-chain GPA for purchase history. Ops should delay close until an indexer exists, or after an explicit long retention once refunded/claimed paths are settled. Correct permissions beat early rent reclaim.

## Future reservation: locker dividends (not implemented)

**Intent (product, undecided rules):** someday issue a token; users may lock it for “dividend shares”; of each 1% protocol fee, roughly half to Dev and half to lockers. Token not launching; lock→share formula not fixed.

**Reservation strategy (do this, nothing more until rules ship):**

| Do now | Do **not** do now |
|---|---|
| Keep `claimProceeds` → 1% → sink | Stake / lock facets or share math in Diamond |
| Keep `setFeeRecipient` as the only switch | Hard-code 50/50 inside `LibRaffleClaim` |
| Document sink as swappable | Premature `AppStorage` staking mappings |
| When ready: deploy splitter/treasury, then `setFeeRecipient(module)` | Couple raffle status machine to a token address |

**Upgrade path when rules are ready:**

1. Deploy a fee module (e.g. `FeeSplitter` / treasury) that receives BNB and ERC-20 fees.
2. Module owns: Dev cut, locker pool, accounting, claim UX — **not** raffle create/buy/draw.
3. Owner calls `setFeeRecipient(module)`.
4. Existing and future raffles keep the same 1% semantics; only the sink changes.

**Non-goals until explicitly scheduled:** Scoop token bytecode, lock durations, share weights, snapshot vs continuous accrual, multi-asset dividend claims.

## Related

- Design spec: `docs/superpowers/specs/2026-11-13-scoop-design.md`
- Ownership: `OwnershipFacet.setFeeRecipient` / `feeRecipient`
- Claim: `LibRaffleClaim.claimProceeds`
- Keeper: `keeper/README.md` · local E2E: `scripts/e2e-local.sh` / `scripts/e2e-solana-local.sh`
- Mainnet prep: [`security-checklist-mainnet.md`](security-checklist-mainnet.md) · [`mainnet-runbook.md`](mainnet-runbook.md) · [`asset-policy.md`](asset-policy.md) · [`mainnet-canary.md`](mainnet-canary.md)
- Asset / index UX: [`asset-policy.md`](asset-policy.md)
