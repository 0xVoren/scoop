'use client'

import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { type EvmRaffleView, fromRaffleReadModel } from '@/chain/adapters/evm'
import { solanaProgramId } from '@/chain/env'
import { DEFAULT_PROGRAM_ID } from '@/chain/solana/constants'
import { listSolanaPurchasesForBuyer } from '@/chain/solana/reads'
import { type MyPurchase, type PurchaseOutcome, purchaseNeedsAction } from '@/hooks/useMyPurchases'
import { effectiveStatus, RaffleStatus } from '@/lib/scoop'

function programId() {
  return solanaProgramId() || DEFAULT_PROGRAM_ID
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

/**
 * Solana Me purchases: discover BuyerRecord PDAs for the connected wallet via
 * getProgramAccounts (primary), with localStorage + recent-id fallback.
 */
export function useSolanaMyPurchases() {
  const { connection } = useConnection()
  const { publicKey, connected } = useWallet()
  const address = connected ? publicKey?.toBase58() : undefined
  const pid = programId()

  const q = useQuery({
    queryKey: ['solana-my-purchases', pid, address],
    enabled: Boolean(address),
    queryFn: () => listSolanaPurchasesForBuyer(connection, pid, address!),
  })

  const purchases = useMemo(() => {
    if (!address || !q.data) return [] as MyPurchase[]
    const list: MyPurchase[] = q.data.purchases.map((p) => {
      const view: EvmRaffleView = fromRaffleReadModel(p.raffle)
      const st = effectiveStatus(view.status, view.deadline)
      let outcome: PurchaseOutcome = 'pending'
      if (st === RaffleStatus.Drawn && p.record.shareCount > 0) {
        outcome = p.winnerOwner === address ? 'won' : 'lost'
      }
      return {
        orderId: p.raffleId,
        ...view,
        myShares: p.record.shareCount,
        outcome,
        creatorOnly: false,
        refunded: p.record.refunded,
      }
    })

    list.sort((a, b) => {
      const sa = effectiveStatus(a.status, a.deadline)
      const sb = effectiveStatus(b.status, b.deadline)
      const ra = rank(sa, a.outcome, purchaseNeedsAction(a, address))
      const rb = rank(sb, b.outcome, purchaseNeedsAction(b, address))
      if (ra !== rb) return ra - rb
      return a.orderId < b.orderId ? -1 : a.orderId > b.orderId ? 1 : 0
    })
    return list
  }, [address, q.data])

  const actionable = useMemo(
    () => purchases.filter((p) => purchaseNeedsAction(p, address)),
    [purchases, address],
  )
  const history = useMemo(
    () => purchases.filter((p) => !purchaseNeedsAction(p, address)),
    [purchases, address],
  )

  return {
    purchases,
    actionable,
    history,
    isLoading: Boolean(address) && q.isLoading,
    refetch: q.refetch,
    address,
    gpaFailed: q.data?.gpaFailed ?? false,
    source: q.data?.source,
  }
}
