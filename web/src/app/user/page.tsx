'use client'

import { PublicKey } from '@solana/web3.js'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { isAddress } from 'viem'
import { useChainFamily } from '@/chain/selection'
import { RaffleCard } from '@/components/raffle-card'
import { useCreatorOrders } from '@/hooks/useCreatorOrders'
import { useSolanaCreatorOrders } from '@/hooks/useSolanaRaffle'
import { useT } from '@/lib/i18n'
import { shortAddress } from '@/lib/tokens'

function parseSolanaPubkey(raw: string): string | undefined {
  try {
    return new PublicKey(raw).toBase58()
  } catch {
    return undefined
  }
}

function UserInner() {
  const t = useT()
  const { family } = useChainFamily()
  const search = useSearchParams()
  const raw = search.get('a') || ''
  const evmCreator = family === 'evm' && isAddress(raw) ? (raw as `0x${string}`) : undefined
  const solCreator = family === 'solana' ? parseSolanaPubkey(raw) : undefined
  const evm = useCreatorOrders(evmCreator)
  const sol = useSolanaCreatorOrders(solCreator)

  if (family === 'solana') {
    if (!solCreator) {
      return <div className="empty">{t('userEmpty')}</div>
    }

    const { count, active, settled, isLoading, refetch, gpaFailed } = sol

    return (
      <>
        <div className="page-h">
          <div>
            <p className="muted small" style={{ marginBottom: 8 }}>
              <Link href="/">{t('backRaffles')}</Link>
            </p>
            <h1>{t('userTitle', { a: shortAddress(solCreator) })}</h1>
            <p>{t('userLead', { n: count.toString() })}</p>
          </div>
        </div>

        {gpaFailed && (
          <p className="flash warn" style={{ marginBottom: 16 }}>
            {t('solanaGpaFallback')}
          </p>
        )}

        {isLoading && (
          <div
            className="skeleton-grid"
            role="status"
            aria-busy="true"
            aria-label={t('userLoading')}
          >
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        )}

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
      </>
    )
  }

  if (!evmCreator) {
    return <div className="empty">{t('userEmpty')}</div>
  }

  const { count, active, settled, isLoading, isFetching, canLoadMore, loadMore, refetch } = evm

  return (
    <>
      <div className="page-h">
        <div>
          <p className="muted small" style={{ marginBottom: 8 }}>
            <Link href="/">{t('backRaffles')}</Link>
          </p>
          <h1>{t('userTitle', { a: shortAddress(evmCreator) })}</h1>
          <p>{t('userLead', { n: count.toString() })}</p>
        </div>
      </div>

      {isLoading && (
        <div className="skeleton-grid" role="status" aria-busy="true" aria-label={t('userLoading')}>
          <div className="skeleton-card" />
          <div className="skeleton-card" />
        </div>
      )}

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
