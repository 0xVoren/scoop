// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {ScoopTestHelper} from "./helpers/ScoopTestHelper.sol";
import {Raffle, RaffleStatus} from "../src/storage/AppStorage.sol";
import {LibErrors} from "../src/libraries/LibErrors.sol";

contract Expire is ScoopTestHelper {
    function test_expire_refundAndRecover_noFees() public {
        uint256 id = _createDefault(alice);
        uint256 bobPayBefore = prize.balanceOf(bob);
        _buy(bob, id, 3);
        uint256 bobPaid = 3 * uint256(DEFAULT_PRICE);
        assertEq(bobPayBefore - prize.balanceOf(bob), bobPaid);

        Raffle memory r = views.getRaffle(id);
        vm.warp(r.deadline + 1);

        uint256 bobBefore = prize.balanceOf(bob);
        vm.prank(bob);
        claimFacet.refund(id);
        assertEq(prize.balanceOf(bob) - bobBefore, bobPaid);
        assertTrue(views.buyerRefunded(id, bob));
        assertEq(prize.balanceOf(feeRecipient), 0);

        uint256 alicePrizeBefore = prize.balanceOf(alice);
        vm.prank(alice);
        claimFacet.recoverPrize(id);
        assertEq(prize.balanceOf(alice) - alicePrizeBefore, DEFAULT_PRIZE);
        assertEq(prize.balanceOf(feeRecipient), 0);
        assertEq(uint8(views.getRaffle(id).status), uint8(RaffleStatus.Expired));
    }

    function test_refund_beforeDeadline_reverts() public {
        uint256 id = _createDefault(alice);
        _buy(bob, id, 1);
        vm.prank(bob);
        vm.expectRevert(LibErrors.NotExpired.selector);
        claimFacet.refund(id);
    }

    function test_refund_afterSoldOut_whileDrawable_reverts() public {
        uint256 id = _sellOut(alice, bob);
        Raffle memory r = views.getRaffle(id);
        // Still inside blockhash window — draw is possible, refund must not open.
        vm.roll(uint256(r.soldOutBlock) + uint256(r.drawDelayBlocks) + 1);
        vm.warp(r.deadline + 1);
        vm.prank(bob);
        vm.expectRevert(LibErrors.NotExpired.selector);
        claimFacet.refund(id);
    }

    function test_refund_afterSoldOut_entropyExpired_ok() public {
        uint256 id = _sellOut(alice, bob);
        Raffle memory r = views.getRaffle(id);
        vm.roll(uint256(r.soldOutBlock) + 300);
        vm.prank(bob);
        claimFacet.refund(id);
        assertEq(uint8(views.getRaffle(id).status), uint8(RaffleStatus.Expired));
    }

    function test_doubleRefund_reverts() public {
        uint256 id = _createDefault(alice);
        _buy(bob, id, 2);
        Raffle memory r = views.getRaffle(id);
        vm.warp(r.deadline + 1);
        vm.prank(bob);
        claimFacet.refund(id);
        vm.prank(bob);
        vm.expectRevert(LibErrors.AlreadyRefunded.selector);
        claimFacet.refund(id);
    }

    function test_doubleRecoverPrize_reverts() public {
        uint256 id = _createDefault(alice);
        Raffle memory r = views.getRaffle(id);
        vm.warp(r.deadline + 1);
        vm.prank(alice);
        claimFacet.recoverPrize(id);
        vm.prank(alice);
        vm.expectRevert(LibErrors.PrizeAlreadyRecovered.selector);
        claimFacet.recoverPrize(id);
    }

    function test_recoverPrize_onlyCreator() public {
        uint256 id = _createDefault(alice);
        Raffle memory r = views.getRaffle(id);
        vm.warp(r.deadline + 1);
        vm.prank(bob);
        vm.expectRevert(LibErrors.NotCreator.selector);
        claimFacet.recoverPrize(id);
    }
}
