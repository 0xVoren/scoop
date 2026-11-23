# Frontend Pointed at Testnets (local acceptance)

[中文](frontend-testnet.zh.md)

Configure `web/` against the deployed BSC testnet Diamond and Solana devnet program for local acceptance (`pnpm typecheck` / Biome / `pnpm dev`).

**Secrets:** Private keys, mnemonics, and confidential WalletConnect credentials must **not** enter the repo or this file — use local `web/.env.local` only (gitignored).

| | |
|---|---|
| Live Pages | https://0xvoren.github.io/scoop/ |
| Deploy record | [`testnet-contracts-deploy.md`](testnet-contracts-deploy.md) |
| Pages CI defaults | [`github-pages-testnet.md`](github-pages-testnet.md) |

---

## Target addresses

| Item | Value |
|---|---|
| EVM | BSC testnet / Chapel (`97`) |
| Diamond | `0xfB2678ff49967B073F6537781EC3d35DE731a5DF` |
| Deploy block | `143943857` (start for `/me` event scans — required) |
| Solana | **devnet** |
| Program ID | `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT` |

Explorers:

- Diamond: https://testnet.bscscan.com/address/0xfB2678ff49967B073F6537781EC3d35DE731a5DF
- Program: https://explorer.solana.com/address/FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT?cluster=devnet

---

## Local configuration

Template: [`web/.env.example`](../web/.env.example) (Mode B comment block).  
Practice: copy to `web/.env.local` (do not commit):

```bash
cd web
cp .env.example .env.local
# Uncomment / set Mode B values as below
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

Notes:

- `NEXT_PUBLIC_*` is baked into the frontend bundle; **never** put deploy private keys there.
- `NEXT_PUBLIC_SCOOP_DEPLOY_BLOCK` is required on `testnet` / `mainnet`; missing it makes `/me` purchase-history scans unreliable.
- RPC may be swapped for your own QuickNode / Alchemy; public nodes are defaults only.
- Header can switch between **EVM / Solana**: EVM via wagmi (chain = BSC Testnet), Solana via wallet-adapter (cluster = devnet).

---

## Acceptance commands

```bash
cd web
pnpm install          # if not yet installed
pnpm typecheck
pnpm ci               # Biome
pnpm dev --port 3010
```

Browser smoke checklist:

1. Open `http://localhost:3010` — home does not report “Diamond not configured”.
2. EVM: connect MetaMask (BSC Testnet) → list/create pages can read/write Diamond.
3. Header switch to **Solana** → Phantom/Solflare (devnet) → list/create usable.
4. Solana `/me` with a wallet that bought shares: lists purchases (BuyerRecord GPA); open card to draw/claim/refund without memorizing IDs.
5. Optional: open an existing raffle `/raffle/?id=1` (if that id still exists on-chain).

Static export preview (optional): `pnpm build && pnpm exec serve out`.

---

## Relation to contract docs

| Doc | Content |
|---|---|
| [`testnet-contracts-deploy.md`](testnet-contracts-deploy.md) | Contract deploy addresses and smoke evidence |
| [`testnet-full-e2e.md`](testnet-full-e2e.md) | On-chain full-path script E2E (not UI) |
| [`solana-testnet-deploy.md`](solana-testnet-deploy.md) | Solana deploy details |
| This doc | Frontend env + local UI acceptance |

Keeper / GitHub Pages publish are out of scope here; Pages Variables may reuse the public addresses above (still no private keys).
