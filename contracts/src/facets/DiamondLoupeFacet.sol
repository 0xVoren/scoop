// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {LibDiamond} from "../diamond/libraries/LibDiamond.sol";
import {IDiamondLoupe} from "../diamond/interfaces/IDiamondLoupe.sol";
import {IERC165} from "../diamond/interfaces/IERC165.sol";

/// @title DiamondLoupeFacet — EIP-2535 loupe implementation with ERC-165 support.
contract DiamondLoupeFacet is IDiamondLoupe, IERC165 {
    /// @notice Returns all facets and their function selectors registered in the Diamond.
    /// @return facets_ Array of Facet structs, each containing a facet address and its selectors.
    function facets() external view override returns (Facet[] memory facets_) {
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        uint256 numFacets = ds.facetAddresses.length;
        facets_ = new Facet[](numFacets);
        for (uint256 i; i < numFacets; i++) {
            address facetAddress_ = ds.facetAddresses[i];
            facets_[i].facetAddress = facetAddress_;
            facets_[i].functionSelectors = ds.facetFunctionSelectors[facetAddress_].functionSelectors;
        }
    }

    /// @notice Returns all function selectors registered to a given facet address.
    /// @param _facet The facet address to query.
    /// @return facetFunctionSelectors_ Array of 4-byte function selectors belonging to `_facet`.
    function facetFunctionSelectors(address _facet)
        external
        view
        override
        returns (bytes4[] memory facetFunctionSelectors_)
    {
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        facetFunctionSelectors_ = ds.facetFunctionSelectors[_facet].functionSelectors;
    }

    /// @notice Returns the addresses of all facets currently registered in the Diamond.
    /// @return facetAddresses_ Array of facet addresses.
    function facetAddresses() external view override returns (address[] memory facetAddresses_) {
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        facetAddresses_ = ds.facetAddresses;
    }

    /// @notice Returns the facet address that implements a given function selector.
    /// @param _functionSelector The 4-byte selector to look up.
    /// @return facetAddress_ The facet address implementing `_functionSelector`, or address(0) if not found.
    function facetAddress(bytes4 _functionSelector) external view override returns (address facetAddress_) {
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        facetAddress_ = ds.selectorToFacetAndPosition[_functionSelector].facetAddress;
    }

    /// @notice Returns true if the Diamond declares support for the given ERC-165 interface.
    /// @param _interfaceId The 4-byte interface identifier to check.
    /// @return True if `_interfaceId` is supported, false otherwise.
    function supportsInterface(bytes4 _interfaceId) external view override returns (bool) {
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        return ds.supportedInterfaces[_interfaceId];
    }
}
