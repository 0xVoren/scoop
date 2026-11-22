# GitHub Survey: Scoop-like On-Chain Share Raffles

[中文](github-similar-raffles.zh.md)

**Date:** 2026-11-20  
**Scope:** Public GitHub repos (EVM + Solana); compare to Scoop: escrowed prize, fixed shares until sold out, delay N blocks/slots, `blockhash`/`SlotHashes` draw, winner 100% prize, creator claim with 1% protocol fee, expire refund/recover, no external VRF.  
**Method:** `search_repositories` / `search_code` / reading repo READMEs and core contract sources. Keywords covered: share raffle, 一元夺宝, on-chain raffle, lottery escrow, fairdraw, NFT raffle factory, blockhash raffle, pending draw, Solana raffle / Anchor.

---

## Executive summary

- **Closest product shape:** `yushuohuanxiu/OneChance` (Ethereum “一元夺宝”: fixed Chance shares, draw after sell-out). Randomness is commit–reveal, not blockhash; prizes are fulfilled off-chain by the organizer, not escrowed on-chain.
- **Closest tech stack (Solana):** `draffle-io/draffle` (and derivative `reecen96/Riff-Raffle-Solana-NFT`) — PDA escrow for prize/ticket proceeds, `RecentBlockhashes` draw, end time + **TIME_BUFFER**, anyone can `reveal_winners`, claim expands entropy to pick winners, creator `collect_proceeds` can take protocol fee BPS. Highly isomorphic to Scoop’s “sold-out trigger + SlotHashes”, but the trigger is **time expiry**, not sell-out.
- **Most open-source EVM raffles are NFT tickets + Chainlink VRF / educational audit targets**; production-grade open source that is truly “share-raffle + on-chain native/token escrow + no VRF” is rare. Scoop’s Diamond + no VRF + permissionless keeper combo is nearly unique among public repos.
- **Must-face side evidence:** Galxe contract source explicitly documents “relayer test-and-abort on `prevrandao`”-style MEV; Cyfrin Puppy Raffle systematically exposes weak RNG / DoS / refund pitfalls. These are more valuable engineering inputs for Scoop than “find another identical share raffle”.

---

## Comparison table (Scoop vs candidates)

| Dimension | Scoop | Most open-source raffles | Closest |
|------|-------|-----------------|----------|
| Sale unit | Fixed shares until sold out | Time-window tickets / variable entrant count | OneChance (shares); dRaffle (tickets, time window) |
| Prize | On-chain native/ERC20/SPL escrow | Mostly NFT / ERC1155 | dRaffle / waffle / aavegotchi |
| Draw trigger | Sell-out + delay | Time end + (optional) buffer | dRaffle (time + buffer) |
| Randomness | blockhash / SlotHashes (product choice) | Mostly Chainlink VRF | dRaffle (RecentBlockhashes); OneChance (commit–reveal) |
| Fees | 1% of creator proceeds on claim | Ticket cut / LINK cost / 0 | dRaffle (BPS, often off in prod) |
| Architecture | Diamond / PDA + PendingDraws | Factory / single contract / AppStorage | aavegotchi AppStorage; waffle Factory |
| Ops | pendingDraw keeper + FE trigger | Manual reveal / Chainlink Automation | Scoop already ahead of most open source |

---

## Selected repos (8)

### 1. [yushuohuanxiu/OneChance](https://github.com/yushuohuanxiu/OneChance)

- **One-liner:** 2016 Ethereum “一元夺宝” implementation: organizer posts prizes, users buy Chance with campaign coin, draw after sell-out.
- **Chain:** Ethereum (Solidity ^0.4).
- **Randomness:** Submit `sha3(seed)` when buying; reveal plaintext after sell-out; `sum(seeds) % amt + 1`. Docs mention Randao was considered; also note the **last user refusing to reveal** can manipulate outcomes.
- **Fee model:** Off-chain RMB↔campaign coin 1:1 mint; no on-chain protocol cut; prizes fulfilled off-chain.
- **Architecture:** Three contracts — `OneChanceCoin` + `OneChance` + `AddressCompress` (address→uid compression against storage blowup from storing buyer address per share).
- **Activity:** ★107 / fork 35; last push ~2020-05; high teaching/history value, not production-maintained.
- **vs Scoop:** Closest product semantics (fixed-share raffle); escrow and randomness models differ.

### 2. [draffle-io/draffle](https://github.com/draffle-io/draffle)

