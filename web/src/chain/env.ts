import type { ScoopChainId } from '@/chain/types'

const chainEnv = process.env.NEXT_PUBLIC_CHAIN ?? 'local'

/** Default localnet / deployed program id from `programs/`. */
export const DEFAULT_SOLANA_PROGRAM_ID = 'FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT'

export function resolveEvmChainId(): ScoopChainId {
  if (chainEnv === 'mainnet') return 'evm-bsc'
  if (chainEnv === 'testnet') return 'evm-bsc-testnet'
  return 'evm-local'
}

export function resolveSolanaChainId(): ScoopChainId {
  const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? 'devnet').toLowerCase()
  if (cluster === 'mainnet-beta' || cluster === 'mainnet') return 'solana-mainnet-beta'
  if (cluster === 'local' || cluster === 'localnet') return 'solana-local'
  return 'solana-devnet'
}

/** Diamond (EVM) — same as `scoopAddress` in lib/scoop. */
export function evmEntrypoint(): string {
  return process.env.NEXT_PUBLIC_SCOOP_DIAMOND ?? '0x0000000000000000000000000000000000000000'
}

/** Anchor program id (base58). Defaults to the localnet keypair id. */
export function solanaProgramId(): string {
  return process.env.NEXT_PUBLIC_SOLANA_PROGRAM_ID || DEFAULT_SOLANA_PROGRAM_ID
}

export function solanaRpcUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SOLANA_RPC || undefined
}

export function solanaClusterLabel(): string {
  const id = resolveSolanaChainId()
  if (id === 'solana-mainnet-beta') return 'mainnet-beta'
  if (id === 'solana-local') return 'localnet'
  return 'devnet'
}
