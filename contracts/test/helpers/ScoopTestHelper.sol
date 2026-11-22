// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {Test} from "forge-std/Test.sol";
import {Diamond} from "../../src/diamond/Diamond.sol";
import {DiamondCutFacet} from "../../src/facets/DiamondCutFacet.sol";
import {DiamondLoupeFacet} from "../../src/facets/DiamondLoupeFacet.sol";
import {OwnershipFacet} from "../../src/facets/OwnershipFacet.sol";
import {RaffleCreateFacet} from "../../src/facets/RaffleCreateFacet.sol";
import {RaffleBuyFacet} from "../../src/facets/RaffleBuyFacet.sol";
import {RaffleDrawFacet} from "../../src/facets/RaffleDrawFacet.sol";
import {RaffleClaimFacet} from "../../src/facets/RaffleClaimFacet.sol";
import {RaffleViewsFacet} from "../../src/facets/RaffleViewsFacet.sol";
import {IDiamondCut} from "../../src/diamond/interfaces/IDiamondCut.sol";
import {ScoopDiamondInit} from "../../src/upgradeInitializers/ScoopDiamondInit.sol";
import {ProtocolConfig, Raffle, RaffleStatus} from "../../src/storage/AppStorage.sol";
import {MockERC20} from "./MockERC20.sol";

