# Scoop Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Foundry + EIP-2535 Diamond on BSC that lets anyone create share raffles, buy shares, draw via blockhash, and claim (1% fee on creator proceeds only).

**Architecture:** Single Diamond holds all escrow. Each raffle is an `orderId` in AppStorage. Thin facets call `LibRaffle*` libraries. Pending-draw set avoids scanning all raffles. Native BNB = `address(0)`.

**Tech Stack:** Solidity 0.8.33, Foundry, OpenZeppelin IERC20 + SafeERC20, Diamond pattern copied/adapted from `~/Code/active/grid9/contracts`.

**Spec:** `docs/superpowers/specs/2026-11-13-scoop-design.md`

**Out of scope for this plan:** Next.js frontend (separate plan after contracts are green).

## Global Constraints

- Solidity `0.8.33`, optimizer on, `via_ir = true`, `evm_version = "cancun"` (match grid9).
- Package manager for any JS tooling later: **pnpm** only; this plan is contracts-only (`forge`).
- Native asset sentinel: `address(0)`.
- Fee: immutable `fee = raised / 100` on `claimProceeds` only; winner gets full `prizeAmount`.
- User-facing agent chat stays Chinese; commit messages English.
- Copy Diamond base from grid9; do **not** copy BattleRoyale game facets/libs.
- YAGNI: no VRF, no fee-on-transfer support, no per-raffle clones.

---

## File structure (create)

```text
scoop/
  README.md
  docs/superpowers/specs/2026-11-13-scoop-design.md   # already exists
  docs/superpowers/plans/2026-11-13-scoop-contracts.md # this file
  contracts/
    foundry.toml
    remappings.txt          # optional if remappings only in foundry.toml
    src/
      diamond/
        Diamond.sol
        libraries/LibDiamond.sol
        interfaces/IDiamondCut.sol
        interfaces/IDiamondLoupe.sol
        interfaces/IERC165.sol
        interfaces/IERC173.sol
      storage/AppStorage.sol
      libraries/
        LibErrors.sol
        LibConstants.sol
        LibAsset.sol
        LibRaffle.sol
        LibRaffleDraw.sol
        LibRaffleClaim.sol
        LibRaffleViews.sol
      facets/
        Modifiers.sol
        DiamondCutFacet.sol
        DiamondLoupeFacet.sol
        OwnershipFacet.sol
        RaffleCreateFacet.sol
        RaffleBuyFacet.sol
        RaffleDrawFacet.sol
        RaffleClaimFacet.sol
        RaffleViewsFacet.sol
      upgradeInitializers/ScoopDiamondInit.sol
      interfaces/IScoopRaffle.sol
    script/DeployScoopDiamond.s.sol
    script/DeployLocal.s.sol
    test/
      helpers/MockERC20.sol
      helpers/ScoopTestHelper.sol
      Create.t.sol
      Buy.t.sol
      Draw.t.sol
      Claim.t.sol
      Expire.t.sol
      Indexes.t.sol
      AssetMatrix.t.sol
```

---

### Task 1: Scaffold repo + Diamond skeleton

**Files:**
- Create: `README.md`
- Create: `contracts/foundry.toml`
- Create: all `contracts/src/diamond/**` by copying from `~/Code/active/grid9/contracts/src/diamond/**`
- Create: `contracts/src/facets/DiamondCutFacet.sol`, `DiamondLoupeFacet.sol`, `OwnershipFacet.sol` from grid9 (Ownership: keep `owner` transfer; add `feeRecipient` setter in Task 2+)
- Create: `contracts/src/facets/Modifiers.sol` (reentrancy only; no pause unless needed)
- Test: `contracts/test/DiamondSmoke.t.sol`

**Interfaces:**
- Consumes: none
- Produces: deployable Diamond with cut/loupe/ownership selectors registered

- [ ] **Step 1: Init git + Foundry project**

