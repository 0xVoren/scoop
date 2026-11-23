# Scoop Keeper

[中文](README.zh.md)

Permissionless **pendingDraw** monitor: calls `drawMany` / `draw_many` when raffles become eligible.

Drawing itself is permissionless; the keeper only automates it (cron fallback + HTTP `POST /trigger`).  
When the frontend sets `NEXT_PUBLIC_KEEPER_URL`, the raffle detail page fire-and-forgets POST `/trigger` on draw-ready (users can still draw manually).

Supports **EVM** and **Solana** via `KEEPER_CHAIN`. Ops: [`docs/keeper-testnet-ops.md`](../docs/keeper-testnet-ops.md).

## Environment

### Shared

| Variable | Meaning |
|---|---|
| `KEEPER_CHAIN` | `evm` (default) \| `solana` |
| `KEEPER_TRIGGER_SECRET` | Optional; HTTP `/trigger` checks `x-keeper-secret` |

### EVM (`KEEPER_CHAIN=evm`)

| Variable | Meaning |
|---|---|
| `RPC_URL` | JSON-RPC (default `http://127.0.0.1:8545`) |
| `DIAMOND_ADDRESS` | Scoop Diamond |
| `CHAIN` | `local` \| `testnet` \| `mainnet` (viem chain) |
| `KEEPER_PRIVATE_KEY` | `0x` + 64 hex (Cloudflare secret) |

Mental model: read `pendingDrawCount` / `pendingDrawAt` → `block.number > eligibleBlock` → `drawMany`.

### Solana (`KEEPER_CHAIN=solana`)

| Variable | Meaning |
|---|---|
| `SOLANA_RPC_URL` | Default `http://127.0.0.1:8899` |
| `SOLANA_PROGRAM_ID` | Default `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT` |
| `SOLANA_KEEPER_KEYPAIR` | JSON byte array (Workers secret) or local `keypair.json` path (CLI) |
| `SOLANA_USE_DRAW_MANY` | Default `true`; `false` uses single `draw` |

Mental model: read `PendingDraws` PDA → per raffle `eligible = sold_out_slot + draw_delay_slots` → call `draw_many` only when `eligible < slot ≤ eligible + 512` (remaining: `[raffle, share_board, …]`). Randomness remains on-chain **anchored SlotHash(`eligible`)** (no VRF).

**After SlotHashes expire:** the keeper **does not** retry draw for expired raffles (skips + logs). Users/creators use `refund` / `recover_prize` (SoldOut→Expired, dequeue pending). Key separation: keeper operator key ≠ `fee_recipient`.

## One-shot local

```bash
cd keeper
pnpm install

# EVM (Anvil)
DIAMOND_ADDRESS=0x... CHAIN=local pnpm tick

# Solana (localnet)
KEEPER_CHAIN=solana \
  SOLANA_RPC_URL=http://127.0.0.1:8899 \
  SOLANA_KEEPER_KEYPAIR=~/.config/solana/id.json \
  pnpm tick

# Solana (devnet / testnet) — key only via local path or wrangler secret; never commit
KEEPER_CHAIN=solana \
  SOLANA_RPC_URL=https://api.devnet.solana.com \
  SOLANA_PROGRAM_ID=FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT \
  SOLANA_KEEPER_KEYPAIR=~/.config/solana/id.json \
  pnpm tick
```

Default EVM key is Anvil account#0; local only.  
Devnet deploy + smoke: [`docs/solana-testnet-deploy.md`](../docs/solana-testnet-deploy.md).  
Testnet live tick + alerts / keys / RPC / mainnet notes: [`docs/keeper-testnet-ops.md`](../docs/keeper-testnet-ops.md).

## Cloudflare deploy

```bash
# wrangler.toml: KEEPER_CHAIN + addresses
pnpm exec wrangler secret put KEEPER_PRIVATE_KEY          # EVM
# or
pnpm exec wrangler secret put SOLANA_KEEPER_KEYPAIR       # Solana JSON array
# optional: pnpm exec wrangler secret put RPC_URL / SOLANA_RPC_URL
pnpm deploy
pnpm tail
```

## Local E2E

```bash
# EVM
DIAMOND_ADDRESS=0x... bash scripts/e2e-local.sh

# Solana (start validator, deploy; lifecycle + keeper + expire/refund + late-draw + SPL matrix)
bash scripts/e2e-solana-local.sh
# TS only (needs localnet + deployed program):
#   cd /tmp/scoop-e2e-work && SOLANA_RPC_URL=http://127.0.0.1:8899 pnpm exec tsx scripts/e2e-solana-local.ts

# Solana devnet (needs deployed program + funded authority)
bash scripts/e2e-solana-devnet.sh
```
