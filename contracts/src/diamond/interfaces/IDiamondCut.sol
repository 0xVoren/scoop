// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

/// @title IDiamondCut — EIP-2535 Diamond cut interface for adding, replacing, and removing facets.
interface IDiamondCut {
    enum FacetCutAction {
        Add,
        Replace,
        Remove
    }

    struct FacetCut {
        address facetAddress;
        FacetCutAction action;
        bytes4[] functionSelectors;
    }

    /// @notice Add, replace, or remove facet functions on the Diamond.
    /// @param _diamondCut Array of FacetCut structs describing each selector change.
    /// @param _init Address of the initializer contract to delegatecall after the cut; pass address(0) to skip.
    /// @param _calldata Calldata forwarded to `_init`; ignored when `_init` is address(0).
    function diamondCut(FacetCut[] calldata _diamondCut, address _init, bytes calldata _calldata) external;

    event DiamondCut(FacetCut[] _diamondCut, address _init, bytes _calldata);
}
