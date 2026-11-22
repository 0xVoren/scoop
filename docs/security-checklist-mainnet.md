# Scoop Mainnet Security Checklist

**Status:** pre-mainnet self-audit (docs only; no mainnet deploy in this pass)  
**Rule source:** [`PROTOCOL.md`](PROTOCOL.md) · [`invariants-evm-solana.md`](invariants-evm-solana.md) · [`hardening-from-research.md`](hardening-from-research.md) · [`full-review-e2e.md`](full-review-e2e.md)  
**Testnet reference:** [`testnet-contracts-deploy.md`](testnet-contracts-deploy.md) (BSC Chapel Diamond + Solana devnet program)

---

## 1. Threat model (summary)

| Actor | Goals | Primary surfaces |
|---|---|---|
| Buyer / creator (honest) | Escrow prize, buy shares, draw, claim, refund | Create / buy / draw / claim / refund / recover |
| Permissionless caller | Front-run draw, abort-retry for friendlier entropy, grief pending queue | `draw` / `drawMany` / `draw_many`, pending enqueue |
| Malicious asset issuer | FoT / tax / rebase / pause / Token-2022 extensions to skim vault or brick claims | ERC-20 / SPL mint as prize or payment |
| Compromised owner / upgrade authority | Steal fees, cut malicious facets, change fee sink, brick config | Diamond `diamondCut`, Solana program upgrade, `setFeeRecipient`, `setProtocolConfig` |
| Compromised keeper key | Spam draw txs, drain gas/lamports (cannot rewrite entropy) | Keeper tick / `/trigger` |
| MEV searcher | Bundle draw with buy; observe entropy early | Public mempool / BSC builders / Solana leaders |

**In-scope assets at risk:** escrowed prize + raised payment in Diamond / raffle PDAs; protocol 1% fee to `feeRecipient`; Solana rent on share/buyer accounts.

**Out of scope for this checklist:** frontend phishing, RPC lying to UI only, off-chain marketing claims, future locker/dividend module (not implemented — see PROTOCOL fee sink reservation).

---

## 2. Anchored randomness

| Check | EVM | Solana | Pass criteria |
|---|---|---|---|
| Eligible fixed at sell-out | `eligible = soldOutBlock + drawDelayBlocks` | `eligible = sold_out_slot + draw_delay_slots` | Recorded on-chain at SoldOut |
| Entropy source only eligible | `blockhash(eligible)` only | SlotHashes entry `slot == eligible` only | No “use latest head” fallback |
| Too early | `block.number > eligible` required | `Clock.slot > eligible` required | Pre-window draw reverts |
| Winner expansion | `keccak256(abi.encodePacked(h, orderId)) % totalShares` | `u64::from_le_bytes(keccak(h \|\| raffle_id_le)[0..8]) % total_shares` | Matches PROTOCOL; unit + e2e assert |
| Delay bounds | `drawDelayBlocks ∈ [1,128]` | `draw_delay_slots ∈ [1,128]` | Create rejects OOB |
| Permissionless draw | Anyone `draw` / `drawMany` | Anyone `draw` / `draw_many` | Non-participant can draw |
| No external VRF | — | — | No Chainlink / Switchboard / oracle entropy |

**Self-audit evidence to attach before mainnet:** `Draw.t.sol` anchored cases; Solana `randomness` unit tests; local e2e late-entropy paths; testnet full E2E report [`testnet-full-e2e.md`](testnet-full-e2e.md).

---

## 3. Late entropy → refund (not draw)

| Check | EVM | Solana | Pass criteria |
|---|---|---|---|
| Aged-out entropy | `blockhash(eligible)==0` → `DrawEntropyExpired` | Missing SlotHashes entry / past window → `DrawEntropyExpired` | Draw cannot succeed after roll-out |
| State path | SoldOut → Expired via `refund` / `recoverPrize` | Same via `refund` / `recover_prize` (+ pending dequeue) | Drawn never refundable |
| Window length | ~256 blocks | Refund gate often `eligible + 512` slots | Document UX: brief “draw failed but refund not yet” on Solana is known |
| Keeper behavior | Must not force draw on expired | Tick **skips** expired pending; does not retry forever | Keeper README alignment |
| Fee on refund / recover | None | None | `feeRecipient` balance unchanged |

**Known residual (non-blocking for checklist, track for audit):** Solana refund without SlotHashes may lag draw-fail by a few slots ([`full-review-e2e.md`](full-review-e2e.md) M4).

---

## 4. Assets & accounting

| Check | EVM | Solana | Pass criteria |
|---|---|---|---|
| Supported | BNB (`address(0)`), standard ERC-20 | SOL (`Pubkey::default()`), classic SPL Token Program | Documented in PROTOCOL + [`asset-policy.md`](asset-policy.md) |
| FoT / under-delivery | `LibAsset.pull` balance-diff → `TransferAmountMismatch` | `pull_spl_checked` balance-diff → `TransferAmountMismatch` | Unit / e2e with FoT mock |
| Token-2022 | N/A (ERC-20) | Reject `UnsupportedTokenProgram` | Create/buy with Token-2022 fails |
| Rebase / pause | Under-delivery or transfer revert | Same | Documented unsupported; no whitelist yet |
| Prize ≠ payment | Gated by `allowDifferentTokens` | Same flag | Launch default locked same-token |
| Native vs wrapped | BNB path separate from ERC-20 | Native SOL ≠ wSOL mint (no auto wrap) | UI maps “SOL” → native path |
| Claim push | Prize 100% to winner; proceeds net of 1% | Same | F2–F4 invariants |

