// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {ScoopTestHelper} from "./helpers/ScoopTestHelper.sol";
import {MockERC20} from "./helpers/MockERC20.sol";

contract Indexes is ScoopTestHelper {
    function test_tripleIndex_consistencyAcrossTokensAndCreators() public {
        MockERC20 prize2 = new MockERC20("Prize2", "P2");
        prize2.mint(alice, MINT_AMOUNT);
        prize2.mint(bob, MINT_AMOUNT);
        vm.prank(alice);
        prize2.approve(address(diamond), type(uint256).max);
        vm.prank(bob);
        prize2.approve(address(diamond), type(uint256).max);

        uint256 id1 = _createDefault(alice); // prize token A, alice #1
        vm.prank(bob);
        uint256 id2 = createFacet.createRaffle(
            address(prize),
            address(prize),
            DEFAULT_PRIZE,
            DEFAULT_PRICE,
            DEFAULT_SHARES,
            uint64(block.timestamp + 1 days),
            DEFAULT_DELAY
        );
        vm.prank(alice);
        uint256 id3 = createFacet.createRaffle(
            address(prize2),
            address(prize2),
            DEFAULT_PRIZE,
            DEFAULT_PRICE,
            DEFAULT_SHARES,
            uint64(block.timestamp + 1 days),
            DEFAULT_DELAY
        );

        assertEq(views.orderIdByPrizeToken(address(prize), 1), id1);
        assertEq(views.orderIdByPrizeToken(address(prize), 2), id2);
        assertEq(views.orderIdByPrizeToken(address(prize2), 1), id3);
        assertEq(views.orderIdByCreator(alice, 1), id1);
        assertEq(views.orderIdByCreator(bob, 1), id2);
        assertEq(views.orderIdByCreator(alice, 2), id3);
        assertEq(views.nextOrderId(), 4);
        assertEq(views.tokenOrderCount(address(prize)), 2);
        assertEq(views.tokenOrderCount(address(prize2)), 1);
        assertEq(views.userOrderCount(alice), 2);
        assertEq(views.userOrderCount(bob), 1);
        assertEq(views.getRaffle(id1).tokenOrderId, 1);
        assertEq(views.getRaffle(id2).tokenOrderId, 2);
        assertEq(views.getRaffle(id3).tokenOrderId, 1);
        assertEq(views.getRaffle(id1).userOrderId, 1);
        assertEq(views.getRaffle(id2).userOrderId, 1);
        assertEq(views.getRaffle(id3).userOrderId, 2);
    }
}
