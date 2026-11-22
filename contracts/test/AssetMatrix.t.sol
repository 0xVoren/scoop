// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {ScoopTestHelper} from "./helpers/ScoopTestHelper.sol";
import {Raffle} from "../src/storage/AppStorage.sol";

contract AssetMatrix is ScoopTestHelper {
    function test_matrix_sameErc20() public {
        _fullCycle(address(prize), address(prize), DEFAULT_PRIZE, DEFAULT_PRICE, false);
    }

    function test_matrix_sameBnb() public {
        _fullCycle(address(0), address(0), 1 ether, 0.1 ether, false);
    }

    function test_matrix_crossAsset_whenOpened() public {
        _openAllCreateOptions();
        _fullCycle(address(prize), address(payToken), 100 ether, 1 ether, true);
        _fullCycle(address(0), address(payToken), 1 ether, 0.1 ether, true);
        _fullCycle(address(prize), address(0), 100 ether, 0.05 ether, true);
    }

    function _fullCycle(
        address prizeToken,
        address paymentToken,
        uint128 prizeAmount,
        uint128 pricePerShare,
        bool customShares
    ) internal {
        uint32 shares = customShares ? 5 : DEFAULT_SHARES;
        uint32 delay = DEFAULT_DELAY;

        if (prizeToken == address(0)) {
            vm.prank(alice);
            createFacet.createRaffle{value: prizeAmount}(
                prizeToken, paymentToken, prizeAmount, pricePerShare, shares, uint64(block.timestamp + 1 days), delay
            );
        } else {
            vm.prank(alice);
            createFacet.createRaffle(
                prizeToken, paymentToken, prizeAmount, pricePerShare, shares, uint64(block.timestamp + 1 days), delay
            );
        }
        uint256 id = views.nextOrderId() - 1;

        uint256 cost = uint256(pricePerShare) * uint256(shares);
        if (paymentToken == address(0)) {
            vm.prank(bob);
            buyFacet.buyShares{value: cost}(id, shares);
        } else {
            vm.prank(bob);
            buyFacet.buyShares(id, shares);
        }

        Raffle memory r = views.getRaffle(id);
        vm.roll(uint256(r.soldOutBlock) + uint256(r.drawDelayBlocks) + 1);
        drawFacet.draw(id);
        r = views.getRaffle(id);
        address winner = views.shareOwner(id, r.winnerShareIndex);

        if (prizeToken == address(0)) {
            uint256 before = winner.balance;
            vm.prank(winner);
            claimFacet.claimPrize(id);
            assertEq(winner.balance - before, prizeAmount);
        } else {
            uint256 before = MockBal(prizeToken).balanceOf(winner);
            vm.prank(winner);
            claimFacet.claimPrize(id);
            assertEq(MockBal(prizeToken).balanceOf(winner) - before, prizeAmount);
        }

        uint256 fee = cost / 100;
        if (paymentToken == address(0)) {
            uint256 aliceBefore = alice.balance;
            uint256 feeBefore = feeRecipient.balance;
            vm.prank(alice);
            claimFacet.claimProceeds(id);
            assertEq(alice.balance - aliceBefore, cost - fee);
            assertEq(feeRecipient.balance - feeBefore, fee);
        } else {
            uint256 aliceBefore = MockBal(paymentToken).balanceOf(alice);
            uint256 feeBefore = MockBal(paymentToken).balanceOf(feeRecipient);
            vm.prank(alice);
            claimFacet.claimProceeds(id);
            assertEq(MockBal(paymentToken).balanceOf(alice) - aliceBefore, cost - fee);
            assertEq(MockBal(paymentToken).balanceOf(feeRecipient) - feeBefore, fee);
        }
    }
}

interface MockBal {
    function balanceOf(address) external view returns (uint256);
}
