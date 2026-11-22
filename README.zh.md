# Scoop

[English](README.md)

链上份额抽奖（一元夺宝风格）。**一套规则、双链实现**：现网为 BNB Smart Chain（EVM Diamond）；Solana（Anchor）按同一产品不变量推进，见 [`docs/solana-dual-chain-plan.zh.md`](docs/solana-dual-chain-plan.zh.md) 与对照表 [`docs/invariants-evm-solana.zh.md`](docs/invariants-evm-solana.zh.md)。

任何人可托管奖品（原生币或同质代币），按支付资产售出固定份数（支付资产可与奖品不同）；售罄并再等 `N` 个 slot/区块后，任何人可用链上哈希窗口 `draw`（无外部 VRF）。赢家领取 **100% 奖品**；创建者在 `claimProceeds` 时拿走收益并扣除 **1%** 给 `feeRecipient`。

## 目录

```text
contracts/   # Foundry + EIP-2535 Diamond（BSC / EVM）
programs/    # Anchor MVP（Solana）— Program ID FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT
docs/        # 设计 + 双链规划 + 不变量
web/         # Next.js App Router + wagmi（+ Solana 适配骨架）
keeper/      # pending-draw 触发（EVM + Solana）
```

## 合约

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

静态导出可托管 **GitHub Pages**（`pnpm build` → `web/out`；workflow：`.github/workflows/pages.yml`）。  
路由：`/` · `/create` · `/me` · `/raffle/?id=` · `/token/?a=` · `/user/?a=`  
钱包：RainbowKit（可选 peer `@x402/core` / `@x402/evm` / `@x402/svm` 已写入 dependencies）。

## Keeper（pendingDraw 监控）

```bash
cd keeper && pnpm install
# EVM
DIAMOND_ADDRESS=0x... CHAIN=local pnpm tick
# Solana
KEEPER_CHAIN=solana SOLANA_KEEPER_KEYPAIR=~/.config/solana/id.json pnpm tick
```

本地全链路：

```bash
# EVM（需 Anvil + 已部署 Diamond）
DIAMOND_ADDRESS=0x... bash scripts/e2e-local.sh
# Solana（solana-test-validator + deploy；lifecycle + keeper + expire/refund + late-draw + SPL 矩阵）
bash scripts/e2e-solana-local.sh
```

Solana 本地闸门与资产矩阵见 `scripts/e2e-solana-local.ts` 文件头；库单测：`cd programs && CARGO_TARGET_DIR=/tmp/scoop-programs-target cargo test -p scoop --lib`。

Solana **devnet / 测试网**（需自备注资 keypair；私钥勿写入仓库）：

```bash
export SOLANA_AUTHORITY_KEYPAIR=~/.config/solana/id.json
bash scripts/deploy-solana-devnet.sh          # .so + initialize
bash scripts/e2e-solana-devnet.sh             # create→buy→delay→draw
# Keeper
KEEPER_CHAIN=solana SOLANA_RPC_URL=https://api.devnet.solana.com \
  SOLANA_KEEPER_KEYPAIR=~/.config/solana/id.json pnpm --dir keeper tick
```

测试网合约部署记录（BSC + Solana）：[`docs/testnet-contracts-deploy.zh.md`](docs/testnet-contracts-deploy.zh.md)。  
Keeper 测试网实机运维：[`docs/keeper-testnet-ops.zh.md`](docs/keeper-testnet-ops.zh.md)。  
Solana 专文：[`docs/solana-testnet-deploy.zh.md`](docs/solana-testnet-deploy.zh.md)；另见 [`keeper/README.zh.md`](keeper/README.zh.md)、[`programs/README.zh.md`](programs/README.zh.md)。

## 规格

- 协议笔记（费用与未来 fee-sink 预留）：[`docs/PROTOCOL.md`](docs/PROTOCOL.md)
- 设计：[`docs/superpowers/specs/2026-11-13-scoop-design.md`](docs/superpowers/specs/2026-11-13-scoop-design.md)
- 双链规划：[`docs/solana-dual-chain-plan.zh.md`](docs/solana-dual-chain-plan.zh.md)
- EVM ↔ Solana 不变量：[`docs/invariants-evm-solana.zh.md`](docs/invariants-evm-solana.zh.md)
- Solana 测试网部署：[`docs/solana-testnet-deploy.zh.md`](docs/solana-testnet-deploy.zh.md)

## 许可

[MIT](LICENSE)
