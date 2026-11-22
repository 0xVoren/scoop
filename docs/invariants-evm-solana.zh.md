# Scoop 不变量对照表（EVM ↔ Solana）

[English](invariants-evm-solana.md)

**日期：** 2026-11-20  
**阶段：** Phase 0（规则锁定）  
**原则：** 一套产品规则；链差异仅在机制层，不改费用、状态机、开奖可调用性与资产语义。  
**规则源：** [`PROTOCOL.md`](PROTOCOL.md)、[`superpowers/specs/2026-11-13-scoop-design.md`](superpowers/specs/2026-11-13-scoop-design.md)、`contracts/src/`（`LibRaffleDraw`、`LibRaffleClaim`、`LibConstants`、`AppStorage`、`IScoopRaffle`）

---

## 0. Phase 0 拍板摘要

| 决策 | 结论 |
|---|---|
| 随机源 | **SlotHashes 窗口内解析**（对标 EVM `blockhash`）：售罄记 `sold_out_slot`，延迟 N 个 slot 后任何人可 `draw`；**禁止** Chainlink / Switchboard VRF |
| 资产模型 | **原生 SOL + SPL Token**（对标 BNB + ERC-20）；奖品与支付可不同；原生路径用 lamports 托管，**不**强制 wrap 成 wSOL |
| 结构 | Solana 用程序 ID + `Raffle` PDA，**不**搬 Diamond / facet |

---

## 1. 随机源方案（产品等价，无外部 VRF）

### 1.1 EVM 现状（已实现）

- `eligible = soldOutBlock + drawDelayBlocks`；首次可调条件：`block.number > eligible`。
- `resolveDrawBlock`：**仅**使用 `blockhash(eligible)`；为零则 `DrawEntropyExpired`（**禁止**改用更新的块哈希）。
- `winnerShareIndex = uint256(keccak256(abi.encodePacked(blockhash(eligible), orderId))) % totalShares`。
- 任何人可 `draw` / `drawMany`；迟到且哈希滚出 ~256 窗口 → 不可开奖，走 `refund`/`recoverPrize`。
- `drawDelayBlocks ∈ [1, 128]`（`LibConstants`）。

### 1.2 Solana 映射（Phase 0 定稿）

| 项 | 取值 |
|---|---|
| 时间单位 | **slot**（对标 EVM block） |
| 售罄锚点 | 买满时写 `sold_out_slot = Clock::get().slot` |
| 可开奖 | `Clock::get().slot > sold_out_slot + draw_delay_slots` |
| 延迟边界 | `draw_delay_slots ∈ [1, 128]`（与 EVM 数值一致） |
| 随机字节 | 读 sysvar **`SlotHashes`**：**精确** `slot == eligible` 的条目哈希 |
| 迟到 | eligible 滚出窗口 → `DrawEntropyExpired`；**不**改用最新 slot。退款门控：`slot > eligible + 512`（`SLOT_HASHES_RETENTION`）或等价 |
| 获胜公式 | `winner = u64::from_le_bytes(keccak(hash \|\| raffle_id_le)[0..8]) % total_shares` |
| 可调用性 | 任何人可调 `draw` / `draw_many`；无权限、无 keeper 强制 |
| **禁止** | 静默换成 Chainlink VRF、Switchboard、oracle 回调、off-chain 签名随机；用「提交时最新哈希」开奖 |

### 1.3 与 EVM 的差异（仍算规则一致）

| 差异 | 说明 | 为何仍等价 |
|---|---|---|
| 窗口长度 | EVM ~256 blocks；Solana SlotHashes ~512 slots | 产品语义同为「锚定 eligible 哈希；滚出则退款」；窗口是链能力 |
| 出块/出槽节奏 | BSC ~0.75s；Solana ~0.4s | `N` 同为「延迟槽位数」；用户体感时间略不同，规则字段与边界相同 |
| 哈希 API | `blockhash(n)` vs `SlotHashes` 查表 | 均为「该槽/块的链上承诺哈希」，非外部熵 |
| 程序须传 sysvar 账户 | Solana 账户模型要求显式传入 `SlotHashes` | UX/指令布局差异；对买家/创作者无规则变化 |

若将来 SlotHashes 不可用或窗口语义被破坏，**停在规格层改文档**，不得边写边改成 VRF。