---

## 5. Permissions & admin surface

| Role | Powers | Mainnet requirement |
|---|---|---|
| EVM Diamond owner | `diamondCut`, `transferOwnership`, `setFeeRecipient`, `setProtocolConfig` | Multisig (or equivalent); documented signers; no single hot EOA long-term |
| Solana upgrade authority | `solana program deploy` / upgrade `.so` | Separate cold / multisig; not the keeper key |
| Solana Config `authority` | `set_fee_recipient`, `set_protocol_config` | Same policy as EVM owner; may differ from upgrade authority by design |
| `feeRecipient` | Receives 1% on `claimProceeds` / `claim_proceeds` only | Must accept BNB+ERC-20 and SOL+SPL; prefer multi-asset capable address before renounce |
| Keeper key | Submit draw txs only | Funded operator wallet; **≠** feeRecipient; no admin ix |

**Checklist:**

- [ ] Owner / authority ≠ keeper keypair  
- [ ] `setFeeRecipient(0)` / default pubkey rejected on both chains  
- [ ] `setProtocolConfig` enforces `defaultShares ∈ [MIN_SHARES, MAX_SHARES]` and delay bounds  
- [ ] Document who can rotate fee sink and how (see [`mainnet-runbook.md`](mainnet-runbook.md))  
- [ ] No hidden pause that freezes user refunds (protocol has no global pause today — confirm remains true)

---

## 6. Upgrades

| Chain | Mechanism | Pre-mainnet checks |
|---|---|---|
| EVM | EIP-2535 `diamondCut` (add/replace/remove facets) | Cut script reviewed; selector clash scan; storage layout frozen at `LibAppStorage` slot; init calldata audited |
| Solana | BPF upgradeable loader + upgrade authority | Program ID / keypair alignment; IDL version pinned in FE; Config PDA seeds unchanged |

**Do not** ship a mainnet cut that changes entropy formula or fee denominator without a new security pass — current product has no legacy formula compatibility burden (no prior mainnet).

---

## 7. MEV & griefing

| Risk | Mitigation in design | Residual |
|---|---|---|
| Abort-retry draw for better head hash | Entropy fixed to `eligible` | Searchers can still race *who* calls draw (no economic effect on winner) |
| Buy last share + immediate draw in same block/slot | Delay `N ≥ 1` required | Small N reduces wait but does not restore head-hash MEV |
| Grief pending queue | Capacity limits (Solana PendingDraws hard cap historically 64) | Concurrent sell-outs beyond cap fail enqueue — track before scale |
| Keeper grief | Anyone else can draw | Ops cost only |
| Fee skim via malicious ERC-20 hooks on push | Prefer simple feeRecipient; avoid exotic callbacks in sink | Future splitter must be reviewed |

---

## 8. Pre-mainnet self-audit gate (internal)

Mark each before requesting external audit / canary:

- [ ] `forge test` green on release commit  
- [ ] `cargo test -p scoop --lib` green  
- [ ] `bash scripts/e2e-local.sh` green (incl. late entropy → refund)  
- [ ] `bash scripts/e2e-solana-local.sh` green (incl. late + SPL matrix)  
- [ ] Testnet addresses recorded: [`testnet-contracts-deploy.md`](testnet-contracts-deploy.md)  
- [ ] Testnet full E2E: [`testnet-full-e2e.md`](testnet-full-e2e.md)  
- [ ] Asset policy + UI copy keys shipped: [`asset-policy.md`](asset-policy.md)  
- [ ] Runbook + canary plan reviewed: [`mainnet-runbook.md`](mainnet-runbook.md) · [`mainnet-canary.md`](mainnet-canary.md)  
- [ ] Secrets only in local env / keystore / 1Password — never in docs or Agent Store  

---

## 9. Suggested external audit scope

**In scope (both chains):**

1. Anchored entropy correctness and inability to substitute newer hashes  
2. Late-window refund / recover state machine (SoldOut → Expired; Drawn immutable)  
3. Asset pull accounting (FoT, Token-2022 reject, mint/vault binding on Solana)  
4. Fee math (`raised/100`, remainder to creator, zero fee on prize/refund)  
5. Diamond upgrade / Solana upgrade authority abuse scenarios  
6. Pending draw bookkeeping (enqueue/dequeue, `drawMany` all-or-nothing vs Solana skip)  
7. Share index assignment and winner modulo bias (fixed share counts 2–10_000)  
8. Reentrancy / CPI reentrancy on claim and refund paths  

**Out of scope / defer:**

- Frontend / wallet connector security (separate review)  
- Keeper hosting / Cloudflare Workers ops  
- Unimplemented fee splitter / locker dividends  
- Economic design of share pricing  

**Deliverables expected from auditor:** findings severity, PoC or invariant break, remediation checklist mapped to facets / instructions.

---

## Related

- Protocol: [`PROTOCOL.md`](PROTOCOL.md)  
- Deploy ops: [`mainnet-runbook.md`](mainnet-runbook.md)  
- Assets UX: [`asset-policy.md`](asset-policy.md)  
- Canary: [`mainnet-canary.md`](mainnet-canary.md)  
- Testnet Diamond `0xfB2678ff49967B073F6537781EC3d35DE731a5DF` · Solana program `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT` (devnet)
