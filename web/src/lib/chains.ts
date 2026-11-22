import { bsc, bscTestnet, type Chain, hardhat } from 'viem/chains'
import { resolveSolanaChainId } from '@/chain/env'

const chainEnv = process.env.NEXT_PUBLIC_CHAIN ?? 'local'

export const appChain: Chain =
  chainEnv === 'mainnet' ? bsc : chainEnv === 'testnet' ? bscTestnet : hardhat

export const chainLabel =
  chainEnv === 'mainnet' ? 'BSC' : chainEnv === 'testnet' ? 'BSC Testnet' : 'Local'

/** EVM hex hash or Solana base58 signature. */
export function explorerTxUrl(hash: `0x${string}` | string): string | null {
  if (!hash) return null
  if (!hash.startsWith('0x')) {
    if (resolveSolanaChainId() === 'solana-local') return null
    const cluster = resolveSolanaChainId() === 'solana-devnet' ? '?cluster=devnet' : ''
    return `https://solscan.io/tx/${hash}${cluster}`
  }
  if (appChain.id === hardhat.id) return null
  if (appChain.id === bsc.id) return `https://bscscan.com/tx/${hash}`
  if (appChain.id === bscTestnet.id) return `https://testnet.bscscan.com/tx/${hash}`
  return null
}

export function explorerAddressUrl(address: string): string | null {
  if (!address) return null
  if (!address.startsWith('0x')) {
    if (resolveSolanaChainId() === 'solana-local') return null
    const cluster = resolveSolanaChainId() === 'solana-devnet' ? '?cluster=devnet' : ''
    return `https://solscan.io/account/${address}${cluster}`
  }
  if (appChain.id === hardhat.id) return null
  if (appChain.id === bsc.id) return `https://bscscan.com/address/${address}`
  if (appChain.id === bscTestnet.id) return `https://testnet.bscscan.com/address/${address}`
  return null
}
