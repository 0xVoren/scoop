// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {LibDiamond} from "../diamond/libraries/LibDiamond.sol";
import {IERC173} from "../diamond/interfaces/IERC173.sol";
import {LibAppStorage, AppStorage, ProtocolConfig} from "../storage/AppStorage.sol";
import {LibConstants} from "../libraries/LibConstants.sol";
import {LibErrors} from "../libraries/LibErrors.sol";

/// @title OwnershipFacet — Two-step ownership management (IERC173 / Ownable2Step).
/// @notice Transferring to address(0) renounces ownership immediately without the two-step confirmation.
/// @dev `feeRecipient` is the protocol fee sink (EOA or contract). It receives 1% of creator
///      proceeds (`raised / 100`) on `claimProceeds` only. Future locker dividends attach by
///      `setFeeRecipient` to a splitter — see docs/PROTOCOL.md; do not bake splits into raffles.
///      The winner receives 100% of the prize. Create does not charge a fee. The owner cannot
///      rewrite a raffle's economics, only this recipient.
contract OwnershipFacet is IERC173 {
    /// @notice Emitted when the owner changes the protocol fee recipient.
    /// @param previousRecipient Previous recipient. Zero before init is observed only off the happy path.
    /// @param newRecipient New non-zero recipient.
    event FeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);

    /// @notice Initiates an ownership transfer. Passing address(0) renounces ownership immediately.
    /// @param _newOwner The candidate new owner, or address(0) to renounce.
    function transferOwnership(address _newOwner) external override {
        LibDiamond.enforceIsContractOwner();
        if (_newOwner == address(0)) {
            // Renounce immediately — no two-step required.
            LibDiamond.setContractOwner(address(0));
        } else {
            // Two-step transfer: record pendingOwner; ownership changes only after acceptOwnership().
            LibDiamond.setPendingOwner(_newOwner);
        }
    }

    /// @notice Completes a pending ownership transfer. Must be called by the pending owner.
    function acceptOwnership() external {
        LibDiamond.acceptPendingOwner();
    }

    /// @notice Returns the current contract owner.
    /// @return owner_ The current owner address.
    function owner() external view override returns (address owner_) {
        owner_ = LibDiamond.contractOwner();
    }

    /// @notice Returns the pending owner waiting to accept ownership, or address(0) if none.
    /// @return The pending owner address.
    function pendingOwner() external view returns (address) {
        return LibDiamond.pendingOwner();
    }

    /// @notice Set the address that receives the 1% creator-proceeds fee.
    /// @dev Owner only. Reverts before init and on `address(0)`. Does not move funds.
    /// @param feeRecipient_ New non-zero recipient.
    function setFeeRecipient(address feeRecipient_) external {
        LibDiamond.enforceIsContractOwner();
        AppStorage storage s = LibAppStorage.appStorage();
        if (!s.initialized) revert LibErrors.NotInitialized();
        if (feeRecipient_ == address(0)) revert LibErrors.ZeroAddress();

        address previous = s.feeRecipient;
        s.feeRecipient = feeRecipient_;
        emit FeeRecipientUpdated(previous, feeRecipient_);
    }

    /// @notice Return the current protocol fee recipient.
    /// @return recipient Address paid 1% of raised on `claimProceeds`. Zero if init has not run.
    function feeRecipient() external view returns (address recipient) {
        recipient = LibAppStorage.appStorage().feeRecipient;
    }

    event ProtocolConfigUpdated(
        bool allowDifferentTokens,
        bool allowCustomShares,
        bool allowCustomPrice,
        bool allowCustomDrawDelay,
        uint32 defaultShares,
        uint32 priceDivisor,
        uint32 defaultDrawDelayBlocks
    );

    /// @notice Owner updates progressive create gates. Opening a flag unlocks that create param.
    function setProtocolConfig(ProtocolConfig calldata cfg) external {
        LibDiamond.enforceIsContractOwner();
        AppStorage storage s = LibAppStorage.appStorage();
        if (!s.initialized) revert LibErrors.NotInitialized();
        if (
            cfg.defaultShares < LibConstants.MIN_SHARES
                || cfg.defaultShares > LibConstants.MAX_SHARES
        ) {
            revert LibErrors.InvalidConfig();
        }
        if (cfg.priceDivisor == 0) revert LibErrors.InvalidConfig();
        if (
            cfg.defaultDrawDelayBlocks < LibConstants.MIN_DRAW_DELAY_BLOCKS
                || cfg.defaultDrawDelayBlocks > LibConstants.MAX_DRAW_DELAY_BLOCKS
        ) {
            revert LibErrors.InvalidConfig();
        }

        s.protocolConfig = cfg;
        emit ProtocolConfigUpdated(
            cfg.allowDifferentTokens,
            cfg.allowCustomShares,
            cfg.allowCustomPrice,
            cfg.allowCustomDrawDelay,
            cfg.defaultShares,
            cfg.priceDivisor,
            cfg.defaultDrawDelayBlocks
        );
    }
}
