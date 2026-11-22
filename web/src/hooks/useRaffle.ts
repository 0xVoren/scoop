'use client'

import { useReadContract } from 'wagmi'
import { scoopAbi } from '@/abi/scoop'
import { useChainFamily } from '@/chain/selection'
import {
  useSolanaBuyerRefunded,
  useSolanaRaffle,
  useSolanaShareCount,
  useSolanaShareOwner,
} from '@/hooks/useSolanaRaffle'
import { appChain } from '@/lib/chains'
import { scoopAddress } from '@/lib/scoop'

function useEvmRaffle(orderId: bigint | undefined) {
  return useReadContract({
    address: scoopAddress,
    abi: scoopAbi,
    functionName: 'getRaffle',
    args: orderId !== undefined ? [orderId] : undefined,
    chainId: appChain.id,
    query: { enabled: orderId !== undefined && orderId > BigInt(0) },
  })
}

/** Active-chain raffle read (EVM getRaffle / Solana PDA). */
export function useRaffle(orderId: bigint | undefined) {
  const { family } = useChainFamily()
  const evm = useEvmRaffle(family === 'evm' ? orderId : undefined)
  const sol = useSolanaRaffle(family === 'solana' ? orderId : undefined)

  if (family === 'solana') {
    return {
      data: sol.data,
      isLoading: sol.isLoading,
      isFetching: sol.isFetching,
      refetch: sol.refetch,
      error: sol.error,
    }
  }
  return evm
}

export function useShareCount(orderId: bigint | undefined, user: string | undefined) {
  const { family } = useChainFamily()
  const evm = useReadContract({
    address: scoopAddress,
    abi: scoopAbi,
    functionName: 'shareCount',
    args:
      family === 'evm' && orderId !== undefined && user
        ? [orderId, user as `0x${string}`]
        : undefined,
    chainId: appChain.id,
    query: { enabled: family === 'evm' && Boolean(orderId && user) },
  })
  const sol = useSolanaShareCount(
    family === 'solana' ? orderId : undefined,
    family === 'solana' ? user : undefined,
  )

  if (family === 'solana') {
    return {
      data: sol.data !== undefined ? BigInt(sol.data) : undefined,
      isLoading: sol.isLoading,
      refetch: sol.refetch,
    }
  }
  return evm
}

export function useBuyerRefunded(orderId: bigint | undefined, user: string | undefined) {
  const { family } = useChainFamily()
  const evm = useReadContract({
    address: scoopAddress,
    abi: scoopAbi,
    functionName: 'buyerRefunded',
    args:
      family === 'evm' && orderId !== undefined && user
        ? [orderId, user as `0x${string}`]
        : undefined,
    chainId: appChain.id,
    query: { enabled: family === 'evm' && Boolean(orderId && user) },
  })
  const sol = useSolanaBuyerRefunded(
    family === 'solana' ? orderId : undefined,
    family === 'solana' ? user : undefined,
  )

  if (family === 'solana') {
    return {
      data: sol.data,
      isLoading: sol.isLoading,
      refetch: sol.refetch,
    }
  }
  return evm
}

export function useNextOrderId() {
  return useReadContract({
    address: scoopAddress,
    abi: scoopAbi,
    functionName: 'nextOrderId',
    chainId: appChain.id,
  })
}

export function useShareOwner(orderId: bigint | undefined, shareIndex: number | undefined) {
  const { family } = useChainFamily()
  const evm = useReadContract({
    address: scoopAddress,
    abi: scoopAbi,
    functionName: 'shareOwner',
    args:
      family === 'evm' && orderId !== undefined && shareIndex !== undefined
        ? [orderId, shareIndex]
        : undefined,
    chainId: appChain.id,
    query: {
      enabled: family === 'evm' && orderId !== undefined && shareIndex !== undefined,
    },
  })
  const sol = useSolanaShareOwner(
    family === 'solana' ? orderId : undefined,
    family === 'solana' ? shareIndex : undefined,
  )

  if (family === 'solana') {
    return {
      data: sol.data ?? undefined,
      isLoading: sol.isLoading,
      refetch: sol.refetch,
    }
  }
  return evm
}
