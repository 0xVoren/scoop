// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {ScoopTestHelper} from "./helpers/ScoopTestHelper.sol";
import {ProtocolConfig, Raffle, RaffleStatus} from "../src/storage/AppStorage.sol";
import {LibErrors} from "../src/libraries/LibErrors.sol";
import {LibConstants} from "../src/libraries/LibConstants.sol";
import {Diamond} from "../src/diamond/Diamond.sol";
import {DiamondCutFacet} from "../src/facets/DiamondCutFacet.sol";
import {IDiamondCut} from "../src/diamond/interfaces/IDiamondCut.sol";
import {ScoopDiamondInit} from "../src/upgradeInitializers/ScoopDiamondInit.sol";

/// @title Create
/// @notice `createRaffle` escrow, launch locks, indexes, and init guards.
contract Create is ScoopTestHelper {
    function test_create_erc20Prize_assignsIndexes() public {
        uint256 id = _createDefault(alice);

        Raffle memory r = views.getRaffle(id);
        assertEq(r.creator, alice);
        assertEq(r.prizeToken, address(prize));
        assertEq(r.paymentToken, address(prize));
        assertEq(r.prizeAmount, DEFAULT_PRIZE);
        assertEq(r.pricePerShare, DEFAULT_PRICE);
        assertEq(r.totalShares, 11);
        assertEq(r.soldShares, 0);
        assertEq(r.deadline, uint64(block.timestamp + 1 days));
        assertEq(r.drawDelayBlocks, 5);
        assertEq(uint8(r.status), uint8(RaffleStatus.Selling));
        assertEq(r.tokenOrderId, 1);
        assertEq(r.userOrderId, 1);
        assertEq(views.orderIdByPrizeToken(address(prize), 1), id);
        assertEq(views.orderIdByCreator(alice, 1), id);
        assertEq(prize.balanceOf(address(diamond)), DEFAULT_PRIZE);
        assertEq(ownership.feeRecipient(), feeRecipient);

        ProtocolConfig memory cfg = views.protocolConfig();
        assertFalse(cfg.allowDifferentTokens);
        assertFalse(cfg.allowCustomShares);
        assertFalse(cfg.allowCustomPrice);
        assertFalse(cfg.allowCustomDrawDelay);
        assertEq(cfg.defaultShares, 11);
        assertEq(cfg.priceDivisor, 10);
        assertEq(cfg.defaultDrawDelayBlocks, 5);
    }

    function test_create_bnbPrize_sameToken() public {
        uint256 id = createFacet.createRaffle{value: 1 ether}(
            address(0), address(0), 1 ether, 0.1 ether, 11, uint64(block.timestamp + 1 days), 5
        );
        assertEq(address(diamond).balance, 1 ether);
        assertEq(views.getRaffle(id).prizeToken, address(0));
        assertEq(views.getRaffle(id).paymentToken, address(0));
        assertEq(views.getRaffle(id).pricePerShare, 0.1 ether);
    }

    function test_create_revertsTokenMismatch_whenLocked() public {
        vm.prank(alice);
        vm.expectRevert(LibErrors.TokenMismatch.selector);
        createFacet.createRaffle(
            address(prize),
            address(payToken),
            DEFAULT_PRIZE,
            DEFAULT_PRICE,
            DEFAULT_SHARES,
            uint64(block.timestamp + 1 days),
            DEFAULT_DELAY
        );
    }

    function test_create_revertsSharesLocked() public {
        vm.prank(alice);
        vm.expectRevert(LibErrors.SharesLocked.selector);
        createFacet.createRaffle(
            address(prize),
            address(prize),
            DEFAULT_PRIZE,
            DEFAULT_PRICE,
            2,
            uint64(block.timestamp + 1 days),
            DEFAULT_DELAY
        );
    }

    function test_create_revertsPriceLocked() public {
        vm.prank(alice);
        vm.expectRevert(LibErrors.PriceLocked.selector);
        createFacet.createRaffle(
            address(prize),
            address(prize),
            DEFAULT_PRIZE,
            1 ether,
            DEFAULT_SHARES,
            uint64(block.timestamp + 1 days),
            DEFAULT_DELAY
        );
    }

    function test_create_revertsDrawDelayLocked() public {
        vm.prank(alice);
        vm.expectRevert(LibErrors.DrawDelayLocked.selector);
        createFacet.createRaffle(
            address(prize),
            address(prize),
            DEFAULT_PRIZE,
            DEFAULT_PRICE,
            DEFAULT_SHARES,
            uint64(block.timestamp + 1 days),
            3
        );
    }

    function test_create_revertsInvalidShares_whenCustomAllowed() public {
        _openAllCreateOptions();
        vm.expectRevert(LibErrors.InvalidShares.selector);
        vm.prank(alice);
        createFacet.createRaffle(
            address(prize), address(prize), 100 ether, 10 ether, 1, uint64(block.timestamp + 1 days), 5
        );

        vm.expectRevert(LibErrors.InvalidShares.selector);
        vm.prank(alice);
        createFacet.createRaffle(
            address(prize),
            address(prize),
            100 ether,
            10 ether,
            LibConstants.MAX_SHARES + 1,
            uint64(block.timestamp + 1 days),
            5
        );
    }

    function test_create_secondRaffle_advancesBothIndexes() public {
        uint256 first = _createDefault(alice);
        uint256 second = _createDefault(alice);
        uint256 bobs = _createDefault(bob);

        assertEq(first, 1);
        assertEq(second, 2);
        assertEq(bobs, 3);

        Raffle memory r = views.getRaffle(second);
        assertEq(r.tokenOrderId, 2);
        assertEq(r.userOrderId, 2);
        assertEq(views.orderIdByPrizeToken(address(prize), 2), second);
        assertEq(views.orderIdByCreator(alice, 2), second);

        Raffle memory b = views.getRaffle(bobs);
        assertEq(b.tokenOrderId, 3);
        assertEq(b.userOrderId, 1);
        assertEq(views.orderIdByPrizeToken(address(prize), 3), bobs);
        assertEq(views.orderIdByCreator(bob, 1), bobs);
        assertEq(prize.balanceOf(address(diamond)), 300_000 ether);
    }

    function test_create_whenOpened_allowsCustomParams() public {
        _openAllCreateOptions();
        vm.prank(alice);
        uint256 id = createFacet.createRaffle(
            address(prize),
            address(payToken),
            50 ether,
            3 ether,
            4,
            uint64(block.timestamp + 1 days),
            LibConstants.MIN_DRAW_DELAY_BLOCKS
        );
        Raffle memory r = views.getRaffle(id);
        assertEq(r.paymentToken, address(payToken));
        assertEq(r.totalShares, 4);
        assertEq(r.pricePerShare, 3 ether);
        assertEq(r.drawDelayBlocks, LibConstants.MIN_DRAW_DELAY_BLOCKS);
    }

    function test_create_revertsInvalidDrawDelay_whenOpened() public {
        _openAllCreateOptions();
        vm.prank(alice);
        vm.expectRevert(LibErrors.InvalidDrawDelay.selector);
        createFacet.createRaffle(
            address(prize),
            address(prize),
            DEFAULT_PRIZE,
            DEFAULT_PRICE,
            4,
            uint64(block.timestamp + 1 days),
            0
        );
        vm.prank(alice);
        vm.expectRevert(LibErrors.InvalidDrawDelay.selector);
        createFacet.createRaffle(
            address(prize),
            address(prize),
            DEFAULT_PRIZE,
            DEFAULT_PRICE,
            4,
            uint64(block.timestamp + 1 days),
            LibConstants.MAX_DRAW_DELAY_BLOCKS + 1
        );
    }

    function test_setProtocolConfig_rejectsDefaultSharesAboveMax() public {
        ProtocolConfig memory cfg = ProtocolConfig({
            allowDifferentTokens: false,
            allowCustomShares: false,
            allowCustomPrice: false,
            allowCustomDrawDelay: false,
            defaultShares: LibConstants.MAX_SHARES + 1,
            priceDivisor: 10,
            defaultDrawDelayBlocks: DEFAULT_DELAY
        });
        vm.expectRevert(LibErrors.InvalidConfig.selector);
        ownership.setProtocolConfig(cfg);
    }

    function test_create_bnbPrize_revertsOnValueMismatch() public {
        vm.expectRevert(LibErrors.InvalidMsgValue.selector);
        createFacet.createRaffle{value: 2 ether}(
            address(0), address(0), 1 ether, 0.1 ether, 11, uint64(block.timestamp + 1 days), 5
        );
    }

    function test_create_erc20Prize_revertsOnMsgValue() public {
        vm.prank(alice);
        vm.expectRevert(LibErrors.InvalidMsgValue.selector);
        createFacet.createRaffle{value: 1}(
            address(prize),
            address(prize),
            DEFAULT_PRIZE,
            DEFAULT_PRICE,
            DEFAULT_SHARES,
            uint64(block.timestamp + 1 days),
            DEFAULT_DELAY
        );
    }

    function test_create_revertsInvalidAmount() public {
        vm.prank(alice);
        vm.expectRevert(LibErrors.InvalidAmount.selector);
        createFacet.createRaffle(
            address(prize), address(prize), 0, DEFAULT_PRICE, DEFAULT_SHARES, uint64(block.timestamp + 1 days), 5
        );
    }

    function test_create_revertsInvalidDeadline() public {
        vm.prank(alice);
        vm.expectRevert(LibErrors.InvalidDeadline.selector);
        createFacet.createRaffle(
            address(prize),
            address(prize),
            DEFAULT_PRIZE,
            DEFAULT_PRICE,
            DEFAULT_SHARES,
            uint64(block.timestamp),
            DEFAULT_DELAY
        );
    }

    function test_init_revertsOnZeroFeeRecipient() public {
        DiamondCutFacet cutFacet = new DiamondCutFacet();
        Diamond d = new Diamond(address(this), address(cutFacet));
        ScoopDiamondInit init_ = new ScoopDiamondInit();
        IDiamondCut.FacetCut[] memory cuts = new IDiamondCut.FacetCut[](0);
        vm.expectRevert(LibErrors.ZeroAddress.selector);
        IDiamondCut(address(d)).diamondCut(cuts, address(init_), abi.encodeCall(init_.init, (address(0))));
    }

    function test_init_revertsWhenCalledTwice() public {
        ScoopDiamondInit init_ = new ScoopDiamondInit();
        vm.expectRevert(LibErrors.AlreadyInitialized.selector);
        IDiamondCut(address(diamond))
            .diamondCut(new IDiamondCut.FacetCut[](0), address(init_), abi.encodeCall(init_.init, (feeRecipient)));
    }

    function test_setFeeRecipient_updatesAndRejectsZero() public {
        address next = makeAddr("nextFee");
        ownership.setFeeRecipient(next);
        assertEq(ownership.feeRecipient(), next);
        vm.expectRevert(LibErrors.ZeroAddress.selector);
        ownership.setFeeRecipient(address(0));
    }
}
