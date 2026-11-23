# Scoop 测试网合约部署记录

[English](testnet-contracts-deploy.md)

公开 UI 所使用的 BSC 测试网 Diamond 与 Solana devnet 程序部署权威记录。不含前端 Pages 切换、keeper 实机运维与主网。

**机密：** 私钥与助记词只留在本机 env、Foundry keystore、Solana CLI 或 1Password — **禁止**写入本文件或 Agent Store。

| | |
|---|---|
| 线上 UI | https://0xvoren.github.io/scoop/ |
| 仓库 | https://github.com/0xVoren/scoop |

---

## 总览

| 链 | 目标 | 结果 |
|---|---|---|
| BSC testnet (Chapel, chainId **97**) | 部署 Scoop Diamond + 冒烟 create→buy | **成功** |
| Solana **devnet** | 部署/升级 program + initialize + 冒烟 | **成功**（create→buy→draw；`SKIP_CLAIM=1`） |

---

## 1. EVM — BSC testnet

### 地址与证据

| 字段 | 值 |
|---|---|
| Chain | BSC testnet / Chapel (`97`) |
| Diamond | `0xfB2678ff49967B073F6537781EC3d35DE731a5DF` |
| Owner / feeRecipient | `0x1517821457C17b8e8019DA3C2cAFb5424855480b` |
| Deploy block | `143943857` |
| Diamond CREATE tx | `0xd0d926f24d34af276160bcf38caa1f49e251d34b130f804eda644c227de8bf06` |
| Deploy script broadcast | `contracts/broadcast/DeployScoopDiamond.s.sol/97/run-latest.json`（同块 11 笔：facets + diamondCut init） |
| BscScan Diamond | https://testnet.bscscan.com/address/0xfB2678ff49967B073F6537781EC3d35DE731a5DF |
| BscScan Diamond tx | https://testnet.bscscan.com/tx/0xd0d926f24d34af276160bcf38caa1f49e251d34b130f804eda644c227de8bf06 |

链上核对（本轮）：`owner()` / `feeRecipient()` = 部署者；`codesize` > 0；`nextOrderId` 在冒烟后为 `2`。

### 命令（可重跑）

```bash
cd /Users/zhangxiaotong/Code/active/scoop
export PRIVATE_KEY=0x...   # 本机已有；勿粘贴到聊天
export BSC_TESTNET_RPC_URL=https://bsc-testnet-rpc.publicnode.com

bash scripts/deploy-bsc-testnet.sh
# 或直接：
# cd contracts && forge script script/DeployScoopDiamond.s.sol \
#   --rpc-url "$BSC_TESTNET_RPC_URL" --broadcast -vv

export DIAMOND_ADDRESS=0xfB2678ff49967B073F6537781EC3d35DE731a5DF
bash scripts/smoke-bsc-testnet.sh
```

RPC 也可换成自备 QuickNode/Alchemy；`foundry.toml` 的 `bsc_testnet = "${BSC_TESTNET_RPC_URL}"`。

### 冒烟覆盖

| 步骤 | 结果 | 证据 |
|---|---|---|
| `createRaffle`（BNB prize `0.001`，price `0.0001`，11 shares，delay 5） | OK，`orderId=1` | tx `0x307ebeb7bd2832b95f774f463196772154588cb11a0f60f3c18ce32ab0d9905a` · https://testnet.bscscan.com/tx/0x307ebeb7bd2832b95f774f463196772154588cb11a0f60f3c18ce32ab0d9905a |
| `buyShares(1)`（同一钥） | OK，`soldShares=1`，`shareCount=1` | tx `0x92bc679ada0698c62e35e7d34d9e6068a9cc579e57af1b927730ccb06b173452` · https://testnet.bscscan.com/tx/0x92bc679ada0698c62e35e7d34d9e6068a9cc579e57af1b927730ccb06b173452 |

全链路 + 边缘（多人买满 / expire / late entropy / claim 费 / ERC-20 / drawMany）见 [`testnet-full-e2e.md`](testnet-full-e2e.md)；本地仍以 `bash scripts/e2e-local.sh` 为准。

### 余额 / RPC

- 部署前 deployer ≈ **0.180** tBNB；部署 + 冒烟后 ≈ **0.178** tBNB。
- 公共 RPC `https://bsc-testnet-rpc.publicnode.com` 可用（chainId 97）。
- 部署估算 gas ≈ **0.001** tBNB。

---

## 2. Solana — devnet

### 地址与证据

| 字段 | 值 |
|---|---|
| Cluster | `devnet` |
| Program ID | `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT` |
| ProgramData | `7YPaty1L7MvnadGPP8y2hnpy2y7R3kb2CgY68AaP2SVq` |
| Upgrade authority | `KKjheWGV6VH12Jy8KTjyY4yeHHJAeyGYfkyKrkzD8bH`（`~/.config/solana/id.json`） |
| Deploy slot | `524605686` |
| Deploy tx | `2sUU5rtQDkyDR8XdtSXmw9JGnDhoyKzk4VhDwLVdQWVBcqFM7HeqCQBCgYS7kjWp1sEV4fGvS1HD9fbxtCos4CgG` |
| Initialize tx | `Q3of4xf2JB2huSiDeWN6CjXLsU5QeQ4mqHEaHN9REY68ShCQrrkiSRh17KnCuWHqrvDp6sS2QAJ5NZ3WbUEWcuP` |
| Config PDA | `ESGy3QxNvChDiBj2qkpgobn6dMTUHGA9dpoSxWRkfK7E` |
| fee_recipient | 同 authority |
| Program explorer | https://explorer.solana.com/address/FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT?cluster=devnet |
| Deploy explorer | https://explorer.solana.com/tx/2sUU5rtQDkyDR8XdtSXmw9JGnDhoyKzk4VhDwLVdQWVBcqFM7HeqCQBCgYS7kjWp1sEV4fGvS1HD9fbxtCos4CgG?cluster=devnet |
| Initialize explorer | https://explorer.solana.com/tx/Q3of4xf2JB2huSiDeWN6CjXLsU5QeQ4mqHEaHN9REY68ShCQrrkiSRh17KnCuWHqrvDp6sS2QAJ5NZ3WbUEWcuP?cluster=devnet |
| Config explorer | https://explorer.solana.com/address/ESGy3QxNvChDiBj2qkpgobn6dMTUHGA9dpoSxWRkfK7E?cluster=devnet |

