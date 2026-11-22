# GitHub 类 Scoop 链上份额抽奖调研

[English](github-similar-raffles.md)

**日期：** 2026-11-20  
**范围：** 公开 GitHub 仓库（EVM + Solana）；对照 Scoop：托管奖品、固定份额售罄、延迟 N 块/slot、`blockhash`/`SlotHashes` 开奖、赢家 100% 奖品、创作者 claim 扣 1% 协议费、过期退款/收回、无外部 VRF。  
**方法：** `search_repositories` / `search_code` / 仓库 README 与核心合约源码阅读。关键词覆盖：share raffle、一元夺宝、on-chain raffle、lottery escrow、fairdraw、NFT raffle factory、blockhash raffle、pending draw、Solana raffle / Anchor。

---

## 结论摘要

- **产品形态最接近：** `yushuohuanxiu/OneChance`（以太坊一元夺宝：固定份数 Chance、售罄后开奖）。随机源是 commit–reveal，不是 blockhash；且奖品由主办方链下发货，非链上托管。
- **技术栈最接近（Solana）：** `draffle-io/draffle`（及衍生 `reecen96/Riff-Raffle-Solana-NFT`）——PDA 托管奖品/票款、`RecentBlockhashes` 开奖、结束时间 + **TIME_BUFFER**、任何人可 `reveal_winners`、claim 时按展开熵选赢家、创作者 `collect_proceeds` 可扣协议费 BPS。与 Scoop 的「售罄触发 + SlotHashes」高度同构，但触发条件是**时间截止**而非售罄。
- **EVM 主流开源多为 NFT 票券 + Chainlink VRF / 教育审计靶标**；真正「份额夺宝 + 链上托管原生币/代币 + 无 VRF」的生产级开源极少。Scoop 的 Diamond + 无 VRF + permissionless keeper 组合在公开库中几乎是独特定位。
- **必须正视的旁证：** Galxe 合约源码明确记录了「relayer 对 `prevrandao` 做 test-and-abort」类 MEV；Cyfrin Puppy Raffle 系统化暴露弱 RNG / DoS / 退款坑。这些比「再找一个同款夺宝」对 Scoop 更有工程价值。

---

## 对照表（Scoop vs 候选）

| 维度 | Scoop | 多数开源 raffle | 最接近者 |
|------|-------|-----------------|----------|
| 售卖单位 | 固定份额售罄 | 时间窗卖票 / 可变人数 | OneChance（份额）；dRaffle（票，时间窗） |
| 奖品 | 链上托管原生币/ERC20/SPL | NFT / ERC1155 为主 | dRaffle / waffle / aavegotchi |
| 开奖触发 | 售罄 + delay | 时间截止 +（可选）buffer | dRaffle（时间 + buffer） |
| 随机源 | blockhash / SlotHashes（产品选择） | Chainlink VRF 为主 | dRaffle（RecentBlockhashes）；OneChance（commit–reveal） |
| 费用 | claim 扣 1% 创作者收益 | 票款抽成 / LINK 成本 / 0 | dRaffle（BPS，生产常关） |
| 架构 | Diamond / PDA + PendingDraws | Factory / 单合约 / AppStorage | aavegotchi AppStorage；waffle Factory |
| 运维 | pendingDraw keeper + FE trigger | 人工 reveal / Chainlink Automation | Scoop 已领先多数开源 |

---

## 精选仓库（8）

### 1. [yushuohuanxiu/OneChance](https://github.com/yushuohuanxiu/OneChance)

- **一句话：** 2016 年以太坊「一元夺宝」实现：主办发奖品、用户用活动币买 Chance、售罄后开奖。
- **链：** Ethereum（Solidity ^0.4）。
- **随机源：** 购票时交 `sha3(seed)`，售罄后交明文；`sum(seeds) % amt + 1`。文档自述曾考虑 Randao；并指出**末位用户拒绝提交**可操纵结果。
- **费用模型：** 链下 RMB↔活动币 1:1 铸造；链上无协议抽成；奖品链下发货。
- **架构：** 三合约——`OneChanceCoin` + `OneChance` + `AddressCompress`（地址→uid 压缩，针对「每份都存买家地址」的存储爆炸）。
- **活跃度：** ★107 / fork 35；最后推送约 2020-05；教学/历史价值高，非生产维护。
- **与 Scoop：** 产品语义最近（固定份数夺宝）；托管与随机模型不同。

### 2. [draffle-io/draffle](https://github.com/draffle-io/draffle)

