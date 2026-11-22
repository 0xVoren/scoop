// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

interface IDiamondLoupe {
    struct Facet {
        address facetAddress;
        bytes4[] functionSelectors;
    }

    /// @notice Returns all facet addresses and their associated function selectors.
    function facets() external view returns (Facet[] memory facets_);

    /// @notice Returns all function selectors supported by a given facet.
    function facetFunctionSelectors(address _facet) external view returns (bytes4[] memory facetFunctionSelectors_);

    /// @notice Returns all facet addresses in the Diamond.
    function facetAddresses() external view returns (address[] memory facetAddresses_);

    /// @notice Returns the facet address that implements the given function selector.
    function facetAddress(bytes4 _functionSelector) external view returns (address facetAddress_);
}