- **One-liner:** Solana decentralized raffle: arbitrary SPL/NFT prizes, ticket price, multi-prize; Ignition hackathon output with mainnet deploys.
- **Chain:** Solana (Anchor).
- **Randomness:** `reveal_winners` reads **`RecentBlockhashes` sysvar** into `raffle.randomness`; `claim_prize` expands entropy with keccak → `% entrants.total`. After end time must wait another **`TIME_BUFFER = 20` seconds**.
- **Fee model:** `PROTOCOL_FEE_BPS` (10 bps non-prod, often 0 in prod); `collect_proceeds` takes fee from ticket proceeds to treasury.
- **Architecture:** PDAs: `raffle` / `proceeds` / `prize{i}`; separate `Entrants` account stores buyer pubkey array (default max 5000); CLI + React app.
- **Activity:** ★83 / fork 77; default branch stalled ~2022-12; README requires prod use of `v1` branch.
- **vs Scoop:** Most worth reading on Solana side; differs in “time end vs sell-out”, no PendingDraws queue, RecentBlockhashes vs SlotHashes.

### 3. [reecen96/Riff-Raffle-Solana-NFT](https://github.com/reecen96/Riff-Raffle-Solana-NFT)

- **One-liner:** Deployable ops playbook + frontend whitelist filtering based on dRaffle ideas; tickets can be SOL/SPL.
- **Chain:** Solana.
- **Randomness / fees / architecture:** Same family as dRaffle (reveal + buffer + collect-proceeds).
- **Activity:** ★24; stalled ~2022.
- **vs Scoop:** Copy the **ops playbook** (deployer/operator key split, ATA receive, admin_panel trigger reveal, frontend whitelist display strategy) — not the business rules.

### 4. [Anish-Agnihotri/MultiRaffle](https://github.com/Anish-Agnihotri/MultiRaffle)

- **One-liner:** Paradigm-related reference: refundable tickets + Chainlink VRF + **Fisher–Yates** multi-winner shuffle; batched `clearRaffle` to amortize gas.
- **Chain:** Ethereum (Solidity).
- **Randomness:** Chainlink VRF entropy drives shuffle.
- **Fee model:** Ticket mint cost; losers refunded; no Scoop-style 1% claim fee.
- **Architecture:** Single-contract reference; unaudited by self-declaration.
- **Activity:** ★270 / topics complete; code push ~2022-07, stars still growing (reference heat).
- **vs Scoop:** Copy “**batched settlement / social gas amortization**” and “losers can refund”; not a share raffle.

### 5. [Anish-Agnihotri/waffle](https://github.com/Anish-Agnihotri/waffle)

- **One-liner:** NFT fixed-slot raffle: enter/exit before fill; Factory deploys child contracts and pre-funds LINK.
- **Chain:** Ethereum.
- **Randomness:** Chainlink VRF.
- **Fee model:** Slot pricing; VRF LINK pre-funded by creator; raffles deletable (before winner selection).
- **Architecture:** `WaffleFactory` → child `Waffle`; self-noted limit: too many slots may OOG on delete’s batch transfers.
- **Activity:** ★49; stalled ~2021-07.
- **vs Scoop:** Factory + pre-fund randomness cost; Scoop has no VRF so no LINK pressure, but “front-load create cost” can migrate to keeper incentives.

### 6. [aavegotchi/raffle](https://github.com/aavegotchi/raffle)

- **One-liner:** Production Aavegotchi raffle: ERC1155 tickets enter, Chainlink VRF, on-chain verify winning ranges then claim.
- **Chain:** Ethereum / Polygon (docs include Diamond addresses).
- **Randomness:** Chainlink VRF; `drawRandomNumber` anyone can call (contract needs LINK); owner can retry while pending.
- **Fee model:** VRF LINK cost; no uniform protocol 1%.
- **Architecture:** **AppStorage**-style single-contract state; ticket ranges (rangeStart/End); claim re-derives winning ticket on-chain. Mainnet deploy addresses exist.
- **Activity:** ★13; pushes through ~2023-12; real usage history.
- **vs Scoop:** Copy “**re-verify winner at claim, prevent forgery**”, “VRF pending / retry”, “AppStorage naming to avoid collisions”; different randomness route.

### 7. [Galxe/galxe-raffle](https://github.com/Galxe/galxe-raffle)

