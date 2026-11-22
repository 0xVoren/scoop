// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {Script, console} from "forge-std/Script.sol";
import {Diamond} from "../src/diamond/Diamond.sol";
import {DiamondCutFacet} from "../src/facets/DiamondCutFacet.sol";
import {DiamondLoupeFacet} from "../src/facets/DiamondLoupeFacet.sol";
import {OwnershipFacet} from "../src/facets/OwnershipFacet.sol";
import {RaffleCreateFacet} from "../src/facets/RaffleCreateFacet.sol";
import {RaffleBuyFacet} from "../src/facets/RaffleBuyFacet.sol";
import {RaffleDrawFacet} from "../src/facets/RaffleDrawFacet.sol";
import {RaffleClaimFacet} from "../src/facets/RaffleClaimFacet.sol";
import {RaffleViewsFacet} from "../src/facets/RaffleViewsFacet.sol";
import {IDiamondCut} from "../src/diamond/interfaces/IDiamondCut.sol";
import {ScoopDiamondInit} from "../src/upgradeInitializers/ScoopDiamondInit.sol";

/// @dev Production-style deploy. Env:
///   PRIVATE_KEY, FEE_RECIPIENT (optional; defaults to msg.sender)
///   forge script script/DeployScoopDiamond.s.sol --rpc-url $BSC_RPC --broadcast --verify
contract DeployScoopDiamond is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address feeRecipient = vm.envOr("FEE_RECIPIENT", vm.addr(pk));
        address owner = vm.addr(pk);

        vm.startBroadcast(pk);

        DiamondCutFacet cutFacet = new DiamondCutFacet();
        Diamond diamond = new Diamond(owner, address(cutFacet));

        ScoopDiamondInit diamondInit = new ScoopDiamondInit();
        IDiamondCut(address(diamond))
            .diamondCut(_buildCuts(), address(diamondInit), abi.encodeCall(diamondInit.init, (feeRecipient)));

        vm.stopBroadcast();

        console.log("=== Scoop Diamond Deploy ===");
        console.log("Diamond:", address(diamond));
        console.log("Owner:", owner);
        console.log("FeeRecipient:", feeRecipient);
    }

    function _buildCuts() internal returns (IDiamondCut.FacetCut[] memory cuts) {
        // Same cut set as DeployLocal — keep in sync manually.
        cuts = new IDiamondCut.FacetCut[](7);
        cuts[0] = _loupeCut();
        cuts[1] = _ownershipCut();
        cuts[2] = _createCut();
        cuts[3] = _buyCut();
        cuts[4] = _drawCut();
        cuts[5] = _claimCut();
        cuts[6] = _viewsCut();
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
