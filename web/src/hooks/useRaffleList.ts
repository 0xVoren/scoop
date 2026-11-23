'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useReadContracts } from 'wagmi'
import { scoopAbi } from '@/abi/scoop'
import { useChainFamily } from '@/chain/selection'
import type { RaffleView } from '@/components/raffle-actions'
import { useSolanaRaffleList } from '@/hooks/useSolanaRaffle'
import { appChain } from '@/lib/chains'
import { scoopAddress, sortByMarketplace } from '@/lib/scoop'
import { useNextOrderId } from './useRaffle'

/** How many older orderIds to pull per load-more step. */
const PAGE = 24
/** Keep auto-filling until we have this many live cards (or hit genesis). */
const TARGET_LIVE = 12
const MAX_AUTO_PAGES = 8

export type ListedRaffle = RaffleView & { orderId: bigint }

function useEvmRaffleList() {
  const { data: nextId, isLoading: loadingNext } = useNextOrderId()
  const [pages, setPages] = useState(1)
  const [autoPages, setAutoPages] = useState(0)

  const last = nextId && nextId > BigInt(1) ? Number(nextId) - 1 : 0
  const windowSize = PAGE * pages
  const start = last > 0 ? Math.max(1, last - windowSize + 1) : 0

  const ids = useMemo(() => {
    if (last <= 0) return [] as bigint[]
    const out: bigint[] = []
    for (let i = last; i >= start; i--) out.push(BigInt(i))
    return out
  }, [last, start])

  const canLoadMore = start > 1

  const contracts = useMemo(
    () =>
      ids.map((orderId) => ({
        address: scoopAddress,
        abi: scoopAbi,
        functionName: 'getRaffle' as const,
        args: [orderId] as const,
        chainId: appChain.id,
      })),
    [ids],
  )

  const { data, isLoading, isFetching, refetch } = useReadContracts({
    contracts,
    query: { enabled: ids.length > 0 },
  })

  const raffles = useMemo(() => {
    if (!data) return [] as ListedRaffle[]
    const list = data
      .map((row, i) => {
        if (row.status !== 'success' || !row.result) return null
        const r = row.result as RaffleView
        if (!r.creator || r.creator === '0x0000000000000000000000000000000000000000') return null
        return { orderId: ids[i], ...r }
      })
      .filter(Boolean) as ListedRaffle[]

    return sortByMarketplace(list, { activeOnly: true })
  }, [data, ids])

  const hasAnyOnChain = last > 0
  const scannedAll = !canLoadMore

  useEffect(() => {
    if (loadingNext || isLoading || isFetching) return
    if (!canLoadMore) return
    if (raffles.length >= TARGET_LIVE) return
    if (autoPages >= MAX_AUTO_PAGES) return
    setAutoPages((n) => n + 1)
    setPages((p) => p + 1)
  }, [loadingNext, isLoading, isFetching, canLoadMore, raffles.length, autoPages])

  const loadMore = useCallback(() => {
    if (!canLoadMore) return
    setPages((p) => p + 1)
  }, [canLoadMore])

  return {
    raffles,
    isLoading: loadingNext || (ids.length > 0 && isLoading && pages === 1),
    isFetching,
    refetch,
    nextId,
    hasAnyOnChain,
    canLoadMore,
    scannedAll,
    loadMore,
    incomplete: false as const,
  }
}

/** Browse list: active marketplace only; Solana uses Raffle GPA (+ settled archive). */
export function useRaffleList() {
  const { family } = useChainFamily()
  const evm = useEvmRaffleList()
  const sol = useSolanaRaffleList()

  if (family === 'solana') {
    return {
      raffles: sol.raffles,
      settled: sol.settled,
      isLoading: sol.isLoading,
      isFetching: sol.isFetching,
      refetch: sol.refetch,
      nextId: sol.nextId,
      hasAnyOnChain: sol.hasAnyOnChain,
      canLoadMore: sol.canLoadMore,
      scannedAll: sol.scannedAll,
      loadMore: sol.loadMore,
      incomplete: sol.incomplete,
      gpaFailed: sol.gpaFailed,
    }
  }
  return { ...evm, settled: [] as ListedRaffle[], gpaFailed: false }
}
