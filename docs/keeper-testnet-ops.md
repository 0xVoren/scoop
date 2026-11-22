# Scoop Keeper Testnet Live Ops

[中文](keeper-testnet-ops.zh.md)

**Date:** 2026-11-21  
**Scope:** Live keeper ticks against the deployed testnets (BSC Chapel + Solana devnet) + alerts / secrets / RPC / mainnet notes.  
**Secrets:** Private keys / mnemonics / keypair JSON **must not** be committed or written into the Agent Store; use local paths, 1Password, or Workers secrets only.

Contract addresses: [`testnet-contracts-deploy.md`](testnet-contracts-deploy.md). Mainnet runbook: [`mainnet-runbook.md`](mainnet-runbook.md).

---

## 1. Deploy targets (this run)

| Chain | Target | Address |
|---|---|---|
| BSC testnet (Chapel, 97) | Diamond | `0xfB2678ff49967B073F6537781EC3d35DE731a5DF` |
| Solana **devnet** | Program | `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT` |

The keeper is an **automation caller for permissionless draw**: anyone can draw; the key only pays gas / fees.

---

## 2. Live results this run (2026-11-21)

### BSC

| Step | Result | Evidence |
|---|---|---|
| First `pnpm tick` (queue had entropy-expired oid 2/5) | `readyIds=[2,5]` → `drawMany` simulate revert `DrawEntropyExpired` (`0x58a39da4`) → `skipped-or-raced` | Expected: EVM `drawMany` is **all-or-nothing**; an expired id tanks the whole batch |
| `recoverPrize(2)` / `recoverPrize(5)` clear pending | OK | [tx 2](https://testnet.bscscan.com/tx/0xe4bb24000256b311e323bc119d5d59e63fb793393b81cea450f651a03bbdbad0) · [tx 5](https://testnet.bscscan.com/tx/0x6fd9a65ee5cec7d6bece2fde23870f5e38ccf20de0ce906ea48e7d71266dbeab) |
| create→buyout oid=`16` (delay 5) | OK | [create](https://testnet.bscscan.com/tx/0xa33cd84d1880400ac9c830f88b90877417defa99d653f81a5d5d4938376b4fdd) · [buy](https://testnet.bscscan.com/tx/0xb96ec4e0e5baa907171ab46d3efc6e1888c10e3127f55d6a8238e8672e008893) |
| Keeper `drawMany([16])` | **triggered**; raffle status → Drawn(2); pending=0 | [draw](https://testnet.bscscan.com/tx/0xd73319371e1baf48932cedba9f4b52c4ef6b71b40c678cd5b6604f1c6ee3697b) · block `143990784` |

Keeper EOA (this run): `0xB04d2DA94991F5E6F0DE1aBE6EAC0f32fAc81aA4` (1Password `buyback-vault` / `BSC-testnet-deployer`; **testnet only**).

### Solana

| Step | Result | Evidence |
|---|---|---|
| Empty queue `pnpm tick` | `not-ready` exit 0 | Normal idle |
| create→buy (raffle_id=`15`) then tick | **triggered** `draw_many` | [sig](https://explorer.solana.com/tx/5nj3Ne1vSH4ES3ySzmsERERhJxy5sdBKYmC5zQsmDQeNcV2g8SLCA31NcBJgVBXbujdVRbVZQqo6nUVjZMvPTj3R?cluster=devnet) |
| Tick again | `not-ready` | Queue empty |

Keeper / authority (this run): `KKjheWGV6VH12Jy8KTjyY4yeHHJAeyGYfkyKrkzD8bH` (`~/.config/solana/id.json`).

---

## 3. One-shot commands (local)

```bash
cd /Users/zhangxiaotong/Code/active/scoop/keeper
pnpm install

# --- BSC testnet ---
export KEEPER_PRIVATE_KEY=0x...   # local / 1Password; do not paste into chat
KEEPER_CHAIN=evm \
  CHAIN=testnet \
  DIAMOND_ADDRESS=0xfB2678ff49967B073F6537781EC3d35DE731a5DF \
  RPC_URL=https://bsc-testnet-rpc.publicnode.com \
  pnpm tick

# --- Solana devnet ---
KEEPER_CHAIN=solana \
  SOLANA_RPC_URL=https://api.devnet.solana.com \
  SOLANA_PROGRAM_ID=FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT \
  SOLANA_KEEPER_KEYPAIR=~/.config/solana/id.json \
  pnpm tick
```

`triggered: true` or `reason: not-ready` → exit 0.  
`skipped-or-raced` / RPC / key errors → exit 1 (check logs).

Optional: create a draw-ready raffle — on BSC, create 11 shares + delay 5 under launch lock, sell out, then tick; on Solana use `RUN_KEEPER=1 SKIP_CLAIM=1 bash scripts/e2e-solana-devnet.sh`, or sell out then run `pnpm tick` alone.

---

## 4. Secrets

| Purpose | Where | Notes |
|---|---|---|
| EVM keeper | `KEEPER_PRIVATE_KEY` (env / `wrangler secret`) or 1Password testnet item | **≠** Diamond owner / feeRecipient (ideal); testnet may temporarily share a funded EOA |
| Solana keeper | `SOLANA_KEEPER_KEYPAIR` = local `keypair.json` path, or Workers JSON byte-array secret | **≠** `fee_recipient` / upgrade authority (mainnet must separate) |
| Forbidden | git, Agent Store, `wrangler.toml` vars, chat logs | After rotation, defund the old key |

Local secret fetch example (Service Account; first `export OP_SERVICE_ACCOUNT_TOKEN=…`):

```bash
# Field names follow the 1Password item; do not echo into log files
op item get <item-id> --vault <vault> --fields PRIVATE_KEY --reveal
```

Cloudflare:

```bash
pnpm exec wrangler secret put KEEPER_PRIVATE_KEY        # EVM
pnpm exec wrangler secret put SOLANA_KEEPER_KEYPAIR     # Solana JSON array
# Optional: also put RPC_URL / SOLANA_RPC_URL via secret when they contain API keys
```

Balance floor (rule of thumb): EVM testnet ≥ **0.05 tBNB**; Solana ≥ **0.2 SOL** (tx fees only; prize funds do not pass through the keeper).

---

## 5. RPC

| Chain | Default public endpoint | Notes |
|---|---|---|
| BSC testnet | `https://bsc-testnet-rpc.publicnode.com` | chainId 97; can swap QuickNode/Alchemy |
| Solana devnet | `https://api.devnet.solana.com` | Agave CLI **2.1.x**; 3.0.x often HTTP 400 against public RPC |

Production / high-frequency cron: use a paid RPC and alert on error rate / latency; public endpoints are fine for occasional ticks only.

Health checks:

```bash
cast chain-id --rpc-url "$RPC_URL"          # expect 97
cast call $DIAMOND "pendingDrawCount()(uint256)" --rpc-url "$RPC_URL"
solana cluster-version --url "$SOLANA_RPC_URL"
```

---

## 6. Alerts (recommended)

Keeper has no built-in pager; wrap Workers logs / cron:

| Signal | Severity | Action |
|---|---|---|
| N consecutive ticks `rpc-error` | P1 | Switch RPC; check quota |
| EVM `readyIds` non-empty but long-running `skipped-or-raced` | P1 | Decode revert: usually `DrawEntropyExpired`; `refund`/`recoverPrize` expired raffles out of queue, then tick again |
| Solana log `entropy expired … skip draw` | P2 | Tell users to `refund`/`recover_prize`; keeper **must not** retry |
| Keeper balance below threshold | P1 | Top up; mainnet uses a dedicated hot wallet |
| Cron silent for >2× period | P1 | Workers down / secret missing |
| `drawMany`/`draw_many` succeeded but FE state lags | P3 | Check indexer / deploy block |

**EVM vs Solana (ops must know)**

- Solana keeper **already filters** ids outside `eligible + 512` (skip + log).
- EVM keeper currently only checks `block.number > eligible` and **does not** filter the ~256-block entropy window; expired ids still enter `drawMany`, and the contract is **all-or-nothing** → whole batch fails. Mitigation: clear the queue with `recoverPrize`/`refund` first, or later add entropy-expiry prefiltering on the EVM collector to match on-chain rules.

Optional HTTP: `POST /trigger` + `KEEPER_TRIGGER_SECRET` (header `x-keeper-secret`); frontend `NEXT_PUBLIC_KEEPER_URL` fire-and-forget.

---

## 7. Mainnet notes (summary)

Full flow: [`mainnet-runbook.md`](mainnet-runbook.md) · [`mainnet-canary.md`](mainnet-canary.md) · [`security-checklist-mainnet.md`](security-checklist-mainnet.md).

1. **Do not run mainnet keeper / fund a mainnet hot wallet until explicitly instructed.**
2. `CHAIN=mainnet` + mainnet `RPC_URL`; Solana `mainnet-beta` + mainnet Program ID.
3. Keep keeper keys separate from owner / upgrade authority / feeRecipient; minimal gas balance; rotatable.
4. Before launch, rehearse once on this file’s testnet path: empty queue + one sell-out draw.
5. Entropy expired: **do not** “fix” with a newer block hash; refund/recover only.
6. Incident: stop cron → rotate secret → users can still `draw` themselves (permissionless).

---

## 8. Cloudflare deploy notes

`wrangler.toml`: `KEEPER_CHAIN`, addresses, non-secret vars; cron `* * * * *` as fallback.  
`pnpm deploy` · `pnpm tail`. Dual-chain can be two workers (one `KEEPER_CHAIN` each) to avoid a single instance straddling chains.

---

## Related

- [`keeper/README.md`](../keeper/README.md)
- [`testnet-contracts-deploy.md`](testnet-contracts-deploy.md) · [`testnet-full-e2e.md`](testnet-full-e2e.md)
- [`solana-testnet-deploy.md`](solana-testnet-deploy.md)
- [`PROTOCOL.md`](PROTOCOL.md) · [`invariants-evm-solana.md`](invariants-evm-solana.md)
- [`mainnet-runbook.md`](mainnet-runbook.md)
