'use client'

import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { type EvmRaffleView, fromRaffleReadModel } from '@/chain/adapters/evm'
import { solanaProgramId } from '@/chain/env'
import { DEFAULT_PROGRAM_ID } from '@/chain/solana/constants'
import {
  fetchSolanaBuyerRecord,
  fetchSolanaConfig,
  fetchSolanaRaffleById,
  fetchSolanaShareCount,
  fetchSolanaShareOwner,
  listSolanaRaffles,
  listSolanaRafflesByCreator,
  listSolanaRafflesByPrizeMint,
} from '@/chain/solana/reads'
import { isMarketplaceActive, sortByMarketplace } from '@/lib/scoop'

function programId() {
  return solanaProgramId() || DEFAULT_PROGRAM_ID
}

/** Single raffle read for ActiveChain=solana (detail page / actions). */
export function useSolanaRaffle(raffleId: bigint | undefined) {
  const { connection } = useConnection()
  const pid = programId()
  const enabled = raffleId !== undefined && raffleId > BigInt(0)

  const q = useQuery({
    queryKey: ['solana-raffle', pid, raffleId?.toString()],
    enabled,
    queryFn: async () => {
      const model = await fetchSolanaRaffleById(connection, pid, raffleId!)
      if (!model) return null
      return fromRaffleReadModel(model)
    },
  })

  return {
    data: q.data ?? undefined,
    isLoading: enabled && q.isLoading,
    isFetching: q.isFetching,
    refetch: q.refetch,
    error: q.error,
  }
}

export function useSolanaShareCount(raffleId: bigint | undefined, buyer: string | undefined) {
  const { connection } = useConnection()
  const pid = programId()
  const enabled = Boolean(raffleId && buyer)

  return useQuery({
    queryKey: ['solana-share-count', pid, raffleId?.toString(), buyer],
    enabled,
    queryFn: () => fetchSolanaShareCount(connection, pid, raffleId!, buyer!),
  })
}

export function useSolanaShareOwner(raffleId: bigint | undefined, shareIndex: number | undefined) {
  const { connection } = useConnection()
  const pid = programId()
  const enabled = raffleId !== undefined && shareIndex !== undefined

  return useQuery({
    queryKey: ['solana-share-owner', pid, raffleId?.toString(), shareIndex],
    enabled,
    queryFn: () => fetchSolanaShareOwner(connection, pid, raffleId!, shareIndex!),
  })
}

export function useSolanaBuyerRefunded(raffleId: bigint | undefined, buyer: string | undefined) {
  const { connection } = useConnection()
  const pid = programId()
  const enabled = Boolean(raffleId && buyer)

  return useQuery({
    queryKey: ['solana-buyer-refunded', pid, raffleId?.toString(), buyer],
    enabled,
    queryFn: async () => {
      const rec = await fetchSolanaBuyerRecord(connection, pid, raffleId!, buyer!)
      return rec?.refunded ?? false
    },
  })
}

export function useSolanaProtocolConfig() {
  const { connection } = useConnection()
  const pid = programId()

  return useQuery({
    queryKey: ['solana-config', pid],
    queryFn: () => fetchSolanaConfig(connection, new PublicKey(pid)),
  })
}

export type ListedSolanaRaffle = EvmRaffleView & { orderId: bigint }

function toListed(m: Parameters<typeof fromRaffleReadModel>[0]): ListedSolanaRaffle {
  return { orderId: m.raffleId, ...fromRaffleReadModel(m) }
}

/**
 * Home list for Solana: getProgramAccounts on Raffle accounts (primary).
 * Live = Selling / SoldOut; settled archive = Drawn / Expired (effective).
 * Surfaces `gpaFailed` when RPC blocks GPA (recent-id fallback).
 */
export function useSolanaRaffleList() {
  const { connection } = useConnection()
  const pid = programId()

  const q = useQuery({
    queryKey: ['solana-raffle-list', pid],
    queryFn: () => listSolanaRaffles(connection, pid),
  })

  const listed = useMemo(() => {
    if (!q.data) return [] as ListedSolanaRaffle[]
    return q.data.raffles.map(toListed)
  }, [q.data])

  const raffles = useMemo(() => sortByMarketplace(listed, { activeOnly: true }), [listed])

  const settled = useMemo(
    () =>
      sortByMarketplace(listed.filter((r) => !isMarketplaceActive(r.status, r.deadline))).slice(
        0,
        24,
      ),
    [listed],
  )

  const nextId = q.data?.nextRaffleId
  const hasAnyOnChain = Boolean((nextId && nextId > BigInt(1)) || listed.length > 0)
  const gpaFailed = Boolean(q.data?.gpaFailed)

  return {
    raffles,
    settled,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    refetch: q.refetch,
    nextId,
    hasAnyOnChain,
    /** True only when GPA failed and we fell back to a bounded recent-id scan. */
    incomplete: gpaFailed,
    gpaFailed,
    source: q.data?.source,
    canLoadMore: false,
    scannedAll: true,
    loadMore: () => {},
  }
}

/** Creator browse via Raffle.creator GPA memcmp. */
export function useSolanaCreatorOrders(creator: string | undefined) {
  const { connection } = useConnection()
  const pid = programId()
  const enabled = Boolean(creator)

  const q = useQuery({
    queryKey: ['solana-creator-raffles', pid, creator],
    enabled,
    queryFn: () => listSolanaRafflesByCreator(connection, pid, creator!),
  })

  const cards = useMemo(() => {
    if (!q.data) return [] as ListedSolanaRaffle[]
    return sortByMarketplace(q.data.raffles.map(toListed))
  }, [q.data])

  const active = useMemo(
    () => cards.filter((c) => isMarketplaceActive(c.status, c.deadline)),
    [cards],
  )
  const settled = useMemo(
    () => cards.filter((c) => !isMarketplaceActive(c.status, c.deadline)),
    [cards],
  )

  return {
    count: cards.length,
    active,
    settled,
    isLoading: enabled && q.isLoading,
    isFetching: q.isFetching,
    canLoadMore: false,
    loadMore: () => {},
    refetch: q.refetch,
    gpaFailed: Boolean(q.data?.gpaFailed),
  }
}

/** Prize-mint browse via Raffle.prize_mint GPA memcmp (live only, like EVM). */
export function useSolanaTokenOrders(prizeMint: string | undefined) {
  const { connection } = useConnection()
  const pid = programId()
  const enabled = Boolean(prizeMint)

  const q = useQuery({
    queryKey: ['solana-token-raffles', pid, prizeMint],
    enabled,
    queryFn: () => listSolanaRafflesByPrizeMint(connection, pid, prizeMint!),
  })

  const cards = useMemo(() => {
    if (!q.data) return [] as ListedSolanaRaffle[]
    return sortByMarketplace(q.data.raffles.map(toListed), { activeOnly: true })
  }, [q.data])

  return {
    count: cards.length,
    cards,
    isLoading: enabled && q.isLoading,
    isFetching: q.isFetching,
    canLoadMore: false,
    loadMore: () => {},
    refetch: q.refetch,
    gpaFailed: Boolean(q.data?.gpaFailed),
  }
}

export function useSolanaSlot(enabled: boolean) {
  const { connection } = useConnection()
  return useQuery({
    queryKey: ['solana-slot'],
    enabled,
    refetchInterval: enabled ? 2_000 : false,
    queryFn: () => connection.getSlot('confirmed'),
  })
}

/** True when a marketplace-active raffle exists in the listed set. */
export function solanaHasActive(raffles: ListedSolanaRaffle[]): boolean {
  return raffles.some((r) => isMarketplaceActive(r.status, r.deadline))
}
