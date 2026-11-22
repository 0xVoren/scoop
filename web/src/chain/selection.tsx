'use client'

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { createEvmWrites, evmAdapterMeta } from '@/chain/adapters/evm'
import { createSolanaWrites, solanaAdapterMeta } from '@/chain/adapters/solana'
import type { SolanaWriteDeps } from '@/chain/solana/writes'
import type { ChainFamily, ScoopChainAdapterMeta, ScoopChainWrites } from '@/chain/types'
import { isNative } from '@/lib/scoop'

const STORAGE_KEY = 'scoop.chain-family'

export type ActiveChainValue = {
  family: ChainFamily
  setFamily: (family: ChainFamily) => void
  meta: ScoopChainAdapterMeta
  /**
   * Default writes for the active family.
   * EVM / Solana both need wallet deps via create*WritesWith for real txs.
   */
  writes: ScoopChainWrites
  /** EVM writes factory for pages that already hold wagmi clients. */
  createEvmWritesWith: typeof createEvmWrites
  /** Solana writes factory for pages that hold wallet-adapter clients. */
  createSolanaWritesWith: (deps: SolanaWriteDeps) => ScoopChainWrites
}

const ActiveChainContext = createContext<ActiveChainValue | null>(null)

function readStoredFamily(): ChainFamily {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'evm' || v === 'solana') return v
  } catch {
    // ignore
  }
  return 'evm'
}

export function ActiveChainProvider({ children }: { children: ReactNode }) {
  const [family, setFamilyState] = useState<ChainFamily>('evm')

  useEffect(() => {
    setFamilyState(readStoredFamily())
  }, [])

  const setFamily = useCallback((next: ChainFamily) => {
    setFamilyState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore
    }
  }, [])

  const meta = useMemo(
    () => (family === 'solana' ? solanaAdapterMeta() : evmAdapterMeta()),
    [family],
  )

  const writes = useMemo(() => {
    if (family === 'solana') return createSolanaWrites()
    return createEvmWrites({
      writeContract: async () => {
        throw new Error('EVM writes require wagmi writeContract — use createEvmWritesWith(deps)')
      },
      waitForReceipt: async () => undefined,
      isNativeToken: isNative,
    })
  }, [family])

  const value = useMemo<ActiveChainValue>(
    () => ({
      family,
      setFamily,
      meta,
      writes,
      createEvmWritesWith: createEvmWrites,
      createSolanaWritesWith: (deps) => createSolanaWrites(deps),
    }),
    [family, setFamily, meta, writes],
  )

  return <ActiveChainContext.Provider value={value}>{children}</ActiveChainContext.Provider>
}

export function useActiveChain() {
  const ctx = useContext(ActiveChainContext)
  if (!ctx) throw new Error('useActiveChain must be used within ActiveChainProvider')
  return ctx
}

/** Minimal hook: current family + setter (for header switcher). */
export function useChainFamily() {
  const { family, setFamily, meta } = useActiveChain()
  return { family, setFamily, meta }
}
