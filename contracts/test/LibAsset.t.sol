// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {Test} from "forge-std/Test.sol";
import {LibAsset} from "../src/libraries/LibAsset.sol";
import {LibErrors} from "../src/libraries/LibErrors.sol";
import {MockERC20} from "./helpers/MockERC20.sol";
import {FeeOnTransferERC20} from "./helpers/FeeOnTransferERC20.sol";

/// @notice Harness so tests can call internal `LibAsset` pull and push.
contract LibAssetHarness {
    function pull(address token, address from, uint256 amount) external payable {
        LibAsset.pull(token, from, amount);
    }

    function push(address token, address to, uint256 amount) external {
        LibAsset.push(token, to, amount);
    }
}

/// @title LibAssetTest
/// @notice Pull ERC-20 into the harness and push native BNB out.
contract LibAssetTest is Test {
    MockERC20 internal token;
    FeeOnTransferERC20 internal fot;
    LibAssetHarness internal harness;
    address internal alice;
    address internal bob;

    function setUp() public {
        token = new MockERC20("Mock", "MCK");
        fot = new FeeOnTransferERC20();
        harness = new LibAssetHarness();
        alice = makeAddr("alice");
        bob = makeAddr("bob");
    }

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

    function test_pull_feeOnTransfer_reverts() public {
        fot.mint(alice, 100 ether);
        vm.prank(alice);
        fot.approve(address(harness), 100 ether);
        vm.prank(alice);
        vm.expectRevert(LibErrors.TransferAmountMismatch.selector);
        harness.pull(address(fot), alice, 100 ether);
    }

    function test_pull_zeroAmount_reverts() public {
        vm.expectRevert(LibErrors.InvalidAmount.selector);
        harness.pull(address(0), alice, 0);
    }

    function test_pull_bnb_valueMismatch_reverts() public {
        vm.deal(alice, 2 ether);
        vm.prank(alice);
        vm.expectRevert(LibErrors.InvalidMsgValue.selector);
        harness.pull{value: 1 ether}(address(0), alice, 2 ether);
    }

    function test_pull_erc20_withMsgValue_reverts() public {
        token.mint(alice, 1 ether);
        vm.prank(alice);
        token.approve(address(harness), 1 ether);
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(LibErrors.InvalidMsgValue.selector);
        harness.pull{value: 1}(address(token), alice, 1 ether);
    }

    function test_push_zeroAmount_noop() public {
        harness.push(address(0), bob, 0);
        assertEq(bob.balance, 0);
    }

    function test_push_zeroAddress_reverts() public {
        vm.deal(address(harness), 1 ether);
        vm.expectRevert(LibErrors.ZeroAddress.selector);
        harness.push(address(0), address(0), 1 ether);
    }
}