- **一句话：** Solana 去中心化 raffle：任意 SPL/NFT 奖品、票价、多奖品；Ignition hackathon 产物，主网有部署。
- **链：** Solana（Anchor）。
- **随机源：** `reveal_winners` 读 **`RecentBlockhashes` sysvar** 写入 `raffle.randomness`；`claim_prize` 用 keccak 展开熵 → `% entrants.total`。结束时间后需再等 **`TIME_BUFFER = 20` 秒**。
- **费用模型：** `PROTOCOL_FEE_BPS`（非生产 10 bps，生产常 0）；`collect_proceeds` 从票款扣费到 treasury。
- **架构：** PDA：`raffle` / `proceeds` / `prize{i}`；独立 `Entrants` 账户存买家 pubkey 数组（默认 max 5000）；CLI + React app。
- **活跃度：** ★83 / fork 77；默认分支停更约 2022-12；README 要求生产用 `v1` 分支。
- **与 Scoop：** Solana 侧最值得对读；差在「时间截止 vs 售罄」、无 PendingDraws 队列、RecentBlockhashes vs SlotHashes。

### 3. [reecen96/Riff-Raffle-Solana-NFT](https://github.com/reecen96/Riff-Raffle-Solana-NFT)

- **一句话：** 基于 dRaffle 思路的可部署运营手册 + 前端白名单过滤；票可用 SOL/SPL。
- **链：** Solana。
- **随机源 / 费用 / 架构：** 与 dRaffle 同族（reveal + buffer + collect-proceeds）。
- **活跃度：** ★24；约 2022 停更。
- **与 Scoop：** 可抄**运维手册**（deployer/operator 分钥、ATA 收款、admin_panel 触发 reveal、前端 whitelist 展示策略），不必抄业务规则。

### 4. [Anish-Agnihotri/MultiRaffle](https://github.com/Anish-Agnihotri/MultiRaffle)

- **一句话：** Paradigm 相关参考实现：可退款票 + Chainlink VRF + **Fisher–Yates** 多赢家洗牌；可分批 `clearRaffle` 分摊 gas。
- **链：** Ethereum（Solidity）。
- **随机源：** Chainlink VRF 熵驱动洗牌。
- **费用模型：** 票价 mint cost；输家退款；无 Scoop 式 1% claim 费。
- **架构：** 单合约参考实现；未审计自声明。
- **活跃度：** ★270 / topic 齐；代码推送约 2022-07，星标仍在涨（参考热度）。
- **与 Scoop：** 可抄「**分批结算/社会分担 gas**」与「输家可退」模式；非份额夺宝。

### 5. [Anish-Agnihotri/waffle](https://github.com/Anish-Agnihotri/waffle)

- **一句话：** NFT 固定 slot 抽奖：填满前可进出，Factory 部署子合约并预充 LINK。
- **链：** Ethereum。
- **随机源：** Chainlink VRF。
- **费用模型：** slot 定价；VRF 的 LINK 由创建者预充；可删 raffle（未选赢家前）。
- **架构：** `WaffleFactory` → 子 `Waffle`；自述局限：slot 过多时 delete 的批量 transfer 可能顶 gas。
- **活跃度：** ★49；约 2021-07 停更。
- **与 Scoop：** Factory + 预充随机性成本；Scoop 无 VRF 则无此压力，但「创建成本前置」思路可迁移到 keeper 激励。

### 6. [aavegotchi/raffle](https://github.com/aavegotchi/raffle)

- **一句话：** 生产级 Aavegotchi 抽奖：ERC1155 票进场、Chainlink VRF、链上验证中奖区间后 claim。
- **链：** Ethereum / Polygon（文档含 Diamond 地址）。
- **随机源：** Chainlink VRF；`drawRandomNumber` 任何人可调（需合约有 LINK）；pending 时可 owner 重试。
- **费用模型：** VRF LINK 费；无统一协议 1%。
- **架构：** **AppStorage** 风格单合约状态；票号区间（rangeStart/End）；claim 时链上重算 winning ticket。主网有部署地址。
- **活跃度：** ★13；推送至约 2023-12；有真实使用历史。
- **与 Scoop：** 可抄「**claim 时再验证赢家、防伪造**」「VRF pending / 重试」「AppStorage 命名防冲突」；随机源路线不同。

### 7. [Galxe/galxe-raffle](https://github.com/Galxe/galxe-raffle)