```bash
cd /Users/zhangxiaotong/Code/active/scoop
git init
mkdir -p contracts && cd contracts
forge init --no-commit --force
# remove default src/Counter.sol and test/Counter.t.sol
rm -f src/Counter.sol test/Counter.t.sol script/Counter.s.sol
forge install OpenZeppelin/openzeppelin-contracts --no-commit
```

- [ ] **Step 2: Write `foundry.toml`**

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
remappings = [
    "@openzeppelin/=lib/openzeppelin-contracts/",
]
solc_version = "0.8.33"
optimizer = true
optimizer_runs = 200
via_ir = true
evm_version = "cancun"

[profile.default.fuzz]
runs = 256

[rpc_endpoints]
bsc = "${BSC_MAINNET_RPC_URL}"
bsc_testnet = "${BSC_TESTNET_RPC_URL}"

[fmt]
line_length = 120
tab_width = 4
bracket_spacing = false
```

- [ ] **Step 3: Copy Diamond base from grid9**

```bash
cp -R ~/Code/active/grid9/contracts/src/diamond ~/Code/active/scoop/contracts/src/
cp ~/Code/active/grid9/contracts/src/facets/DiamondCutFacet.sol ~/Code/active/scoop/contracts/src/facets/
cp ~/Code/active/grid9/contracts/src/facets/DiamondLoupeFacet.sol ~/Code/active/scoop/contracts/src/facets/
cp ~/Code/active/grid9/contracts/src/facets/OwnershipFacet.sol ~/Code/active/scoop/contracts/src/facets/
```

Adapt SPDX/`pragma` if needed (keep `^0.8.33`). Strip BattleRoyale-specific comments only; leave Diamond logic intact.

- [ ] **Step 4: Minimal Modifiers (reentrancy)**

Create `contracts/src/facets/Modifiers.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {LibErrors} from "../libraries/LibErrors.sol";

abstract contract Modifiers {
    bytes32 private constant _REENTRANCY_GUARD_SLOT = keccak256("scoop.reentrancy.guard");
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    modifier nonReentrant() {
        bytes32 slot = _REENTRANCY_GUARD_SLOT;
        uint256 status;
        assembly {
            status := sload(slot)
        }
        if (status == _ENTERED) revert LibErrors.ReentrantCall();
        assembly {
            sstore(slot, _ENTERED)
        }
        _;
        assembly {
            sstore(slot, _NOT_ENTERED)
        }
    }
}
```

Create stub `LibErrors.sol` with at least `error ReentrantCall();` (expand in Task 2).

- [ ] **Step 5: Smoke test deploy Diamond + loupe**

Write `contracts/test/DiamondSmoke.t.sol` that deploys `Diamond` + cut facet, cuts loupe + ownership, asserts `facets().length >= 1`. Follow grid9 `DeployLocal.s.sol` cut pattern (read that file while implementing).

- [ ] **Step 6: Run smoke test**

```bash
cd /Users/zhangxiaotong/Code/active/scoop/contracts && forge test --match-contract DiamondSmoke -vv
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/zhangxiaotong/Code/active/scoop
git add README.md contracts docs
git commit -m "$(cat <<'EOF'
chore: scaffold scoop Foundry Diamond skeleton

EOF
)"
```

---

### Task 2: Storage, constants, errors, assets

**Files:**
- Create: `contracts/src/storage/AppStorage.sol`
- Create: `contracts/src/libraries/LibConstants.sol`
- Create: `contracts/src/libraries/LibErrors.sol`
- Create: `contracts/src/libraries/LibAsset.sol`
- Create: `contracts/test/helpers/MockERC20.sol`
- Test: `contracts/test/LibAsset.t.sol`

**Interfaces:**
- Consumes: Diamond skeleton
- Produces: `Raffle` struct, `RaffleStatus`, `LibAppStorage.appStorage()`, `LibAsset.pull` / `push`

- [ ] **Step 1: Write failing asset test**

`MockERC20` = minimal ERC20 with `mint`. Test: pull ERC20 into this contract; push BNB out (use a harness contract that uses `LibAsset`).

```solidity
function test_pullAndPush_erc20() public {
    token.mint(alice, 100 ether);
    vm.prank(alice);
    token.approve(address(harness), 100 ether);
    vm.prank(alice);
    harness.pull(address(token), alice, 100 ether);
    assertEq(token.balanceOf(address(harness)), 100 ether);
    harness.push(address(token), bob, 40 ether);
    assertEq(token.balanceOf(bob), 40 ether);
}