### 命令（可重跑）

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
# 推荐 Agave/Solana CLI **2.1.x**（3.0.x 对本公共 RPC 常 HTTP 400）
export SOLANA_AUTHORITY_KEYPAIR=~/.config/solana/id.json
export SOLANA_RPC_URL=https://api.devnet.solana.com
# 首次部署建议 ≥ 3.5 SOL；程序已在链上时脚本只要求 initialize 缓冲
bash scripts/deploy-solana-devnet.sh
SKIP_CLAIM=1 bash scripts/e2e-solana-devnet.sh
```

详见 [`solana-testnet-deploy.md`](solana-testnet-deploy.md)。

### 冒烟覆盖

| 步骤 | 结果 | 证据 |
|---|---|---|
| `initialize`（Config + PendingDraws） | OK | [init tx](https://explorer.solana.com/tx/Q3of4xf2JB2huSiDeWN6CjXLsU5QeQ4mqHEaHN9REY68ShCQrrkiSRh17KnCuWHqrvDp6sS2QAJ5NZ3WbUEWcuP?cluster=devnet) |
| `create_raffle`（raffle_id=1，0.05 SOL prize） | OK | [create tx](https://explorer.solana.com/tx/4L6htnGPVzu3XWYgB8M1UrCkdqDH3DDZiLm7gohsXGgYgHnVVULJBXWSRiRTrnxYSWeD3XCAFhrZC3VsenLqZSJ7?cluster=devnet) |
| `buy_shares`（临时 buyer 全额购入 → SoldOut） | OK | [buy tx](https://explorer.solana.com/tx/5LK1Wi1mvr7qKkQ8p6RZswsWsTNBifNzvzYnXcKu1bsnA1f6nx6ciATuKYpovtS6yJK23UdPDSjDERd1ajMW9qD6?cluster=devnet) |
| `draw`（SlotHashes；`sold_out_slot=524605857`） | OK，winner share=10 | [draw tx](https://explorer.solana.com/tx/5wCMmVAxWve2Q8cpNpnAbKRYkbgTsuA3chzJqaNNCK16YQgt2i2VdsLwYmktJZiF8QzgRCBcPWHAoBopFcjyUzrj?cluster=devnet) |

冒烟曾用 `SKIP_CLAIM=1`。全链路 + 边缘（含 claim / expire / late SlotHashes / SPL / draw_many）见 [`testnet-full-e2e.md`](testnet-full-e2e.md)。

### 余额 / RPC 备注

- 注资后权威 ≈ **5.0 SOL** → 部署后 ≈ **2.44 SOL**（program rent ≈ 2.56 SOL）。
- **Agave CLI 3.0.13** 对 `https://api.devnet.solana.com` 常报 HTTP 400；改用 **2.1.0** 后 `solana balance` / `program deploy` 正常。
- 脚本已修：macOS `sed -i`；程序已上链时余额门槛降为 initialize 缓冲（默认 0.05 SOL）。

---

## 3. Web / Keeper

- 前端本地验收：[`frontend-testnet.md`](frontend-testnet.md)
- Keeper 测试网实机 + 告警 / 密钥 / RPC / 主网注意：[`keeper-testnet-ops.md`](keeper-testnet-ops.md)（本轮 BSC oid 16 + Solana raffle 15 已开奖）

```bash
# web/.env.local（示例，无密钥）
NEXT_PUBLIC_CHAIN=testnet
NEXT_PUBLIC_SCOOP_DIAMOND=0xfB2678ff49967B073F6537781EC3d35DE731a5DF
NEXT_PUBLIC_SCOOP_DEPLOY_BLOCK=143943857
NEXT_PUBLIC_BSC_RPC=https://bsc-testnet-rpc.publicnode.com

NEXT_PUBLIC_SOLANA_CLUSTER=devnet
NEXT_PUBLIC_SOLANA_PROGRAM_ID=FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
# NEXT_PUBLIC_KEEPER_URL=   # 若部署了 Cloudflare worker
```

---

## 关联

- 部署脚本：`scripts/deploy-bsc-testnet.sh` · `scripts/smoke-bsc-testnet.sh` · `scripts/deploy-solana-devnet.sh` · `scripts/e2e-solana-devnet.sh`
- 全链路 E2E：`scripts/e2e-bsc-testnet.sh` · `scripts/e2e-solana-testnet-full.sh` · 报告 [`testnet-full-e2e.md`](testnet-full-e2e.md)
- Keeper 运维：[`keeper-testnet-ops.md`](keeper-testnet-ops.md)
- 前端测试网：[`frontend-testnet.md`](frontend-testnet.md) · 模板 [`web/.env.example`](../web/.env.example)
- 合约脚本：`contracts/script/DeployScoopDiamond.s.sol`
- Solana 专文：[`solana-testnet-deploy.md`](solana-testnet-deploy.md)
