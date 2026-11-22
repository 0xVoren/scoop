'use client'

import { useCallback, useMemo, useState } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import { scoopAbi } from '@/abi/scoop'
import type { RaffleView } from '@/components/raffle-actions'
import { appChain } from '@/lib/chains'
import { scoopAddress, sortByMarketplace } from '@/lib/scoop'

const PAGE = 20

/** Paginate prize-token raffles; marketplace shows live only. */
export function useTokenOrders(prizeToken: `0x${string}` | undefined) {
  const [pages, setPages] = useState(1)

  const { data: count, isLoading: loadingCount } = useReadContract({
    address: scoopAddress,
    abi: scoopAbi,
    functionName: 'tokenOrderCount',
    args: prizeToken ? [prizeToken] : undefined,
    chainId: appChain.id,
    query: { enabled: Boolean(prizeToken) },
  })

  const total = Number(count ?? 0)
  const take = Math.min(total, PAGE * pages)
  const canLoadMore = take < total

  const lookups = useMemo(() => {
    const out: number[] = []
    for (let i = total; i >= 1 && out.length < take; i--) out.push(i)
    return out
  }, [total, take])

  const orderLookups = useReadContracts({
    contracts: prizeToken
      ? lookups.map((tokenOrderId) => ({
          address: scoopAddress,
          abi: scoopAbi,
          functionName: 'orderIdByPrizeToken' as const,
          args: [prizeToken, tokenOrderId] as const,
          chainId: appChain.id,
        }))
      : [],
    query: { enabled: Boolean(prizeToken) && lookups.length > 0 },
  })

  const orderIds = useMemo(() => {
    return (orderLookups.data ?? [])
      .map((r) => (r.status === 'success' ? (r.result as bigint) : BigInt(0)))
      .filter((id) => id > BigInt(0))
  }, [orderLookups.data])

  const rafflesQuery = useReadContracts({
    contracts: orderIds.map((orderId) => ({
      address: scoopAddress,
      abi: scoopAbi,
      functionName: 'getRaffle' as const,
      args: [orderId] as const,
      chainId: appChain.id,
    })),
    query: { enabled: orderIds.length > 0 },
  })

  const cards = useMemo(() => {
    const list = (rafflesQuery.data ?? [])
      .map((row, i) => {
        if (row.status !== 'success' || !row.result) return null
        return { orderId: orderIds[i], ...(row.result as RaffleView) }
      })
      .filter(Boolean) as Array<RaffleView & { orderId: bigint }>
    return sortByMarketplace(list, { activeOnly: true })
  }, [rafflesQuery.data, orderIds])

  const isLoading =
    loadingCount ||
    (lookups.length > 0 && orderLookups.isLoading) ||
    (orderIds.length > 0 && rafflesQuery.isLoading)

  const loadMore = useCallback(() => {
    if (!canLoadMore) return
    setPages((p) => p + 1)
  }, [canLoadMore])

  return {
    count: total,
    cards,
    isLoading,
    isFetching: orderLookups.isFetching || rafflesQuery.isFetching,
    canLoadMore,
    loadMore,
    refetch: () => {
      void orderLookups.refetch()
      void rafflesQuery.refetch()
    },
  }
}
