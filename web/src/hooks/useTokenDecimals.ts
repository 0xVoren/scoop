'use client'

import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { type Address, erc20Abi } from 'viem'
import { useReadContract } from 'wagmi'
import { useChainFamily } from '@/chain/selection'
import { isNativeMint } from '@/chain/solana/constants'
import { appChain } from '@/lib/chains'
import { isNative } from '@/lib/scoop'

/** Native BNB → 18; native SOL → 9; ERC-20 / SPL → on-chain decimals (fallback while loading). */
export function useTokenDecimals(token: Address | string | undefined): number {
  const { family } = useChainFamily()
  const { connection } = useConnection()
  const native = !token || isNative(token)

  const evm = useReadContract({
    address: native || family === 'solana' ? undefined : (token as Address),
    abi: erc20Abi,
    functionName: 'decimals',
    chainId: appChain.id,
    query: { enabled: family === 'evm' && Boolean(token) && !native },
  })

  const spl = useQuery({
    queryKey: ['spl-decimals', token],
    enabled: family === 'solana' && Boolean(token) && !native && !isNativeMint(token!),
    queryFn: async () => {
      const { value } = await connection.getParsedAccountInfo(new PublicKey(token!))
      const parsed = value?.data
      if (parsed && typeof parsed === 'object' && 'parsed' in parsed) {
        const info = (parsed as { parsed?: { info?: { decimals?: number } } }).parsed?.info
        if (typeof info?.decimals === 'number') return info.decimals
      }
      return 9
    },
  })

  if (native) return family === 'solana' ? 9 : 18
  if (family === 'solana') return typeof spl.data === 'number' ? spl.data : 9
  return typeof evm.data === 'number' ? evm.data : 18
}
