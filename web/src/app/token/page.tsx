'use client'

import { PublicKey } from '@solana/web3.js'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { isAddress } from 'viem'
import { useChainFamily } from '@/chain/selection'
import { RaffleCard } from '@/components/raffle-card'
import { useSolanaTokenOrders } from '@/hooks/useSolanaRaffle'
import { useTokenOrders } from '@/hooks/useTokenOrders'
import { useT } from '@/lib/i18n'
import { tokenLabel } from '@/lib/tokens'

function parseSolanaPubkey(raw: string): string | undefined {
  try {
    return new PublicKey(raw).toBase58()
  } catch {
    return undefined
  }
}

function TokenInner() {
  const t = useT()
  const { family } = useChainFamily()
  const search = useSearchParams()
  const raw = search.get('a') || ''
  const evmToken = family === 'evm' && isAddress(raw) ? (raw as `0x${string}`) : undefined
  const solMint = family === 'solana' ? parseSolanaPubkey(raw) : undefined
  const evm = useTokenOrders(evmToken)
  const sol = useSolanaTokenOrders(solMint)

  if (family === 'solana') {
    if (!solMint) {
      return <div className="empty">{t('tokenEmpty')}</div>
    }

    const { count, cards, isLoading, refetch, gpaFailed } = sol

    return (
      <>
        <div className="page-h">
          <div>
            <p className="muted small" style={{ marginBottom: 8 }}>
              <Link href="/">{t('backRaffles')}</Link>
            </p>
            <h1>{t('tokenTitle', { token: tokenLabel(solMint) })}</h1>
            <p>{t('tokenLead', { n: count.toString() })}</p>
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
            aria-label={t('tokenLoading')}
          >
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        )}
        {!isLoading && (
          <div className="grid">
            {cards.map((c) => (
              <RaffleCard key={c.orderId.toString()} {...c} onDone={() => refetch()} />
            ))}
          </div>
        )}
        {!isLoading && cards.length === 0 && <div className="empty">{t('tokenEmpty')}</div>}
      </>
    )
  }

  if (!evmToken) {
    return <div className="empty">{t('tokenEmpty')}</div>
  }

  const { count, cards, isLoading, isFetching, canLoadMore, loadMore, refetch } = evm

  return (
    <>
      <div className="page-h">
        <div>
          <p className="muted small" style={{ marginBottom: 8 }}>
            <Link href="/">{t('backRaffles')}</Link>
          </p>
          <h1>{t('tokenTitle', { token: tokenLabel(evmToken) })}</h1>
          <p>{t('tokenLead', { n: count.toString() })}</p>
        </div>
      </div>
      {isLoading && (
        <div
          className="skeleton-grid"
          role="status"
          aria-busy="true"
          aria-label={t('tokenLoading')}
        >
          <div className="skeleton-card" />
          <div className="skeleton-card" />
        </div>
      )}
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
