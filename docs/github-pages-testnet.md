# Scoop GitHub Pages (testnet frontend)

[中文](github-pages-testnet.zh.md)

**Repo:** https://github.com/0xVoren/scoop  
**Site:** https://0xvoren.github.io/scoop/  
**Source:** Actions workflow `.github/workflows/pages.yml` (`output: 'export'` from `web/`)

Public Pages hosts the Scoop UI against **testnets only**. It does not advertise or invent mainnet contract addresses.

---

## Targets (CI defaults)

| Item | Value |
| --- | --- |
| EVM | BSC testnet / Chapel (`NEXT_PUBLIC_CHAIN=testnet`) |
| Diamond | `0xfB2678ff49967B073F6537781EC3d35DE731a5DF` |
| Deploy block | `143943857` |
| BSC RPC | `https://bsc-testnet-rpc.publicnode.com` |
| Solana | **devnet** |
| Program ID | `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT` |
| Solana RPC | `https://api.devnet.solana.com` |
| `basePath` | `/scoop` (project site under `0xvoren.github.io/scoop/`) |

Use public on-chain addresses and public RPCs only. **Never** commit private keys, mnemonics, or confidential WalletConnect credentials.

Related: [`frontend-testnet.md`](frontend-testnet.md), [`testnet-contracts-deploy.md`](testnet-contracts-deploy.md).

---

## How it deploys

1. Push to `main` touching `web/**` or `.github/workflows/pages.yml`, **or** run **Actions → Deploy Pages → Run workflow**.
2. Job `build` runs `pnpm install` + `pnpm build` in `web/` with the env above (Actions **Variables** override defaults when set).
3. Job `deploy` publishes `web/out` via `actions/deploy-pages`.
4. Site URL: https://0xvoren.github.io/scoop/

Pages settings: **Settings → Pages → Build and deployment → Source = GitHub Actions**.

---

## Redeploy

```bash
cd ~/Code/active/scoop
git push scoop-0xvoren main
# or:
gh workflow run "Deploy Pages" --repo 0xVoren/scoop
```

Override without editing YAML: repo **Settings → Secrets and variables → Actions → Variables**, for example:

- `NEXT_PUBLIC_CHAIN`, `NEXT_PUBLIC_SCOOP_DIAMOND`, `NEXT_PUBLIC_SCOOP_DEPLOY_BLOCK`
- `NEXT_PUBLIC_BSC_RPC`, `NEXT_PUBLIC_SOLANA_*`, `NEXT_PUBLIC_BASE_PATH`
- Optional: `NEXT_PUBLIC_WC_PROJECT_ID`, `NEXT_PUBLIC_KEEPER_URL`

---

## Verify

```bash
curl -sI https://0xvoren.github.io/scoop/ | head -15
# Expect HTTP 200; HTML should reference /scoop/_next/… assets
# In-browser: BSC Testnet / Solana devnet labels; Diamond configured
# Must NOT show Next “Application error: a client-side exception…”
```

Local static preview (optional):

```bash
cd web
NEXT_PUBLIC_BASE_PATH=/scoop \
NEXT_PUBLIC_CHAIN=testnet \
NEXT_PUBLIC_SCOOP_DIAMOND=0xfB2678ff49967B073F6537781EC3d35DE731a5DF \
NEXT_PUBLIC_SCOOP_DEPLOY_BLOCK=143943857 \
NEXT_PUBLIC_BSC_RPC=https://bsc-testnet-rpc.publicnode.com \
NEXT_PUBLIC_SOLANA_CLUSTER=devnet \
NEXT_PUBLIC_SOLANA_PROGRAM_ID=FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT \
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com \
pnpm build
mkdir -p /tmp/scoop-pages/scoop && cp -R out/. /tmp/scoop-pages/scoop/
python3 -m http.server 4173 --bind 127.0.0.1 -d /tmp/scoop-pages
# open http://127.0.0.1:4173/scoop/
```

---

## Notes

- Empty `NEXT_PUBLIC_WC_PROJECT_ID` in CI must fall back to RainbowKit’s documented placeholder (see `web/src/lib/wagmi.ts`); otherwise WalletConnect throws and the static site crashes client-side.
- Fonts and favicon assets must resolve under `basePath` `/scoop` (webpack-emitted `/scoop/_next/static/media/…`).
