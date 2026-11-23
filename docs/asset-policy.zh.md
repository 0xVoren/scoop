# Scoop 资产策略

[English](asset-policy.md)

Scoop 接受哪些资产作为奖池或支付的产品与链上规则。双链通用；主网就绪前 UI 文案须与这些闸门一致。

**规则源：** [`PROTOCOL.md`](PROTOCOL.md) §Supported assets · [`invariants-evm-solana.md`](invariants-evm-solana.md) §2 · [`hardening-from-research.md`](hardening-from-research.md)  
**UI 文案键：** `web/src/lib/i18n.tsx`（见 §4）

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

On-chain Solana MVP 不发出 EVM 式 `SharesPurchased` 日志，也不维护独立的创建者 / 奖池币索引表。前端用 `getProgramAccounts`（GPA）+ 客户端过滤发现账户：

| Surface | Behavior | i18n keys |
|---|---|---|
| Home “Live” | 对 `Raffle` 账户 GPA（discriminator + 定长）；客户端过滤 Selling / SoldOut；Drawn / Expired 进首页归档 | `homeLeadSolana`, `homeArchiveTitle`, `homeEmptySolana` |
| Home 当 GPA 被拒 | 有界近期 id 扫描回退 + 警告 | `homeSolanaIndexHint`, `solanaGpaFallback` |
| Me / purchases | 通过 `getProgramAccounts` 扫描 `BuyerRecord` PDA（seeds `["buyer", raffle_id_le, buyer]`）；RPC 禁用 GPA 时回退 localStorage + 有界近期 id 探测 | `meLeadSolana`, `meSolanaNoIndex`（仅 RPC 回退警告）, `meSolanaHint` |
| Creator / token pages | 对 `Raffle.creator` / `Raffle.prize_mint` GPA memcmp（无新链上索引） | `solanaNoSecondaryIndex`, `solanaGpaFallback` |
| Settled discovery | 首页归档 +「我的」；#ID 搜索仍可用 | `homeArchiveLead`, `searchPlaceholder`, `rulesBodySolana` |

**中英产品边界（canonical）:**

- EN: *Solana Live discovers raffles via getProgramAccounts on Raffle accounts (not “recent id only”). “My purchases” use BuyerRecord GPA. Creator / prize-mint pages reuse Raffle memcmp filters. Some public RPCs disable GPA — UI falls back and warns.*  
- 中文：*Solana 热卖页通过 Raffle 账户 GPA 全量发现（不再只是「扫近期 id」）。「我的购买」用 BuyerRecord GPA。创建者/奖池币页面对同一批账户做 memcmp 过滤。部分公共 RPC 禁用 GPA 时回退并诚实提示。*

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
| `assetPolicySolanaIndexHint` | Solana Live discovers raffles via getProgramAccounts; some public RPCs disable GPA (UI falls back and warns). | Home / docs（GPA 失败时复用 `homeSolanaIndexHint`） |

Existing Solana index keys (do not rename): `meSolanaNoIndex`（RPC 回退警告）, `meLeadSolana`, `homeSolanaIndexHint`（GPA 失败警告）, `homeArchiveTitle`, `solanaNoSecondaryIndex`, `solanaGpaFallback`, `solanaOpenById`, `rulesBodySolana`.

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