**实现备注（keeper）：** 扫 `PendingDraws` → 仅对 `eligible < slot ≤ eligible+512` 的场次 `draw`；熵过期场次跳过并告警，由用户 `refund`/`recover`（见 `keeper/README.md`）。

### 1.4 随机源测试点

- 售罄后未过 N：`draw` 失败（TooEarly）。
- `current > eligible` 且锚定哈希在窗内：成功，`drawBlock/slot == eligible`，winner 落在 `[0, total_shares)`，状态 → Drawn，pending 出队。
- 迟到开奖（eligible 已滚出窗口）：`DrawEntropyExpired`；随后 `refund`/`recover` → Expired。
- 同一 `raffle_id` 不可二次 `draw`。
- `draw_many`：Solana 部分就绪时跳过 TooEarly / 熵过期；EVM `drawMany` 为 **all-or-nothing**（调用方须预过滤，与合约计划及单测一致）。

---

## 2. 资产模型（SOL + SPL，含 wSOL 策略）

### 2.1 对照

| 角色 | EVM | Solana |
|---|---|---|
| 原生币 | `address(0)` = BNB，`msg.value` / 合约余额 | **原生 SOL**：sentinel mint = `Pubkey::default()`（全零）；System Program 转入/转出 **raffle 托管 PDA** 的 lamports |
| 同质代币 | ERC-20 | **经典 SPL Token Program**（Token-2022 拒绝：`UnsupportedTokenProgram`） |
| 奖品 ≠ 支付 | 已支持（可被 `allowDifferentTokens` 门控） | 同：`prize_mint` 与 `payment_mint` 可不同 |
| 奖品 = 支付 | 允许 | 允许 |

### 2.2 wSOL 策略（默认）

1. **产品「原生 SOL」路径**：托管 **lamports**，不 wrap。对标 EVM 的 BNB `address(0)`。
2. **用户显式选 Wrapped SOL mint**（`So11111111111111111111111111111111111111112`）：走 **普通 SPL** 路径（ATA ↔ vault ATA），与任意其他 mint 相同。
3. **程序不自动 wrap/unwrap**：创建/购买/领取时，原生与 SPL 分路；前端若展示「SOL」，映射到原生路径，不静默改成 wSOL。
4. **feeRecipient**：配置账户存收款 pubkey；原生费 → 转 lamports；SPL 费 → 其对应 ATA（缺失则指令要求预先创建或 CPI 创建，Phase 1 固定一种）。

### 2.3 资产测试点

- 矩阵：奖品×支付 ∈ {SOL, SPL_A, SPL_B}（含同 mint、异 mint）。
- 原生路径：`msg.value` 精确匹配；SPL 路径：转账金额精确，无 fee-on-transfer。
- wSOL 作为 SPL 与「原生 SOL」两场并存时，托管账户互不混用。

---

## 3. 不变量一行对照

格式：**主题** — EVM 现状 → Solana 映射 → 测试点

### 3.1 状态机

| # | 不变量 | EVM 现状 | Solana 映射 | 测试点 |
|---|---|---|---|---|
| S1 | 公开生命周期 | `Selling → SoldOut → Drawn`；或 `Selling → Expired`；或 `SoldOut → Expired`（仅熵过期） | 同四态枚举，存在 `Raffle` PDA | 合法转移均覆盖；禁止 Drawn→Expired；SoldOut→Expired 仅当锚定哈希不可用 |
| S2 | 创建落点 | `createRaffle` 直接 `Selling`，无长期 `Created` | `create` 初始化 PDA 为 `Selling` 并托管奖品 | 创建后可读为 Selling；奖品已锁定 |
| S3 | 售罄 | 买满 → `SoldOut`，写 `soldOutBlock`，入 pending | 买满 → `SoldOut`，写 `sold_out_slot`，入 pending | 最后一份额购买触发；超额购买失败 |
| S4 | 过期懒触发 | 超时未售罄；首次 `refund`/`recoverPrize` 将 `Selling`→`Expired` | 同：比较 `Clock.unix_timestamp` 与 `deadline` | 截止前不可退；截止后首次退款改状态 |
| S5 | Drawn 永不退；SoldOut 仅熵过期可退 | `_ensureExpired`：Drawn 拒绝；SoldOut 仅当 `blockhash(eligible)==0` | 同：Drawn 拒绝；SoldOut 当 `slot > eligible+512`（或 SlotHashes 无 eligible） | 可开奖窗口内 SoldOut 不可 refund；熵过期后可 |

