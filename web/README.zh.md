# Scoop Web

[English](README.md)

Scoop 的 Next.js App Router 前端：wagmi / RainbowKit（EVM）与 Solana wallet-adapter。  
对接 Scoop Diamond（BSC / Anvil）与 Scoop Anchor program（Solana）。  
**静态导出**（`output: 'export'`），用于 **GitHub Pages**。

| | |
|---|---|
| 线上 | https://0xvoren.github.io/scoop/ |
| 仓库 | https://github.com/0xVoren/scoop |
| Pages 手册 | [`docs/github-pages-testnet.zh.md`](../docs/github-pages-testnet.zh.md) |
| 本地测试网环境 | [`docs/frontend-testnet.zh.md`](../docs/frontend-testnet.zh.md) |
| BSC 测试网 Diamond | `0xfB2678ff49967B073F6537781EC3d35DE731a5DF` |
| Solana 程序 | `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT` |

## Setup

```bash
pnpm install
cp .env.example .env.local
# EVM：填 NEXT_PUBLIC_SCOOP_DIAMOND；主网/测试网必填 NEXT_PUBLIC_SCOOP_DEPLOY_BLOCK
# Solana：见下方「Solana 本地」
# 测试网 UI 验收：见仓库 docs/frontend-testnet.md（.env.example Mode B）
pnpm dev --port 3010
```

| Env | 说明 |
|---|---|
| `NEXT_PUBLIC_CHAIN` | `local` \| `testnet` \| `mainnet`（EVM） |
| `NEXT_PUBLIC_SCOOP_DIAMOND` | Diamond 地址 |
| `NEXT_PUBLIC_SCOOP_DEPLOY_BLOCK` | 部署块（`/me` 事件扫描起点；非 local 必填） |
| `NEXT_PUBLIC_KEEPER_URL` | 可选；开奖就绪时 POST `{url}/trigger` |
| `NEXT_PUBLIC_WC_PROJECT_ID` | WalletConnect（可空本地） |
| `NEXT_PUBLIC_BSC_RPC` | 可选自定义 RPC |
| `NEXT_PUBLIC_BASE_PATH` | Pages 子路径，如 `/scoop`；自定义域名留空 |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | `local` / `localnet` \| `devnet` \| `mainnet-beta` |
| `NEXT_PUBLIC_SOLANA_PROGRAM_ID` | Anchor program id（默认 `FC9im2jk…UrpHT`） |
| `NEXT_PUBLIC_SOLANA_RPC` | 可选 Solana RPC（localnet 默认 `http://127.0.0.1:8899`） |

多链适配层：`src/chain/`（EVM 包装 wagmi；Solana 对接 `programs/` + IDL `src/idl/scoop.json`）。

包管理只用 **pnpm**；检查用 Biome（`pnpm check` / `pnpm ci`）。

## Solana 本地

1. 按 `programs/README.md` 启动 validator、部署 program、`initialize` Config  
   （或跑 `bash scripts/e2e-solana-local.sh`）。
2. `.env.local`：

```bash
NEXT_PUBLIC_SOLANA_CLUSTER=localnet
NEXT_PUBLIC_SOLANA_PROGRAM_ID=FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT
NEXT_PUBLIC_SOLANA_RPC=http://127.0.0.1:8899
```

3. `pnpm dev` → header 切到 **Solana** → Phantom/Solflare（localnet）连接。
4. **按 ActiveChain 分支**：`/create`、`/raffle/?id=`（买 / 开奖 / 领奖 / 退款 / 收回）与首页列表在 `family=solana` 时走 Solana 适配；EVM 走 wagmi。开奖熵源为 **SlotHashes**（无 VRF）。
5. 读：`fetchSolanaRaffleById`；首页列表为顺序扫描近期 id（**不是**全站索引）。  
   `/me` 通过 **BuyerRecord GPA** 列出 Solana 购买记录。`/user`、`/token` 在 Solana 无次级索引，展示明确空态 / 限制说明。

原生 SOL 哨兵 = `Pubkey::default()`（`1111…1111`）；显式 wSOL mint 走普通 SPL，不 auto-wrap。  
钱包：Solana → `WalletPill`（wallet-adapter）；EVM → RainbowKit。

## Routes

`/` · `/create` · `/me` · `/raffle/?id=` · `/token/?a=` · `/user/?a=`  
（query 形式，便于静态站深链；无服务端动态路由。）

## GitHub Pages

1. 仓库 **Settings → Pages → Source = GitHub Actions**
2. 配置 Actions **Variables**：`NEXT_PUBLIC_SCOOP_DIAMOND`、`NEXT_PUBLIC_SCOOP_DEPLOY_BLOCK`、`NEXT_PUBLIC_CHAIN` 等（见 `.env.example`）
3. 若站点是 `user.github.io/repo`，设 `NEXT_PUBLIC_BASE_PATH=/repo`
4. 推送 `main`（或手动跑 `Deploy Pages` workflow）→ 产物在 `web/out`

本地预览静态产物：

```bash
pnpm build && pnpm exec serve out   # 或 npx serve out
```

## Scripts

```bash
pnpm dev
pnpm build      # → out/
pnpm typecheck
pnpm ci
```

合约与本地 E2E 见仓库根 `README.md`、`scripts/e2e-local.sh`、`programs/`、`keeper/`。
