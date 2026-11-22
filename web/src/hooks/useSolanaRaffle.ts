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
  listSolanaRafflesRough,
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

/**
 * Home list for Solana: sequential id scan only — not a full index.
 * Surfaces `incomplete: true` so UI can warn honestly.
 */
export function useSolanaRaffleList(opts: { limit?: number } = {}) {
  const { connection } = useConnection()
  const pid = programId()
  const limit = opts.limit ?? 48

  const q = useQuery({
    queryKey: ['solana-raffle-list', pid, limit],
    queryFn: () => listSolanaRafflesRough(connection, pid, { limit }),
  })

  const raffles = useMemo(() => {
    if (!q.data) return [] as ListedSolanaRaffle[]
    const list: ListedSolanaRaffle[] = q.data.raffles.map((m) => ({
      orderId: m.raffleId,
      ...fromRaffleReadModel(m),
    }))
    return sortByMarketplace(list, { activeOnly: true })
  }, [q.data])

  const nextId = q.data?.nextRaffleId
  const hasAnyOnChain = Boolean(nextId && nextId > BigInt(1))

  return {
    raffles,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    refetch: q.refetch,
    nextId,
    hasAnyOnChain,
    /** Always true for Solana MVP — no secondary / event index. */
    incomplete: true as const,
    canLoadMore: false,
    scannedAll: true,
    loadMore: () => {},
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

/** True when a marketplace-active raffle exists in the rough window. */
export function solanaHasActive(raffles: ListedSolanaRaffle[]): boolean {
  return raffles.some((r) => isMarketplaceActive(r.status, r.deadline))
}