- **One-liner:** Quest-style raffle: signature admit → `commitRandomness` → SP1 ZK proof reveal → merkle winner root.
- **Chain:** EVM (Gravity etc.; Foundry).
- **Randomness:** `block.prevrandao` (Gravity docs call it DKG+WVUF); **contract comments openly admit**: signatures only authorize the quest; a relayer can **test-and-abort** and retry on another block.
- **Fee model:** Platform quest system, not ticket escrow.
- **Architecture:** `Raffle.sol` + SP1 verifier + prover-service + Go off-chain lib; EIP-712 signatures.
- **Activity:** ★5; still pushing 2024–2026 (relatively new).
- **vs Scoop:** **Do not copy the product**, but treat the “MEV / late-submit manipulation” comments as threat-model teaching — Scoop’s permissionless `draw` similarly has a “who submits in which slot” contention surface.

### 8. [Cyfrin/4-puppy-raffle-audit](https://github.com/Cyfrin/4-puppy-raffle-audit)

- **One-liner:** Intentionally vulnerable teaching raffle: weak on-chain hash RNG, refund holes, fee extraction coupled to active players, etc.
- **Chain:** Ethereum (Foundry, solc 0.7.6).
- **Randomness:** `keccak(msg.sender, timestamp, difficulty)` — biasable by miner/caller.
- **Fee model:** 80% winner / 20% feeAddress.
- **Architecture:** Single contract + NFT mint; ★110 / fork 133, audit-training staple.
- **vs Scoop:** Treat as a **negative checklist**: weak RNG, DoS-style enter (repeated scans), refund zeroing holes, `selectWinner` vs payment ordering, inconsistent fee accounting.

### Mentions not in the main table

| Repo | Why not in main table |
|------|----------------|
| `pooltogether/v4-core` etc. | No-loss savings lottery; opposite product philosophy (principal refundable) |
| `verumlotus/No-Loss-ERC721-Raffle` | Interest to creator; VRF; small |
| `comfortablesk/solana-switchboard-vrf-lottery` | Switchboard VRF reference sample; ★0, tiny |
| `phanlancer/RafflePanda-contract` | Early lottery-dapp; thin docs |
| `microgift/my-web3-projects` | Grab-bag including raffle; not a standalone protocol |

---

## Borrow list (concrete “what we can copy”)

### Implementation patterns

1. **dRaffle `TIME_BUFFER`:** Scoop already has `drawDelayBlocks/slots`; confirm dual-chain delay semantics match and document “why N” — their 20s buffer digests blockhash freshness.
2. **dRaffle entropy expansion:** `keccak(randomness || prize_index)` then mod — avoids reuse bias when multi-prize/multi-raffle; Scoop can reuse if extending to multi-winner.
3. **MultiRaffle batched `clearRaffle`:** If share cap rises or shuffle is needed, use “anyone can advance; progress in storage” to avoid single-tx OOG; same family as Scoop’s `drawMany` / late `DrawEntropyExpired`→refund.
4. **OneChance `AddressCompress`:** If EVM `shareOwner` arrays get heavy, consider uid compression or compact share-board bitmaps — Scoop Solana `share_board` is already the PDA answer to that.
5. **waffle Factory pre-fund cost:** Without VRF, switch to “lock a small keeper tip at create” or off-chain incentives to reduce “sold out but nobody draws”.
6. **aavegotchi claim re-verify:** At prize claim, recompute from stored randomness rather than trusting a frontend-passed winner — Scoop already hard-writes winner on-chain; keep “claim only checks stored state”; do not introduce forgeable off-chain win proofs unless a ZK path exists.

### Indexing & UX

7. **Riff / dRaffle frontend whitelist:** Public list shows curated raffles only; protocol stays permissionless — good for anti-spam.
8. **Event-driven indexing:** OneChance / aavegotchi heavily rely on events (`NotifySubmitPlaintext`, `RaffleTicketsEntered`); Scoop should ensure create/buy/soldOut/draw/claim/refund event fields are rich enough for Subgraph/The Graph / Solana Geyser/Carbon indexing — avoid “scan storage only”.
9. **admin_panel one-click reveal:** Align with Scoop FE “when ready POST keeper `/trigger` + user can still manual draw”.

### Security & testing

