'use client'

import { useCallback, useEffect, useState } from 'react'
import { type Address, parseAbiItem } from 'viem'
import { hardhat } from 'viem/chains'
import { usePublicClient } from 'wagmi'
import { appChain } from '@/lib/chains'
import { scoopAddress } from '@/lib/scoop'

const sharesPurchased = parseAbiItem(
  'event SharesPurchased(uint256 indexed orderId, address indexed buyer, uint32 count, uint32 startIndex)',
)

/** BSC / most RPCs cap eth_getLogs range; keep under common 10k limits. */
const LOG_CHUNK = BigInt(9_000)

function deployFromBlock(): bigint | null {
  const raw = process.env.NEXT_PUBLIC_SCOOP_DEPLOY_BLOCK
  if (raw !== undefined && raw !== '') {
    try {
      return BigInt(raw)
    } catch {
      return null
    }
  }
  // Local anvil: genesis is fine. Mainnet/testnet require an explicit deploy block.
  if (appChain.id === hardhat.id) return BigInt(0)
  return null
}

async function getLogsChunked(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  buyer: Address,
  fromBlock: bigint,
) {
  const latest = await publicClient.getBlockNumber()
  const logs = []
  let from = fromBlock
  while (from <= latest) {
    const chunkEnd = from + LOG_CHUNK - BigInt(1)
    // biome-ignore lint/complexity/useMathMinMax: bigint — Math.min coerces to number
    const to = chunkEnd < latest ? chunkEnd : latest
    const chunk = await publicClient.getLogs({
      address: scoopAddress,
      event: sharesPurchased,
      args: { buyer },
      fromBlock: from,
      toBlock: to,
    })
    logs.push(...chunk)
    from = to + BigInt(1)
  }
  return logs
}

/** Resolve orderIds the user bought via SharesPurchased(buyer) logs. */
export function useBoughtOrderIds(buyer: Address | undefined) {
  const publicClient = usePublicClient({ chainId: appChain.id })
  const [orderIds, setOrderIds] = useState<bigint[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const refetch = useCallback(async () => {
    if (!buyer || !publicClient || scoopAddress === '0x0000000000000000000000000000000000000000') {
      setOrderIds([])
      setFailed(false)
      return
    }
    const fromBlock = deployFromBlock()
    if (fromBlock === null) {
      setFailed(true)
      setOrderIds([])
      return
    }
    setIsLoading(true)
    setFailed(false)
    try {
      const logs = await getLogsChunked(publicClient, buyer, fromBlock)
      const seen = new Set<string>()
      const ids: bigint[] = []
      for (const log of logs) {
        const id = log.args.orderId
        if (id === undefined) continue
        const k = id.toString()
        if (seen.has(k)) continue
        seen.add(k)
        ids.push(id)
      }
      ids.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
      setOrderIds(ids)
    } catch {
      setFailed(true)
      setOrderIds([])
    } finally {
      setIsLoading(false)
    }
  }, [buyer, publicClient])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { orderIds, isLoading, failed, refetch }
}
