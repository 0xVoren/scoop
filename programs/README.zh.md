# Scoop Solana Programs（Anchor MVP）

[English](README.md)

与 EVM Diamond 同产品语义。规则源：[`docs/invariants-evm-solana.md`](../docs/invariants-evm-solana.md)。

**Program ID（localnet / 预定 devnet keypair）：** `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT`

**测试网部署：** 见 [`docs/solana-testnet-deploy.md`](../docs/solana-testnet-deploy.md) · 总表 [`docs/testnet-contracts-deploy.md`](../docs/testnet-contracts-deploy.md)。  
**devnet 已上链**（Program ID 同上；initialize + create→buy→draw 冒烟已通过）。本地验证：`bash scripts/e2e-solana-local.sh`。

```bash
# Devnet：部署 .so + initialize（密钥路径用环境变量，勿写入仓库）
export SOLANA_AUTHORITY_KEYPAIR=~/.config/solana/id.json
bash scripts/deploy-solana-devnet.sh
# 冒烟 create→buy→delay→draw（无 airdrop）
bash scripts/e2e-solana-devnet.sh
```

## 工具链

| 工具 | 已验证版本 |
|---|---|
| Anchor | 0.32.1（`avm use 0.32.1`；已去掉 `#![allow(deprecated)]` realloc 压制） |
| Solana / Agave | 2.1.0（Anchor 推荐 2.3.0；本机 2.1.0 已验证 check/test/sbf/e2e） |
| Rust（host 单测） | stable ≥ 1.85 推荐 |
| 额外 crate | `solana-keccak-hasher`（0.32 起不再从 `solana_program` 再导出 keccak） |

```bash
# PATH
export PATH="$HOME/.avm/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"

cd programs

# Host 单元测试（不依赖 validator；费用/份额/开奖窗口/过期）
CARGO_TARGET_DIR=/tmp/scoop-programs-target cargo test -p scoop --lib -- --nocapture

# BPF / SBF 构建（需 platform-tools ≥ v1.47；锁文件已钉住 edition2024 依赖）
CARGO_TARGET_DIR=/tmp/scoop-programs-target \
  cargo-build-sbf --tools-version v1.47 --manifest-path programs/scoop/Cargo.toml
# 产物：target/deploy/scoop.so（或 $CARGO_TARGET_DIR/deploy/scoop.so）

# 也可用 Anchor 封装（等价）
anchor build
```

> Agent Store / FUSE 上若 `cargo` 链接报 `Resource temporarily unavailable`，请设 `CARGO_TARGET_DIR` 到本机磁盘路径（如 `/tmp/scoop-programs-target`）。  
> `Cargo.lock` 已 pin：`blake3=1.5.5`、`proc-macro-crate=3.2.0`、`indexmap=2.7.1`、`zeroize=1.8.1`、`unicode-segmentation=1.12.0` 等，以兼容 platform-tools rustc 1.84。

## 指令一览

| 指令 | 说明 |
|---|---|
| `initialize` | 创建 Config + PendingDraws |
| `set_fee_recipient` / `set_protocol_config` | authority 更新 |
| `create_raffle` | 托管奖品 → `Selling`（0 费） |
| `buy_shares` | 购份额；售罄 → `SoldOut` + pending 入队 |
| `draw` / `draw_many` | 任何人；锚定 `eligible` SlotHash；`draw_many` 跳过未就绪/熵过期 |
| `close_share_board` / `close_buyer_record` | 终端态回收租金（对标 dRaffle close_entrants） |
| `claim_prize` | 赢家 100% 奖品（0 费） |
| `claim_proceeds` | 创作者收益；`fee = raised/100` → fee_recipient |
| `refund` / `recover_prize` | Selling 截止过期，或 SoldOut 熵过期 → `Expired`（0 费）；需 `pending` 账户 |

## 账户模型（PDA）

| 账户 | Seeds | 职责 |
|---|---|---|
| `Config` | `["config"]` | authority、fee_recipient、next_raffle_id、ProtocolConfig |
| `PendingDraws` | `["pending"]` | 可枚举 `raffle_ids[]`（keeper 扫描入口） |
| `Raffle` | `["raffle", raffle_id_le]` | 单场状态；**原生 SOL 托管在本账户 lamports** |
| `ShareBoard` | `["shares", raffle_id_le]` | `owners[i]` = 份额 i 买家 |
| `BuyerRecord` | `["buyer", raffle_id_le, buyer]` | paid / share_count / refunded |
| SPL vault ATA | ATA(raffle, mint) | 奖品/支付 SPL；authority = Raffle PDA |

**原生哨兵 mint：** `Pubkey::default()`（全零），经 `create_raffle` **指令参数**传入（链上无法挂载 default 账户）。显式 wSOL mint 走普通 SPL，程序不 auto wrap。

### Keeper 如何扫 pending

1. 读 `PendingDraws` PDA → `raffle_ids`
2. 对每个 id 读 `Raffle`：`eligible_slot = sold_out_slot + draw_delay_slots`
3. 若 `Clock.slot > eligible_slot`，调 `draw` 或批量 `draw_many`
4. 成功后该 id 从 pending 出队

`draw_many` remaining_accounts 布局：`[raffle_0, share_board_0, raffle_1, share_board_1, ...]`。

## 随机（SlotHashes）

- 可开奖：`slot > sold_out_slot + draw_delay_slots`，`draw_delay_slots ∈ [1,128]`
- 解析：**仅** `slot == eligible` 的条目；滚出窗口 → `DrawEntropyExpired`（禁止改用更新 slot）
- 获胜：`u64::from_le_bytes(keccak(hash || raffle_id_le)[0..8]) % total_shares`（dRaffle 风格熵展开）
- **禁止** VRF / oracle

## 与对照表差异

**无**（产品规则数值与状态机对齐）。链能力差异（SlotHashes ~512 vs EVM ~256；slot 节奏）已在对照表 §1.3 声明为等价。

实现层备注（非规则差异）：

- MVP 仅经典 SPL Token Program（拒 Token-2022；`anchor-spl` 关 default features）
- 次级索引（tokenOrderId / userOrderId）未镜像；`raffle_id` 自 1 递增
- pending 账户需预留空间；大量入队时客户端应 `AccountInfo::resize`（或后续加 `resize_pending`）
- 本地 E2E：`bash scripts/e2e-solana-local.sh`（validator + deploy；闸门：lifecycle、keeper `draw_many`、expire/refund/recover、迟到 `DrawEntropyExpired`→退款、SPL 资产矩阵）
- Devnet：`bash scripts/deploy-solana-devnet.sh` + `bash scripts/e2e-solana-devnet.sh`（需注资；见测试网文档）
- `draw_many` 对 remaining raffle/share_board 使用完整账户缓冲做 `try_deserialize` / `try_serialize`（含 discriminator）

## 目录

```text
programs/
  Anchor.toml
  Cargo.toml                 # workspace
  README.md
  programs/scoop/            # Anchor 程序
    Cargo.toml
    src/
      lib.rs                 # 入口 + invariant 单测
      constants.rs / errors.rs
      state/                 # Config, Raffle, ShareBoard, Buyer, Pending
      instructions/          # create/buy/draw/claim/refund/...
      utils/                 # SlotHashes + asset pull/push
  target/deploy/scoop-keypair.json
```
