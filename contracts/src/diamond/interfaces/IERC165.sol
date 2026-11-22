// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

/// @title IERC165
/// @notice ERC-165 introspection interface.
interface IERC165 {
    /// @notice Returns true if this contract implements the interface defined by `interfaceId`.
    /// @param interfaceId The ERC-165 interface identifier to query.
    /// @return True if the interface is supported.
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}
