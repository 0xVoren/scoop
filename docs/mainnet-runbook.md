# Scoop Mainnet Runbook

**Status:** preparation only — **do not deploy mainnet until the operator explicitly orders it**  
**Rule source:** [`PROTOCOL.md`](PROTOCOL.md) · [`invariants-evm-solana.md`](invariants-evm-solana.md)  
**Practice reference (testnet / devnet):** [`testnet-contracts-deploy.md`](testnet-contracts-deploy.md) · [`solana-testnet-deploy.md`](solana-testnet-deploy.md) · [`testnet-full-e2e.md`](testnet-full-e2e.md)  
**Companion:** [`security-checklist-mainnet.md`](security-checklist-mainnet.md) · [`mainnet-canary.md`](mainnet-canary.md) · [`asset-policy.md`](asset-policy.md)

**Secrets:** private keys, mnemonics, and upgrade keypaths stay in local env / Foundry keystore / Solana CLI / 1Password. Never paste into this file, chat, or Agent Store.

---

## 0. Roles (assign before go-live)

| Role | BSC (EVM) | Solana | Notes |
|---|---|---|---|
| Deployer | Hot or one-shot EOA for CREATE | Key that pays rent + deploy | Can be retired after cut |
| Owner / Config authority | Diamond `owner()` | Config PDA `authority` | Multisig preferred |
| Upgrade authority | Same as Diamond owner via `diamondCut` | BPF upgrade authority | Prefer cold / multisig; **≠** keeper |
| Fee sink | `feeRecipient` | Config `fee_recipient` | Must receive native + fungible |
| Keeper operator | `KEEPER_PRIVATE_KEY` | `SOLANA_KEEPER_KEYPAIR` | Draw-only; funded for gas |

Testnet practice values (not mainnet):

| | BSC Chapel (97) | Solana devnet |
|---|---|---|
| Diamond / Program | `0xfB2678ff49967B073F6537781EC3d35DE731a5DF` | `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT` |
| Owner / feeRecipient / authority | `0x1517821457C17b8e8019DA3C2cAFb5424855480b` | Upgrade authority `KKjheWGV6VH12Jy8KTjyY4yeHHJAeyGYfkyKrkzD8bH`; Config `ESGy3QxNvChDiBj2qkpgobn6dMTUHGA9dpoSxWRkfK7E` |

---

## 1. Pre-flight

1. Complete [`security-checklist-mainnet.md`](security-checklist-mainnet.md) §8 gate.  
2. Freeze release commit SHA; record in canary log when execution starts.  
3. Confirm RPCs (private preferred for deploy): BSC mainnet + Solana mainnet-beta.  
4. Fund deployer / authority with native for deploy + buffer (testnet used ~0.001 tBNB deploy gas; Solana program rent was ~2.5+ SOL on devnet — re-estimate on release binary).  
5. Decide mainnet `feeRecipient` / `fee_recipient` (EOA or receivable contract). Prefer multi-asset sink before any ownership renounce.  
6. Decide launch `ProtocolConfig` (defaults below).  
7. Frontend env prepared but **not** pointed at mainnet until canary § go.

### Launch ProtocolConfig (both chains)

| Field | Launch default | Bounds |
|---|---|---|
| `allowDifferentTokens` | `false` | — |
| `allowCustomShares` | `false` | — |
| `allowCustomPrice` | `false` | — |
| `allowCustomDrawDelay` | `false` | — |
| `defaultShares` | `11` | `[2, 10_000]` |
| `priceDivisor` | `10` (`price = prize / 10`) | > 0 |
| `defaultDrawDelayBlocks` / `default_draw_delay_slots` | `5` | `[1, 128]` |
| Fee | `raised / 100` on proceeds claim only | Fixed in code |

---

## 2. BSC mainnet — deploy steps

Mirror testnet script shape (`scripts/deploy-bsc-testnet.sh` / `contracts/script/DeployScoopDiamond.s.sol`).

