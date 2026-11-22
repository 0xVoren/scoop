'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { isAddress } from 'viem'
import { useChainFamily } from '@/chain/selection'
import { RaffleCard } from '@/components/raffle-card'
import { useCreatorOrders } from '@/hooks/useCreatorOrders'
import { useT } from '@/lib/i18n'
import { shortAddress } from '@/lib/tokens'

function UserInner() {
  const t = useT()
  const { family } = useChainFamily()
  const search = useSearchParams()
  const raw = search.get('a') || ''
  const creator = family === 'evm' && isAddress(raw) ? (raw as `0x${string}`) : undefined
  const { count, active, settled, isLoading, isFetching, canLoadMore, loadMore, refetch } =
    useCreatorOrders(creator)

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

  if (!creator) {
    return <div className="empty">{t('userEmpty')}</div>
  }

  return (
    <>
      <div className="page-h">
        <div>
          <p className="muted small" style={{ marginBottom: 8 }}>
            <Link href="/">{t('backRaffles')}</Link>
          </p>
          <h1>{t('userTitle', { a: shortAddress(creator) })}</h1>
          <p>{t('userLead', { n: count.toString() })}</p>
        </div>
      </div>

      {isLoading && <div className="empty">{t('userLoading')}</div>}

      {!isLoading && active.length > 0 && (
        <section className="me-sect">
          <h2 className="me-sect-h">{t('userActive')}</h2>
          <div className="grid">
            {active.map((c) => (
              <RaffleCard key={c.orderId.toString()} {...c} onDone={() => refetch()} />
            ))}
          </div>
        </section>
      )}

      {!isLoading && settled.length > 0 && (
        <section className="me-sect">
          <h2 className="me-sect-h">{t('userSettled')}</h2>
          <div className="grid">
            {settled.map((c) => (
              <RaffleCard key={c.orderId.toString()} {...c} onDone={() => refetch()} />
            ))}
          </div>
        </section>
      )}

      {!isLoading && active.length === 0 && settled.length === 0 && (
        <div className="empty">{t('userEmpty')}</div>
      )}

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

export default function UserPage() {
  return (
    <Suspense fallback={<div className="empty">…</div>}>
      <UserInner />
    </Suspense>
  )
}
