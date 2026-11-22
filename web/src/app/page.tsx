'use client'

import Link from 'next/link'
import { solanaProgramId } from '@/chain/env'
import { useChainFamily } from '@/chain/selection'
import { RaffleCard } from '@/components/raffle-card'
import { useRaffleList } from '@/hooks/useRaffleList'
import { useT } from '@/lib/i18n'
import { scoopAddress } from '@/lib/scoop'

export default function HomePage() {
  const { family, meta } = useChainFamily()
  const {
    raffles,
    isLoading,
    isFetching,
    refetch,
    hasAnyOnChain,
    canLoadMore,
    loadMore,
    incomplete,
  } = useRaffleList()
  const t = useT()
  const entry = family === 'solana' ? solanaProgramId() || meta.entrypoint : scoopAddress

  return (
    <div className="layout">
      <div>
        <div className="page-h">
          <div>
            <h1>{t('homeTitle')}</h1>
            <p>{family === 'solana' ? t('homeLeadSolana') : t('homeLead')}</p>
          </div>
          <Link href="/create" className="btn primary sm">
            {t('homeCreate')}
          </Link>
        </div>

        {family === 'solana' && incomplete && (
          <p className="flash warn" style={{ marginBottom: 16 }}>
            {t('homeSolanaIndexHint')}
          </p>
        )}

        {isLoading && <div className="empty">{t('homeLoading')}</div>}
        {!isLoading && raffles.length === 0 && (
          <div className="empty">
            {hasAnyOnChain ? (
              <>
                {t('homeEmptyActive')} <Link href="/me">{t('navMe')}</Link>
              </>
            ) : family === 'solana' ? (
              (() => {
                const [before = '', after = ''] = t('homeEmptySolana').split(
                  'NEXT_PUBLIC_SOLANA_PROGRAM_ID',
                )
                return (
                  <span>
                    {before}
                    <code className="mono">NEXT_PUBLIC_SOLANA_PROGRAM_ID</code>
                    {after}
                  </span>
                )
              })()
            ) : (
              (() => {
                const [before = '', after = ''] = t('homeEmpty').split('NEXT_PUBLIC_SCOOP_DIAMOND')
                return (
                  <span>
                    {before}
                    <code className="mono">NEXT_PUBLIC_SCOOP_DIAMOND</code>
                    {after}
                  </span>
                )
              })()
            )}
          </div>
        )}
        <div className="grid">
          {raffles.map((r) => (
            <RaffleCard key={r.orderId.toString()} {...r} onDone={() => refetch()} />
          ))}
        </div>
        {!isLoading && canLoadMore && (
          <div className="load-more">
            <button
              type="button"
              className="btn touch"
              disabled={isFetching}
              onClick={() => loadMore()}
            >
              {isFetching ? t('homeLoading') : t('homeLoadMore')}
            </button>
          </div>
        )}
      </div>

      <aside className="side" aria-label={t('sideAria')}>
        <div className="sect">
          <h2>{t('aboutTitle')}</h2>
          <p>{family === 'solana' ? t('aboutBodySolana') : t('aboutBody')}</p>
          <ul className="links">
            <li>
              <Link href="/create">{t('aboutCreate')}</Link>
            </li>
            <li>
              <Link href="/me">{t('aboutMe')}</Link>
            </li>
          </ul>
        </div>
        <div className="sect">
          <h2>{family === 'solana' ? t('programTitle') : t('contractTitle')}</h2>
          <p className="muted small mono">
            {family === 'solana'
              ? entry
                ? `${entry.slice(0, 8)}…${entry.slice(-6)}`
                : t('programUnset')
              : scoopAddress === '0x0000000000000000000000000000000000000000'
                ? t('contractUnset')
                : `${scoopAddress.slice(0, 8)}…${scoopAddress.slice(-6)}`}
          </p>
        </div>
        <div className="sect">
          <h2>{t('rulesTitle')}</h2>
          <p className="muted small">
            {family === 'solana' ? t('rulesBodySolana') : t('rulesBody')}
          </p>
        </div>
      </aside>
    </div>
  )
}
