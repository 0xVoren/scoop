import { type Address, type Hash, zeroAddress } from 'viem'
import { scoopAbi } from '@/abi/scoop'
import { evmEntrypoint, resolveEvmChainId } from '@/chain/env'
import type {
  CreateRaffleParams,
  RaffleReadModel,
  ScoopChainAdapterMeta,
  ScoopChainWrites,
  TxResult,
} from '@/chain/types'
import { chainLabel } from '@/lib/chains'
import { scoopAddress } from '@/lib/scoop'

/**
 * On-chain raffle UI shape (orderId passed separately).
 * Addresses are hex (EVM) or base58 (Solana); drawDelayBlocks/soldOutBlock/drawBlock
 * mean blocks on EVM and slots on Solana.
 */
export type EvmRaffleView = {
  creator: string
  prizeToken: string
  paymentToken: string
  prizeAmount: bigint
  pricePerShare: bigint
  totalShares: number
  soldShares: number
  deadline: bigint
  drawDelayBlocks: number
  soldOutBlock: bigint
  drawBlock: bigint
  winnerShareIndex: number
  tokenOrderId: number
  userOrderId: number
  status: number
  prizeClaimed: boolean
  proceedsClaimed: boolean
  prizeRecovered: boolean
}

export function evmAdapterMeta(): ScoopChainAdapterMeta {
  return {
    family: 'evm',
    chainId: resolveEvmChainId(),
    label: chainLabel,
    entrypoint: evmEntrypoint(),
    nativeAssetSentinel: zeroAddress,
    clusterOrNetwork: chainLabel,
  }
}

export function toRaffleReadModel(orderId: bigint, r: EvmRaffleView): RaffleReadModel {
  return {
    raffleId: orderId,
    creator: r.creator,
    prizeToken: r.prizeToken,
    paymentToken: r.paymentToken,
    prizeAmount: r.prizeAmount,
    pricePerShare: r.pricePerShare,
    totalShares: r.totalShares,
    soldShares: r.soldShares,
    deadline: r.deadline,
    drawDelay: r.drawDelayBlocks,
    soldOutAt: r.soldOutBlock,
    drawAt: r.drawBlock,
    winnerShareIndex: r.winnerShareIndex,
    tokenOrderId: r.tokenOrderId,
    userOrderId: r.userOrderId,
    status: r.status,
    prizeClaimed: r.prizeClaimed,
    proceedsClaimed: r.proceedsClaimed,
    prizeRecovered: r.prizeRecovered,
  }
}

export function fromRaffleReadModel(m: RaffleReadModel): EvmRaffleView {
  return {
    creator: m.creator,
    prizeToken: m.prizeToken,
    paymentToken: m.paymentToken,
    prizeAmount: m.prizeAmount,
    pricePerShare: m.pricePerShare,
    totalShares: m.totalShares,
    soldShares: m.soldShares,
    deadline: m.deadline,
    drawDelayBlocks: m.drawDelay,
    soldOutBlock: m.soldOutAt,
    drawBlock: m.drawAt,
    winnerShareIndex: m.winnerShareIndex,
    tokenOrderId: m.tokenOrderId,
    userOrderId: m.userOrderId,
    status: m.status,
    prizeClaimed: m.prizeClaimed,
    proceedsClaimed: m.proceedsClaimed,
    prizeRecovered: m.prizeRecovered,
  }
}

/** Loose write surface so wagmi `writeContractAsync` can be passed without ABI generics. */
export type EvmWriteDeps = {
  writeContract: (args: Record<string, unknown>) => Promise<Hash>
  waitForReceipt: (hash: Hash) => Promise<unknown>
  /** Prize/payment token is native (BNB). */
  isNativeToken: (token: string) => boolean
}

function asTx(hash: Hash): TxResult {
  return { signature: hash }
}

/**
 * Wrap existing wagmi/viem write path so pages can migrate off raw ABI calls
 * without changing product behavior. Existing pages may keep calling wagmi
 * directly; this is the shared adapter entry when they opt in.
 */
export function createEvmWrites(deps: EvmWriteDeps): ScoopChainWrites {
  const diamond = scoopAddress

  async function run(
    functionName:
      | 'createRaffle'
      | 'buyShares'
      | 'draw'
      | 'claimPrize'
      | 'claimProceeds'
      | 'refund'
      | 'recoverPrize',
    args: readonly unknown[],
    value?: bigint,
  ): Promise<TxResult> {
    const hash = await deps.writeContract({
      address: diamond,
      abi: scoopAbi,
      functionName,
      args,
      value,
    })
    await deps.waitForReceipt(hash)
    return asTx(hash)
  }

  return {
    async create(params: CreateRaffleParams) {
      const value = deps.isNativeToken(params.prizeToken) ? params.prizeAmount : BigInt(0)
      return run(
        'createRaffle',
        [
          params.prizeToken as Address,
          params.paymentToken as Address,
          params.prizeAmount,
          params.pricePerShare,
          params.totalShares,
          params.deadline,
          params.drawDelay,
        ],
        value,
      )
    },
    async buy(raffleId, shareCount) {
      // Native BNB value: use evmBuyWithValue. ERC-20: approve separately in UI.
      return run('buyShares', [raffleId, shareCount])
    },
    async draw(raffleId) {
      return run('draw', [raffleId])
    },
    async claimPrize(raffleId) {
      return run('claimPrize', [raffleId])
    },
    async claimProceeds(raffleId) {
      return run('claimProceeds', [raffleId])
    },
    async refund(raffleId) {
      return run('refund', [raffleId])
    },
    async recoverPrize(raffleId) {
      return run('recoverPrize', [raffleId])
    },
  }
}

/** Buy with explicit native value (BNB path). */
export async function evmBuyWithValue(
  deps: EvmWriteDeps,
  raffleId: bigint,
  shareCount: number,
  value: bigint,
): Promise<TxResult> {
  const hash = await deps.writeContract({
    address: scoopAddress,
    abi: scoopAbi,
    functionName: 'buyShares',
    args: [raffleId, shareCount],
    value,
  })
  await deps.waitForReceipt(hash)
  return asTx(hash)
}
