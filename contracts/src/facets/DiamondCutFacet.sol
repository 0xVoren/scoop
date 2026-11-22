// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {IDiamondCut} from "../diamond/interfaces/IDiamondCut.sol";
import {LibDiamond} from "../diamond/libraries/LibDiamond.sol";

/// @title DiamondCutFacet — owner-gated facet management for the EIP-2535 Diamond.
contract DiamondCutFacet is IDiamondCut {
    /// @notice Add, replace, or remove facet selectors. Caller must be the contract owner.
    /// @param _diamondCut Array of facet cuts (facet address, action, selectors).
    /// @param _init Address of the initializer contract, or address(0) for none.
    /// @param _calldata Calldata passed to _init via delegatecall, or empty if _init is address(0).
    function diamondCut(FacetCut[] calldata _diamondCut, address _init, bytes calldata _calldata) external override {
        LibDiamond.enforceIsContractOwner();
        LibDiamond.diamondCut(_diamondCut, _init, _calldata);
    }
}
