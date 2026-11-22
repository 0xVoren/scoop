// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {ScoopTestHelper} from "./helpers/ScoopTestHelper.sol";
import {LibErrors} from "../src/libraries/LibErrors.sol";

contract Claim is ScoopTestHelper {
    function test_claimPrize_winnerGetsFullPrize_noFee() public {
        (uint256 id, address winner) = _drawDefault();
        uint256 beforeBal = prize.balanceOf(winner);
        vm.prank(winner);
        claimFacet.claimPrize(id);
        assertEq(prize.balanceOf(winner) - beforeBal, DEFAULT_PRIZE);
        assertEq(prize.balanceOf(feeRecipient), 0);
    }

    function test_claimProceeds_skimsOnePercentToFeeRecipient() public {
        (uint256 id,) = _drawDefault();
        uint256 raised = uint256(DEFAULT_PRICE) * uint256(DEFAULT_SHARES);
        uint256 fee = raised / 100;
        // Launch lock: payment token == prize token.
        uint256 creatorBefore = prize.balanceOf(alice);
        uint256 feeBefore = prize.balanceOf(feeRecipient);
        vm.prank(alice);
        claimFacet.claimProceeds(id);
        assertEq(prize.balanceOf(alice) - creatorBefore, raised - fee);
        assertEq(prize.balanceOf(feeRecipient) - feeBefore, fee);
    }

    function test_claimPrize_onlyWinner() public {
        (uint256 id, address winner) = _drawDefault();
        address notWinner = winner == bob ? alice : bob;
        vm.prank(notWinner);
        vm.expectRevert(LibErrors.NotWinner.selector);
        claimFacet.claimPrize(id);
    }

    function test_doubleClaim_reverts() public {
        (uint256 id, address winner) = _drawDefault();
        vm.prank(winner);
        claimFacet.claimPrize(id);
        vm.prank(winner);
        vm.expectRevert(LibErrors.PrizeAlreadyClaimed.selector);
        claimFacet.claimPrize(id);

        vm.prank(alice);
        claimFacet.claimProceeds(id);
        vm.prank(alice);
        vm.expectRevert(LibErrors.ProceedsAlreadyClaimed.selector);
        claimFacet.claimProceeds(id);
    }
}
