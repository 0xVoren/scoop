# Scoop GitHub Pages（测试网前端）

[English](github-pages-testnet.md)

**仓库：** https://github.com/0xVoren/scoop  
**站点：** https://0xvoren.github.io/scoop/  
**来源：** Actions 工作流 `.github/workflows/pages.yml`（从 `web/` 做 `output: 'export'`）

公开 Pages 仅对接 **测试网**，不宣传或编造主网合约地址。

---

## 目标环境（CI 默认）

| 项 | 值 |
| --- | --- |
| EVM | BSC 测试网 / Chapel（`NEXT_PUBLIC_CHAIN=testnet`） |
| Diamond | `0xfB2678ff49967B073F6537781EC3d35DE731a5DF` |
| 部署块 | `143943857` |
| BSC RPC | `https://bsc-testnet-rpc.publicnode.com` |
| Solana | **devnet** |
| Program ID | `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT` |
| Solana RPC | `https://api.devnet.solana.com` |
| `basePath` | `/scoop`（站点位于 `0xvoren.github.io/scoop/`） |

仅使用公开链上地址与公开 RPC。**切勿**将私钥、助记词或机密 WalletConnect 凭证写入仓库。

相关：[`frontend-testnet.zh.md`](frontend-testnet.zh.md)、[`testnet-contracts-deploy.zh.md`](testnet-contracts-deploy.zh.md)。

---

## 部署方式

1. 向 `main` 推送触及 `web/**` 或 `.github/workflows/pages.yml` 的改动，**或**在 **Actions → Deploy Pages → Run workflow** 手动触发。
2. `build` 作业在 `web/` 执行 `pnpm install` + `pnpm build`（可用 Actions **Variables** 覆盖默认环境变量）。
3. `deploy` 作业通过 `actions/deploy-pages` 发布 `web/out`。
4. 站点：https://0xvoren.github.io/scoop/

Pages 设置：**Settings → Pages → Build and deployment → Source = GitHub Actions**。

---

## 重新部署

```bash
cd ~/Code/active/scoop
git push scoop-0xvoren main
# 或：
gh workflow run "Deploy Pages" --repo 0xVoren/scoop
```

不改 YAML 时，可在仓库 **Settings → Secrets and variables → Actions → Variables** 覆盖，例如：

- `NEXT_PUBLIC_CHAIN`、`NEXT_PUBLIC_SCOOP_DIAMOND`、`NEXT_PUBLIC_SCOOP_DEPLOY_BLOCK`
- `NEXT_PUBLIC_BSC_RPC`、`NEXT_PUBLIC_SOLANA_*`、`NEXT_PUBLIC_BASE_PATH`
- 可选：`NEXT_PUBLIC_WC_PROJECT_ID`、`NEXT_PUBLIC_KEEPER_URL`

---

## 验证

```bash
curl -sI https://0xvoren.github.io/scoop/ | head -15
# 期望 HTTP 200；HTML 引用 /scoop/_next/… 资源
# 浏览器：BSC Testnet / Solana devnet；Diamond 已配置
# 不得出现 Next “Application error: a client-side exception…”
```

本地静态预览（可选）见英文版同节命令。

---

## 说明

- CI 中空的 `NEXT_PUBLIC_WC_PROJECT_ID` 必须回退到 RainbowKit 文档占位（见 `web/src/lib/wagmi.ts`），否则 WalletConnect 抛错导致静态站客户端崩溃。
- 字体与 favicon 须在 `basePath` `/scoop` 下可解析（webpack 产出 `/scoop/_next/static/media/…`）。
