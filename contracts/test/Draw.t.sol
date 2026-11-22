// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {ScoopTestHelper} from "./helpers/ScoopTestHelper.sol";
import {Raffle, RaffleStatus} from "../src/storage/AppStorage.sol";
import {LibErrors} from "../src/libraries/LibErrors.sol";

contract Draw is ScoopTestHelper {
    function test_draw_usesEligibleBlockhash() public {
        uint256 id = _sellOut(alice, bob);
        Raffle memory before = views.getRaffle(id);
        uint256 eligible = uint256(before.soldOutBlock) + uint256(before.drawDelayBlocks);
        vm.roll(eligible + 1);
        drawFacet.draw(id);
        Raffle memory r = views.getRaffle(id);
        assertEq(uint8(r.status), uint8(RaffleStatus.Drawn));
        assertEq(uint256(r.drawBlock), eligible); // anchored — never a later head block
        assertTrue(r.winnerShareIndex < r.totalShares);
        assertEq(views.pendingDrawCount(), 0);
        assertEq(views.shareOwner(id, r.winnerShareIndex), bob);
    }

    function test_draw_multiBuyer_winnerMatchesShareOwner() public {
        address carol = makeAddr("carol");
        address stranger = makeAddr("stranger");
        prize.mint(carol, MINT_AMOUNT);
        vm.prank(carol);
        prize.approve(address(diamond), type(uint256).max);

        uint256 id = _createDefault(alice);
        _buy(bob, id, 4);
        _buy(carol, id, 7);

        Raffle memory before = views.getRaffle(id);
        uint256 eligible = uint256(before.soldOutBlock) + uint256(before.drawDelayBlocks);
        vm.roll(eligible + 1);
        // Permissionless: neither buyer nor creator draws.
        vm.prank(stranger);
        drawFacet.draw(id);

        Raffle memory r = views.getRaffle(id);
        assertEq(uint8(r.status), uint8(RaffleStatus.Drawn));
        assertEq(uint256(r.drawBlock), eligible);
        address winner = views.shareOwner(id, r.winnerShareIndex);
        assertTrue(winner == bob || winner == carol);
        bytes32 h = blockhash(eligible);
        uint256 expected = uint256(keccak256(abi.encodePacked(h, id))) % uint256(r.totalShares);
        assertEq(uint256(r.winnerShareIndex), expected);
    }

    function test_draw_tooEarly_reverts() public {
        uint256 id = _sellOut(alice, bob);
        vm.expectRevert(LibErrors.DrawTooEarly.selector);
        drawFacet.draw(id);
    }

    function test_draw_late_entropyExpired_reverts() public {
        uint256 id = _sellOut(alice, bob);
        Raffle memory r = views.getRaffle(id);
        uint256 soldOut = r.soldOutBlock;
        // Past the 256-block window: anchored eligible hash is gone — must NOT clamp to a newer hash.
        vm.roll(soldOut + 300);
        vm.expectRevert(LibErrors.DrawEntropyExpired.selector);
        drawFacet.draw(id);
        assertEq(uint8(views.getRaffle(id).status), uint8(RaffleStatus.SoldOut));
    }

    function test_draw_veryLate_entropyExpired_reverts() public {
        uint256 id = _sellOut(alice, bob);
        Raffle memory r = views.getRaffle(id);
        vm.roll(uint256(r.soldOutBlock) + 100_000);
        vm.expectRevert(LibErrors.DrawEntropyExpired.selector);
        drawFacet.draw(id);
    }

    function test_lateEntropy_refundAndRecover() public {
        uint256 id = _sellOut(alice, bob);
        Raffle memory r = views.getRaffle(id);
        vm.roll(uint256(r.soldOutBlock) + 300);

        uint256 bobBefore = prize.balanceOf(bob);
        uint256 paid = uint256(DEFAULT_PRICE) * uint256(DEFAULT_SHARES);
        vm.prank(bob);
        claimFacet.refund(id);
        assertEq(prize.balanceOf(bob) - bobBefore, paid);
        assertEq(uint8(views.getRaffle(id).status), uint8(RaffleStatus.Expired));
        assertEq(views.pendingDrawCount(), 0);

        uint256 aliceBefore = prize.balanceOf(alice);
        vm.prank(alice);
        claimFacet.recoverPrize(id);
        assertEq(prize.balanceOf(alice) - aliceBefore, DEFAULT_PRIZE);
    }

    function test_drawMany_allOrNothing() public {
        uint256 id1 = _sellOut(alice, bob);
        // second raffle: charlie pays
        address charlie = makeAddr("charlie");
        prize.mint(charlie, MINT_AMOUNT);
        vm.prank(charlie);
        prize.approve(address(diamond), type(uint256).max);
        uint256 id2 = _createDefault(alice);
        _buy(charlie, id2, DEFAULT_SHARES);

        Raffle memory r1 = views.getRaffle(id1);
        vm.roll(uint256(r1.soldOutBlock) + uint256(r1.drawDelayBlocks) + 1);

        uint256[] memory ids = new uint256[](2);
        ids[0] = id1;
        ids[1] = id2; // id2 sold out later / same block but may still be too early relative to its own soldOut+N
        // Make id2 also ready
        Raffle memory r2 = views.getRaffle(id2);
        uint256 need = uint256(r2.soldOutBlock) + uint256(r2.drawDelayBlocks) + 1;
        if (block.number < need) vm.roll(need);

        drawFacet.drawMany(ids);
        assertEq(uint8(views.getRaffle(id1).status), uint8(RaffleStatus.Drawn));
        assertEq(uint8(views.getRaffle(id2).status), uint8(RaffleStatus.Drawn));
        assertEq(uint256(views.getRaffle(id1).drawBlock), uint256(r1.soldOutBlock) + uint256(r1.drawDelayBlocks));
        assertEq(views.pendingDrawCount(), 0);
    }

    function test_drawMany_revertsWholeBatchIfOneNotReady() public {
        uint256 idReady = _sellOut(alice, bob);
        Raffle memory ready = views.getRaffle(idReady);
        vm.roll(uint256(ready.soldOutBlock) + uint256(ready.drawDelayBlocks) + 1);

        // Sell out a second raffle at the new head — its delay has not elapsed yet.
        uint256 idEarly = _createDefault(alice);
        _buy(bob, idEarly, DEFAULT_SHARES);

        uint256[] memory ids = new uint256[](2);
        ids[0] = idReady;
        ids[1] = idEarly;
        vm.expectRevert(LibErrors.DrawTooEarly.selector);
        drawFacet.drawMany(ids);
        // All-or-nothing: ready raffle must remain undrawn after batch revert.
        assertEq(uint8(views.getRaffle(idReady).status), uint8(RaffleStatus.SoldOut));
        assertEq(uint8(views.getRaffle(idEarly).status), uint8(RaffleStatus.SoldOut));
    }
}