```bash
cd /Users/zhangxiaotong/Code/active/scoop
export PRIVATE_KEY=0x...          # deployer — local only
export FEE_RECIPIENT=0x...        # mainnet fee sink (defaults to deployer if unset)
export BSC_MAINNET_RPC_URL=...    # private RPC recommended

cd contracts
forge script script/DeployScoopDiamond.s.sol \
  --rpc-url "$BSC_MAINNET_RPC_URL" \
  --broadcast -vv
```

Post-deploy verification (record addresses in a private ops note; public doc may list Diamond only after go-live):

1. `owner()` == intended owner (or transfer immediately to multisig).  
2. `feeRecipient()` == intended sink.  
3. `protocolConfig()` matches launch defaults.  
4. `codesize(Diamond) > 0`; facets cut as in broadcast JSON.  
5. Optional smoke: tiny BNB raffle create → buy → wait N → draw → claim (or defer to [`mainnet-canary.md`](mainnet-canary.md)).

### Upgrade authority (EVM)

- Authority = Diamond `owner` via `IDiamondCut.diamondCut`.  
- Mainnet upgrades: prepare facet bytecode → selector diff → storage layout check → multisig-signed cut → verify on BscScan.  
- Emergency: replace vulnerable facet selectors; do **not** change entropy/fee semantics without a new audit pass.

### feeRecipient rotation (EVM)

```text
OwnershipFacet.setFeeRecipient(newSink)  // owner only; rejects address(0)
```

Sink must accept BNB and ERC-20 transfers. For future dividends, deploy a splitter first, then point `feeRecipient` at it ([`PROTOCOL.md`](PROTOCOL.md)).

### Ownership transfer

```text
transferOwnership(multisig)  // after feeRecipient + config confirmed
```

---

## 3. Solana mainnet — deploy steps

Mirror `scripts/deploy-solana-devnet.sh` / [`solana-testnet-deploy.md`](solana-testnet-deploy.md); retarget cluster to **mainnet-beta**.

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
# Prefer Solana/Agave CLI 2.1.x if 3.x RPC quirks appear (seen on public devnet)
export SOLANA_AUTHORITY_KEYPAIR=~/.config/solana/id.json   # or dedicated deploy key
export SOLANA_RPC_URL=https://api.mainnet-beta.solana.com  # or private

# Build release .so (programs/), ensure declare_id! matches deploy keypair
anchor build   # or cargo build-sbf per repo practice
solana program deploy target/deploy/scoop.so \
  --url "$SOLANA_RPC_URL" \
  --keypair "$SOLANA_AUTHORITY_KEYPAIR"

# Initialize Config + PendingDraws (once)
# fee_recipient + ProtocolConfig via initialize ix — see scripts/initialize-solana.ts
```

Post-deploy verification:

1. Program ID matches FE `NEXT_PUBLIC_SOLANA_PROGRAM_ID`.  
2. Upgrade authority = intended cold key / multisig.  
3. Config PDA: `authority`, `fee_recipient`, `next_raffle_id == 1`, launch `protocol_config`.  
4. Smoke or canary: create → buy → draw → claim (native SOL first).

### Upgrade authority (Solana)

- BPF upgradeable loader authority controls `.so` replacement.  
- Config `authority` is **separate** (fee + protocol config). Prefer both cold; they may be the same multisig.  
- Transfer upgrade authority only after initialize + canary; document ceremony.

### fee_recipient rotation (Solana)

```text
set_fee_recipient(new_pubkey)  // Config authority; rejects Pubkey::default()
```

For SPL fees, ensure recipient ATA exists (or ix creates it per current program rules) before claiming proceeds in that mint.

---

## 4. Web / Keeper cutover

```bash
# web/.env.local (mainnet — enable only when canary starts)
NEXT_PUBLIC_CHAIN=mainnet
NEXT_PUBLIC_SCOOP_DIAMOND=0x...
NEXT_PUBLIC_SCOOP_DEPLOY_BLOCK=...
NEXT_PUBLIC_BSC_RPC=...

NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta
NEXT_PUBLIC_SOLANA_PROGRAM_ID=...
# optional: NEXT_PUBLIC_KEEPER_URL=https://...
```

Keeper (`keeper/README.md`):

| | EVM | Solana |
|---|---|---|
| `KEEPER_CHAIN` | `evm` | `solana` |
| Address | `DIAMOND_ADDRESS` | `SOLANA_PROGRAM_ID` |
| `CHAIN` / RPC | `mainnet` + `RPC_URL` | `SOLANA_RPC_URL` mainnet |
| Key | `KEEPER_PRIVATE_KEY` | `SOLANA_KEEPER_KEYPAIR` |

Keeper **skips** entropy-expired Solana pending ids; users refund themselves.

---

## 5. Parameter change playbooks

| Change | Who | How | Risk |
|---|---|---|---|
| Unlock custom shares / price / delay / different tokens | Owner / Config authority | `setProtocolConfig` / `set_protocol_config` | UX + accounting edge cases; stay within bounds |
| Fee sink | Owner / authority | `setFeeRecipient` / `set_fee_recipient` | Mis-set sink may brick fee delivery |
| Facet logic | Diamond owner | `diamondCut` | Highest risk — treat as release |
| Program logic | Upgrade authority | `solana program deploy` (upgrade) | Highest risk — treat as release |
| Fee rate 1% | — | **Code change** (not a runtime param) | Requires upgrade + audit |

---

## 6. Emergency procedures

### 6.1 Suspected entropy / draw bug

1. Stop advertising create; optionally take FE offline.  
2. Pause keeper ticks (disable cron / Workers).  
3. Do **not** “fix” by drawing with alternate hashes — protocol forbids it.  
4. If eligible hashes still in window: users may still permissionlessly draw correctly.  
5. If window expired: instruct `refund` / `recoverPrize` (EVM) or `refund` / `recover_prize` (Solana).  
6. Prepare audited upgrade; follow §2 / §3 upgrade path.

### 6.2 Malicious or bricking token

1. On-chain already rejects FoT under-delivery and Token-2022 (see [`asset-policy.md`](asset-policy.md)).  
2. For pausable tokens that revert mid-flow: communicate unsupported; no admin rescue of foreign escrow beyond existing recover/refund rules.  
3. FE: block known-bad mints via copy + client checks when available.

### 6.3 Compromised owner / upgrade authority

1. If still able: transfer ownership / upgrade authority to clean multisig immediately.  
2. If cut already malicious: public incident; warn users; FE kill-switch; evaluate remaining escrow — may be unrecoverable without honest upgrade path.  
3. Rotate feeRecipient if sink key compromised (fees only; escrow unaffected).

### 6.4 Compromised keeper

1. Rotate keeper key in Workers secrets; fund new key.  
2. No protocol state change required (draw is permissionless).  
3. Revoke old key funding.

### 6.5 Pending queue full (Solana)

1. Symptom: sell-out enqueue fails near capacity.  
2. Short-term: prioritize draws to free slots; avoid mass simultaneous sell-outs.  
3. Medium-term: ship `resize_pending` / higher capacity (tracked residual).

### 6.6 Communications

- State facts: Diamond / Program IDs, affected raffle ids, whether funds are refundable.  
- Point users to explorer + in-app refund/recover.  
- Do not promise admin clawback that does not exist.

---

## 7. Dual-chain go-live order (recommended)

1. BSC mainnet Diamond deploy + verify.  
2. Solana mainnet program deploy + initialize + verify.  
3. Point staging FE at both; run [`mainnet-canary.md`](mainnet-canary.md) small-funds paths **only when ordered**.  
4. Enable public FE + keeper.  
5. After stability, consider unlocking ProtocolConfig flags gradually.

---

## Related scripts

- BSC testnet practice: `scripts/deploy-bsc-testnet.sh` · `scripts/smoke-bsc-testnet.sh` · `scripts/e2e-bsc-testnet.sh`  
- Solana practice: `scripts/deploy-solana-devnet.sh` · `scripts/e2e-solana-devnet.sh` · `scripts/e2e-solana-testnet-full.sh` · `scripts/initialize-solana.ts`  
- Local gates: `scripts/e2e-local.sh` · `scripts/e2e-solana-local.sh`
