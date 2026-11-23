# Scoop Testnet Contract Deploy Record

[中文](testnet-contracts-deploy.zh.md)

Authoritative record of the BSC testnet Diamond and Solana devnet program deployments used by the public UI. Excludes frontend Pages cutover, live keeper ops, and mainnet.

**Secrets:** Private keys and mnemonics stay in local env, Foundry keystore, Solana CLI, or 1Password — **never** in this file or the Agent Store.

| | |
|---|---|
| Live UI | https://0xvoren.github.io/scoop/ |
| Repo | https://github.com/0xVoren/scoop |

---

## Overview

| Chain | Target | Result |
|---|---|---|
| BSC testnet (Chapel, chainId **97**) | Deploy Scoop Diamond + smoke create→buy | **Success** |
| Solana **devnet** | Deploy/upgrade program + initialize + smoke | **Success** (create→buy→draw; `SKIP_CLAIM=1`) |

---

## 1. EVM — BSC testnet

### Addresses and evidence

| Field | Value |
|---|---|
| Chain | BSC testnet / Chapel (`97`) |
| Diamond | `0xfB2678ff49967B073F6537781EC3d35DE731a5DF` |
| Owner / feeRecipient | `0x1517821457C17b8e8019DA3C2cAFb5424855480b` |
| Deploy block | `143943857` |
| Diamond CREATE tx | `0xd0d926f24d34af276160bcf38caa1f49e251d34b130f804eda644c227de8bf06` |
| Deploy script broadcast | `contracts/broadcast/DeployScoopDiamond.s.sol/97/run-latest.json` (11 txs in same block: facets + diamondCut init) |
| BscScan Diamond | https://testnet.bscscan.com/address/0xfB2678ff49967B073F6537781EC3d35DE731a5DF |
| BscScan Diamond tx | https://testnet.bscscan.com/tx/0xd0d926f24d34af276160bcf38caa1f49e251d34b130f804eda644c227de8bf06 |

On-chain checks (this run): `owner()` / `feeRecipient()` = deployer; `codesize` > 0; `nextOrderId` = `2` after smoke.

### Commands (re-runnable)

```bash
cd /Users/zhangxiaotong/Code/active/scoop
export PRIVATE_KEY=0x...   # already on machine; do not paste into chat
export BSC_TESTNET_RPC_URL=https://bsc-testnet-rpc.publicnode.com

bash scripts/deploy-bsc-testnet.sh
# or directly:
# cd contracts && forge script script/DeployScoopDiamond.s.sol \
#   --rpc-url "$BSC_TESTNET_RPC_URL" --broadcast -vv

export DIAMOND_ADDRESS=0xfB2678ff49967B073F6537781EC3d35DE731a5DF
bash scripts/smoke-bsc-testnet.sh
```

RPC may also be your own QuickNode/Alchemy; `foundry.toml` has `bsc_testnet = "${BSC_TESTNET_RPC_URL}"`.

### Smoke coverage

| Step | Result | Evidence |
|---|---|---|
| `createRaffle` (BNB prize `0.001`, price `0.0001`, 11 shares, delay 5) | OK, `orderId=1` | tx `0x307ebeb7bd2832b95f774f463196772154588cb11a0f60f3c18ce32ab0d9905a` · https://testnet.bscscan.com/tx/0x307ebeb7bd2832b95f774f463196772154588cb11a0f60f3c18ce32ab0d9905a |
| `buyShares(1)` (same key) | OK, `soldShares=1`, `shareCount=1` | tx `0x92bc679ada0698c62e35e7d34d9e6068a9cc579e57af1b927730ccb06b173452` · https://testnet.bscscan.com/tx/0x92bc679ada0698c62e35e7d34d9e6068a9cc579e57af1b927730ccb06b173452 |

Full path + edge (multi-buyer sell-out / expire / late entropy / claim fee / ERC-20 / drawMany): [`testnet-full-e2e.md`](testnet-full-e2e.md); local baseline remains `bash scripts/e2e-local.sh`.

### Balance / RPC

- Pre-deploy deployer ≈ **0.180** tBNB; after deploy + smoke ≈ **0.178** tBNB.
- Public RPC `https://bsc-testnet-rpc.publicnode.com` works (chainId 97).
- Deploy gas estimate ≈ **0.001** tBNB.

---

## 2. Solana — devnet

### Addresses and evidence

| Field | Value |
|---|---|
| Cluster | `devnet` |
| Program ID | `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT` |
| ProgramData | `7YPaty1L7MvnadGPP8y2hnpy2y7R3kb2CgY68AaP2SVq` |
| Upgrade authority | `KKjheWGV6VH12Jy8KTjyY4yeHHJAeyGYfkyKrkzD8bH` (`~/.config/solana/id.json`) |
| Deploy slot | `524605686` |
| Deploy tx | `2sUU5rtQDkyDR8XdtSXmw9JGnDhoyKzk4VhDwLVdQWVBcqFM7HeqCQBCgYS7kjWp1sEV4fGvS1HD9fbxtCos4CgG` |
| Initialize tx | `Q3of4xf2JB2huSiDeWN6CjXLsU5QeQ4mqHEaHN9REY68ShCQrrkiSRh17KnCuWHqrvDp6sS2QAJ5NZ3WbUEWcuP` |
| Config PDA | `ESGy3QxNvChDiBj2qkpgobn6dMTUHGA9dpoSxWRkfK7E` |
| fee_recipient | Same as authority |
| Program explorer | https://explorer.solana.com/address/FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT?cluster=devnet |
| Deploy explorer | https://explorer.solana.com/tx/2sUU5rtQDkyDR8XdtSXmw9JGnDhoyKzk4VhDwLVdQWVBcqFM7HeqCQBCgYS7kjWp1sEV4fGvS1HD9fbxtCos4CgG?cluster=devnet |
| Initialize explorer | https://explorer.solana.com/tx/Q3of4xf2JB2huSiDeWN6CjXLsU5QeQ4mqHEaHN9REY68ShCQrrkiSRh17KnCuWHqrvDp6sS2QAJ5NZ3WbUEWcuP?cluster=devnet |
| Config explorer | https://explorer.solana.com/address/ESGy3QxNvChDiBj2qkpgobn6dMTUHGA9dpoSxWRkfK7E?cluster=devnet |

