# Scoop

[中文](README.zh.md)

On-chain share raffle (一元夺宝-style). **One product rulebook, two chain implementations:** production path is BNB Smart Chain (EVM Diamond); Solana (Anchor) tracks the same product invariants — see [`docs/solana-dual-chain-plan.md`](docs/solana-dual-chain-plan.md) and the comparison table [`docs/invariants-evm-solana.md`](docs/invariants-evm-solana.md).

Anyone escrows a prize (native or fungible token), sells a fixed number of shares priced in a payment asset (may differ), then after sell-out + `N` slots/blocks anyone can `draw` via an on-chain hash window (no external VRF). Winner takes **100% of the prize**; creator takes proceeds minus **1%** sent to `feeRecipient` on `claimProceeds`.

## Layout

```text
contracts/   # Foundry + EIP-2535 Diamond (BSC / EVM)
programs/    # Anchor MVP (Solana) — Program ID FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT
docs/        # design + dual-chain plan + invariants
web/         # Next.js App Router + wagmi (+ Solana adapter skeleton)
keeper/      # pending-draw trigger (EVM + Solana)
```

## Contracts

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

Static export can host on **GitHub Pages** (`pnpm build` → `web/out`; workflow: `.github/workflows/pages.yml`).  
Routes: `/` · `/create` · `/me` · `/raffle/?id=` · `/token/?a=` · `/user/?a=`  
Wallet: RainbowKit (optional peers `@x402/core` / `@x402/evm` / `@x402/svm` are listed in dependencies).

## Keeper (pendingDraw monitor)

```bash
cd keeper && pnpm install
# EVM
DIAMOND_ADDRESS=0x... CHAIN=local pnpm tick
# Solana
KEEPER_CHAIN=solana SOLANA_KEEPER_KEYPAIR=~/.config/solana/id.json pnpm tick
```

Local end-to-end:

```bash
# EVM (needs Anvil + deployed Diamond)
DIAMOND_ADDRESS=0x... bash scripts/e2e-local.sh
# Solana (solana-test-validator + deploy; lifecycle + keeper + expire/refund + late-draw + SPL matrix)
bash scripts/e2e-solana-local.sh
```

Solana local gates and asset matrix: see the header of `scripts/e2e-solana-local.ts`. Library unit tests: `cd programs && CARGO_TARGET_DIR=/tmp/scoop-programs-target cargo test -p scoop --lib`.

Solana **devnet / testnet** (self-funded keypair; never commit private keys):

```bash
export SOLANA_AUTHORITY_KEYPAIR=~/.config/solana/id.json
bash scripts/deploy-solana-devnet.sh          # .so + initialize
bash scripts/e2e-solana-devnet.sh             # create→buy→delay→draw
# Keeper
KEEPER_CHAIN=solana SOLANA_RPC_URL=https://api.devnet.solana.com \
  SOLANA_KEEPER_KEYPAIR=~/.config/solana/id.json pnpm --dir keeper tick
```

Testnet contract deploy notes (BSC + Solana): [`docs/testnet-contracts-deploy.md`](docs/testnet-contracts-deploy.md).  
Keeper testnet ops: [`docs/keeper-testnet-ops.md`](docs/keeper-testnet-ops.md).  
Solana-focused: [`docs/solana-testnet-deploy.md`](docs/solana-testnet-deploy.md); also [`keeper/README.md`](keeper/README.md), [`programs/README.md`](programs/README.md).

## Spec

- Protocol notes (fees + future fee-sink reservation): [`docs/PROTOCOL.md`](docs/PROTOCOL.md)
- Design: [`docs/superpowers/specs/2026-11-13-scoop-design.md`](docs/superpowers/specs/2026-11-13-scoop-design.md)
- Dual-chain plan: [`docs/solana-dual-chain-plan.md`](docs/solana-dual-chain-plan.md)
- EVM ↔ Solana invariants: [`docs/invariants-evm-solana.md`](docs/invariants-evm-solana.md)
- Solana testnet deploy: [`docs/solana-testnet-deploy.md`](docs/solana-testnet-deploy.md)

## License

[MIT](LICENSE)