- **一句话：** 任务型 raffle：签名准入 → `commitRandomness` → SP1 ZK 证明 reveal → merkle 赢家根。
- **链：** EVM（Gravity 等；Foundry）。
- **随机源：** `block.prevrandao`（Gravity 文档称 DKG+WVUF）；**合约注释公开承认**：签名只授权 quest，relayer 可对结果 **test-and-abort** 换块重试。
- **费用模型：** 平台任务体系，非票价托管。
- **架构：** `Raffle.sol` + SP1 verifier + prover-service + Go 链下库；EIP-712 签名。
- **活跃度：** ★5；2024–2026 仍有推送（相对新）。
- **与 Scoop：** **不抄产品**，但必须把其「MEV / 迟到提交操纵」注释当作威胁模型教材——Scoop 的 permissionless `draw` 同样存在「谁在哪一槽提交」的争议面。

### 8. [Cyfrin/4-puppy-raffle-audit](https://github.com/Cyfrin/4-puppy-raffle-audit)

- **一句话：** 故意有漏洞的教学 raffle：弱链上哈希 RNG、退款留洞、费用提取与活跃玩家耦合等。
- **链：** Ethereum（Foundry，solc 0.7.6）。
- **随机源：** `keccak(msg.sender, timestamp, difficulty)`——可被矿工/调用者偏向。
- **费用模型：** 80% 赢家 / 20% feeAddress。
- **架构：** 单合约 + NFT mint；★110 / fork 133，审计训练标配。
- **与 Scoop：** 当作**负面清单**：弱 RNG、DoS 型 enter（重复扫描）、退款置零洞、`selectWinner` 与支付顺序、费用会计不一致。

### 补充提及（未进主表）

| 仓库 | 为何不进主表 |
|------|----------------|
| `pooltogether/v4-core` 等 | 无损失储蓄彩票，产品哲学相反（本金可退） |
| `verumlotus/No-Loss-ERC721-Raffle` | 利息给创作者；VRF；体量小 |
| `comfortablesk/solana-switchboard-vrf-lottery` | Switchboard VRF 对照样板；★0、体积极小 |
| `phanlancer/RafflePanda-contract` | 早期 lottery-dapp；文档稀薄 |
| `microgift/my-web3-projects` | 大杂烩含 raffle，非独立协议 |

---

## 可借鉴清单（具体到「我们可抄什么」）

### 实现模式

1. **dRaffle `TIME_BUFFER`：** Scoop 已有 `drawDelayBlocks/slots`；对照确认双链延迟语义一致，并文档化「为何选 N」——对标他们的 20s buffer 是为消化 blockhash 新鲜度。
2. **dRaffle 熵展开：** `keccak(randomness || prize_index)` 再取模——多奖品/多场时避免「同一随机源重复用」偏差；Scoop 若扩展多赢家可直接复用该模式。
3. **MultiRaffle 分批 `clearRaffle`：** 若份额上限上调或需洗牌，用「任何人可推进、进度落存储」避免单笔 OOG；与 Scoop 已有 `drawMany` / 迟到 `DrawEntropyExpired`→退款 同族。
4. **OneChance `AddressCompress`：** 若 EVM 侧按份额存 `shareOwner` 数组压力大，可参考 uid 压缩或「份额板紧凑位图」——Scoop Solana `share_board` 已是该问题的 PDA 解法。
5. **waffle Factory 预充成本：** 无 VRF 时改为「创建时锁定少量 keeper tip」或链下激励，减少「售罄后无人 draw」。
6. **aavegotchi claim 再验证：** 赢家 claim 奖品时用存储的随机源重算，而不是盲信前端传的 winner——Scoop 已链上写死 winner，保持「claim 只校验存储状态」即可，勿引入可伪造的 off-chain win 证明除非有 ZK 路径。

### 索引与 UX

7. **Riff / dRaffle 前端 whitelist：** 公开列表只展示策展场次；协议层仍 permissionless——适合防垃圾场刷屏。
8. **事件驱动索引：** OneChance / aavegotchi 重度依赖 event（`NotifySubmitPlaintext`、`RaffleTicketsEntered`）；Scoop 应保证 create/buy/soldOut/draw/claim/refund 事件字段足够 Subgraph/The Graph / Solana Geyser/Carbon 索引，避免「仅靠扫描存储」。
9. **admin_panel 一键 reveal：** 对齐 Scoop FE「就绪则 POST keeper `/trigger` + 用户仍可手动 draw」。

### 安全与测试