/// @title ScoopTestHelper
/// @notice Deploys the full Scoop Diamond with all raffle facets cut and initialized.
abstract contract ScoopTestHelper is Test {
    Diamond public diamond;
    MockERC20 public prize;
    MockERC20 public payToken;
    ScoopDiamondInit public diamondInit;

    RaffleCreateFacet internal createFacet;
    RaffleBuyFacet internal buyFacet;
    RaffleDrawFacet internal drawFacet;
    RaffleClaimFacet internal claimFacet;
    RaffleViewsFacet internal views;
    OwnershipFacet internal ownership;

    address public alice;
    address public bob;
    address public feeRecipient;

    uint256 internal constant MINT_AMOUNT = 1_000_000 ether;
    uint128 internal constant DEFAULT_PRIZE = 100_000 ether;
    /// @dev Launch lock: pricePerShare = prizeAmount / 10.
    uint128 internal constant DEFAULT_PRICE = 10_000 ether;
    uint32 internal constant DEFAULT_SHARES = 11;
    uint32 internal constant DEFAULT_DELAY = 5;

    function setUp() public virtual {
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        feeRecipient = makeAddr("feeRecipient");

        prize = new MockERC20("Prize", "PRIZE");
        payToken = new MockERC20("Pay", "PAY");
        _deployDiamond();
        _fundUsers();
    }

    function _deployDiamond() internal {
        DiamondCutFacet diamondCutFacet = new DiamondCutFacet();
        diamond = new Diamond(address(this), address(diamondCutFacet));

        IDiamondCut.FacetCut[] memory cuts = new IDiamondCut.FacetCut[](7);
        cuts[0] = _loupeCut();
        cuts[1] = _ownershipCut();
        cuts[2] = _createCut();
        cuts[3] = _buyCut();
        cuts[4] = _drawCut();
        cuts[5] = _claimCut();
        cuts[6] = _viewsCut();

        diamondInit = new ScoopDiamondInit();
        IDiamondCut(address(diamond))
            .diamondCut(cuts, address(diamondInit), abi.encodeCall(diamondInit.init, (feeRecipient)));

        createFacet = RaffleCreateFacet(address(diamond));
        buyFacet = RaffleBuyFacet(address(diamond));
        drawFacet = RaffleDrawFacet(address(diamond));
        claimFacet = RaffleClaimFacet(address(diamond));
        views = RaffleViewsFacet(address(diamond));
        ownership = OwnershipFacet(address(diamond));
    }

    function _fundUsers() internal {
        prize.mint(alice, MINT_AMOUNT);
        prize.mint(bob, MINT_AMOUNT);
        payToken.mint(alice, MINT_AMOUNT);
        payToken.mint(bob, MINT_AMOUNT);

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(address(this), 100 ether);

        vm.prank(alice);
        prize.approve(address(diamond), type(uint256).max);
        vm.prank(alice);
        payToken.approve(address(diamond), type(uint256).max);
        vm.prank(bob);
        prize.approve(address(diamond), type(uint256).max);
        vm.prank(bob);
        payToken.approve(address(diamond), type(uint256).max);
    }

    function _createDefault(address creator) internal returns (uint256 orderId) {
        // Launch defaults: same token, 11 shares, price = prize/10, delay = 5.
        vm.prank(creator);
        orderId = createFacet.createRaffle(
            address(prize),
            address(prize),
            DEFAULT_PRIZE,
            DEFAULT_PRICE,
            DEFAULT_SHARES,
            uint64(block.timestamp + 1 days),
            DEFAULT_DELAY
        );
    }

    function _openAllCreateOptions() internal {
        ProtocolConfig memory cfg = ProtocolConfig({
            allowDifferentTokens: true,
            allowCustomShares: true,
            allowCustomPrice: true,
            allowCustomDrawDelay: true,
            defaultShares: DEFAULT_SHARES,
            priceDivisor: 10,
            defaultDrawDelayBlocks: DEFAULT_DELAY
        });
        ownership.setProtocolConfig(cfg);
    }

    function _buy(address buyer, uint256 orderId, uint32 count) internal {
        Raffle memory r = views.getRaffle(orderId);
        if (r.paymentToken == address(0)) {
            uint256 value = uint256(r.pricePerShare) * uint256(count);
            vm.prank(buyer);
            buyFacet.buyShares{value: value}(orderId, count);
        } else {
            vm.prank(buyer);
            buyFacet.buyShares(orderId, count);
        }
    }

    function _sellOut(address creator, address buyer) internal returns (uint256 orderId) {
        orderId = _createDefault(creator);
        _buy(buyer, orderId, DEFAULT_SHARES);
    }

    function _drawDefault() internal returns (uint256 orderId, address winner) {
        orderId = _sellOut(alice, bob);
        Raffle memory r = views.getRaffle(orderId);
        vm.roll(uint256(r.soldOutBlock) + uint256(r.drawDelayBlocks) + 1);
        drawFacet.draw(orderId);
        r = views.getRaffle(orderId);
        winner = views.shareOwner(orderId, r.winnerShareIndex);
    }

    function _loupeCut() internal returns (IDiamondCut.FacetCut memory) {
        DiamondLoupeFacet f = new DiamondLoupeFacet();
        bytes4[] memory s = new bytes4[](5);
        s[0] = f.facets.selector;
        s[1] = f.facetFunctionSelectors.selector;
        s[2] = f.facetAddresses.selector;
        s[3] = f.facetAddress.selector;
        s[4] = f.supportsInterface.selector;
        return IDiamondCut.FacetCut(address(f), IDiamondCut.FacetCutAction.Add, s);
    }

    function _ownershipCut() internal returns (IDiamondCut.FacetCut memory) {
        OwnershipFacet f = new OwnershipFacet();
        bytes4[] memory s = new bytes4[](7);
        s[0] = f.transferOwnership.selector;
        s[1] = f.owner.selector;
        s[2] = f.acceptOwnership.selector;
        s[3] = f.pendingOwner.selector;
        s[4] = f.setFeeRecipient.selector;
        s[5] = f.feeRecipient.selector;
        s[6] = f.setProtocolConfig.selector;
        return IDiamondCut.FacetCut(address(f), IDiamondCut.FacetCutAction.Add, s);
    }

    function _createCut() internal returns (IDiamondCut.FacetCut memory) {
        RaffleCreateFacet f = new RaffleCreateFacet();
        bytes4[] memory s = new bytes4[](1);
        s[0] = f.createRaffle.selector;
        return IDiamondCut.FacetCut(address(f), IDiamondCut.FacetCutAction.Add, s);
    }

    function _buyCut() internal returns (IDiamondCut.FacetCut memory) {
        RaffleBuyFacet f = new RaffleBuyFacet();
        bytes4[] memory s = new bytes4[](1);
        s[0] = f.buyShares.selector;
        return IDiamondCut.FacetCut(address(f), IDiamondCut.FacetCutAction.Add, s);
    }

    function _drawCut() internal returns (IDiamondCut.FacetCut memory) {
        RaffleDrawFacet f = new RaffleDrawFacet();
        bytes4[] memory s = new bytes4[](2);
        s[0] = f.draw.selector;
        s[1] = f.drawMany.selector;
        return IDiamondCut.FacetCut(address(f), IDiamondCut.FacetCutAction.Add, s);
    }

    function _claimCut() internal returns (IDiamondCut.FacetCut memory) {
        RaffleClaimFacet f = new RaffleClaimFacet();
        bytes4[] memory s = new bytes4[](4);
        s[0] = f.claimPrize.selector;
        s[1] = f.claimProceeds.selector;
        s[2] = f.refund.selector;
        s[3] = f.recoverPrize.selector;
        return IDiamondCut.FacetCut(address(f), IDiamondCut.FacetCutAction.Add, s);
    }

    function _viewsCut() internal returns (IDiamondCut.FacetCut memory) {
        RaffleViewsFacet f = new RaffleViewsFacet();
        // feeRecipient lives on OwnershipFacet (same selector cannot be cut twice).
        bytes4[] memory s = new bytes4[](13);
        s[0] = f.getRaffle.selector;
        s[1] = f.shareOwner.selector;
        s[2] = f.shareCount.selector;
        s[3] = f.buyerPaid.selector;
        s[4] = f.buyerRefunded.selector;
        s[5] = f.pendingDrawCount.selector;
        s[6] = f.pendingDrawAt.selector;
        s[7] = f.orderIdByPrizeToken.selector;
        s[8] = f.orderIdByCreator.selector;
        s[9] = f.nextOrderId.selector;
        s[10] = f.tokenOrderCount.selector;
        s[11] = f.userOrderCount.selector;
        s[12] = f.protocolConfig.selector;
        return IDiamondCut.FacetCut(address(f), IDiamondCut.FacetCutAction.Add, s);
    }
}
