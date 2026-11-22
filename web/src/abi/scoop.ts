export const scoopAbi = [
  {
    type: 'function',
    name: 'createRaffle',
    inputs: [
      {
        name: 'prizeToken',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'paymentToken',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'prizeAmount',
        type: 'uint128',
        internalType: 'uint128',
      },
      {
        name: 'pricePerShare',
        type: 'uint128',
        internalType: 'uint128',
      },
      {
        name: 'totalShares',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: 'deadline',
        type: 'uint64',
        internalType: 'uint64',
      },
      {
        name: 'drawDelayBlocks',
        type: 'uint32',
        internalType: 'uint32',
      },
    ],
    outputs: [
      {
        name: 'orderId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'payable',
  },
  {
    type: 'event',
    name: 'RaffleCreated',
    inputs: [
      {
        name: 'orderId',
        type: 'uint256',
        indexed: true,
        internalType: 'uint256',
      },
      {
        name: 'creator',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'prizeToken',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'paymentToken',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
      {
        name: 'prizeAmount',
        type: 'uint128',
        indexed: false,
        internalType: 'uint128',
      },
      {
        name: 'pricePerShare',
        type: 'uint128',
        indexed: false,
        internalType: 'uint128',
      },
      {
        name: 'totalShares',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
      {
        name: 'deadline',
        type: 'uint64',
        indexed: false,
        internalType: 'uint64',
      },
      {
        name: 'drawDelayBlocks',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
      {
        name: 'tokenOrderId',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
      {
        name: 'userOrderId',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'DrawDelayLocked',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidAmount',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidConfig',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidDeadline',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidDrawDelay',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidMsgValue',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidShares',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotInitialized',
    inputs: [],
  },
  {
    type: 'error',
    name: 'PriceLocked',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ReentrantCall',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SafeERC20FailedOperation',
    inputs: [
      {
        name: 'token',
        type: 'address',
        internalType: 'address',
      },
    ],
  },
  {
    type: 'error',
    name: 'SharesLocked',
    inputs: [],
  },
  {
    type: 'error',
    name: 'TokenMismatch',
    inputs: [],
  },
  {
    type: 'function',
    name: 'buyShares',
    inputs: [
      {
        name: 'orderId',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'count',
        type: 'uint32',
        internalType: 'uint32',
      },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'event',
    name: 'SharesPurchased',
    inputs: [
      {
        name: 'orderId',
        type: 'uint256',
        indexed: true,
        internalType: 'uint256',
      },
      {
        name: 'buyer',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'count',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
      {
        name: 'startIndex',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'SoldOut',
    inputs: [
      {
        name: 'orderId',
        type: 'uint256',
        indexed: true,
        internalType: 'uint256',
      },
      {
        name: 'prizeToken',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'soldOutBlock',
        type: 'uint64',
        indexed: false,
        internalType: 'uint64',
      },
      {
        name: 'eligibleBlock',
        type: 'uint64',
        indexed: false,
        internalType: 'uint64',
      },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'DeadlinePassed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InsufficientShares',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotSelling',
    inputs: [],
  },
  {
    type: 'function',
    name: 'draw',
    inputs: [
      {
        name: 'orderId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'drawMany',
    inputs: [
      {
        name: 'orderIds',
        type: 'uint256[]',
        internalType: 'uint256[]',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'Drawn',
    inputs: [
      {
        name: 'orderId',
        type: 'uint256',
        indexed: true,
        internalType: 'uint256',
      },
      {
        name: 'winnerShareIndex',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
      {
        name: 'drawBlock',
        type: 'uint64',
        indexed: false,
        internalType: 'uint64',
      },
      {
        name: 'winner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'DrawTooEarly',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NoBlockhash',
    inputs: [],
  },
  {
    type: 'error',
    name: 'DrawEntropyExpired',
    inputs: [],
  },
  {
    type: 'error',
    name: 'TransferAmountMismatch',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotPendingDraw',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotSoldOut',
    inputs: [],
  },
  {
    type: 'function',
    name: 'claimPrize',
    inputs: [
      {
        name: 'orderId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claimProceeds',
    inputs: [
      {
        name: 'orderId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'recoverPrize',
    inputs: [
      {
        name: 'orderId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'refund',
    inputs: [
      {
        name: 'orderId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'PrizeClaimed',
    inputs: [
      {
        name: 'orderId',
        type: 'uint256',
        indexed: true,
        internalType: 'uint256',
      },
      {
        name: 'winner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'PrizeRecovered',
    inputs: [
      {
        name: 'orderId',
        type: 'uint256',
        indexed: true,
        internalType: 'uint256',
      },
      {
        name: 'creator',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ProceedsClaimed',
    inputs: [
      {
        name: 'orderId',
        type: 'uint256',
        indexed: true,
        internalType: 'uint256',
      },
      {
        name: 'creator',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'creatorAmount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'feeAmount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Refunded',
    inputs: [
      {
        name: 'orderId',
        type: 'uint256',
        indexed: true,
        internalType: 'uint256',
      },
      {
        name: 'buyer',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'AlreadyRefunded',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotCreator',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotDrawn',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotExpired',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotWinner',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NothingToRefund',
    inputs: [],
  },
  {
    type: 'error',
    name: 'PrizeAlreadyClaimed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'PrizeAlreadyRecovered',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ProceedsAlreadyClaimed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ZeroAddress',
    inputs: [],
  },
  {
    type: 'function',
    name: 'buyerPaid',
    inputs: [
      {
        name: 'orderId',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'user',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'buyerRefunded',
    inputs: [
      {
        name: 'orderId',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'user',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getRaffle',
    inputs: [
      {
        name: 'orderId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [
      {
        name: 'raffle',
        type: 'tuple',
        internalType: 'struct Raffle',
        components: [
          {
            name: 'creator',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'prizeToken',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'paymentToken',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'prizeAmount',
            type: 'uint128',
            internalType: 'uint128',
          },
          {
            name: 'pricePerShare',
            type: 'uint128',
            internalType: 'uint128',
          },
          {
            name: 'totalShares',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'soldShares',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'deadline',
            type: 'uint64',
            internalType: 'uint64',
          },
          {
            name: 'drawDelayBlocks',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'soldOutBlock',
            type: 'uint64',
            internalType: 'uint64',
          },
          {
            name: 'drawBlock',
            type: 'uint64',
            internalType: 'uint64',
          },
          {
            name: 'winnerShareIndex',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'tokenOrderId',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'userOrderId',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'status',
            type: 'uint8',
            internalType: 'enum RaffleStatus',
          },
          {
            name: 'prizeClaimed',
            type: 'bool',
            internalType: 'bool',
          },
          {
            name: 'proceedsClaimed',
            type: 'bool',
            internalType: 'bool',
          },
          {
            name: 'prizeRecovered',
            type: 'bool',
            internalType: 'bool',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'nextOrderId',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'orderIdByCreator',
    inputs: [
      {
        name: 'creator',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'userOrderId',
        type: 'uint32',
        internalType: 'uint32',
      },
    ],
    outputs: [
      {
        name: 'orderId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'orderIdByPrizeToken',
    inputs: [
      {
        name: 'prizeToken',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'tokenOrderId',
        type: 'uint32',
        internalType: 'uint32',
      },
    ],
    outputs: [
      {
        name: 'orderId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'pendingDrawAt',
    inputs: [
      {
        name: 'index',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [
      {
        name: 'orderId',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'eligibleBlock',
        type: 'uint64',
        internalType: 'uint64',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'pendingDrawCount',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'protocolConfig',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct ProtocolConfig',
        components: [
          {
            name: 'allowDifferentTokens',
            type: 'bool',
            internalType: 'bool',
          },
          {
            name: 'allowCustomShares',
            type: 'bool',
            internalType: 'bool',
          },
          {
            name: 'allowCustomPrice',
            type: 'bool',
            internalType: 'bool',
          },
          {
            name: 'allowCustomDrawDelay',
            type: 'bool',
            internalType: 'bool',
          },
          {
            name: 'defaultShares',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'priceDivisor',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'defaultDrawDelayBlocks',
            type: 'uint32',
            internalType: 'uint32',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'shareCount',
    inputs: [
      {
        name: 'orderId',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'user',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint32',
        internalType: 'uint32',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'shareOwner',
    inputs: [
      {
        name: 'orderId',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'shareIndex',
        type: 'uint32',
        internalType: 'uint32',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'tokenOrderCount',
    inputs: [
      {
        name: 'prizeToken',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint32',
        internalType: 'uint32',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'userOrderCount',
    inputs: [
      {
        name: 'creator',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint32',
        internalType: 'uint32',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'acceptOwnership',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'feeRecipient',
    inputs: [],
    outputs: [
      {
        name: 'recipient',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [
      {
        name: 'owner_',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'pendingOwner',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'setFeeRecipient',
    inputs: [
      {
        name: 'feeRecipient_',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setProtocolConfig',
    inputs: [
      {
        name: 'cfg',
        type: 'tuple',
        internalType: 'struct ProtocolConfig',
        components: [
          {
            name: 'allowDifferentTokens',
            type: 'bool',
            internalType: 'bool',
          },
          {
            name: 'allowCustomShares',
            type: 'bool',
            internalType: 'bool',
          },
          {
            name: 'allowCustomPrice',
            type: 'bool',
            internalType: 'bool',
          },
          {
            name: 'allowCustomDrawDelay',
            type: 'bool',
            internalType: 'bool',
          },
          {
            name: 'defaultShares',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'priceDivisor',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'defaultDrawDelayBlocks',
            type: 'uint32',
            internalType: 'uint32',
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'transferOwnership',
    inputs: [
      {
        name: '_newOwner',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'FeeRecipientUpdated',
    inputs: [
      {
        name: 'previousRecipient',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'newRecipient',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OwnershipTransferStarted',
    inputs: [
      {
        name: 'previousOwner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'newOwner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OwnershipTransferred',
    inputs: [
      {
        name: 'previousOwner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'newOwner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ProtocolConfigUpdated',
    inputs: [
      {
        name: 'allowDifferentTokens',
        type: 'bool',
        indexed: false,
        internalType: 'bool',
      },
      {
        name: 'allowCustomShares',
        type: 'bool',
        indexed: false,
        internalType: 'bool',
      },
      {
        name: 'allowCustomPrice',
        type: 'bool',
        indexed: false,
        internalType: 'bool',
      },
      {
        name: 'allowCustomDrawDelay',
        type: 'bool',
        indexed: false,
        internalType: 'bool',
      },
      {
        name: 'defaultShares',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
      {
        name: 'priceDivisor',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
      {
        name: 'defaultDrawDelayBlocks',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
    ],
    anonymous: false,
  },
] as const
