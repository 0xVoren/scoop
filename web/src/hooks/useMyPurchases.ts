'use client'

import { useCallback, useMemo, useState } from 'react'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { scoopAbi } from '@/abi/scoop'
import type { RaffleView } from '@/components/raffle-actions'
import { appChain } from '@/lib/chains'
import { effectiveStatus, RaffleStatus, scoopAddress } from '@/lib/scoop'
import { useBoughtOrderIds } from './useBoughtOrderIds'
import { useNextOrderId } from './useRaffle'
import type { ListedRaffle } from './useRaffleList'

const FALLBACK_PAGE = 40

export type PurchaseOutcome = 'won' | 'lost' | 'pending'

export type MyPurchase = ListedRaffle & {
  myShares: number
  outcome: PurchaseOutcome
  creatorOnly?: boolean
  refunded?: boolean
}

/** EVM hex is case-insensitive; Solana base58 must stay case-sensitive. */
export function sameWalletAddress(a: string, b: string): boolean {
  if (a.startsWith('0x') || b.startsWith('0x')) return a.toLowerCase() === b.toLowerCase()
  return a === b
}

/** Still needs user attention: buy more / draw / claim / refund / creator proceeds. */
export function purchaseNeedsAction(p: MyPurchase, address?: string): boolean {
  const st = effectiveStatus(p.status, p.deadline)
  const isCreator = Boolean(address && sameWalletAddress(p.creator, address))
  if (st === RaffleStatus.Selling) return p.myShares > 0
  if (st === RaffleStatus.SoldOut) return p.myShares > 0 || isCreator
  if (st === RaffleStatus.Expired) {
    if (p.myShares > 0 && !p.refunded) return true
    if (isCreator && !p.prizeRecovered) return true
    return false
  }
  if (st === RaffleStatus.Drawn) {
    if (p.outcome === 'won' && !p.prizeClaimed) return true
    if (isCreator && !p.proceedsClaimed) return true
  }
  return false
}

function rank(status: number, outcome: PurchaseOutcome, needs: boolean): number {
  if (needs) {
    if (status === RaffleStatus.SoldOut) return 0
    if (status === RaffleStatus.Drawn) return 1
    if (status === RaffleStatus.Selling) return 2
    if (status === RaffleStatus.Expired) return 3
    return 4
  }
  if (status === RaffleStatus.Drawn) return outcome === 'won' ? 5 : 6
  if (status === RaffleStatus.Expired) return 7
  return 8
}

