// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {Test} from "forge-std/Test.sol";
import {Diamond} from "../src/diamond/Diamond.sol";
import {DiamondCutFacet} from "../src/facets/DiamondCutFacet.sol";
import {DiamondLoupeFacet} from "../src/facets/DiamondLoupeFacet.sol";
import {OwnershipFacet} from "../src/facets/OwnershipFacet.sol";
import {IDiamondCut} from "../src/diamond/interfaces/IDiamondCut.sol";
import {IDiamondLoupe} from "../src/diamond/interfaces/IDiamondLoupe.sol";

/// @title DiamondSmoke
/// @notice Deploys the Diamond, cuts loupe and ownership, and checks those selectors are registered.
contract DiamondSmoke is Test {
    function test_deploy_cutsLoupeAndOwnership() public {
        address owner = makeAddr("owner");

        DiamondCutFacet diamondCutFacet = new DiamondCutFacet();
        Diamond diamond = new Diamond(owner, address(diamondCutFacet));

        DiamondLoupeFacet loupeFacet = new DiamondLoupeFacet();
        OwnershipFacet ownershipFacet = new OwnershipFacet();

        IDiamondCut.FacetCut[] memory cuts = new IDiamondCut.FacetCut[](2);
        cuts[0] = _loupeCut(loupeFacet);
        cuts[1] = _ownershipCut(ownershipFacet);

        vm.prank(owner);
        IDiamondCut(address(diamond)).diamondCut(cuts, address(0), "");

        IDiamondLoupe loupe = IDiamondLoupe(address(diamond));
        IDiamondLoupe.Facet[] memory facetList = loupe.facets();
        assertGe(facetList.length, 1);
        assertEq(loupe.facetAddress(IDiamondCut.diamondCut.selector), address(diamondCutFacet));
        assertEq(loupe.facetAddress(loupeFacet.facets.selector), address(loupeFacet));
        assertEq(loupe.facetAddress(ownershipFacet.owner.selector), address(ownershipFacet));
        assertEq(OwnershipFacet(address(diamond)).owner(), owner);
    }

    function _loupeCut(DiamondLoupeFacet f) internal pure returns (IDiamondCut.FacetCut memory) {
        bytes4[] memory s = new bytes4[](5);
        s[0] = f.facets.selector;
        s[1] = f.facetFunctionSelectors.selector;
        s[2] = f.facetAddresses.selector;
        s[3] = f.facetAddress.selector;
        s[4] = f.supportsInterface.selector;
        return IDiamondCut.FacetCut(address(f), IDiamondCut.FacetCutAction.Add, s);
    }

    function _ownershipCut(OwnershipFacet f) internal pure returns (IDiamondCut.FacetCut memory) {
        bytes4[] memory s = new bytes4[](4);
        s[0] = f.transferOwnership.selector;
        s[1] = f.owner.selector;
        s[2] = f.acceptOwnership.selector;
        s[3] = f.pendingOwner.selector;
        return IDiamondCut.FacetCut(address(f), IDiamondCut.FacetCutAction.Add, s);
    }
}
