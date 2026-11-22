# Scoop Asset Policy

[English](asset-policy.md)

**Status:** product + on-chain policy for mainnet readiness  
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

## 3. Solana list / index product boundary（产品边界）

On-chain Solana MVP does **not** emit EVM-style `SharesPurchased` logs or maintain creator / prize-token secondary indexes. The web app therefore:

| Surface | Behavior | i18n keys |
|---|---|---|
| Home “Live” | Sequential scan of **recent** raffle ids — not a full site index | `homeLeadSolana`, `homeSolanaIndexHint`, `homeEmptySolana` |
| Me / purchases | 通过 `getProgramAccounts` 扫描 `BuyerRecord` PDA（seeds `["buyer", raffle_id_le, buyer]`）；RPC 禁用 GPA 时回退 localStorage + 有界近期 id 探测 | `meLeadSolana`, `meSolanaNoIndex`（仅 RPC 回退警告）, `meSolanaHint` |
| Creator / token pages | No secondary index | `solanaNoSecondaryIndex`, `solanaOpenById` |
| Settled discovery (非购买) | User searches by raffle **#ID** | `searchPlaceholder`, rules copy `rulesBodySolana` |

**中英产品边界（canonical）:**

- EN: *Solana MVP lists recent raffles on Live by scanning ids (not a full site index). “My purchases” is discovered on-chain via BuyerRecord accounts for the connected wallet — no need to memorize raffle IDs. Creator/token secondary lists still need an indexer or #ID search.*  
- 中文：*Solana MVP 热卖页用顺序扫描近期场次 id（非全站索引）。「我的购买」通过连接钱包的 BuyerRecord 链上账户发现，无需死记场次 ID。创建者/奖池币次级列表仍需索引或搜 #ID。*

EVM keeps event-based purchase indexing (`SharesPurchased`) and creator/token order maps in Diamond storage.

**残留限制：** 部分公共 RPC 禁用 `getProgramAccounts`（UI 回退并警告）。`close_buyer_record` **仅 Config.authority** 可调（买家不能自关）；authority 回收租金后 PDA 从历史消失——有索引器或长期保留后再关（见 `PROTOCOL.md` Solana account reclaim）。

---

## 4. UI / copy keys (required)

Add / keep these keys in `web/src/lib/i18n.tsx` (zh + en). Asset-rejection keys are also classified in `web/src/lib/tx.ts` for toast mapping.

| Key | EN (canonical) | When shown |
|---|---|---|
| `errFeeOnTransfer` | This token transfers less than requested (fee-on-transfer / tax). Scoop rejects it. | Create/buy/claim path hits `TransferAmountMismatch` |
| `errToken2022` | Token-2022 is not supported. Use classic SPL Token. | Solana path hits `UnsupportedTokenProgram` |
| `assetPolicyFoTHint` | Fee-on-transfer and tax tokens are rejected on-chain. | Create form helper / docs link |
| `assetPolicyToken2022Hint` | Solana: classic SPL Token only — Token-2022 is rejected. | Create form helper (Solana) |
| `assetPolicySolanaIndexHint` | Solana Live lists scan recent ids only — not a full index. Older non-purchase raffles: search #ID. | Home (may reuse existing `homeSolanaIndexHint`) |

Existing Solana index keys (do not rename): `meSolanaNoIndex` (now RPC-fallback warn), `meLeadSolana`, `homeSolanaIndexHint`, `solanaNoSecondaryIndex`, `solanaOpenById`, `rulesBodySolana`.

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
