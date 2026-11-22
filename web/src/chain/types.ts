/**
 * Chain-agnostic Scoop types (Phase 2 skeleton).
 * Product rules stay shared; adapters own wallet / RPC / tx shape.
 */

export type ChainFamily = 'evm' | 'solana'

/** Active product network for the selected family. */
export type ScoopChainId =
  | 'evm-local'
  | 'evm-bsc-testnet'
  | 'evm-bsc'
  | 'solana-local'
  | 'solana-devnet'
  | 'solana-mainnet-beta'

export type ChainConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'wrong_network'

export type ChainConnection = {
  status: ChainConnectionStatus
  /** Hex address (EVM) or base58 pubkey (Solana). */
  address: string | null
  chainId: ScoopChainId
}

/**
 * Shared raffle read model for UI.
 * Time units: deadline = unix seconds; drawDelay / soldOutAt / drawAt are
 * EVM blocks or Solana slots depending on `chainId` family.
 */
export type RaffleReadModel = {
  raffleId: bigint
  creator: string
  prizeToken: string
  paymentToken: string
  prizeAmount: bigint
  pricePerShare: bigint
  totalShares: number
  soldShares: number
  deadline: bigint
  /** Blocks (EVM) or slots (Solana). */
  drawDelay: number
  /** soldOutBlock / sold_out_slot */
  soldOutAt: bigint
  /** drawBlock / draw_slot */
  drawAt: bigint
  winnerShareIndex: number
  tokenOrderId: number
  userOrderId: number
  status: number
  prizeClaimed: boolean
  proceedsClaimed: boolean
  prizeRecovered: boolean
}

export type CreateRaffleParams = {
  prizeToken: string
  paymentToken: string
  prizeAmount: bigint
  pricePerShare: bigint
  totalShares: number
  deadline: bigint
  drawDelay: number
}

/** Hex tx hash (EVM) or base58 signature (Solana). */
export type TxResult = {
  signature: string
}

/** Write surface shared by both adapters (Phase 1 ops). */
export type ScoopChainWrites = {
  create(params: CreateRaffleParams): Promise<TxResult>
  buy(raffleId: bigint, shareCount: number): Promise<TxResult>
  draw(raffleId: bigint): Promise<TxResult>
  claimPrize(raffleId: bigint): Promise<TxResult>
  claimProceeds(raffleId: bigint): Promise<TxResult>
  refund(raffleId: bigint): Promise<TxResult>
  recoverPrize(raffleId: bigint): Promise<TxResult>
}

export type ScoopChainAdapterMeta = {
  family: ChainFamily
  chainId: ScoopChainId
  label: string
  /** Diamond address (EVM) or program id (Solana). */
  entrypoint: string
  /** address(0) or Pubkey::default() sentinel string. */
  nativeAssetSentinel: string
  clusterOrNetwork: string
}

export type ScoopChainAdapter = ScoopChainAdapterMeta & {
  writes: ScoopChainWrites
}

export class ChainNotImplementedError extends Error {
  readonly family: ChainFamily
  readonly method: string

  constructor(family: ChainFamily, method: string, detail?: string) {
    super(
      detail ??
        `${family} adapter: ${method} is not implemented yet (awaiting programs / wallet wiring)`,
    )
    this.name = 'ChainNotImplementedError'
    this.family = family
    this.method = method
  }
}