### Commands (re-runnable)

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
# Prefer Agave/Solana CLI **2.1.x** (3.0.x often HTTP 400 against this public RPC)
export SOLANA_AUTHORITY_KEYPAIR=~/.config/solana/id.json
export SOLANA_RPC_URL=https://api.devnet.solana.com
# First deploy: recommend ≥ 3.5 SOL; when program already on-chain the script only requires initialize buffer
bash scripts/deploy-solana-devnet.sh
SKIP_CLAIM=1 bash scripts/e2e-solana-devnet.sh
```

Details: [`solana-testnet-deploy.md`](solana-testnet-deploy.md).

### Smoke coverage

| Step | Result | Evidence |
|---|---|---|
| `initialize` (Config + PendingDraws) | OK | [init tx](https://explorer.solana.com/tx/Q3of4xf2JB2huSiDeWN6CjXLsU5QeQ4mqHEaHN9REY68ShCQrrkiSRh17KnCuWHqrvDp6sS2QAJ5NZ3WbUEWcuP?cluster=devnet) |
| `create_raffle` (raffle_id=1, 0.05 SOL prize) | OK | [create tx](https://explorer.solana.com/tx/4L6htnGPVzu3XWYgB8M1UrCkdqDH3DDZiLm7gohsXGgYgHnVVULJBXWSRiRTrnxYSWeD3XCAFhrZC3VsenLqZSJ7?cluster=devnet) |
| `buy_shares` (ephemeral buyer buys all → SoldOut) | OK | [buy tx](https://explorer.solana.com/tx/5LK1Wi1mvr7qKkQ8p6RZswsWsTNBifNzvzYnXcKu1bsnA1f6nx6ciATuKYpovtS6yJK23UdPDSjDERd1ajMW9qD6?cluster=devnet) |
| `draw` (SlotHashes; `sold_out_slot=524605857`) | OK, winner share=10 | [draw tx](https://explorer.solana.com/tx/5wCMmVAxWve2Q8cpNpnAbKRYkbgTsuA3chzJqaNNCK16YQgt2i2VdsLwYmktJZiF8QzgRCBcPWHAoBopFcjyUzrj?cluster=devnet) |

Smoke used `SKIP_CLAIM=1`. Full path + edge (including claim / expire / late SlotHashes / SPL / draw_many): [`testnet-full-e2e.md`](testnet-full-e2e.md).

### Balance / RPC notes

- After funding, authority ≈ **5.0 SOL** → after deploy ≈ **2.44 SOL** (program rent ≈ 2.56 SOL).
- **Agave CLI 3.0.13** often returns HTTP 400 against `https://api.devnet.solana.com`; switching to **2.1.0** fixed `solana balance` / `program deploy`.
- Script fixes: macOS `sed -i`; when program already on-chain, balance floor drops to initialize buffer (default 0.05 SOL).

---

## 3. Web / Keeper

- Frontend local acceptance: [`frontend-testnet.md`](frontend-testnet.md)
- Keeper testnet live ops + alerts / secrets / RPC / mainnet notes: [`keeper-testnet-ops.md`](keeper-testnet-ops.md) (this run drew BSC oid 16 + Solana raffle 15)

```bash
# web/.env.local (example, no secrets)
NEXT_PUBLIC_CHAIN=testnet
NEXT_PUBLIC_SCOOP_DIAMOND=0xfB2678ff49967B073F6537781EC3d35DE731a5DF
NEXT_PUBLIC_SCOOP_DEPLOY_BLOCK=143943857
NEXT_PUBLIC_BSC_RPC=https://bsc-testnet-rpc.publicnode.com

NEXT_PUBLIC_SOLANA_CLUSTER=devnet
NEXT_PUBLIC_SOLANA_PROGRAM_ID=FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
# NEXT_PUBLIC_KEEPER_URL=   # if Cloudflare worker is deployed
```

---

## Related

- Deploy scripts: `scripts/deploy-bsc-testnet.sh` · `scripts/smoke-bsc-testnet.sh` · `scripts/deploy-solana-devnet.sh` · `scripts/e2e-solana-devnet.sh`
- Full-path E2E: `scripts/e2e-bsc-testnet.sh` · `scripts/e2e-solana-testnet-full.sh` · report [`testnet-full-e2e.md`](testnet-full-e2e.md)
- Keeper ops: [`keeper-testnet-ops.md`](keeper-testnet-ops.md)
- Frontend testnet: [`frontend-testnet.md`](frontend-testnet.md) · template [`web/.env.example`](../web/.env.example)
- Contract script: `contracts/script/DeployScoopDiamond.s.sol`
- Solana dedicated doc: [`solana-testnet-deploy.md`](solana-testnet-deploy.md)
