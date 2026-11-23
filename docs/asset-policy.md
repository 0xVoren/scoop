# Scoop Asset Policy

[中文](asset-policy.zh.md)

Product and on-chain rules for which assets Scoop accepts as prize or payment. Applies to both chains; UI copy must match these gates before mainnet readiness.

**Rule source:** [`PROTOCOL.md`](PROTOCOL.md) §Supported assets · [`invariants-evm-solana.md`](invariants-evm-solana.md) §2 · [`hardening-from-research.md`](hardening-from-research.md)  
**UI copy keys:** `web/src/lib/i18n.tsx` (see §4)

---

## 1. Supported (both chains)

| Role | BSC / EVM | Solana |
|---|---|---|
| Native | BNB — sentinel `address(0)` | SOL — sentinel `Pubkey::default()` |
| Fungible | Standard ERC-20 (exact credit) | Classic **SPL Token Program** only |
| Prize ≠ payment | Allowed when `allowDifferentTokens` | Same flag |
| wBNB / wSOL | Treat as ERC-20 / SPL mint if user pastes mint | **No** auto wrap/unwrap; native SOL path stays lamports |

Pull paths record the expected amount and require the vault / contract balance increase to match **exactly**.

---

## 2. Rejected / unsupported

### 2.1 Fee-on-transfer / tax / deflationary (FoT)

| | EVM | Solana |
|---|---|---|
| Detection | `LibAsset.pull` balance-before/after | `pull_spl_checked` vault delta |
| On-chain error | `TransferAmountMismatch` | `TransferAmountMismatch` |
| Product stance | **Reject** — do not create or buy with FoT as prize or payment | Same |
| Why | Escrow and claims assume exact amounts; silent skim breaks winner/creator accounting |

Rebasing tokens that shrink mid-flight are treated the same (under-delivery → revert). Pausable tokens that revert transfers are unsupported (no separate pause probe).

### 2.2 Token-2022 (Solana)

| | |
|---|---|
| Detection | Non–Token Program id on SPL path |
| On-chain error | `UnsupportedTokenProgram` |
| Product stance | **Reject** — MVP / mainnet-v1 supports classic Token Program only |
| Why | Transfer-fee, freeze, and other extensions break exact-credit assumptions |

### 2.3 Explicit non-goals

- No mint whitelist contract (yet) — defense is exact-credit + Token-2022 reject  
- No support path for “almost FoT” or partial credits  
- No admin rescue of escrow beyond normal `refund` / `recoverPrize` rules  

---

## 3. Solana list / index product boundary

On-chain Solana MVP does **not** emit EVM-style `SharesPurchased` logs or maintain dedicated creator / prize-token index tables. The web app discovers accounts with `getProgramAccounts` (GPA) + client filters:

| Surface | Behavior | i18n keys |
|---|---|---|
| Home “Live” | GPA on `Raffle` accounts (discriminator + fixed size); client-filter Selling / SoldOut; Drawn / Expired in home archive | `homeLeadSolana`, `homeArchiveTitle`, `homeEmptySolana` |
| Home when GPA blocked | Bounded recent-id scan fallback + warn | `homeSolanaIndexHint`, `solanaGpaFallback` |
| Me / purchases | GPA on `BuyerRecord` PDAs (`["buyer", raffle_id_le, buyer]`); fallback = localStorage ids + bounded recent-id probe | `meLeadSolana`, `meSolanaNoIndex` (RPC fallback warn only), `meSolanaHint` |
| Creator / token pages | GPA memcmp on `Raffle.creator` / `Raffle.prize_mint` (client filter; no new on-chain indexes) | `solanaNoSecondaryIndex`, `solanaGpaFallback` |
| Settled discovery | Home archive + Me; #ID search still works | `homeArchiveLead`, `searchPlaceholder`, `rulesBodySolana` |

**Canonical product boundary:**

Solana Live discovers raffles via `getProgramAccounts` on Raffle accounts (not “recent id only”). “My purchases” use BuyerRecord GPA for the connected wallet. Creator / prize-mint pages reuse the same Raffle accounts with memcmp filters. Some public RPCs disable GPA — UI falls back to a bounded recent-id scan and warns honestly.

EVM keeps event-based purchase indexing (`SharesPurchased`) and creator/token order maps in Diamond storage.

**Residual limits:** some public RPCs disable `getProgramAccounts` (UI falls back + warns). `close_buyer_record` is **Config.authority-only** (buyers cannot self-close); when authority does reclaim rent, the PDA disappears from history — delay reclaim until an indexer exists or after long retention (see `PROTOCOL.md` Solana account reclaim).

---

## 4. UI / copy keys (required)

Add / keep these keys in `web/src/lib/i18n.tsx` (zh + en). Asset-rejection keys are also classified in `web/src/lib/tx.ts` for toast mapping.

| Key | EN (canonical) | When shown |
|---|---|---|
| `errFeeOnTransfer` | This token transfers less than requested (fee-on-transfer / tax). Scoop rejects it. | Create/buy/claim path hits `TransferAmountMismatch` |
| `errToken2022` | Token-2022 is not supported. Use classic SPL Token. | Solana path hits `UnsupportedTokenProgram` |
| `assetPolicyFoTHint` | Fee-on-transfer and tax tokens are rejected on-chain. | Create form helper / docs link |
| `assetPolicyToken2022Hint` | Solana: classic SPL Token only — Token-2022 is rejected. | Create form helper (Solana) |
| `assetPolicySolanaIndexHint` | Solana Live discovers raffles via getProgramAccounts; some public RPCs disable GPA (UI falls back and warns). | Home / docs (may reuse `homeSolanaIndexHint` when GPA fails) |

Existing Solana index keys (do not rename): `meSolanaNoIndex` (RPC-fallback warn), `meLeadSolana`, `homeSolanaIndexHint` (GPA-failure warn), `homeArchiveTitle`, `solanaNoSecondaryIndex`, `solanaGpaFallback`, `solanaOpenById`, `rulesBodySolana`.

---

## 5. Operator checklist

- [ ] FE create form shows FoT / Token-2022 hints on the active chain  
- [ ] Tx toasts map on-chain errors to `errFeeOnTransfer` / `errToken2022`  
- [ ] Marketing / docs never claim “any SPL” or “any ERC-20” without the exclusions above  
- [ ] Canary uses only native + one vanilla ERC-20 / classic SPL mint ([`mainnet-canary.md`](mainnet-canary.md))  

---

## Related

- Protocol: [`PROTOCOL.md`](PROTOCOL.md)  
- Security: [`security-checklist-mainnet.md`](security-checklist-mainnet.md)  
- Testnet asset matrix evidence: [`testnet-full-e2e.md`](testnet-full-e2e.md)
