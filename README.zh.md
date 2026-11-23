# Scoop

[English](README.md)

**链上份额抽奖协议** — 一套产品规则，双链实现。

任何人可托管奖品（原生币或同质代币），按支付资产售出固定份数（支付资产可与奖品不同）；售罄并经过约定延迟后，任何人可用链上哈希窗口 `draw`（无外部 VRF）。中奖份额领取 **100% 奖品**；创建者在 `claimProceeds` 时拿走收益并扣除 **1%** 协议费至 `feeRecipient`。

| | |
|---|---|
| 线上 UI（GitHub Pages） | https://0xvoren.github.io/scoop/ |
| 源码 | https://github.com/0xVoren/scoop |
| BSC 测试网 Diamond | [`0xfB2678ff49967B073F6537781EC3d35DE731a5DF`](https://testnet.bscscan.com/address/0xfB2678ff49967B073F6537781EC3d35DE731a5DF) |
| Solana 程序（devnet） | [`FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT`](https://explorer.solana.com/address/FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT?cluster=devnet) |

现网路径：**BNB Smart Chain**（EVM EIP-2535 Diamond）。**Solana**（Anchor）按同一产品不变量推进，见 [`docs/solana-dual-chain-plan.zh.md`](docs/solana-dual-chain-plan.zh.md) 与 [`docs/invariants-evm-solana.zh.md`](docs/invariants-evm-solana.zh.md)。公开 Pages 部署仅指向 **测试网**（BSC Chapel + Solana devnet），不编造或宣传主网地址。

## 仓库结构

```text
contracts/   # Foundry + EIP-2535 Diamond（BSC / EVM）
programs/    # Anchor 程序（Solana）— Program ID FC9im2jk…UrpHT
docs/        # 协议说明、双链规划、部署与运维手册
web/         # Next.js App Router + wagmi + Solana wallet-adapter（静态导出）
keeper/      # 无需许可的 pending-draw 触发（EVM + Solana）
```

## 合约（EVM）

```bash
cd contracts
forge test
```

本地部署（Anvil）：

```bash
anvil &
forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

生命周期：`createRaffle` → `buyShares` →（售罄）→ 等 N 块 → `draw` → `claimPrize` / `claimProceeds`。  
若截止前未售罄：`refund` / `recoverPrize`（无手续费）。

## Web

```bash
cd web
cp .env.example .env.local
# 将 NEXT_PUBLIC_SCOOP_DIAMOND 设为已部署 Diamond
# NEXT_PUBLIC_CHAIN=local|testnet|mainnet
# 主网/测试网：设置 NEXT_PUBLIC_SCOOP_DEPLOY_BLOCK 供 SharesPurchased 日志扫描
pnpm dev
```

静态导出托管于 **GitHub Pages**（`pnpm build` → `web/out`；workflow：`.github/workflows/pages.yml`）。  
路由：`/` · `/create` · `/me` · `/raffle/?id=` · `/token/?a=` · `/user/?a=`  
包说明：[`web/README.zh.md`](web/README.zh.md)。Pages 默认值：[`docs/github-pages-testnet.zh.md`](docs/github-pages-testnet.zh.md)。

## Keeper（pendingDraw 监控）

```bash
cd keeper && pnpm install
# EVM
DIAMOND_ADDRESS=0x... CHAIN=local pnpm tick
# Solana
KEEPER_CHAIN=solana SOLANA_KEEPER_KEYPAIR=~/.config/solana/id.json pnpm tick
```

详见：[`keeper/README.zh.md`](keeper/README.zh.md)。

## 本地与测试网验证

```bash
# EVM（需 Anvil + 已部署 Diamond）
DIAMOND_ADDRESS=0x... bash scripts/e2e-local.sh
# Solana（solana-test-validator + deploy；lifecycle + keeper + expire/refund + late-draw + SPL 矩阵）
bash scripts/e2e-solana-local.sh
```

Solana 本地闸门与资产矩阵见 `scripts/e2e-solana-local.ts` 文件头；库单测：`cd programs && CARGO_TARGET_DIR=/tmp/scoop-programs-target cargo test -p scoop --lib`。

Solana **devnet**（需自备注资 keypair；私钥勿写入仓库）：

```bash
export SOLANA_AUTHORITY_KEYPAIR=~/.config/solana/id.json
bash scripts/deploy-solana-devnet.sh          # .so + initialize
bash scripts/e2e-solana-devnet.sh             # create→buy→delay→draw
KEEPER_CHAIN=solana SOLANA_RPC_URL=https://api.devnet.solana.com \
  SOLANA_KEEPER_KEYPAIR=~/.config/solana/id.json pnpm --dir keeper tick
```

| 文档 | 用途 |
|---|---|
| [`docs/testnet-contracts-deploy.zh.md`](docs/testnet-contracts-deploy.zh.md) | BSC + Solana 测试网部署记录 |
| [`docs/keeper-testnet-ops.zh.md`](docs/keeper-testnet-ops.zh.md) | Keeper 测试网运维 |
| [`docs/solana-testnet-deploy.zh.md`](docs/solana-testnet-deploy.zh.md) | Solana 专项部署 |
| [`docs/frontend-testnet.zh.md`](docs/frontend-testnet.zh.md) | 本地 UI 指向测试网 |
| [`docs/github-pages-testnet.zh.md`](docs/github-pages-testnet.zh.md) | Pages 工作流与默认环境 |
| [`programs/README.zh.md`](programs/README.zh.md) | Anchor 程序工具链 |

## 规格与运维

- 协议笔记（费用、开奖熵源、资产、收租）：[`docs/PROTOCOL.md`](docs/PROTOCOL.md)
- 资产策略：[`docs/asset-policy.zh.md`](docs/asset-policy.zh.md)
- 设计历史：[`docs/superpowers/specs/2026-11-13-scoop-design.md`](docs/superpowers/specs/2026-11-13-scoop-design.md)
- 双链规划：[`docs/solana-dual-chain-plan.zh.md`](docs/solana-dual-chain-plan.zh.md)
- EVM ↔ Solana 不变量：[`docs/invariants-evm-solana.zh.md`](docs/invariants-evm-solana.zh.md)
- 主网准备（未获明确指令前勿部署）：[`docs/mainnet-runbook.md`](docs/mainnet-runbook.md)

## 许可

[MIT](LICENSE)
