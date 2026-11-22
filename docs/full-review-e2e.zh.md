# Scoop 全量 Review + 本地 E2E（SCO-14）

[English](full-review-e2e.md)

**日期：** 2026-11-21  
**分支工作：** `cursor/hardening-from-research-5ad4` 上的 review/fix 提交  
**对照：** [`PROTOCOL.md`](PROTOCOL.md) · [`invariants-evm-solana.md`](invariants-evm-solana.md) · [`hardening-from-research.md`](hardening-from-research.md)  
**范围：** EVM `contracts/`、Solana `programs/`、`keeper/`、关键 `scripts/`、前端链分支（点到关键风险）  
**不上测试网；** 现行最新方案为准。

---

## 1. Review 发现

### 严重（Critical）

**无。** 锚定开奖、迟到不可开→退款、1% 仅 `claimProceeds`、FoT 余额差、PendingDraws、permissionless draw、双链产品规则主体一致。

### 中（Medium）

| # | 项 | 状态 |
|---|---|---|
| M1 | Solana SPL 路径 buy/claim/refund/recover **未校验 vault/ATA mint**（仅 create 校验 prize mint）— 可错 mint 入账破坏托管 | **本轮已修**：各 SPL 路径 `require_keys_eq!(*.mint, payment/prize_mint)` + vault owner |
| M2 | EVM / Solana `setProtocolConfig` 未限制 `defaultShares`（及 Solana delay）上限，可砖创建 | **本轮已修** + forge 单测 |
| M3 | `drawMany`：文档曾写「跳过」；EVM 实为 **all-or-nothing**；Solana 为 **skip** | **文档已对齐**（`invariants` §1.4 / P4）；实现刻意双链不同，keeper EVM 须预过滤 |
| M4 | Solana SoldOut 退款门控常走 `eligible+512`（refund 未传 SlotHashes）— draw 已失败时 refund 可能短暂 `NotExpired` | **记入剩余**（hardening 已知）；多等数槽可过 |
| M5 | PendingDraws 硬容量 64、无 resize — 并发售罄第 65 场 enqueue 失败 | **记入剩余**（产品负载前再做） |

### 低（Low）

| # | 项 |
|---|---|
| L1 | 死 error：`AlreadyDrawn` / `NoBlockhash`（EVM）、Solana `AlreadyDrawn` 未接线 |
| L2 | EVM `LibAsset.push` BNB 用 string require；outbound 无余额差（FoT 已在 pull 拒绝，可接受） |
| L3 | Solana `close_buyer_record` 任意 recipient 可收租金（注释承认 ops）；keeper IX map 未含 `close_*` |
| L4 | `draw_many` 忽略 `pending.remove` 失败；remaining accounts 缺 PDA seeds 防御性校验 |
| L5 | 前端：`family === 'solana' \| 'evm'` 双轨组件；错链 pill / env 配错 Diamond vs Program ID 时 UX 失败（非合约漏洞） |

### 本轮已修（小问题）

1. EVM `OwnershipFacet.setProtocolConfig`：`defaultShares ∈ [MIN, MAX]`  
2. Solana `set_protocol_config`：shares + draw_delay 边界  
3. Solana SPL mint/owner 绑定（buy / claim_prize / claim_proceeds / refund / recover）  
4. 对照表 `drawMany` 双链语义  
5. Forge：多人异地址份额、permissionless draw + keccak 公式断言、config 上限  
6. Solana e2e：macOS `sed -i`、RPC 就绪探测、Clock 截止等待、draw 槽位 race、`--bpf-program` 与 keypair 不一致时的清晰错误  

---

## 2. 测试结果（本机实跑）

### 2.1 `forge test`（contracts）

| | |
|---|---|
| 命令 | `cd contracts && forge test` |
| 结果 | **48 passed**, 0 failed |
| 覆盖 | 创建/购买/开奖/领取/过期退款/迟到熵/FoT unit/资产矩阵/pending/`drawMany` all-or-nothing；**新增**多人异地址、keccak 赢家、config MAX |

### 2.2 `cargo test -p scoop --lib`（programs）

| | |
|---|---|
| 命令 | `cd programs && cargo test -p scoop --lib` |
| 结果 | **16 passed**, 0 failed |
| 覆盖 | 锚定 SlotHashes、迟到熵、费用 1%、过期状态机、pending、delay/shares 边界、keccak LE 取模 |

### 2.3 EVM `scripts/e2e-local.sh`（Anvil）

| | |
|---|---|
| 命令 | `forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast` → `DIAMOND_ADDRESS=0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1 bash scripts/e2e-local.sh` |
| 结果 | **ALL E2E PASSED** |
| 覆盖 | ① 多人买（PK2×10 + PK×1）→ delay → draw → claimPrize/claimProceeds ② 超时 expire → refund + recoverPrize ③ 迟到挖 500 块 → draw 失败 → refund/recover ④ keeper 扫 pending → `drawMany` + `pnpm tick` |

### 2.4 Solana `scripts/e2e-solana-local.sh`

| | |
|---|---|
| 命令 | `bash scripts/e2e-solana-local.sh` |
| 结果 | **ALL SOLANA E2E PASSED** |
| 耗时 | **≈ 359 s**（其中 late 门约 **263 s** 等 SlotHashes 滚出） |
| 覆盖 | ① **多人**（buyer×10 + authority×1）create→buy→draw→claim ② keeper `draw_many` ③ 超时未售罄 → refund + recoverPrize ④ 迟到熵 → draw 拒 → refund+recover ⑤ SPL 矩阵：A/A、SOL/A、A/SOL、A/B |

---

## 3. 仍缺什么（客观剩余）

1. Solana refund/recover **传入 SlotHashes**，与 draw 失败时刻对齐（消 M4）  
2. Pending **resize** / 容量 >64（M5）  
3. Forge：**reentrancy 攻击测**、FoT 经 Diamond facet 的 e2e、双 `recoverPrize` 专项  
4. Cargo：**FoT / Token-2022 CPI 单测**、`close_*` 租金回收 e2e  
5. Keeper e2e：**显式断言**跳过熵过期 id（逻辑已有，gate 4 未断言 tick skip）  
6. 前端：无浏览器 QA；仅静态链分支风险（配错 env / 错链）  
7. `scoop-keypair.json` pubkey ≠ `declare_id!` — local 靠 `--bpf-program`；升级部署需对齐 keypair  

---

## 4. 结论

锚定开奖 + 迟到退款 + 多人份额 + FoT 余额差 + Pending/keeper 路径在双链上**可上线规则层面一致**；本轮修了 config 砖创建、SPL mint 绑定、文档/e2e 毛刺，并跑绿 forge / cargo / Anvil e2e / Solana 全量 e2e（含 late 长跑）。剩余项为门控精度、容量与测试加深，非当前资金盗窃级漏洞。
