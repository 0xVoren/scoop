// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

/// @title ERC-173 contract ownership standard
interface IERC173 {
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /// @notice Returns the address of the current owner.
    function owner() external view returns (address owner_);

    /// @notice Transfers contract ownership to `_newOwner`.
    /// @param _newOwner Address of the new owner.
    function transferOwnership(address _newOwner) external;
}
