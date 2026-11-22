// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

enum RaffleStatus {
    Selling, // 0
    SoldOut, // 1
    Drawn, // 2
    Expired // 3
}

/// @notice Progressive create-time gates. Launch locked; owner flips flags to open options.
struct ProtocolConfig {
    bool allowDifferentTokens;
    bool allowCustomShares;
    bool allowCustomPrice;
    bool allowCustomDrawDelay;
    uint32 defaultShares;
    uint32 priceDivisor;
    uint32 defaultDrawDelayBlocks;
}

struct Raffle {
    address creator;
    address prizeToken;
    address paymentToken;
    uint128 prizeAmount;
    uint128 pricePerShare;
    uint32 totalShares;
    uint32 soldShares;
    uint64 deadline;
    uint32 drawDelayBlocks;
    uint64 soldOutBlock;
    uint64 drawBlock;
    uint32 winnerShareIndex;
    uint32 tokenOrderId;
    uint32 userOrderId;
    RaffleStatus status;
    bool prizeClaimed;
    bool proceedsClaimed;
    bool prizeRecovered;
}

struct AppStorage {
    bool initialized;
    address feeRecipient;
    ProtocolConfig protocolConfig;
    uint256 nextOrderId; // starts at 1 after init
    mapping(uint256 => Raffle) raffles;
    mapping(uint256 => mapping(uint32 => address)) shareOwner; // orderId => shareIndex => buyer
    mapping(uint256 => mapping(address => uint32)) shareCount; // orderId => buyer => count
    mapping(uint256 => mapping(address => uint256)) buyerPaid; // orderId => buyer => payment amount
    mapping(uint256 => mapping(address => bool)) buyerRefunded;
    mapping(address => uint32) tokenOrderCount; // prizeToken => count
    mapping(address => mapping(uint32 => uint256)) tokenOrderIdToOrderId;
    mapping(address => uint32) userOrderCount; // creator => count
    mapping(address => mapping(uint32 => uint256)) userOrderIdToOrderId;
    // pending draw enumerable set
    uint256[] pendingDrawIds;
    mapping(uint256 => uint256) pendingDrawIndex; // orderId => index+1 (0 = absent)
}

/// @title LibAppStorage
/// @notice Diamond app storage at `keccak256("scoop.app.storage")`.
library LibAppStorage {
    bytes32 constant STORAGE_SLOT = keccak256("scoop.app.storage");

    function appStorage() internal pure returns (AppStorage storage s) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            s.slot := slot
        }
    }
}
