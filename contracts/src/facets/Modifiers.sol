// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {LibErrors} from "../libraries/LibErrors.sol";

abstract contract Modifiers {
    bytes32 private constant _REENTRANCY_GUARD_SLOT = keccak256("scoop.reentrancy.guard");
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    modifier nonReentrant() {
        bytes32 slot = _REENTRANCY_GUARD_SLOT;
        uint256 status;
        assembly {
            status := sload(slot)
        }
        if (status == _ENTERED) revert LibErrors.ReentrantCall();
        assembly {
            sstore(slot, _ENTERED)
        }
        _;
        assembly {
            sstore(slot, _NOT_ENTERED)
        }
    }
}
