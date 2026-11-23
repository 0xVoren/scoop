# Scoop Solana 测试网部署（devnet）

[English](solana-testnet-deploy.md)

在 Solana **devnet** 上部署并验证 Scoop Anchor 程序（文档称「测试网」时默认指此；非 testnet-beta）。

| | |
|---|---|
| Program ID | `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT` |
| 随机源 | SlotHashes（**无 VRF**） |
| Explorer | https://explorer.solana.com/address/FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT?cluster=devnet |
| 线上 UI | https://0xvoren.github.io/scoop/ |

> 机密（私钥 / 助记词 / JSON 密钥）只放在本机 `~/.config/solana/` 或 CI secret；**禁止**写入 Agent Store / git。

---

## 现状（2026-11-21）

| 项 | 状态 |
|---|---|
| `.so` 产物 | 有：`programs/target/deploy/scoop.so`（~504 KB） |
| Program keypair | `programs/target/deploy/scoop-keypair.json` → 上述 Program ID |
| Devnet 上链 | **已部署 + initialize**（authority `KKjhe…D8bH`；deploy slot `524605686`） |
| Devnet 冒烟 | **已通过** `SKIP_CLAIM=1 bash scripts/e2e-solana-devnet.sh`（create→buy→draw） |
| 本地冒烟 | **已通过** `bash scripts/e2e-solana-local.sh` |
| 并联总表 | [`testnet-contracts-deploy.md`](testnet-contracts-deploy.md) |

> CLI：用 **Solana/Agave 2.1.x**；3.0.x 对公共 devnet RPC 常 HTTP 400。

---

## 前置

1. Solana CLI ≥ 2.1（`solana --version`）
2. 已构建 `scoop.so`（见 [`programs/README.md`](../programs/README.md)）
3. **已注资** authority（建议 ≥ **3.5 SOL**；程序账户 rent ≈ 2.25 SOL + buffer/手续费）
   - 浏览器水龙头：https://faucet.solana.com  
   - CLI `solana airdrop` 在公共 RPC 上常失败（faucet closed / rate limit）

```bash
# 本机生成权威钱包（写在家目录，不要提交）
solana-keygen new -o ~/.config/solana/id.json
solana config set --url https://api.devnet.solana.com
solana config set --keypair ~/.config/solana/id.json
# 用 faucet.solana.com 给 pubkey 充值后：
solana balance
```

---

## 一键部署 + initialize

```bash
export SOLANA_AUTHORITY_KEYPAIR=~/.config/solana/id.json
# 可选：FEE_RECIPIENT=<base58>  SOLANA_RPC_URL=https://api.devnet.solana.com
bash scripts/deploy-solana-devnet.sh
```

脚本会：

1. 检查余额（不足则 **exit 2** + 打印公钥 / explorer，不假部署）
2. `solana program deploy scoop.so --program-id scoop-keypair.json`
3. 调用 `initialize`（Config + PendingDraws；已存在则跳过）
4. 打印 program / tx explorer 链接

仅演练：`DRY_RUN=1 bash scripts/deploy-solana-devnet.sh`

---

## 冒烟（create → buy → delay → draw）

```bash
export SOLANA_AUTHORITY_KEYPAIR=~/.config/solana/id.json
bash scripts/e2e-solana-devnet.sh
# 可选：RUN_KEEPER=1  SKIP_CLAIM=1
```

**无 airdrop**：从 authority 转 SOL 给临时 buyer。权威需额外持仓覆盖奖品（默认 0.05 SOL）+ 购份额 + 租金。

本地并联验证（不需测试网 SOL）：

```bash
bash scripts/e2e-solana-local.sh
```

---

## Keeper（测试网）

完整运维（告警 / 密钥 / RPC / 主网注意 + 本轮实机证据）：[`keeper-testnet-ops.md`](keeper-testnet-ops.md)。

```bash
cd keeper && pnpm install
KEEPER_CHAIN=solana \
  SOLANA_RPC_URL=https://api.devnet.solana.com \
  SOLANA_PROGRAM_ID=FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT \
  SOLANA_KEEPER_KEYPAIR=~/.config/solana/id.json \
  pnpm tick
```

Cloudflare Workers：`wrangler.toml` 设 `KEEPER_CHAIN=solana`、`SOLANA_RPC_URL`、`SOLANA_PROGRAM_ID`；  
`pnpm exec wrangler secret put SOLANA_KEEPER_KEYPAIR`（JSON 字节数组，**不要**进仓库）。

心智不变：扫 `PendingDraws` → `draw` / `draw_many`；随机仍是 SlotHashes。

---

## Web env（测试网）

```bash
# web/.env.local（勿提交密钥）
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
NEXT_PUBLIC_SOLANA_PROGRAM_ID=FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT
# 可选自定义 RPC；留空则用集群默认
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
NEXT_PUBLIC_KEEPER_URL=   # 若部署了 keeper worker
```

参见 [`web/.env.example`](../web/.env.example)。

---

## 部署记录表（成功后填写）

| 字段 | 值 |
|---|---|
| Cluster | `devnet` |
| Program ID | `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT` |
| Deploy tx | `2sUU5rtQDkyDR8XdtSXmw9JGnDhoyKzk4VhDwLVdQWVBcqFM7HeqCQBCgYS7kjWp1sEV4fGvS1HD9fbxtCos4CgG` |
| Initialize tx | `Q3of4xf2JB2huSiDeWN6CjXLsU5QeQ4mqHEaHN9REY68ShCQrrkiSRh17KnCuWHqrvDp6sS2QAJ5NZ3WbUEWcuP` |
| Config PDA | `ESGy3QxNvChDiBj2qkpgobn6dMTUHGA9dpoSxWRkfK7E` |
| fee_recipient | `KKjheWGV6VH12Jy8KTjyY4yeHHJAeyGYfkyKrkzD8bH` |
| Program explorer | https://explorer.solana.com/address/FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT?cluster=devnet |

---

## 备注

1. 公共 faucet 仍常不可用；本轮由用户给 authority 注资后完成上链
2. Upgrade authority = 部署 authority；生产前再考虑多签 / 冻结
3. 证据总表：[`testnet-contracts-deploy.md`](testnet-contracts-deploy.md)

**关联：** [`invariants-evm-solana.md`](invariants-evm-solana.md) · [`programs/README.md`](../programs/README.md) · [`keeper/README.md`](../keeper/README.md)