export function useMyPurchases() {
  const { address } = useAccount()
  const { data: nextId, isLoading: loadingNext } = useNextOrderId()
  const [fallbackPages, setFallbackPages] = useState(1)
  const {
    orderIds: boughtFromLogs,
    isLoading: loadingLogs,
    failed: logsFailed,
    refetch: refetchLogs,
  } = useBoughtOrderIds(address)

  const { data: createdCount } = useReadContract({
    address: scoopAddress,
    abi: scoopAbi,
    functionName: 'userOrderCount',
    args: address ? [address] : undefined,
    chainId: appChain.id,
    query: { enabled: Boolean(address) },
  })

  const createdLookups = useMemo(() => {
    const n = Number(createdCount ?? 0)
    const out: number[] = []
    for (let i = n; i >= 1 && out.length < 60; i--) out.push(i)
    return out
  }, [createdCount])

  const createdOrderQuery = useReadContracts({
    contracts: address
      ? createdLookups.map((userOrderId) => ({
          address: scoopAddress,
          abi: scoopAbi,
          functionName: 'orderIdByCreator' as const,
          args: [address, userOrderId] as const,
          chainId: appChain.id,
        }))
      : [],
    query: { enabled: Boolean(address) && createdLookups.length > 0 },
  })

  const createdOrderIds = useMemo(() => {
    return (createdOrderQuery.data ?? [])
      .map((r) => (r.status === 'success' ? (r.result as bigint) : BigInt(0)))
      .filter((id) => id > BigInt(0))
  }, [createdOrderQuery.data])

  /** Fallback scan when getLogs fails (RPC range limits). */
  const fallbackIds = useMemo(() => {
    if (!logsFailed || !nextId || nextId <= BigInt(1)) return [] as bigint[]
    const last = Number(nextId) - 1
    const window = FALLBACK_PAGE * fallbackPages
    const start = Math.max(1, last - window + 1)
    const out: bigint[] = []
    for (let i = last; i >= start; i--) out.push(BigInt(i))
    return out
  }, [logsFailed, nextId, fallbackPages])

  const fallbackCanLoadMore =
    logsFailed && nextId && nextId > BigInt(1) && fallbackIds.length > 0
      ? Number(fallbackIds[fallbackIds.length - 1]) > 1
      : false

  const scanIds = useMemo(() => {
    const set = new Set<string>()
    const out: bigint[] = []
    const source = logsFailed ? fallbackIds : boughtFromLogs
    for (const id of [...source, ...createdOrderIds]) {
      const k = id.toString()
      if (set.has(k)) continue
      set.add(k)
      out.push(id)
    }
    return out
  }, [logsFailed, fallbackIds, boughtFromLogs, createdOrderIds])

  const raffleContracts = useMemo(
    () =>
      scanIds.map((orderId) => ({
        address: scoopAddress,
        abi: scoopAbi,
        functionName: 'getRaffle' as const,
        args: [orderId] as const,
        chainId: appChain.id,
      })),
    [scanIds],
  )

  const shareContracts = useMemo(
    () =>
      address
        ? scanIds.map((orderId) => ({
            address: scoopAddress,
            abi: scoopAbi,
            functionName: 'shareCount' as const,
            args: [orderId, address] as const,
            chainId: appChain.id,
          }))
        : [],
    [scanIds, address],
  )

  const rafflesQuery = useReadContracts({
    contracts: raffleContracts,
    query: { enabled: scanIds.length > 0 && Boolean(address) },
  })

  const sharesQuery = useReadContracts({
    contracts: shareContracts,
    query: { enabled: scanIds.length > 0 && Boolean(address) },
  })

  const refundContracts = useMemo(
    () =>
      address
        ? scanIds.map((orderId) => ({
            address: scoopAddress,
            abi: scoopAbi,
            functionName: 'buyerRefunded' as const,
            args: [orderId, address] as const,
            chainId: appChain.id,
          }))
        : [],
    [scanIds, address],
  )

  const refundsQuery = useReadContracts({
    contracts: refundContracts,
    query: { enabled: scanIds.length > 0 && Boolean(address) },
  })

  const drawnWithShares = useMemo(() => {
    if (!address || !rafflesQuery.data || !sharesQuery.data) {
      return [] as Array<{ orderId: bigint; winnerIdx: number }>
    }
    const out: Array<{ orderId: bigint; winnerIdx: number }> = []
    for (let i = 0; i < scanIds.length; i++) {
      const rRow = rafflesQuery.data[i]
      const sRow = sharesQuery.data[i]
      if (rRow?.status !== 'success' || sRow?.status !== 'success' || !rRow.result) continue
      const shares = Number(sRow.result as number | bigint)
      if (shares <= 0) continue
      const r = rRow.result as RaffleView
      const st = effectiveStatus(r.status, r.deadline)
      if (st === RaffleStatus.Drawn) {
        out.push({ orderId: scanIds[i], winnerIdx: r.winnerShareIndex })
      }
    }
    return out
  }, [address, rafflesQuery.data, sharesQuery.data, scanIds])

  const winnerContracts = useMemo(
    () =>
      drawnWithShares.map(({ orderId, winnerIdx }) => ({
        address: scoopAddress,
        abi: scoopAbi,
        functionName: 'shareOwner' as const,
        args: [orderId, winnerIdx] as const,
        chainId: appChain.id,
      })),
    [drawnWithShares],
  )

  const winnersQuery = useReadContracts({
    contracts: winnerContracts,
    query: { enabled: winnerContracts.length > 0 },
  })

  const purchases = useMemo(() => {
    if (!address || !rafflesQuery.data || !sharesQuery.data) return [] as MyPurchase[]

    const winnerByOrder = new Map<string, `0x${string}`>()
    drawnWithShares.forEach((d, i) => {
      const row = winnersQuery.data?.[i]
      if (row?.status === 'success' && row.result) {
        winnerByOrder.set(d.orderId.toString(), row.result as `0x${string}`)
      }
    })

    const list: MyPurchase[] = []

    for (let i = 0; i < scanIds.length; i++) {
      const rRow = rafflesQuery.data[i]
      const sRow = sharesQuery.data[i]
      if (rRow?.status !== 'success' || !rRow.result) continue
      const myShares = sRow?.status === 'success' ? Number(sRow.result as number | bigint) : 0
      const refundRow = refundsQuery.data?.[i]
      const refunded = refundRow?.status === 'success' ? Boolean(refundRow.result) : false
      const r = rRow.result as RaffleView
      if (!r.creator || r.creator === '0x0000000000000000000000000000000000000000') continue

      const isCreator = sameWalletAddress(r.creator, address)
      const st = effectiveStatus(r.status, r.deadline)
      let outcome: PurchaseOutcome = 'pending'
      if (st === RaffleStatus.Drawn && myShares > 0) {
        const w = winnerByOrder.get(scanIds[i].toString())
        outcome = w && sameWalletAddress(w, address) ? 'won' : 'lost'
      }

      const keepBuyer = myShares > 0
      const keepCreator =
        isCreator &&
        ((st === RaffleStatus.Drawn && !r.proceedsClaimed) ||
          (st === RaffleStatus.Expired && !r.prizeRecovered) ||
          st === RaffleStatus.SoldOut)

      if (!keepBuyer && !keepCreator) continue

      list.push({
        orderId: scanIds[i],
        ...r,
        myShares: Number.isFinite(myShares) ? myShares : 0,
        outcome,
        creatorOnly: !keepBuyer && Boolean(keepCreator),
        refunded,
      })
    }

    list.sort((a, b) => {
      const sa = effectiveStatus(a.status, a.deadline)
      const sb = effectiveStatus(b.status, b.deadline)
      const ra = rank(sa, a.outcome, purchaseNeedsAction(a, address))
      const rb = rank(sb, b.outcome, purchaseNeedsAction(b, address))
      if (ra !== rb) return ra - rb
      return a.orderId < b.orderId ? -1 : a.orderId > b.orderId ? 1 : 0
    })
    return list
  }, [
    address,
    rafflesQuery.data,
    sharesQuery.data,
    refundsQuery.data,
    winnersQuery.data,
    drawnWithShares,
    scanIds,
  ])

  const actionable = useMemo(
    () => purchases.filter((p) => purchaseNeedsAction(p, address)),
    [purchases, address],
  )
  const history = useMemo(
    () => purchases.filter((p) => !purchaseNeedsAction(p, address)),
    [purchases, address],
  )

  const isLoading =
    Boolean(address) &&
    (loadingNext ||
      loadingLogs ||
      rafflesQuery.isLoading ||
      sharesQuery.isLoading ||
      refundsQuery.isLoading ||
      winnersQuery.isLoading ||
      createdOrderQuery.isLoading)

  const loadMore = useCallback(() => {
    if (!fallbackCanLoadMore) return
    setFallbackPages((p) => p + 1)
  }, [fallbackCanLoadMore])

  function refetch() {
    void refetchLogs()
    void rafflesQuery.refetch()
    void sharesQuery.refetch()
    void refundsQuery.refetch()
    void winnersQuery.refetch()
    void createdOrderQuery.refetch()
  }

  return {
    purchases,
    actionable,
    history,
    isLoading,
    refetch,
    address,
    nextId,
    logsFailed,
    canLoadMore: fallbackCanLoadMore,
    loadMore,
  }
}
