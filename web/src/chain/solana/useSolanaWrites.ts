'use client'

import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, type Transaction } from '@solana/web3.js'
import { useMemo } from 'react'
import { solanaProgramId } from '@/chain/env'
import { DEFAULT_PROGRAM_ID } from '@/chain/solana/constants'
import {
  createSolanaWrites,
  createSolanaWritesUnwired,
  type SolanaWriteDeps,
} from '@/chain/solana/writes'
import type { ScoopChainWrites } from '@/chain/types'

/** Live ScoopChainWrites bound to the connected Solana wallet. */
export function useSolanaWrites(): ScoopChainWrites {
  const { connection } = useConnection()
  const { publicKey, sendTransaction, connected } = useWallet()

  return useMemo(() => {
    const pidStr = solanaProgramId() || DEFAULT_PROGRAM_ID
    if (!connected || !publicKey) return createSolanaWritesUnwired()

    const deps: SolanaWriteDeps = {
      connection,
      publicKey,
      programId: new PublicKey(pidStr),
      sendTransaction: (tx: Transaction, conn) => sendTransaction(tx, conn),
    }
    return createSolanaWrites(deps)
  }, [connection, publicKey, sendTransaction, connected])
}
