# Scoop Solana Testnet Deploy (devnet)

[中文](solana-testnet-deploy.zh.md)

Deploy and verify the Scoop Anchor program on Solana **devnet** (the product default when docs say “testnet”; not testnet-beta).

| | |
|---|---|
| Program ID | `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT` |
| Randomness | SlotHashes (**no VRF**) |
| Explorer | https://explorer.solana.com/address/FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT?cluster=devnet |
| Live UI | https://0xvoren.github.io/scoop/ |

> Secrets (private keys / mnemonics / JSON keypairs) stay in local `~/.config/solana/` or CI secrets; **do not** write them into the Agent Store / git.

---

## Status (2026-11-21)

| Item | Status |
|---|---|
| `.so` artifact | Present: `programs/target/deploy/scoop.so` (~504 KB) |
| Program keypair | `programs/target/deploy/scoop-keypair.json` → Program ID above |
| On-chain (devnet) | **Deployed + initialized** (authority `KKjhe…D8bH`; deploy slot `524605686`) |
| Devnet smoke | **Passed** `SKIP_CLAIM=1 bash scripts/e2e-solana-devnet.sh` (create→buy→draw) |
| Local smoke | **Passed** `bash scripts/e2e-solana-local.sh` |
| Parallel summary | [`testnet-contracts-deploy.md`](testnet-contracts-deploy.md) |

> CLI: use **Solana/Agave 2.1.x**; 3.0.x often HTTP 400 against public devnet RPC.

---

## Prerequisites

1. Solana CLI ≥ 2.1 (`solana --version`)
2. Built `scoop.so` (see [`programs/README.md`](../programs/README.md))
3. **Funded** authority (recommend ≥ **3.5 SOL**; program account rent ≈ 2.25 SOL + buffer/fees)
   - Browser faucet: https://faucet.solana.com  
   - CLI `solana airdrop` often fails on public RPC (faucet closed / rate limit)

```bash
# Generate authority wallet locally (home directory; do not commit)
solana-keygen new -o ~/.config/solana/id.json
solana config set --url https://api.devnet.solana.com
solana config set --keypair ~/.config/solana/id.json
# After funding the pubkey via faucet.solana.com:
solana balance
```

---

## One-shot deploy + initialize

```bash
export SOLANA_AUTHORITY_KEYPAIR=~/.config/solana/id.json
# Optional: FEE_RECIPIENT=<base58>  SOLANA_RPC_URL=https://api.devnet.solana.com
bash scripts/deploy-solana-devnet.sh
```

The script will:

1. Check balance (insufficient → **exit 2** + print pubkey / explorer; no fake deploy)
2. `solana program deploy scoop.so --program-id scoop-keypair.json`
3. Call `initialize` (Config + PendingDraws; skip if already exists)
4. Print program / tx explorer links

Dry run only: `DRY_RUN=1 bash scripts/deploy-solana-devnet.sh`

---

## Smoke (create → buy → delay → draw)

```bash
export SOLANA_AUTHORITY_KEYPAIR=~/.config/solana/id.json
bash scripts/e2e-solana-devnet.sh
# Optional: RUN_KEEPER=1  SKIP_CLAIM=1
```

**No airdrop:** transfers SOL from authority to an ephemeral buyer. Authority needs extra balance for prize (default 0.05 SOL) + share purchase + rent.

Local parallel verify (no testnet SOL needed):

```bash
bash scripts/e2e-solana-local.sh
```

---

## Keeper (testnet)

Full ops (alerts / secrets / RPC / mainnet notes + live evidence this run): [`keeper-testnet-ops.md`](keeper-testnet-ops.md).

```bash
cd keeper && pnpm install
KEEPER_CHAIN=solana \
  SOLANA_RPC_URL=https://api.devnet.solana.com \
  SOLANA_PROGRAM_ID=FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT \
  SOLANA_KEEPER_KEYPAIR=~/.config/solana/id.json \
  pnpm tick
```

Cloudflare Workers: set `KEEPER_CHAIN=solana`, `SOLANA_RPC_URL`, `SOLANA_PROGRAM_ID` in `wrangler.toml`;  
`pnpm exec wrangler secret put SOLANA_KEEPER_KEYPAIR` (JSON byte array; **do not** commit).

Mental model unchanged: scan `PendingDraws` → `draw` / `draw_many`; randomness remains SlotHashes.

---

## Web env (testnet)

```bash
# web/.env.local (do not commit secrets)
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
NEXT_PUBLIC_SOLANA_PROGRAM_ID=FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT
# Optional custom RPC; empty uses cluster default
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
NEXT_PUBLIC_KEEPER_URL=   # if keeper worker is deployed
```

See [`web/.env.example`](../web/.env.example).

---

## Deploy record table (fill after success)

| Field | Value |
|---|---|
| Cluster | `devnet` |
| Program ID | `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT` |
| Deploy tx | `2sUU5rtQDkyDR8XdtSXmw9JGnDhoyKzk4VhDwLVdQWVBcqFM7HeqCQBCgYS7kjWp1sEV4fGvS1HD9fbxtCos4CgG` |
| Initialize tx | `Q3of4xf2JB2huSiDeWN6CjXLsU5QeQ4mqHEaHN9REY68ShCQrrkiSRh17KnCuWHqrvDp6sS2QAJ5NZ3WbUEWcuP` |
| Config PDA | `ESGy3QxNvChDiBj2qkpgobn6dMTUHGA9dpoSxWRkfK7E` |
| fee_recipient | `KKjheWGV6VH12Jy8KTjyY4yeHHJAeyGYfkyKrkzD8bH` |
| Program explorer | https://explorer.solana.com/address/FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT?cluster=devnet |

---

## Notes

1. Public faucet remains often unavailable; this run completed after the user funded the authority
2. Upgrade authority = deploy authority; consider multisig / freeze before production
3. Evidence summary: [`testnet-contracts-deploy.md`](testnet-contracts-deploy.md)

**Related:** [`invariants-evm-solana.md`](invariants-evm-solana.md) · [`programs/README.md`](../programs/README.md) · [`keeper/README.md`](../keeper/README.md)
