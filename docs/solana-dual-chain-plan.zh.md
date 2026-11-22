# Scoop 双链规划（EVM + Solana）

[English](solana-dual-chain-plan.md)

**日期：** 2026-11-20  
**原则：** 一个产品、一套规则；两条链各自实现，不硬拼运行时。  
**规则源：** [`PROTOCOL.md`](PROTOCOL.md)、[`superpowers/specs/2026-11-13-scoop-design.md`](superpowers/specs/2026-11-13-scoop-design.md)  
**Phase 0：** ✅ 已执行 — 对照表 [`invariants-evm-solana.md`](invariants-evm-solana.md)；随机源 = SlotHashes（无 VRF）；资产 = 原生 SOL + SPL（原生不强制 wSOL）

## 1. 建议怎么拆

| 层 | 做法 |
|---|---|
| 产品规则 | 只维护一份链无关不变量（费用、状态机、份额上下限、开奖资格、退款） |
| 链上实现 | EVM 继续 `contracts/`；Solana 新建 `programs/`（Anchor），镜像同一状态机 |
| 前端 | 一个 `web/`，用链适配层（钱包 / RPC / 读模型 / 写交易），UI 与路由共用 |
| Keeper | 同一「扫 pending → 调 draw」职责；EVM 与 Solana 分执行器，可同仓库 `keeper/` |
| 文档与测试 | 不变量对照表 + 每链本地 E2E；禁止「Solana 先凑合、规则以后对齐」 |

不要把 Diamond / facet 模式硬搬到 Solana；用 PDA + 账户布局表达同一生命周期即可。

## 2. 建议目录（仍是一个项目）

```text
scoop/
  contracts/     # 现有 Foundry + Diamond（BSC）
  programs/      # 新增 Anchor（Solana）
  web/           # 共用前端 + chain adapters
  keeper/        # EVM + Solana 开奖触发
  docs/          # 规则与对照表
  scripts/       # 各链 e2e
```

## 3. 必须对齐的不变量（落地前先写成对照表）

1. 生命周期：`Selling → SoldOut → Drawn`，或超时 `Expired`（退款 / 收回奖品）
2. 费用：仅 `claimProceeds` 抽创作者收益的 **1%**；奖品与退款路径 **0 费**
3. 份额：`MIN_SHARES = 2`，`MAX_SHARES = 10_000`
4. 开奖：售罄后延迟 N 个「槽位」任何人可调；随机源在 Solana 上需等价替代（见下节），不可改产品语义
5. 资产：奖品与支付资产可不同（原生币 / SPL，对标 BNB / ERC-20）

产出物：[`invariants-evm-solana.md`](invariants-evm-solana.md)（每条：EVM 现状 → Solana 映射 → 测试点）。**Phase 0 已完成。**

## 4. Solana 上的关键等价（已定）

| EVM | Solana（Phase 0 定稿） |
|---|---|
| `blockhash` + `soldOutBlock + N` | 售罄记 `sold_out_slot`；`slot > sold_out_slot + N` 后任何人 `draw`；**仅**取 SlotHashes 中 `slot == eligible` 的哈希；滚出窗口 → `DrawEntropyExpired` → refund/recover（~512）。**禁止** Chainlink/Switchboard VRF |
| Diamond 单地址 + `orderId` | 程序 ID + `Raffle` PDA（种子含递增 id） |
| ERC-20 / native | SPL Token + **原生 SOL**（lamports 托管 PDA）；显式选 wSOL mint 才走 SPL。见对照表 §2 |
| `drawMany` / pending 队列 | 可查询 pending 集合 + `draw_many`；默认逐条尝试、跳过未就绪 |
| `feeRecipient` | Config PDA 收款 pubkey（+ ATA）；日后可换 splitter，不污染状态机 |

随机源与资产细节、与 EVM 差异说明：见对照表 §0–§2。若 SlotHashes 语义被破坏，先改规格文档，不要边写边改规则。

## 5. 分阶段（推荐顺序，未推翻）

### Phase 0 — 规则锁定（短）✅
- [x] 从现有 design / PROTOCOL 抽出链无关不变量对照表
- [x] 拍板 Solana 随机源与资产模型
- [x] 更新根 README：双链 monorepo 说明

### Phase 1 — `programs/` MVP
- Anchor：create / buy / draw / claimPrize / claimProceeds / refund / recoverPrize
- 单元测试覆盖与 EVM 同语义的边界（份额、费用、过期）
- 本地 validator 脚本

### Phase 2 — `web/` 多链
- 抽象：链选择、连接钱包、raffle 读模型、写操作
- 路由与文案共用；Solana 钱包（如 Solana wallet-adapter）与现有 wagmi 并存
- 环境变量按链拆分（程序 ID、集群、部署起点等）

### Phase 3 — Keeper + E2E
- Solana pending 扫描与 `draw` 触发
- `scripts/` 下 Solana 本地全链路，对齐现有 `e2e-local.sh` 心智

### Phase 4 — 测试网并联
- BSC 与 Solana 测试网各部署一套
- 同一套产品验收清单跑通后再谈主网
- Solana 侧脚本/文档：[`solana-testnet-deploy.md`](solana-testnet-deploy.md)；**devnet 程序上链仍待注资 authority**（公共 faucet 常不可用）

## 6. 明确不做（本阶段）

- 跨链桥接同一场抽奖
- 为双链强行统一账户抽象到牺牲 UX
- 提前做 Scoop 代币 / locker 分红（仍按 PROTOCOL 预留 fee sink）

## 7. 验收标准

- 对照表每条不变量在两边都有测试或明确「链差异但产品等价」说明
- 用户用同一前端可在两条链完成：创建 → 购买 → 开奖 → 领奖 / 领收益 / 过期退款
- Keeper 在两条链都能自动推进 pending draw

## 8. 下一步

1. ~~写 `docs/invariants-evm-solana.md` 并定随机源~~ ✅ Phase 0  
2. Phase 1：脚手架 `programs/`（Anchor），按对照表落地 create/buy/draw/claim/refund  
3. 并行：前端 chain adapter 骨架  