function test_pullAndPush_bnb() public {
    vm.deal(alice, 10 ether);
    vm.prank(alice);
    harness.pull{value: 3 ether}(address(0), alice, 3 ether);
    assertEq(address(harness).balance, 3 ether);
    harness.push(address(0), bob, 1 ether);
    assertEq(bob.balance, 1 ether);
}
```

- [ ] **Step 2: Run — expect FAIL (LibAsset missing)**

```bash
forge test --match-contract LibAssetTest -vv
```

- [ ] **Step 3: Implement storage + LibAsset**

`AppStorage.sol` core types:

```solidity
enum RaffleStatus {
    Selling,  // 0
    SoldOut,  // 1
    Drawn,    // 2
    Expired   // 3
}

struct Raffle {
    address creator;
    address prizeToken;
    address paymentToken;
    uint128 prizeAmount;
    uint128 pricePerShare;
    uint32 totalShares;
    uint32 soldShares;
    uint64 deadline;
    uint32 drawDelayBlocks;
    uint64 soldOutBlock;
    uint64 drawBlock;
    uint32 winnerShareIndex;
    uint32 tokenOrderId;
    uint32 userOrderId;
    RaffleStatus status;
    bool prizeClaimed;
    bool proceedsClaimed;
    bool prizeRecovered;
}

struct AppStorage {
    bool initialized;
    address feeRecipient;
    uint256 nextOrderId; // starts at 1 after init
    mapping(uint256 => Raffle) raffles;
    mapping(uint256 => mapping(uint32 => address)) shareOwner; // orderId => shareIndex => buyer
    mapping(uint256 => mapping(address => uint32)) shareCount; // orderId => buyer => count
    mapping(uint256 => mapping(address => uint256)) buyerPaid; // orderId => buyer => payment amount
    mapping(uint256 => mapping(address => bool)) buyerRefunded;
    mapping(address => uint32) tokenOrderCount; // prizeToken => count
    mapping(address => mapping(uint32 => uint256)) tokenOrderIdToOrderId;
    mapping(address => uint32) userOrderCount; // creator => count
    mapping(address => mapping(uint32 => uint256)) userOrderIdToOrderId;
    // pending draw enumerable set
    uint256[] pendingDrawIds;
    mapping(uint256 => uint256) pendingDrawIndex; // orderId => index+1 (0 = absent)
}

