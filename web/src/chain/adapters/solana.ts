import {
  resolveSolanaChainId,
  solanaClusterLabel,
  solanaProgramId,
  solanaRpcUrl,
} from '@/chain/env'
import { DEFAULT_PROGRAM_ID, NATIVE_MINT_PUBKEY, WSOL_MINT } from '@/chain/solana/constants'
import {
  createSolanaWrites as createSolanaWritesImpl,
  createSolanaWritesUnwired,
  type SolanaWriteDeps,
} from '@/chain/solana/writes'
import type { ScoopChainAdapterMeta, ScoopChainWrites } from '@/chain/types'

/** Native SOL sentinel — mirrors on-chain `Pubkey::default()`. */
export const SOLANA_NATIVE_MINT = NATIVE_MINT_PUBKEY.toBase58()

export { WSOL_MINT }

export function solanaAdapterMeta(): ScoopChainAdapterMeta {
  const cluster = solanaClusterLabel()
  const programId = solanaProgramId() || DEFAULT_PROGRAM_ID
  return {
    family: 'solana',
    chainId: resolveSolanaChainId(),
    label:
      cluster === 'mainnet-beta'
        ? 'Solana'
        : cluster === 'localnet'
          ? 'Solana Local'
          : 'Solana Devnet',
    entrypoint: programId,
    nativeAssetSentinel: SOLANA_NATIVE_MINT,
    clusterOrNetwork: cluster,
  }
}

export function solanaConfig() {
  return {
    ...solanaAdapterMeta(),
    rpcUrl: solanaRpcUrl(),
    programId: solanaProgramId() || DEFAULT_PROGRAM_ID,
    cluster: solanaClusterLabel(),
    idlPath: '@/idl/scoop.json',
  }
}

export type { SolanaWriteDeps }

/**
 * Typed Solana writes against the live Anchor program.
 * Pass wallet + connection deps (see `useSolanaWrites`).
 * Without deps, returns unwired stubs that throw a clear error.
 */
export function createSolanaWrites(deps?: SolanaWriteDeps): ScoopChainWrites {
  if (!deps) return createSolanaWritesUnwired()
  return createSolanaWritesImpl(deps)
}
