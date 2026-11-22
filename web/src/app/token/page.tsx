'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { isAddress } from 'viem'
import { useChainFamily } from '@/chain/selection'
import { RaffleCard } from '@/components/raffle-card'
import { useTokenOrders } from '@/hooks/useTokenOrders'
import { useT } from '@/lib/i18n'
import { tokenLabel } from '@/lib/tokens'

function TokenInner() {
  const t = useT()
  const { family } = useChainFamily()
  const search = useSearchParams()
  const raw = search.get('a') || ''
  const prizeToken = family === 'evm' && isAddress(raw) ? (raw as `0x${string}`) : undefined
  const { count, cards, isLoading, isFetching, canLoadMore, loadMore, refetch } =
    useTokenOrders(prizeToken)

  if (family === 'solana') {
    return (
      <div className="empty">
        <p className="flash warn" style={{ marginBottom: 12 }}>
          {t('solanaNoSecondaryIndex')}
        </p>
        <p>
          {t('solanaOpenById')} <Link href="/">{t('navRaffles')}</Link>
        </p>
      </div>
    )
  }

  if (!prizeToken) {
    return <div className="empty">{t('tokenEmpty')}</div>
  }

  return (
    <>
      <div className="page-h">
        <div>
          <p className="muted small" style={{ marginBottom: 8 }}>
            <Link href="/">{t('backRaffles')}</Link>
          </p>
          <h1>{t('tokenTitle', { token: tokenLabel(prizeToken) })}</h1>
          <p>{t('tokenLead', { n: count.toString() })}</p>
        </div>
      </div>
      {isLoading && <div className="empty">{t('tokenLoading')}</div>}
      {!isLoading && (
        <div className="grid">
          {cards.map((c) => (
            <RaffleCard key={c.orderId.toString()} {...c} onDone={() => refetch()} />
          ))}
        </div>
      )}
      {!isLoading && cards.length === 0 && <div className="empty">{t('tokenEmpty')}</div>}
      {canLoadMore && (
        <div className="load-more">
          <button
            type="button"
            className="btn touch"
            disabled={isFetching}
            onClick={() => loadMore()}
          >
            {t('homeLoadMore')}
          </button>
        </div>
      )}
    </>
  )
}

export default function TokenPage() {
  return (
    <Suspense fallback={<div className="empty">…</div>}>
      <TokenInner />
    </Suspense>
  )
}