### 3.2 费用 1%

| # | 不变量 | EVM 现状 | Solana 映射 | 测试点 |
|---|---|---|---|---|
| F1 | 费率 | `fee = raised / 100`（`FEE_DENOMINATOR=100`） | 同整数除法 | `raised=1100` → fee=11；`raised<100` → fee=0 |
| F2 | 仅收益侧 | 只在 `claimProceeds` 抽 1% | 同指令语义 | claimPrize 前后 feeRecipient 余额不变 |
| F3 | 奖品 0 费 | 赢家得 100% `prizeAmount` | 同 | 赢家余额 +prizeAmount |
| F4 | 退款/收回 0 费 | `refund` / `recoverPrize` 不抽成 | 同 | 过期全额退支付、全额回奖品 |
| F5 | 创建 0 费 | create 只托管奖品 | 同 | 创建不增加 fee 账户余额 |
| F6 | 舍入 | 余数归创作者（`raised - fee`） | 同 | fee + creator == raised |

### 3.3 份额 2–10000

| # | 不变量 | EVM 现状 | Solana 映射 | 测试点 |
|---|---|---|---|---|
| H1 | 上下限 | `MIN_SHARES=2`，`MAX_SHARES=10_000` | 同常量 | 1 与 10001 创建失败；2 与 10000 成功 |
| H2 | 索引 | 份额下标 `0 .. totalShares-1`，按购买顺序分配 | 同 | 售罄后 `share_owner[i]` 全覆盖 |
| H3 | 多份额同址 | 同一买家可持多下标；开奖按 index 不按地址去重 | 同 | 多买后可赢其中一个 index |
| H4 | 会计 | `raised == pricePerShare * soldShares`（售罄时 = `* totalShares`） | 同 | 买后校验；claim 用满额 raised |

### 3.4 开奖延迟与可调用性

| # | 不变量 | EVM 现状 | Solana 映射 | 测试点 |
|---|---|---|---|---|
| D1 | 延迟字段 | `drawDelayBlocks ∈ [1,128]` | `draw_delay_slots ∈ [1,128]` | 边界与越界 |
| D2 | 可开奖条件 | `block.number > soldOutBlock + N` | `slot > sold_out_slot + N` | N=1 与 N=128 |
| D3 | 权限 | 任何人 `draw` | 任何人 `draw` | 非买家/非创建者可开奖 |
| D4 | 随机绑定 | **仅** `blockhash(eligible)` + `orderId` 展开 | **仅** `slot==eligible` 的 SlotHash + `raffle_id` 展开 | 记录的 drawBlock/slot 必须等于 eligible |
| D5 | 迟到不可开 | 哈希滚出 → `DrawEntropyExpired` → 退款 | 同 | 迟到 draw 失败；refund 成功 |
| D6 | 一次性 | Drawn 后不可再开 | 同 | 二次 draw 失败 |

### 3.5 退款 / 收回奖品

| # | 不变量 | EVM 现状 | Solana 映射 | 测试点 |
|---|---|---|---|---|
| R1 | 条件 | `timestamp > deadline` 且非 SoldOut/Drawn | 同用 unix 截止 | 截止边界 |
| R2 | 买家退款 | 按 `buyerPaid` 一次；`buyerRefunded` 防重入 | PDA 内映射或 per-buyer 账户；一次性 | 双退失败；金额 = 已付 |
| R3 | 创作者收回 | `recoverPrize` 一次全额奖品 | 同 | 双收失败 |
| R4 | 无费用 | 两侧 0 费 | 同 | feeRecipient 不变 |

### 3.6 双资产（奖品 ≠ 支付）

| # | 不变量 | EVM 现状 | Solana 映射 | 测试点 |
|---|---|---|---|---|
| A1 | 独立选择 | `prizeToken` / `paymentToken` 可异 | `prize_mint` / `payment_mint` 可异 | 异资产全链路 |
| A2 | 原生哨兵 | `address(0)` = BNB | `Pubkey::default()` = 原生 SOL | 原生奖品+SPL 支付等组合 |
| A3 | 托管隔离 | 每 `orderId` 不补贴其他场 | 每 raffle PDA/vault 隔离 | 两场并行领取不错账 |
| A4 | 精确转账 | pull 用余额差；FoT → `TransferAmountMismatch` | SPL 余额差；Token-2022 拒 | FoT 创建/购买失败；经典 token 余额变化 = 期望值 |

