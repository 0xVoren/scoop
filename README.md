# Scoop

[中文](README.zh.md)

**On-chain share raffle protocol** — one product rulebook, two chain implementations.

Anyone escrows a prize (native or fungible token), sells a fixed number of shares priced in a payment asset (which may differ), then after sell-out plus a configured delay anyone may `draw` using an on-chain hash window (no external VRF). The winning share claims **100% of the prize**; the creator claims proceeds minus a **1%** protocol fee to `feeRecipient` on `claimProceeds`.

| | |
|---|---|
| Live UI (GitHub Pages) | https://0xvoren.github.io/scoop/ |
| Source | https://github.com/0xVoren/scoop |
| BSC testnet Diamond | [`0xfB2678ff49967B073F6537781EC3d35DE731a5DF`](https://testnet.bscscan.com/address/0xfB2678ff49967B073F6537781EC3d35DE731a5DF) |
| Solana program (devnet) | [`FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT`](https://explorer.solana.com/address/FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT?cluster=devnet) |

Production path: **BNB Smart Chain** (EVM EIP-2535 Diamond). **Solana** (Anchor) tracks the same product invariants — see [`docs/solana-dual-chain-plan.md`](docs/solana-dual-chain-plan.md) and [`docs/invariants-evm-solana.md`](docs/invariants-evm-solana.md). The public Pages deployment targets **testnets only** (BSC Chapel + Solana devnet); it does not invent or advertise mainnet addresses.

## Repository layout

```text
contracts/   # Foundry + EIP-2535 Diamond (BSC / EVM)
programs/    # Anchor program (Solana) — Program ID FC9im2jk…UrpHT
docs/        # Protocol notes, dual-chain plan, deploy & ops runbooks
web/         # Next.js App Router + wagmi + Solana wallet-adapter (static export)
keeper/      # Permissionless pending-draw trigger (EVM + Solana)
```

## Contracts (EVM)

```bash
cd contracts
forge test
```

Local deploy (Anvil):

```bash
anvil &
forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

Lifecycle: `createRaffle` → `buyShares` → (sell-out) → wait N blocks → `draw` → `claimPrize` / `claimProceeds`.  
If the deadline passes before sell-out: `refund` / `recoverPrize` (no fees).

## Web

```bash
cd web
cp .env.example .env.local
# set NEXT_PUBLIC_SCOOP_DIAMOND to the deployed Diamond
# NEXT_PUBLIC_CHAIN=local|testnet|mainnet
# mainnet/testnet: set NEXT_PUBLIC_SCOOP_DEPLOY_BLOCK for SharesPurchased log scans
pnpm dev
```

Static export hosts on **GitHub Pages** (`pnpm build` → `web/out`; workflow: `.github/workflows/pages.yml`).  
Routes: `/` · `/create` · `/me` · `/raffle/?id=` · `/token/?a=` · `/user/?a=`  
Package notes: [`web/README.md`](web/README.md). Pages defaults: [`docs/github-pages-testnet.md`](docs/github-pages-testnet.md).

## Keeper (pendingDraw monitor)

```bash
cd keeper && pnpm install
# EVM
DIAMOND_ADDRESS=0x... CHAIN=local pnpm tick
# Solana
KEEPER_CHAIN=solana SOLANA_KEEPER_KEYPAIR=~/.config/solana/id.json pnpm tick
```

Details: [`keeper/README.md`](keeper/README.md).

## Local and testnet verification

```bash
# EVM (needs Anvil + deployed Diamond)
DIAMOND_ADDRESS=0x... bash scripts/e2e-local.sh
# Solana (solana-test-validator + deploy; lifecycle + keeper + expire/refund + late-draw + SPL matrix)
bash scripts/e2e-solana-local.sh
```

Solana local gates and asset matrix: see the header of `scripts/e2e-solana-local.ts`. Library unit tests: `cd programs && CARGO_TARGET_DIR=/tmp/scoop-programs-target cargo test -p scoop --lib`.

Solana **devnet** (self-funded keypair; never commit private keys):

```bash
export SOLANA_AUTHORITY_KEYPAIR=~/.config/solana/id.json
bash scripts/deploy-solana-devnet.sh          # .so + initialize
bash scripts/e2e-solana-devnet.sh             # create→buy→delay→draw
KEEPER_CHAIN=solana SOLANA_RPC_URL=https://api.devnet.solana.com \
  SOLANA_KEEPER_KEYPAIR=~/.config/solana/id.json pnpm --dir keeper tick
```

| Document | Purpose |
|---|---|
| [`docs/testnet-contracts-deploy.md`](docs/testnet-contracts-deploy.md) | BSC + Solana testnet deploy record |
| [`docs/keeper-testnet-ops.md`](docs/keeper-testnet-ops.md) | Keeper testnet operations |
| [`docs/solana-testnet-deploy.md`](docs/solana-testnet-deploy.md) | Solana-focused deploy |
| [`docs/frontend-testnet.md`](docs/frontend-testnet.md) | Point local UI at testnets |
| [`docs/github-pages-testnet.md`](docs/github-pages-testnet.md) | Pages workflow + baked defaults |
| [`programs/README.md`](programs/README.md) | Anchor program toolchain |

## Spec and ops

- Protocol notes (fees, draw entropy, assets, reclaim): [`docs/PROTOCOL.md`](docs/PROTOCOL.md)
- Asset policy: [`docs/asset-policy.md`](docs/asset-policy.md)
- Design history: [`docs/superpowers/specs/2026-11-13-scoop-design.md`](docs/superpowers/specs/2026-11-13-scoop-design.md)
- Dual-chain plan: [`docs/solana-dual-chain-plan.md`](docs/solana-dual-chain-plan.md)
- EVM ↔ Solana invariants: [`docs/invariants-evm-solana.md`](docs/invariants-evm-solana.md)
- Mainnet preparation (do not deploy until explicitly ordered): [`docs/mainnet-runbook.md`](docs/mainnet-runbook.md)

## License

[MIT](LICENSE)
