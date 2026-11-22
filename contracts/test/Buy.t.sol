// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {ScoopTestHelper} from "./helpers/ScoopTestHelper.sol";
import {Raffle, RaffleStatus} from "../src/storage/AppStorage.sol";
import {LibErrors} from "../src/libraries/LibErrors.sol";

contract Buy is ScoopTestHelper {
    function test_buy_assignsSequentialShareIndexes() public {
        uint256 id = _createDefault(alice);
        _buy(bob, id, 3);
        assertEq(views.shareOwner(id, 0), bob);
        assertEq(views.shareOwner(id, 2), bob);
        assertEq(views.shareCount(id, bob), 3);
        assertEq(views.getRaffle(id).soldShares, 3);
        assertEq(views.buyerPaid(id, bob), 3 * uint256(DEFAULT_PRICE));
    }

    function test_buy_sellsOut_enqueuesPendingDraw() public {
        uint256 id = _createDefault(alice);
        _buy(bob, id, 11);
        Raffle memory r = views.getRaffle(id);
        assertEq(uint8(r.status), uint8(RaffleStatus.SoldOut));
        assertEq(r.soldOutBlock, block.number);
        assertEq(views.pendingDrawCount(), 1);
        (uint256 oid, uint64 eligible) = views.pendingDrawAt(0);
        assertEq(oid, id);
        assertEq(eligible, uint64(block.number + r.drawDelayBlocks));
    }

    function test_buy_revertsAfterDeadline() public {
        uint256 id = _createDefault(alice);
        Raffle memory r = views.getRaffle(id);
        vm.warp(r.deadline + 1);
        vm.prank(bob);
        vm.expectRevert(LibErrors.DeadlinePassed.selector);
        buyFacet.buyShares(id, 1);
    }

    function test_sameBuyerMultiplePurchases() public {
        uint256 id = _createDefault(alice);
        _buy(bob, id, 2);
        _buy(bob, id, 3);
        assertEq(views.shareCount(id, bob), 5);
        assertEq(views.shareOwner(id, 0), bob);
        assertEq(views.shareOwner(id, 4), bob);
        assertEq(views.getRaffle(id).soldShares, 5);
    }

    function test_multiBuyer_distinctAddresses_shareOwnership() public {
        address carol = makeAddr("carol");
        prize.mint(carol, MINT_AMOUNT);
        vm.prank(carol);
        prize.approve(address(diamond), type(uint256).max);

        uint256 id = _createDefault(alice);
        _buy(bob, id, 5);
        _buy(carol, id, 4);
        _buy(alice, id, 2); // creator also buys; sell-out

        assertEq(views.getRaffle(id).soldShares, 11);
        assertEq(uint8(views.getRaffle(id).status), uint8(RaffleStatus.SoldOut));
        assertEq(views.shareCount(id, bob), 5);
        assertEq(views.shareCount(id, carol), 4);
        assertEq(views.shareCount(id, alice), 2);
        assertEq(views.shareOwner(id, 0), bob);
        assertEq(views.shareOwner(id, 5), carol);
        assertEq(views.shareOwner(id, 9), alice);
        assertEq(views.buyerPaid(id, bob), 5 * uint256(DEFAULT_PRICE));
        assertEq(views.buyerPaid(id, carol), 4 * uint256(DEFAULT_PRICE));
    }

    function test_buy_revertsInsufficientShares() public {
        uint256 id = _createDefault(alice);
        _buy(bob, id, 10);
        vm.prank(alice);
        vm.expectRevert(LibErrors.InsufficientShares.selector);
        buyFacet.buyShares(id, 2);
    }
}