10. **Cyfrin audit checklist → Scoop regression cases:** repeat buys, refund placeholders, fee accounting, document weak RNG, reentrancy/malicious receiver stuck claims.
11. **Galxe comment on test-and-abort:** Write an explicit Scoop threat model: can callers bias winners by picking slot/block? Is delay N + fixed `eligible` hash enough? Public FAQ.
12. **OneChance last-user seed refusal:** Explain commit–reveal failure modes — supports Scoop’s product choice of “no interactive randomness; use on-chain entropy”.

### Ops (keeper)

13. **Permissionless draw + dedicated keeper:** Scoop already has this; industry gap — most open source relies on manual reveal or Chainlink Automation. Keep Cron + HTTP trigger dual path, and monitor “SoldOut timed out without draw”.
14. **dRaffle LINK/treasury separation:** Protocol fee receive account vs ops keys (Riff deployer vs operator) — align with Scoop `feeRecipient` vs keeper key separation.

---

## Things we may not have considered

### Attack surface & randomness disputes

- **Permissionless draw MEV:** Who draws first has limited manipulation when the fixed `eligible` hash is used; but if implemented as “use *current* blockhash / latest SlotHash” instead of anchoring `soldOut+N`, it is the same class as Galxe abort-retry. Audit both chains for **anchoring the same absolute height/slot**.
- **Late draw:** Both chains anchor `soldOut+N`; window roll-out (EVM ~256 / Solana SlotHashes ~512) → `DrawEntropyExpired` → `refund`/`recover` (SoldOut→Expired); forbid switching to a newer hash to avoid stuck SoldOut.
- **Share dilution / Sybil:** Fixed-price shares, no KYC; whales can sweep. Product layer may add per-address caps (MultiRaffle has per-address max) — Scoop needs a product decision if fairness perception matters.
- **Malicious tokens:** fee-on-transfer, rebasing, pause, blacklist, ERC777 hooks, Solana token-2022 transfer fee / freeze — escrow and claim balance reconciliation fails. Whitelist mints or `balanceBefore/After` accounting.
- **Receiver contract rejects ETH/BNB:** In Cyfrin, winner.call failure reverts the whole tx; Scoop claim/prize paths need pull pattern or failure handling that does not lock funds.
- **Malicious creators:** Prize is a worthless meme coin; frontend needs risk warnings and asset metadata checks (not solvable by contracts alone).

### Compliance / ops

- **Gambling / prize-sale classification:** Even in OneChance’s era, off-chain fiat conversion; many jurisdictions may treat share raffles as gambling. Geo-fencing, ToS, non-custodial wording need legal — not “code is decentralized, done”.
- **Escrowed assets vs custody duties:** Contract escrow ≠ exemption from disclosure duties; expire-refund UX must be extremely obvious.
- **Protocol fee tax & entity:** Whether a 1% `feeRecipient` sits behind an operating entity.

### Indexing / cross-chain / other

- **Dual-chain IDs & deep links:** Unified explorer for BSC + Solana raffles? Bridging “same raffle” has no current need — bridges introduce message delay and wrong draw timing.
- **Entrants account size:** dRaffle max 5000 pubkeys; Scoop `MAX_SHARES = 10_000` already hits similar storage/compute edges.
- **No-VRF public opinion:** Community defaults “fair = Chainlink/Switchboard”. Need a public, reproducible draw formula and a one-pager “why no VRF”, or every dispute restarts from zero.
- **Keeper centralization optics:** Anyone can draw, but if only the official keeper runs, delayed draws get questioned. Consider small tips to incentivize third parties.

---

## Top-priority recommendations (3)

1. **Single current draw spec:** Anchor `soldOut+N` hash + keccak expansion; late cannot draw → `DrawEntropyExpired` → refund (see `PROTOCOL.md` / `hardening-from-research.md`). Forbid drifting to “latest hash at submit time”.
2. **Malicious assets & reconciliation (landed):** ERC-20/SPL balance-delta accounting; FoT under-delivery reverts; Token-2022 rejected; docs list unsupported classes.
3. **dRaffle paired reading (landed):** Entropy expansion, `close_share_board` / `close_buyer_record`, PendingDraws dequeue on entropy expiry, keeper skips expired draws.

---

## Search notes

- On-chain open source for “一元夺宝” is scarce; many results are company-party raffle frontends, Bilibili/JD scripts, traditional lottery predictors — filtered out.
- `fairdraw` / `pending draw keeper` code search barely hits independent protocols; the keeper pattern is Scoop’s differentiation vs the open-source community.
- No Scoop business code changed; this file is the research deliverable.
