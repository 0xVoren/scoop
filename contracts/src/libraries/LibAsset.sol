// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {LibErrors} from "./LibErrors.sol";

/// @title LibAsset
/// @notice Pull and push native BNB (`address(0)`) or ERC-20 into the Diamond.
/// @dev Callers must be `payable` and use `msg.value` on only one asset path per call.
///      ERC-20 pulls use balance-before/after accounting so fee-on-transfer tokens cannot
///      under-credit the vault while still recording full `amount` in raffle books.
///      Unsupported / rejected classes (document + tests): fee-on-transfer, rebasing that
///      shrinks balances mid-flight, pause that reverts transfers. Pausable tokens that
///      revert on transfer fail the call; silent under-delivery reverts with TransferAmountMismatch.
library LibAsset {
    using SafeERC20 for IERC20;

    function pull(address token, address from, uint256 amount) internal {
        if (amount == 0) revert LibErrors.InvalidAmount();
        if (token == address(0)) {
            if (msg.value != amount) revert LibErrors.InvalidMsgValue();
        } else {
            if (msg.value != 0) revert LibErrors.InvalidMsgValue();
            uint256 beforeBal = IERC20(token).balanceOf(address(this));
            IERC20(token).safeTransferFrom(from, address(this), amount);
            uint256 received = IERC20(token).balanceOf(address(this)) - beforeBal;
            if (received != amount) revert LibErrors.TransferAmountMismatch();
        }
    }

    function push(address token, address to, uint256 amount) internal {
        if (amount == 0) return;
        if (to == address(0)) revert LibErrors.ZeroAddress();
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            require(ok, "BNB transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
