# Scoop Web

[中文](README.zh.md)

Next.js App Router frontend for Scoop: wagmi / RainbowKit (EVM) and Solana wallet-adapter.  
Talks to the Scoop Diamond (BSC / Anvil) and the Scoop Anchor program (Solana).  
**Static export** (`output: 'export'`) for **GitHub Pages**.

| | |
|---|---|
| Live | https://0xvoren.github.io/scoop/ |
| Repo | https://github.com/0xVoren/scoop |
| Pages runbook | [`docs/github-pages-testnet.md`](../docs/github-pages-testnet.md) |
| Local testnet env | [`docs/frontend-testnet.md`](../docs/frontend-testnet.md) |
| BSC testnet Diamond | `0xfB2678ff49967B073F6537781EC3d35DE731a5DF` |
| Solana program | `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT` |

## Setup

```bash
pnpm install
cp .env.example .env.local
# EVM: set NEXT_PUBLIC_SCOOP_DIAMOND; mainnet/testnet also require NEXT_PUBLIC_SCOOP_DEPLOY_BLOCK
# Solana: see “Solana local” below
# Testnet UI acceptance: docs/frontend-testnet.md (.env.example Mode B)
pnpm dev --port 3010
```

| Env | Meaning |
|---|---|
| `NEXT_PUBLIC_CHAIN` | `local` \| `testnet` \| `mainnet` (EVM) |
| `NEXT_PUBLIC_SCOOP_DIAMOND` | Diamond address |
| `NEXT_PUBLIC_SCOOP_DEPLOY_BLOCK` | Deploy block (`/me` event scan start; required when not local) |
| `NEXT_PUBLIC_KEEPER_URL` | Optional; POST `{url}/trigger` when draw-ready |
| `NEXT_PUBLIC_WC_PROJECT_ID` | WalletConnect (can be empty locally) |
| `NEXT_PUBLIC_BSC_RPC` | Optional custom RPC |
| `NEXT_PUBLIC_BASE_PATH` | Pages subpath, e.g. `/scoop`; leave empty for custom domain |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | `local` / `localnet` \| `devnet` \| `mainnet-beta` |
| `NEXT_PUBLIC_SOLANA_PROGRAM_ID` | Anchor program id (default `FC9im2jk…UrpHT`) |
| `NEXT_PUBLIC_SOLANA_RPC` | Optional Solana RPC (localnet default `http://127.0.0.1:8899`) |

Multi-chain adapter layer: `src/chain/` (EVM wraps wagmi; Solana talks to `programs/` + IDL `src/idl/scoop.json`).

Package manager: **pnpm** only. Checks via Biome (`pnpm check` / `pnpm ci`).

## Solana local

1. Follow `programs/README.md` to start the validator, deploy the program, and `initialize` Config  
   (or run `bash scripts/e2e-solana-local.sh`).
2. `.env.local`:

```bash
NEXT_PUBLIC_SOLANA_CLUSTER=localnet
NEXT_PUBLIC_SOLANA_PROGRAM_ID=FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT
NEXT_PUBLIC_SOLANA_RPC=http://127.0.0.1:8899
```

3. `pnpm dev` → switch header to **Solana** → connect Phantom/Solflare (localnet).
4. **ActiveChain branching**: `/create`, `/raffle/?id=` (buy / draw / claim / refund / recover), and the home list use Solana adapters when `family=solana`; EVM uses wagmi. Draw entropy is **SlotHashes** (no VRF).
5. Reads: `fetchSolanaRaffleById`; home list via `getProgramAccounts` on Raffle accounts (GPA fallback = bounded recent-id scan).  
   `/me` lists Solana purchases via **BuyerRecord GPA**. `/user` and `/token` have no secondary indexes on Solana and show an explicit empty / limitation state.

Native SOL sentinel = `Pubkey::default()` (`1111…1111`); explicit wSOL mint uses ordinary SPL (no auto-wrap).  
Wallets: Solana → `WalletPill` (wallet-adapter); EVM → RainbowKit.

## Routes

`/` · `/create` · `/me` · `/raffle/?id=` · `/token/?a=` · `/user/?a=`  
(query form for static deep links; no server dynamic routes.)

## GitHub Pages

1. Repo **Settings → Pages → Source = GitHub Actions**
2. Configure Actions **Variables**: `NEXT_PUBLIC_SCOOP_DIAMOND`, `NEXT_PUBLIC_SCOOP_DEPLOY_BLOCK`, `NEXT_PUBLIC_CHAIN`, etc. (see `.env.example`)
3. If the site is `user.github.io/repo`, set `NEXT_PUBLIC_BASE_PATH=/repo`
4. Push `main` (or run the `Deploy Pages` workflow manually) → artifacts in `web/out`

Preview the static build locally:

```bash
pnpm build && pnpm exec serve out   # or npx serve out
```

## Scripts

```bash
pnpm dev
pnpm build      # → out/
pnpm typecheck
pnpm ci
```

Contracts and local E2E: root `README.md`, `scripts/e2e-local.sh`, `programs/`, `keeper/`.
