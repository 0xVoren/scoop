# 前端指向测试网（本地验收）

[English](frontend-testnet.md)

**日期：** 2026-11-21  
**范围：** `web/` 指向已部署的 BSC testnet Diamond + Solana devnet program；本地 `pnpm typecheck` / Biome / `pnpm dev` 冒烟。  
**机密：** 私钥 / 助记词 / 需保密的 WalletConnect 密钥**不要**写入仓库或本文件；只放本机 `web/.env.local`（已 gitignore）。

合约地址与链上证据见 [`testnet-contracts-deploy.md`](testnet-contracts-deploy.md)。

---

## 目标地址

| 项 | 值 |
|---|---|
| EVM | BSC testnet / Chapel (`97`) |
| Diamond | `0xfB2678ff49967B073F6537781EC3d35DE731a5DF` |
| Deploy block | `143943857`（`/me` 事件扫描起点，必填） |
| Solana | **devnet** |
| Program ID | `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT` |

Explorer：

- Diamond：https://testnet.bscscan.com/address/0xfB2678ff49967B073F6537781EC3d35DE731a5DF
- Program：https://explorer.solana.com/address/FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT?cluster=devnet

---

## 本机配置

模板：[`web/.env.example`](../web/.env.example)（Mode B 注释块）。  
实操：复制到 `web/.env.local`（勿提交）：

```bash
cd web
cp .env.example .env.local
# 按 Mode B 取消注释 / 改成下列值
```

```bash
# EVM — BSC testnet
NEXT_PUBLIC_CHAIN=testnet
NEXT_PUBLIC_SCOOP_DIAMOND=0xfB2678ff49967B073F6537781EC3d35DE731a5DF
NEXT_PUBLIC_SCOOP_DEPLOY_BLOCK=143943857
NEXT_PUBLIC_BSC_RPC=https://bsc-testnet-rpc.publicnode.com

# Solana — devnet
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
NEXT_PUBLIC_SOLANA_PROGRAM_ID=FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com

# Optional
NEXT_PUBLIC_KEEPER_URL=
NEXT_PUBLIC_WC_PROJECT_ID=
NEXT_PUBLIC_BASE_PATH=
```

说明：

- `NEXT_PUBLIC_*` 会打进前端 bundle；**绝不要**放部署私钥。
- `NEXT_PUBLIC_SCOOP_DEPLOY_BLOCK` 在 `testnet` / `mainnet` 必填；漏填则 `/me` 购买记录扫描不可靠。
- RPC 可换成自备 QuickNode / Alchemy；公共节点仅作默认。
- Header 可在 **EVM / Solana** 间切换：EVM 走 wagmi（链 = BSC Testnet），Solana 走 wallet-adapter（cluster = devnet）。

---

## 验收命令

```bash
cd web
pnpm install          # 若尚未安装
pnpm typecheck
pnpm ci               # Biome
pnpm dev --port 3010
```

浏览器冒烟清单：

1. 打开 `http://localhost:3010` — 首页不报「未配置 Diamond」。
2. EVM：连 MetaMask（BSC Testnet）→ 列表/创建页可读写 Diamond。
3. Header 切 **Solana** → Phantom/Solflare（devnet）→ 列表/创建可用。
4. 可选：打开已有场次 `/raffle/?id=1`（若链上仍有该 id）。

静态导出预览（可选）：`pnpm build && pnpm exec serve out`。

---

## 与合约文档的关系

| 文档 | 内容 |
|---|---|
| [`testnet-contracts-deploy.md`](testnet-contracts-deploy.md) | 合约部署地址与冒烟证据 |
| [`testnet-full-e2e.md`](testnet-full-e2e.md) | 链上全链路脚本 E2E（非 UI） |
| [`solana-testnet-deploy.md`](solana-testnet-deploy.md) | Solana 部署细节 |
| 本文 | 前端 env + 本地 UI 验收 |

Keeper / GitHub Pages 发布不在本文范围；Pages Variables 可复用上表公开地址（仍勿放私钥）。
