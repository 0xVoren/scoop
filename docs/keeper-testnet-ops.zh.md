# Scoop Keeper 测试网实机运维

[English](keeper-testnet-ops.md)

**日期：** 2026-11-21  
**范围：** 已部署测试网 Keeper 实机 tick（BSC Chapel + Solana devnet）+ 告警 / 密钥 / RPC / 主网注意。  
**机密：** 私钥 / 助记词 / keypair JSON **禁止**入库或写入 Agent Store；只用本机路径、1Password、或 Workers secrets。

合约地址见 [`testnet-contracts-deploy.md`](testnet-contracts-deploy.md)。主网总册见 [`mainnet-runbook.md`](mainnet-runbook.md)。

---

## 1. 部署目标（本轮）

| 链 | 目标 | 地址 |
|---|---|---|
| BSC testnet (Chapel, 97) | Diamond | `0xfB2678ff49967B073F6537781EC3d35DE731a5DF` |
| Solana **devnet** | Program | `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT` |

Keeper 是 **permissionless draw 的自动化调用方**：开奖本身任何人可调；密钥只付 gas / 手续费。

---

## 2. 本轮实机结果（2026-11-21）

### BSC

| 步骤 | 结果 | 证据 |
|---|---|---|
| 首次 `pnpm tick`（队列含熵过期 oid 2/5） | `readyIds=[2,5]` → `drawMany` 模拟 revert `DrawEntropyExpired` (`0x58a39da4`) → `skipped-or-raced` | 预期：EVM `drawMany` **全有或全无**，过期 id 会拖垮整批 |
| `recoverPrize(2)` / `recoverPrize(5)` 清空 pending | OK | [tx 2](https://testnet.bscscan.com/tx/0xe4bb24000256b311e323bc119d5d59e63fb793393b81cea450f651a03bbdbad0) · [tx 5](https://testnet.bscscan.com/tx/0x6fd9a65ee5cec7d6bece2fde23870f5e38ccf20de0ce906ea48e7d71266dbeab) |
| create→buyout oid=`16`（delay 5） | OK | [create](https://testnet.bscscan.com/tx/0xa33cd84d1880400ac9c830f88b90877417defa99d653f81a5d5d4938376b4fdd) · [buy](https://testnet.bscscan.com/tx/0xb96ec4e0e5baa907171ab46d3efc6e1888c10e3127f55d6a8238e8672e008893) |
| Keeper `drawMany([16])` | **triggered**；raffle status → Drawn(2)；pending=0 | [draw](https://testnet.bscscan.com/tx/0xd73319371e1baf48932cedba9f4b52c4ef6b71b40c678cd5b6604f1c6ee3697b) · block `143990784` |

Keeper EOA（本轮）：`0xB04d2DA94991F5E6F0DE1aBE6EAC0f32fAc81aA4`（1Password `buyback-vault` / `BSC-testnet-deployer`；**仅测试网**）。

### Solana

| 步骤 | 结果 | 证据 |
|---|---|---|
| 空队列 `pnpm tick` | `not-ready` exit 0 | 正常空闲 |
| create→buy（raffle_id=`15`）后 tick | **triggered** `draw_many` | [sig](https://explorer.solana.com/tx/5nj3Ne1vSH4ES3ySzmsERERhJxy5sdBKYmC5zQsmDQeNcV2g8SLCA31NcBJgVBXbujdVRbVZQqo6nUVjZMvPTj3R?cluster=devnet) |
| 再 tick | `not-ready` | 队列已空 |

Keeper / authority（本轮）：`KKjheWGV6VH12Jy8KTjyY4yeHHJAeyGYfkyKrkzD8bH`（`~/.config/solana/id.json`）。

---

## 3. 一发命令（本机）

```bash
cd /Users/zhangxiaotong/Code/active/scoop/keeper
pnpm install

# --- BSC testnet ---
export KEEPER_PRIVATE_KEY=0x...   # 本机 / 1Password；勿粘贴聊天
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

`triggered: true` 或 `reason: not-ready` → exit 0。  
`skipped-or-raced` / RPC / 密钥错误 → exit 1（需看日志）。

造可开奖场次（可选）：BSC 按 launch lock 造 11 份额 + delay 5 后买满再 tick；Solana 用 `RUN_KEEPER=1 SKIP_CLAIM=1 bash scripts/e2e-solana-devnet.sh`，或卖完后单独 `pnpm tick`。

---

## 4. 密钥

| 用途 | 存哪 | 注意 |
|---|---|---|
| EVM keeper | `KEEPER_PRIVATE_KEY`（env / `wrangler secret`）或 1Password 测试网项 | **≠** Diamond owner / feeRecipient（理想态）；测试网可临时共用 funded EOA |
| Solana keeper | `SOLANA_KEEPER_KEYPAIR` = 本机 `keypair.json` 路径，或 Workers 里 JSON 字节数组 secret | **≠** `fee_recipient` / upgrade authority（主网强制分离） |
| 禁止 | git、Agent Store、`wrangler.toml` vars、聊天记录 | 轮换后旧钥停资 |

本机取钥示例（Service Account；先 `export OP_SERVICE_ACCOUNT_TOKEN=…`）：

```bash
# 字段名以 1Password 条目为准；勿 echo 到日志文件
op item get <item-id> --vault <vault> --fields PRIVATE_KEY --reveal
```

Cloudflare：

```bash
pnpm exec wrangler secret put KEEPER_PRIVATE_KEY        # EVM
pnpm exec wrangler secret put SOLANA_KEEPER_KEYPAIR     # Solana JSON array
# 可选：RPC_URL / SOLANA_RPC_URL 含 API key 时也走 secret
```

余额下限（经验）：EVM 测试网 ≥ **0.05 tBNB**；Solana ≥ **0.2 SOL**（仅付 tx；奖品金不经 keeper）。

---

## 5. RPC

| 链 | 默认公共端点 | 备注 |
|---|---|---|
| BSC testnet | `https://bsc-testnet-rpc.publicnode.com` | chainId 97；可换 QuickNode/Alchemy |
| Solana devnet | `https://api.devnet.solana.com` | Agave CLI **2.1.x**；3.0.x 对公共 RPC 常 HTTP 400 |

生产 / 高频 cron：自备付费 RPC，设错误率与延迟告警；公共端点仅适合偶发 tick。

健康检查：

```bash
cast chain-id --rpc-url "$RPC_URL"          # expect 97
cast call $DIAMOND "pendingDrawCount()(uint256)" --rpc-url "$RPC_URL"
solana cluster-version --url "$SOLANA_RPC_URL"
```

---

## 6. 告警（建议）

Keeper 无内置 pager；用 Workers 日志 / cron 外包一层：

| 信号 | 严重度 | 动作 |
|---|---|---|
| 连续 N 次 tick `rpc-error` | P1 | 换 RPC；查配额 |
| EVM `readyIds` 非空但长期 `skipped-or-raced` | P1 | 解码 revert：常见 `DrawEntropyExpired`；对过期场 `refund`/`recoverPrize` 出队后再 tick |
| Solana 日志 `entropy expired … skip draw` | P2 | 通知用户走 `refund`/`recover_prize`；keeper **不应**重试 |
| Keeper 余额低于阈值 | P1 | 注资；主网用独立 hot wallet |
| Cron 超过 2× 周期无日志 | P1 | Workers 是否挂了 / secret 丢了 |
| `drawMany`/`draw_many` 成功但 FE 状态滞后 | P3 | 查 indexer / 部署块 |

**EVM vs Solana（运维必知）**

- Solana keeper **已过滤** `eligible + 512` 以外的 id（跳过并打日志）。
- EVM keeper 目前只判断 `block.number > eligible`，**不过滤** ~256 块熵窗口；过期 id 仍会进 `drawMany`，而合约是 **all-or-nothing** → 一整批失败。处置：先 `recoverPrize`/`refund` 清队列，或后续给 EVM collector 加与链上一致的过期预过滤。

可选 HTTP：`POST /trigger` + `KEEPER_TRIGGER_SECRET`（header `x-keeper-secret`）；前端 `NEXT_PUBLIC_KEEPER_URL` fire-and-forget。

---

## 7. 主网注意（摘要）

完整流程：[`mainnet-runbook.md`](mainnet-runbook.md) · [`mainnet-canary.md`](mainnet-canary.md) · [`security-checklist-mainnet.md`](security-checklist-mainnet.md)。

1. **未获明确指令前不跑主网 keeper / 不注资主网 hot wallet。**
2. `CHAIN=mainnet` + 主网 `RPC_URL`；Solana `mainnet-beta` + 主网 Program ID。
3. Keeper 钥与 owner / upgrade authority / feeRecipient **分离**；最小 gas 余额；可轮换。
4. 上线前用本文件测试网路径做一次「空队列 + 一场卖完开奖」演练。
5. 熵过期：**禁止**改用更新块哈希「补救」；只走 refund/recover。
6. 事故：停 cron → 轮换 secret → 用户仍可自行 `draw`（permissionless）。

---

## 8. Cloudflare 部署备忘

`wrangler.toml`：`KEEPER_CHAIN`、地址、无密钥 vars；cron `* * * * *` 兜底。  
`pnpm deploy` · `pnpm tail`。双链可两套 worker（各一条 `KEEPER_CHAIN`），避免单实例串链。

---

## 关联

- [`keeper/README.md`](../keeper/README.md)
- [`testnet-contracts-deploy.md`](testnet-contracts-deploy.md) · [`testnet-full-e2e.md`](testnet-full-e2e.md)
- [`solana-testnet-deploy.md`](solana-testnet-deploy.md)
- [`PROTOCOL.md`](PROTOCOL.md) · [`invariants-evm-solana.md`](invariants-evm-solana.md)
- [`mainnet-runbook.md`](mainnet-runbook.md)
