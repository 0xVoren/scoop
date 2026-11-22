'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import { useAccount, useChainId } from 'wagmi'
import { useActiveChain } from '@/chain/selection'
import type { ChainConnection } from '@/chain/types'
import { appChain } from '@/lib/chains'

/**
 * Chain-agnostic connection snapshot.
 * EVM: wagmi account + appChain check.
 * Solana: wallet-adapter publicKey.
 */
export function useChainConnection(): ChainConnection {
  const { family, meta } = useActiveChain()
  const { address, isConnected, isConnecting } = useAccount()
  const chainId = useChainId()
  const { publicKey, connected: solConnected, connecting: solConnecting } = useWallet()

  if (family === 'solana') {
    if (solConnecting) {
      return { status: 'connecting', address: publicKey?.toBase58() ?? null, chainId: meta.chainId }
    }
    if (!solConnected || !publicKey) {
      return { status: 'disconnected', address: null, chainId: meta.chainId }
    }
    return {
      status: 'connected',
      address: publicKey.toBase58(),
      chainId: meta.chainId,
    }
  }

  if (isConnecting) {
    return { status: 'connecting', address: address ?? null, chainId: meta.chainId }
  }
  if (!isConnected || !address) {
    return { status: 'disconnected', address: null, chainId: meta.chainId }
  }
  if (chainId !== appChain.id) {
    return { status: 'wrong_network', address, chainId: meta.chainId }
  }
  return { status: 'connected', address, chainId: meta.chainId }
}
