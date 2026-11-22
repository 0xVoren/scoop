// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {LibAppStorage, AppStorage, ProtocolConfig} from "../storage/AppStorage.sol";
import {LibDiamond} from "../diamond/libraries/LibDiamond.sol";
import {LibConstants} from "../libraries/LibConstants.sol";
import {LibErrors} from "../libraries/LibErrors.sol";
import {IDiamondCut} from "../diamond/interfaces/IDiamondCut.sol";
import {IDiamondLoupe} from "../diamond/interfaces/IDiamondLoupe.sol";
import {IERC173} from "../diamond/interfaces/IERC173.sol";
import {IERC165} from "../diamond/interfaces/IERC165.sol";

/// @title ScoopDiamondInit
/// @notice One-time Diamond initializer. Must be `delegatecall`ed from `diamondCut`, not cut in as a facet.
/// @dev Registers ERC-165 ids for cut, loupe, ERC-173, and ERC-165, matching the Diamond constructor.
///      Fee is not configured here beyond the recipient. Create charges nothing. `claimProceeds` later
///      sends 1% of raised (`raised / 100`) to `feeRecipient`. The winner receives 100% of the prize.
contract ScoopDiamondInit {
    /// @notice Initialize app storage. Reverts if called again or if `feeRecipient_` is zero.
    /// @param feeRecipient_ Address that will receive the 1% creator-proceeds fee on later claims.
    function init(address feeRecipient_) external {
        AppStorage storage s = LibAppStorage.appStorage();
        if (s.initialized) revert LibErrors.AlreadyInitialized();
        if (feeRecipient_ == address(0)) revert LibErrors.ZeroAddress();

        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        ds.supportedInterfaces[type(IERC165).interfaceId] = true;
        ds.supportedInterfaces[type(IDiamondCut).interfaceId] = true;
        ds.supportedInterfaces[type(IDiamondLoupe).interfaceId] = true;
        ds.supportedInterfaces[type(IERC173).interfaceId] = true;

        s.initialized = true;
        s.feeRecipient = feeRecipient_;
        s.nextOrderId = 1;
        // Launch: same token, 11 shares, price = prize/10, draw delay = 5. Owner opens flags later.
        s.protocolConfig = ProtocolConfig({
            allowDifferentTokens: false,
            allowCustomShares: false,
            allowCustomPrice: false,
            allowCustomDrawDelay: false,
            defaultShares: LibConstants.LAUNCH_SHARES,
            priceDivisor: LibConstants.LAUNCH_PRICE_DIVISOR,
            defaultDrawDelayBlocks: LibConstants.LAUNCH_DRAW_DELAY_BLOCKS
        });
    }
}