### 3.7 feeRecipient

| # | 不变量 | EVM 现状 | Solana 映射 | 测试点 |
|---|---|---|---|---|
| E1 | 协议费汇 | `AppStorage.feeRecipient`；owner `setFeeRecipient` | `Config` PDA 字段；authority 可更新 | 更新后新 claim 打到新地址 |
| E2 | 接收能力 | EOA 或可收 BNB+ERC-20 的合约 | 可收 SOL 的 pubkey + SPL ATA | 原生费与 SPL 费各一测 |
| E3 | 与状态机解耦 | 抽奖逻辑不解读分账/锁仓 | 同；未来 splitter 只换收款方 | claimProceeds 只 push 1%，无 50/50 内嵌 |
| E4 | 非零 | 不可设 `address(0)` | 不可设默认/空 pubkey | set 零地址失败 |

### 3.8 pending draw / drawMany

| # | 不变量 | EVM 现状 | Solana 映射 | 测试点 |
|---|---|---|---|---|
| P1 | 入队 | 售罄 `pendingDrawAdd` | 售罄写入 pending 集合（账户列表或可枚举索引） | `pending_count` +1 |
| P2 | 出队 | 成功 `draw` → `pendingDrawRemove` | 同 | 开奖后不在 pending |
| P3 | 视图 | `pendingDrawCount` / `pendingDrawAt(i) → (orderId, eligibleBlock)` | 等价视图或账户字段：`raffle_id` + `eligible_slot` | keeper 可扫描 |
| P4 | 批量 | `drawMany(orderId[])` 任何人可调；**整批 all-or-nothing**（一笔失败则整批 revert） | `draw_many` 传入多个 raffle 账户；TooEarly/熵过期 **跳过**，就绪者开奖 | EVM 混入未就绪 id 整批失败；Solana 同批可部分成功 |
| P5 | 禁止全表扫描依赖 | 不以遍历全部历史 orderId 为唯一手段 | 同：pending 可枚举 | 文档+测试断言 pending 路径 |

### 3.9 领取与托管

| # | 不变量 | EVM 现状 | Solana 映射 | 测试点 |
|---|---|---|---|---|
| C1 | 领奖 | `claimPrize`：仅赢家，一次，全额奖品 | 同 | 非赢家失败；双领失败 |
| C2 | 领收益 | `claimProceeds`：仅创作者，一次，99%+1% | 同 | 非创作者失败 |
| C3 | 托管下限 | 活跃期间 Diamond 持有未领奖品与未领支付 | raffle/vault PDA 持有对应资产 | 领完后 vault 对应侧归零 |

### 3.10 身份与索引（产品级，实现形态可变）

| # | 不变量 | EVM 现状 | Solana 映射 | 测试点 |
|---|---|---|---|---|
| I1 | 全局 id | `orderId` 自 1 递增 | `raffle_id` 自 1 递增（或 PDA 种子含 id） | 创建单调 |
| I2 | 次级索引 | prizeToken / creator 下 1-based 序号 | 可用 PDA 或索引账户镜像 | 浏览用 id 可解析 |
| I3 | 单地址入口 | Diamond 地址 | 单一 Program ID | 前端只配程序 ID + 集群 |

---

## 4. 明确不做（本对照表约束）

- 跨链同一场抽奖 / 桥接份额  
- 为 Solana「先上 VRF 以后再对齐」  
- 在抽奖状态机内嵌入代币锁仓分红  
- 强制把原生 SOL 全部做成 wSOL  

---

## 5. Phase 0 完成标准

- [x] 本对照表覆盖状态机、费用、份额、开奖、退款、双资产、feeRecipient、pending/drawMany  
- [x] 随机源定为 SlotHashes，无外部 VRF  
- [x] 资产模型与 wSOL 策略写清  
- [ ] Phase 1+：每条不变量有链上/单元测试挂钩（见各「测试点」列）

**关联：** 双链阶段顺序见 [`solana-dual-chain-plan.md`](solana-dual-chain-plan.md)。