10. **Cyfrin 审计清单 → Scoop 回归用例：** 重复买入、退款后占位、费用会计、弱 RNG 文档化、重入/恶意收款合约卡住 claim。
11. **Galxe 注释中的 test-and-abort：** 为 Scoop 写明确威胁模型：调用者能否通过选槽/选块偏向赢家？延迟 N + 固定 `eligible` 哈希是否足够？公开 FAQ。
12. **OneChance 末位拒交 seed：** 说明 commit–reveal 失败模式——支撑 Scoop「坚持无交互式随机、用链上熵」的产品选择。

### 运维（keeper）

13. **permissionless draw + 专用 keeper：** Scoop 已有；对标行业缺口——多数开源靠人工 reveal 或 Chainlink Automation。保持 Cron + HTTP trigger 双通道，并监控「SoldOut 超时未 draw」。
14. **dRaffle LINK/treasury 分离：** 协议费接收账户与操作密钥分离（Riff 的 deployer vs operator）——对齐 Scoop `feeRecipient` 与 keeper key 分离。

---

## 我们可能没考虑到的

### 攻击面与随机性争议

- **Permissionless draw 的 MEV：** 谁先 `draw` 不改变固定 `eligible` 哈希时操纵空间有限；但若实现成「用*当前* blockhash / 最新 SlotHash」而非锚定 `soldOut+N`，则与 Galxe 的 abort-retry 同类。需审计双链是否**锚定同一绝对高度/slot**。
- **迟到开奖：** 双链均锚定 `soldOut+N`；窗口滚出（EVM ~256 / Solana SlotHashes ~512）→ `DrawEntropyExpired` → `refund`/`recover`（SoldOut→Expired），禁止改用更新哈希，避免卡死在 SoldOut。
- **份额稀释 / 女巫：** 固定价份额无 KYC；大户可扫货。产品层可用人均上限（MultiRaffle 有 per-address max）——Scoop 若要坚持公平感知需产品决策。
- **恶意代币：** fee-on-transfer、rebasing、暂停、黑名单、ERC777 hook、Solana token-2022 transfer fee / freeze——托管与 claim 余额对账失败。白名单 mint 或 `balanceBefore/After` 记账。
- **收款合约拒绝 ETH/BNB：** Cyfrin 中 winner.call 失败整笔 revert；Scoop claim/prize 路径需 pull 模式或处理失败不锁死。
- **创作者恶意：** 奖品为无价值山寨币；前端需风险提示与资产元数据校验（非合约能单独解决）。

### 合规 / 运营

- **博彩/有奖销售定性：** OneChance 时代即链下法币兑换；多司法辖区可能视份额夺宝为 gambling。地理围栏、条款、非托管表述需法务，不是「代码去中心化即可」。
- **托管资产与托管责任：** 合约托管 ≠ 免除宣传义务；过期退款 UX 必须极明显。
- **协议费税务与主体：** 1% `feeRecipient` 背后是否有运营实体。

### 索引 / 跨链 / 其他

- **双链 ID 与深链：** BSC + Solana 场次是否统一 explorer？跨链「同一场」目前无需求则勿做桥——桥会引入消息延迟与错误开奖时机。
- **Entrants 账户大小：** dRaffle max 5000 pubkey；Scoop `MAX_SHARES = 10_000` 已触同类存储/计算边界。
- **无 VRF 的舆论：** 社区默认「公平 = Chainlink/Switchboard」。需公开可复现的开奖公式与「为何不用 VRF」一页纸，否则每次争议都从零解释。
- **Keeper 中心化观感：** 任何人可 draw，但若仅官方 keeper 在跑，延迟开奖会被质疑。可考虑小额 tip 激励第三方。

---

## 最高优先级建议（3）

1. **现行唯一开奖规范：** 锚定 `soldOut+N` 哈希 + keccak 展开；迟到不可开 → `DrawEntropyExpired` → 退款（见 `PROTOCOL.md` / `hardening-from-research.md`）。禁止漂移成「用提交时最新哈希」。
2. **恶意资产与对账（已落地）：** ERC-20/SPL 余额差记账；FoT 少到账 revert；Token-2022 拒绝；文档列出不支持类。
3. **dRaffle 对读（已落地）：** 熵展开、`close_share_board` / `close_buyer_record`、PendingDraws 熵过期出队与 keeper 跳过过期 draw。

---

## 检索备注

- 「一元夺宝」链上开源极少；大量结果是年会抽奖前端、B 站/京东脚本、传统彩票预测，已过滤。
- `fairdraw` / `pending draw keeper` 代码搜索几乎无独立协议命中；keeper 模式是 Scoop 相对开源社区的差异化。
- 未改动 Scoop 业务代码；本文件为调研交付。