library LibAppStorage {
    bytes32 constant STORAGE_SLOT = keccak256("scoop.app.storage");
    function appStorage() internal pure returns (AppStorage storage s) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            s.slot := slot
        }
    }
}
```

`LibConstants.sol`:

```solidity
library LibConstants {
    uint256 internal constant FEE_DENOMINATOR = 100; // fee = amount / 100
    uint32 internal constant MIN_SHARES = 2;
    uint32 internal constant MIN_DRAW_DELAY_BLOCKS = 1;
    uint32 internal constant MAX_DRAW_DELAY_BLOCKS = 128;
}
```

`LibErrors.sol` (complete set used by later tasks):

```solidity
library LibErrors {
    error ReentrantCall();
    error NotInitialized();
    error AlreadyInitialized();
    error ZeroAddress();
    error InvalidShares();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidDrawDelay();
    error InvalidMsgValue();
    error NotSelling();
    error DeadlinePassed();
    error InsufficientShares();
    error NotSoldOut();
    error AlreadyDrawn();
    error DrawTooEarly();
    error NoBlockhash();
    error NotDrawn();
    error NotWinner();
    error PrizeAlreadyClaimed();
    error ProceedsAlreadyClaimed();
    error NotExpired();
    error NothingToRefund();
    error AlreadyRefunded();
    error NotCreator();
    error PrizeAlreadyRecovered();
    error NotPendingDraw();
}
```

`LibAsset.sol`:

```solidity
library LibAsset {
    using SafeERC20 for IERC20;

    function pull(address token, address from, uint256 amount) internal {
        if (amount == 0) revert LibErrors.InvalidAmount();
        if (token == address(0)) {
            if (msg.value != amount) revert LibErrors.InvalidMsgValue();
        } else {
            if (msg.value != 0) revert LibErrors.InvalidMsgValue();
            IERC20(token).safeTransferFrom(from, address(this), amount);
        }
    }

    function push(address token, address to, uint256 amount) internal {
        if (amount == 0) return;
        if (to == address(0)) revert LibErrors.ZeroAddress();
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            require(ok, "BNB transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
```

Note: `create`/`buy` facets must be `payable` and call `pull` such that only one asset path uses `msg.value` per call.

- [ ] **Step 4: Run asset tests — PASS**

```bash
forge test --match-contract LibAssetTest -vv
```

- [ ] **Step 5: Commit**

```bash
git add contracts/src/storage contracts/src/libraries contracts/test
git commit -m "$(cat <<'EOF'
feat: add scoop storage, errors, and LibAsset

EOF
)"
```

---

### Task 3: Init + Ownership feeRecipient + Create raffle

**Files:**
- Create: `contracts/src/upgradeInitializers/ScoopDiamondInit.sol`
- Create: `contracts/src/libraries/LibRaffle.sol`
- Create: `contracts/src/facets/RaffleCreateFacet.sol`
- Create: `contracts/src/interfaces/IScoopRaffle.sol`
- Modify: `contracts/src/facets/OwnershipFacet.sol` — add `setFeeRecipient` / `feeRecipient`
- Create: `contracts/test/helpers/ScoopTestHelper.sol`
- Test: `contracts/test/Create.t.sol`

**Interfaces:**
- Consumes: `LibAsset`, `AppStorage`
- Produces:

```solidity
function createRaffle(
    address prizeToken,
    address paymentToken,
    uint128 prizeAmount,
    uint128 pricePerShare,
    uint32 totalShares,
    uint64 deadline,
    uint32 drawDelayBlocks
) external payable returns (uint256 orderId);
```

- [ ] **Step 1: Write failing create tests**

```solidity
function test_create_erc20Prize_assignsIndexes() public {
    // alice approves prizeToken, creates 11 shares, price 1e18, deadline +1 days, N=5
    uint256 id = _createDefault(alice);
    Raffle memory r = views.getRaffle(id);
    assertEq(r.creator, alice);
    assertEq(uint8(r.status), uint8(RaffleStatus.Selling));
    assertEq(r.tokenOrderId, 1);
    assertEq(r.userOrderId, 1);
    assertEq(views.orderIdByPrizeToken(address(prize), 1), id);
    assertEq(views.orderIdByCreator(alice, 1), id);
    assertEq(prize.balanceOf(diamond), 100_000 ether);
}

function test_create_bnbPrize() public {
    uint256 id = createFacet.createRaffle{value: 1 ether}(
        address(0), address(payToken), 1 ether, 0.1 ether, 11, uint64(block.timestamp + 1 days), 5
    );
    assertEq(address(diamond).balance, 1 ether);
    assertEq(views.getRaffle(id).prizeToken, address(0));
}

function test_create_revertsInvalidShares() public {
    vm.expectRevert(LibErrors.InvalidShares.selector);
    // totalShares = 1
}
```

- [ ] **Step 2: Run — FAIL**

```bash
forge test --match-contract Create -vv
```

- [ ] **Step 3: Implement ScoopDiamondInit**

```solidity
function init(address feeRecipient_) external {
    AppStorage storage s = LibAppStorage.appStorage();
    if (s.initialized) revert LibErrors.AlreadyInitialized();
    if (feeRecipient_ == address(0)) revert LibErrors.ZeroAddress();
    s.initialized = true;
    s.feeRecipient = feeRecipient_;
    s.nextOrderId = 1;
    // register ERC165 for cut/loupe/173/165 like grid9 init
}
```

- [ ] **Step 4: Implement LibRaffle.create + RaffleCreateFacet**

Validation:

- `totalShares >= MIN_SHARES`
- `prizeAmount > 0`, `pricePerShare > 0`
- `deadline > block.timestamp`
- `drawDelayBlocks` in `[MIN_DRAW_DELAY_BLOCKS, MAX_DRAW_DELAY_BLOCKS]`
- `LibAsset.pull(prizeToken, msg.sender, prizeAmount)`
- Assign `orderId = nextOrderId++`
- Increment `tokenOrderCount[prizeToken]`, `userOrderCount[msg.sender]`, write reverse maps
- Status `Selling`
- Emit `RaffleCreated(orderId, creator, prizeToken, paymentToken, prizeAmount, pricePerShare, totalShares, deadline, drawDelayBlocks, tokenOrderId, userOrderId)`

- [ ] **Step 5: ScoopTestHelper deploys full diamond with all facets cut (add create now; other facets stub empty or cut later)**

Helper must `deal`/`mint` tokens and expose facet interfaces via diamond address casts.

- [ ] **Step 6: Run Create tests — PASS**

```bash
forge test --match-contract Create -vv
```

- [ ] **Step 7: Commit**

```bash
git commit -am "$(cat <<'EOF'
feat: createRaffle with triple indexes and escrow

EOF
)"
```

---

### Task 4: Buy shares + pending draw enqueue

**Files:**
- Modify: `contracts/src/libraries/LibRaffle.sol`
- Create: `contracts/src/facets/RaffleBuyFacet.sol`
- Test: `contracts/test/Buy.t.sol`

**Interfaces:**
- Produces: `function buyShares(uint256 orderId, uint32 count) external payable;`

- [ ] **Step 1: Failing tests**

```solidity
function test_buy_assignsSequentialShareIndexes() public {
    uint256 id = _createDefault(alice);
    _buy(bob, id, 3);
    assertEq(views.shareOwner(id, 0), bob);
    assertEq(views.shareOwner(id, 2), bob);
    assertEq(views.shareCount(id, bob), 3);
    assertEq(views.getRaffle(id).soldShares, 3);
}

function test_buy_sellsOut_enqueuesPendingDraw() public {
    uint256 id = _createDefault(alice); // 11 shares
    _buy(bob, id, 11);
    Raffle memory r = views.getRaffle(id);
    assertEq(uint8(r.status), uint8(RaffleStatus.SoldOut));
    assertEq(r.soldOutBlock, block.number);
    assertEq(views.pendingDrawCount(), 1);
    (uint256 oid, uint64 eligible) = views.pendingDrawAt(0);
    assertEq(oid, id);
    assertEq(eligible, uint64(block.number + r.drawDelayBlocks));
}

function test_buy_revertsAfterDeadline() public { /* warp past deadline */ }
function test_sameBuyerMultiplePurchases() public { /* bob buys 2 then 3 */ }
```

- [ ] **Step 2: Run — FAIL**

```bash
forge test --match-contract Buy -vv
```

- [ ] **Step 3: Implement buy**

For `i` in `0..count-1`: `shareOwner[orderId][soldShares + i] = msg.sender`; then `soldShares += count`; `shareCount += count`; `buyerPaid += pricePerShare * count`; `LibAsset.pull(paymentToken, ...)`.

On `soldShares == totalShares`: status `SoldOut`, `soldOutBlock = block.number`, `_pendingDrawAdd(orderId)`, emit `SoldOut`.

Pending set helpers in `LibRaffle.sol`:

```solidity
function pendingDrawAdd(AppStorage storage s, uint256 orderId) internal {
    if (s.pendingDrawIndex[orderId] != 0) return;
    s.pendingDrawIds.push(orderId);
    s.pendingDrawIndex[orderId] = s.pendingDrawIds.length; // 1-based
}

function pendingDrawRemove(AppStorage storage s, uint256 orderId) internal {
    uint256 idxPlus = s.pendingDrawIndex[orderId];
    if (idxPlus == 0) revert LibErrors.NotPendingDraw();
    uint256 idx = idxPlus - 1;
    uint256 last = s.pendingDrawIds.length - 1;
    if (idx != last) {
        uint256 moved = s.pendingDrawIds[last];
        s.pendingDrawIds[idx] = moved;
        s.pendingDrawIndex[moved] = idx + 1;
    }
    s.pendingDrawIds.pop();
    delete s.pendingDrawIndex[orderId];
}
```

- [ ] **Step 4: Run Buy — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -am "$(cat <<'EOF'
feat: buyShares with sellout pending-draw enqueue

EOF
)"
```

---

### Task 5: Draw + drawMany

**Files:**
- Create: `contracts/src/libraries/LibRaffleDraw.sol`
- Create: `contracts/src/facets/RaffleDrawFacet.sol`
- Test: `contracts/test/Draw.t.sol`

**Interfaces:**
- Produces: `draw(uint256 orderId)`, `drawMany(uint256[] calldata orderIds)`

- [ ] **Step 1: Failing tests**

```solidity
function test_draw_usesEligibleBlockhash() public {
    uint256 id = _sellOut(alice, bob); // N=5
    vm.roll(block.number + 5);
    // optional: vm.setBlockhash if needed on exact block
    drawFacet.draw(id);
    Raffle memory r = views.getRaffle(id);
    assertEq(uint8(r.status), uint8(RaffleStatus.Drawn));
    assertTrue(r.winnerShareIndex < r.totalShares);
    assertEq(views.pendingDrawCount(), 0);
}

function test_draw_tooEarly_reverts() public {
    uint256 id = _sellOut(alice, bob);
    vm.expectRevert(LibErrors.DrawTooEarly.selector);
    drawFacet.draw(id);
}

function test_draw_walksForwardWhenHashMissing() public {
    // roll far enough that original eligible hash is zero; ensure forward walk finds a usable hash
}

function test_drawMany_drawsReadySkipsNotReady() public {
    // two raffles; only one eligible; drawMany both; assert one drawn one still pending OR revert policy:
    // SPEC CHOICE: drawMany processes each; not-ready items revert the whole batch.
    // Implement: all-or-nothing revert on first failure (simpler).
}
```

- [ ] **Step 2: Implement draw logic**

```solidity
function resolveDrawBlock(uint64 soldOutBlock, uint32 delay) internal view returns (uint64 drawBlock) {
    uint256 start = uint256(soldOutBlock) + uint256(delay);
    if (block.number <= start) revert LibErrors.DrawTooEarly();
    for (uint256 b = start; b < block.number; ++b) {
        if (blockhash(b) != bytes32(0)) return uint64(b);
    }
    revert LibErrors.NoBlockhash();
}

winnerShareIndex = uint32(uint256(blockhash(drawBlock)) % totalShares);
```

Then status `Drawn`, `pendingDrawRemove`, emit `Drawn(orderId, winnerShareIndex, drawBlock, winner)`.

- [ ] **Step 3: Run Draw — PASS**

- [ ] **Step 4: Commit**

```bash
git commit -am "$(cat <<'EOF'
feat: blockhash draw with pending-draw dequeue

EOF
)"
```

---

### Task 6: Claim prize + claim proceeds (fee on creator only)

**Files:**
- Create: `contracts/src/libraries/LibRaffleClaim.sol`
- Create: `contracts/src/facets/RaffleClaimFacet.sol`
- Test: `contracts/test/Claim.t.sol`

**Interfaces:**
- Produces: `claimPrize(uint256 orderId)`, `claimProceeds(uint256 orderId)`

- [ ] **Step 1: Failing tests**

```solidity
function test_claimPrize_winnerGetsFullPrize_noFee() public {
    (uint256 id, address winner) = _drawDefault();
    uint256 before = prize.balanceOf(winner);
    vm.prank(winner);
    claimFacet.claimPrize(id);
    assertEq(prize.balanceOf(winner) - before, 100_000 ether);
    assertEq(prize.balanceOf(feeRecipient), 0);
}

function test_claimProceeds_skimsOnePercentToFeeRecipient() public {
    (uint256 id,) = _drawDefault(); // raised = 11 * 1e18
    uint256 raised = 11 ether;
    uint256 fee = raised / 100;
    uint256 creatorBefore = payToken.balanceOf(alice);
    uint256 feeBefore = payToken.balanceOf(feeRecipient);
    vm.prank(alice);
    claimFacet.claimProceeds(id);
    assertEq(payToken.balanceOf(alice) - creatorBefore, raised - fee);
    assertEq(payToken.balanceOf(feeRecipient) - feeBefore, fee);
}

function test_claimPrize_onlyWinner() public { /* non-winner reverts NotWinner */ }
function test_doubleClaim_reverts() public { /* ... */ }
```

- [ ] **Step 2: Implement**

```solidity
// claimPrize
if (status != Drawn) revert NotDrawn();
if (prizeClaimed) revert PrizeAlreadyClaimed();
address winner = shareOwner[orderId][winnerShareIndex];
if (msg.sender != winner) revert NotWinner();
prizeClaimed = true;
LibAsset.push(prizeToken, winner, prizeAmount);

// claimProceeds
if (msg.sender != creator) revert NotCreator();
if (proceedsClaimed) revert ProceedsAlreadyClaimed();
proceedsClaimed = true;
uint256 raised = uint256(pricePerShare) * uint256(totalShares);
uint256 fee = raised / LibConstants.FEE_DENOMINATOR;
LibAsset.push(paymentToken, feeRecipient, fee);
LibAsset.push(paymentToken, creator, raised - fee);
```

Anyone may call? Spec says winner/creator claim — **restrict to winner / creator** as above.

- [ ] **Step 3: Run Claim — PASS**

- [ ] **Step 4: Commit**

```bash
git commit -am "$(cat <<'EOF'
feat: claimPrize full pot and claimProceeds with 1pct fee

EOF
)"
```

---

### Task 7: Expire — refund buyers + recover prize

**Files:**
- Modify: `contracts/src/libraries/LibRaffleClaim.sol` (or `LibRaffle.sol`)
- Modify: `contracts/src/facets/RaffleClaimFacet.sol`
- Test: `contracts/test/Expire.t.sol`

**Interfaces:**
- Produces: `refund(uint256 orderId)`, `recoverPrize(uint256 orderId)`

- [ ] **Step 1: Failing tests**

```solidity
function test_expire_refundAndRecover_noFees() public {
    uint256 id = _createDefault(alice);
    _buy(bob, id, 3);
    vm.warp(deadline + 1);
    uint256 bobPaid = 3 ether;
    vm.prank(bob);
    claimFacet.refund(id);
    assertEq(payToken.balanceOf(bob), bobPaid); // relative assert in helper
    vm.prank(alice);
    claimFacet.recoverPrize(id);
    assertEq(prize.balanceOf(alice), 100_000 ether);
    assertEq(uint8(views.getRaffle(id).status), uint8(RaffleStatus.Expired));
}

function test_refund_beforeDeadline_reverts() public { /* ... */ }
function test_refund_afterSoldOut_reverts() public { /* ... */ }
function test_doubleRefund_reverts() public { /* ... */ }
```

- [ ] **Step 2: Implement lazy expire**

On `refund` / `recoverPrize`:

- require `block.timestamp > deadline`
- require status is `Selling` OR `Expired` (not SoldOut/Drawn)
- if `Selling`, set `Expired`
- refund: `buyerPaid > 0`, not `buyerRefunded`, push payment, mark refunded
- recover: only creator, not `prizeRecovered`, push full prize

- [ ] **Step 3: Run Expire — PASS**

- [ ] **Step 4: Commit**

```bash
git commit -am "$(cat <<'EOF'
feat: lazy expire refunds and prize recovery

EOF
)"
```

---

### Task 8: Views facet + index/pagination tests

**Files:**
- Create: `contracts/src/libraries/LibRaffleViews.sol`
- Create: `contracts/src/facets/RaffleViewsFacet.sol`
- Test: `contracts/test/Indexes.t.sol`

**Interfaces (minimum):**

```solidity
function getRaffle(uint256 orderId) external view returns (Raffle memory);
function shareOwner(uint256 orderId, uint32 shareIndex) external view returns (address);
function shareCount(uint256 orderId, address user) external view returns (uint32);
function pendingDrawCount() external view returns (uint256);
function pendingDrawAt(uint256 index) external view returns (uint256 orderId, uint64 eligibleBlock);
function orderIdByPrizeToken(address prizeToken, uint32 tokenOrderId) external view returns (uint256);
function orderIdByCreator(address creator, uint32 userOrderId) external view returns (uint256);
function nextOrderId() external view returns (uint256);
function feeRecipient() external view returns (address);
```

- [ ] **Step 1: Tests for triple index consistency after 3 creates across 2 tokens / 2 creators**

- [ ] **Step 2: Implement views — PASS**

- [ ] **Step 3: Commit**

```bash
git commit -am "$(cat <<'EOF'
feat: raffle view facet and index getters

EOF
)"
```

---

### Task 9: Asset matrix + deploy scripts

**Files:**
- Test: `contracts/test/AssetMatrix.t.sol`
- Create: `contracts/script/DeployScoopDiamond.s.sol`
- Create: `contracts/script/DeployLocal.s.sol`
- Modify: `contracts/test/helpers/ScoopTestHelper.sol` — ensure all facets cut

**Matrix (each: create → buy all → draw → both claims):**

1. prize ERC20 / pay ERC20  
2. prize BNB / pay ERC20  
3. prize ERC20 / pay BNB  
4. prize BNB / pay BNB  

Also one multi-share winner path already covered; include BNB feeRecipient receive in matrix.

- [ ] **Step 1: Write AssetMatrix tests — run FAIL then implement any missing payable paths until PASS**

```bash
forge test --match-contract AssetMatrix -vv
```

- [ ] **Step 2: DeployLocal script**

Mirrors test helper: deploy facets, diamond, init with `feeRecipient = msg.sender`, log diamond address.

- [ ] **Step 3: Full suite**

```bash
forge test -vv
```

Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git commit -am "$(cat <<'EOF'
feat: asset matrix coverage and deploy scripts

EOF
)"
```

---

### Task 10: Docs polish for contracts MVP

**Files:**
- Modify: `README.md` — how to `forge test`, create/buy/draw/claim flow, fee rule
- Modify: `docs/superpowers/specs/2026-11-13-scoop-design.md` — set Status to `Approved`

- [ ] **Step 1: Update README with commands and addresses placeholder**

- [ ] **Step 2: Commit**

```bash
git commit -am "$(cat <<'EOF'
docs: mark scoop contracts MVP ready for web plan

EOF
)"
```

---

## Spec coverage checklist (self-review)

| Spec item | Task |
|---|---|
| Single Diamond + orderId | 1, 3 |
| Create escrow prize BNB/ERC20 | 3, 9 |
| Buy multi-share, sellout | 4 |
| Triple indexes (global / prizeToken / creator) | 3, 8 |
| Pending draw set + drawMany | 4, 5 |
| Blockhash + forward walk | 5 |
| Winner 100% prize | 6 |
| Creator proceeds 1% fee to feeRecipient on claim | 6 |
| Lazy expire refund/recover no fee | 7 |
| Views | 8 |
| Asset matrix | 9 |
| Frontend | **Deferred — separate plan** |

## Follow-up plan (not in this file)

After Task 10 is green, write `docs/superpowers/plans/2026-11-13-scoop-web.md`: Next.js + wagmi + RainbowKit, routes `/`, `/raffle/[orderId]`, `/create`, `/token/[prizeToken]`, `/user/[address]`, ABI from forge artifacts.
