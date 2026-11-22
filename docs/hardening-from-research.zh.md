# Hardening from research（SCO-12）

[English](hardening-from-research.md)

**日期：** 2026-11-21  
**依据：** [`github-similar-raffles.md`](github-similar-raffles.md)、[`invariants-evm-solana.md`](invariants-evm-solana.md) 三条优先建议

---

## 改了什么

### 1. 锚定开奖 + 迟到不可开 → 退款

| 链 | 行为 |
|---|---|
| EVM | `resolveDrawBlock` **只**用 `blockhash(soldOut+N)`；滚出 ~256 窗口 → `DrawEntropyExpired`；`refund`/`recoverPrize` 可将 SoldOut→Expired 并出队 pending |
| Solana | `resolve_draw_slot` **只**取 `slot == eligible`；滚出 → `DrawEntropyExpired`；退款门控 `slot > eligible + 512`；`refund`/`recover_prize` 需 `pending` 账户 |
| 双方 | 获胜改为 **keccak 展开**：EVM `keccak256(h \|\| orderId)`；Solana `keccak(h \|\| raffle_id_le)` |
| Keeper | Solana tick **跳过**熵过期场次，不再死磕 draw |
| 文档 | `PROTOCOL.md` 写入对外可验证公式；对照表 S1/S5/D4/D5 同步 |

### 2. 恶意资产与对账

- EVM `LibAsset.pull`：ERC-20 **余额差**记账；少到账 → `TransferAmountMismatch`（FoT / 税币）
- Solana `pull_spl_checked`：同余额差；Token-2022 仍 `UnsupportedTokenProgram`
- 文档列出不支持类；单测 `FeeOnTransferERC20`

### 3. dRaffle 对读落地

- 熵展开（上）
- `close_share_board` / `close_buyer_record` 回收租金
- PendingDraws：熵过期出队；keeper 职责写清（`keeper/README.md`）

---

## 测了什么

| 套件 | 结果 |
|---|---|
| `contracts/` `forge test` | **45 passed** |
| `programs/scoop` `cargo test` | **16 passed**（含 randomness 锚定/展开） |
| `scripts/e2e-local.sh`（Anvil） | **ALL E2E PASSED**（含 late entropy → refund） |
| `cargo build-sbf` | `target/deploy/scoop.so` 成功 |
| `anchor build` IDL 阶段 | 既有 `anchor-spl`/`token_2022` feature 噪音（与本次无关）；sbf 产物可用 |
| Solana `e2e-solana-local.sh` 全量 | **未在本轮重跑**（late 段需 ~512+ slots）；脚本已改为「draw 失败 + refund」 |

关键用例：`Draw.t.sol`（锚定 / 迟到退款）、`Expire.t.sol`、`LibAsset.t.sol`（FoT）、Solana `late_window_entropy_expired` / `expire_refund_path`。

---

## 仍故意不做

- 不上 Chainlink / Switchboard VRF
- 不支持 Token-2022 / fee-on-transfer（拒绝；余额差记账下少到账直接 revert）
- 不按地址人均份额上限（产品未拍板）
- 不自动 wrap/unwrap wSOL
- 不在 keeper 内代用户发起 refund（只跳过过期 draw；退款仍 permissionless 用户路径）
- 不修 `anchor build` IDL 对 `token_2022` feature 的上游摩擦（本次非范围）

---

## 剩余风险

1. Solana 退款门控用 **512 保守界**（无 SlotHashes 账户时）；与 sysvar 实际长度偶发偏差时，可能短暂「draw 已失败但 refund 尚早」——多等数槽即可。
2. 获胜公式即现行唯一规范：`keccak(h ‖ orderId/raffle_id)` 再取模（无链上历史部署；不以「旧公式」并存）。
3. Solana 全量 late e2e 本轮未绿跑；建议下次 localnet 长跑验证。
4. 暂停中的 ERC-20 仍依赖 transfer revert；无独立 pause 探测。
