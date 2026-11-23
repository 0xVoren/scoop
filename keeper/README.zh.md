# Scoop Keeper

[English](README.md)

无需许可的 **pendingDraw** 监控：场次到达可开奖条件时调用 `drawMany` / `draw_many`。

开奖本身任何人可调；keeper 仅负责自动化（Cron 兜底 + HTTP `POST /trigger`）。  
前端配置 `NEXT_PUBLIC_KEEPER_URL` 后，详情页在开奖就绪时会 fire-and-forget POST `/trigger`（用户仍可手动 `draw`）。

通过 `KEEPER_CHAIN` 支持 **EVM** 与 **Solana**。运维见 [`docs/keeper-testnet-ops.zh.md`](../docs/keeper-testnet-ops.zh.md)。

## 环境变量

### 共用

| 变量 | 说明 |
|---|---|
| `KEEPER_CHAIN` | `evm`（默认）\| `solana` |
| `KEEPER_TRIGGER_SECRET` | 可选；HTTP `/trigger` 校验 `x-keeper-secret` |

### EVM（`KEEPER_CHAIN=evm`）

| 变量 | 说明 |
|---|---|
| `RPC_URL` | JSON-RPC（默认 `http://127.0.0.1:8545`） |
| `DIAMOND_ADDRESS` | Scoop Diamond |
| `CHAIN` | `local` \| `testnet` \| `mainnet`（viem chain） |
| `KEEPER_PRIVATE_KEY` | `0x` + 64 hex（Cloudflare 用 secret） |

心智：读 `pendingDrawCount` / `pendingDrawAt` → `block.number > eligibleBlock` → `drawMany`。

### Solana（`KEEPER_CHAIN=solana`）

| 变量 | 说明 |
|---|---|
| `SOLANA_RPC_URL` | 默认 `http://127.0.0.1:8899` |
| `SOLANA_PROGRAM_ID` | 默认 `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT` |
| `SOLANA_KEEPER_KEYPAIR` | JSON 字节数组（Workers secret）或本地 `keypair.json` 路径（CLI） |
| `SOLANA_USE_DRAW_MANY` | 默认 `true`；`false` 时单笔 `draw` |

心智：读 `PendingDraws` PDA → 每场 `eligible = sold_out_slot + draw_delay_slots` → 仅当 `eligible < slot ≤ eligible + 512` 时 `draw_many`（remaining: `[raffle, share_board, …]`）。随机仍为链上 **锚定 SlotHash(`eligible`)**（无 VRF）。

**SlotHashes 过期后：** keeper **不再**对过期场次重试 draw（会跳过并打日志）。用户/创作者走 `refund` / `recover_prize`（SoldOut→Expired，pending 出队）。密钥分离：keeper 操作钥 ≠ `fee_recipient`。

## 本地一发

```bash
cd keeper
pnpm install

# EVM（Anvil）
DIAMOND_ADDRESS=0x... CHAIN=local pnpm tick

# Solana（localnet）
KEEPER_CHAIN=solana \
  SOLANA_RPC_URL=http://127.0.0.1:8899 \
  SOLANA_KEEPER_KEYPAIR=~/.config/solana/id.json \
  pnpm tick

# Solana（devnet / 测试网）— 密钥仅本机路径或 wrangler secret，勿提交
KEEPER_CHAIN=solana \
  SOLANA_RPC_URL=https://api.devnet.solana.com \
  SOLANA_PROGRAM_ID=FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT \
  SOLANA_KEEPER_KEYPAIR=~/.config/solana/id.json \
  pnpm tick
```

默认 EVM 用 Anvil account#0 私钥；仅本地。  
Devnet 部署与冒烟：[`docs/solana-testnet-deploy.md`](../docs/solana-testnet-deploy.md)。  
测试网实机 tick + 告警 / 密钥 / RPC / 主网注意：[`docs/keeper-testnet-ops.md`](../docs/keeper-testnet-ops.md)。

## Cloudflare 部署

```bash
# wrangler.toml：KEEPER_CHAIN + 对应地址
pnpm exec wrangler secret put KEEPER_PRIVATE_KEY          # EVM
# 或
pnpm exec wrangler secret put SOLANA_KEEPER_KEYPAIR       # Solana JSON array
# 可选：pnpm exec wrangler secret put RPC_URL / SOLANA_RPC_URL
pnpm deploy
pnpm tail
```

## 本地 E2E

```bash
# EVM
DIAMOND_ADDRESS=0x... bash scripts/e2e-local.sh

# Solana（起 validator、deploy；lifecycle + keeper + expire/refund + late-draw + SPL 矩阵）
bash scripts/e2e-solana-local.sh
# 仅跑 TS（需已有 localnet + 已部署程序）：
#   cd /tmp/scoop-e2e-work && SOLANA_RPC_URL=http://127.0.0.1:8899 pnpm exec tsx scripts/e2e-solana-local.ts

# Solana devnet（需已部署程序 + 注资 authority）
bash scripts/e2e-solana-devnet.sh
```
