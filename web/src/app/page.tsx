'use client'

import Link from 'next/link'
import { solanaProgramId } from '@/chain/env'
import { useChainFamily } from '@/chain/selection'
import { CopyableAddress } from '@/components/copyable-address'
import { RaffleCard } from '@/components/raffle-card'
import { useRaffleList } from '@/hooks/useRaffleList'
import { useT } from '@/lib/i18n'
import { scoopAddress } from '@/lib/scoop'
import {
  bscDiamondExplorerUrl,
  GITHUB_REPO,
  PROTOCOL_DOC,
  solanaProgramExplorerUrl,
} from '@/lib/site'

function HeroMark() {
  return (
    <svg className="mark hero-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 20V3.6" />
      <path d="M9 14.4C9 10 15.4 10.5 15.4 6.8" />
      <circle className="d" cx="9" cy="20" r="2.4" />
      <circle className="e" cx="15.4" cy="5.1" r="1.8" />
    </svg>
  )
}

const ZERO = '0x0000000000000000000000000000000000000000'

export default function HomePage() {
  const { family } = useChainFamily()
  const {
    raffles,
    settled,
    isLoading,
    isFetching,
    refetch,
    hasAnyOnChain,
    canLoadMore,
    loadMore,
    incomplete,
  } = useRaffleList()
  const t = useT()
  const diamond = scoopAddress
  const program = solanaProgramId()
  const entry = family === 'solana' ? program : diamond
  const entryOk =
    family === 'solana' ? Boolean(entry) : Boolean(entry && entry.toLowerCase() !== ZERO)

  return (
    <>
      <section className="hero" aria-label={t('heroAria')}>
        <div className="hero-copy">
          <p className="hero-brand">Scoop</p>
          <h1 className="hero-headline">{t('heroHeadline')}</h1>
          <p className="hero-lead">{t('heroLead')}</p>
          <div className="hero-ctas">
            <a href="#live" className="btn primary lg">
              {t('heroCtaLive')}
            </a>
            <Link href="/create" className="btn lg">
              {t('heroCtaCreate')}
            </Link>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <HeroMark />
        </div>
      </section>

      <div className="layout">
        <div>
          <div className="section-h" id="live">
            <div>
              <h2>{t('homeTitle')}</h2>
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

          {isLoading && (
            <div
              className="skeleton-grid"
              role="status"
              aria-busy="true"
              aria-label={t('homeLoading')}
            >
              <div className="skeleton-card" />
              <div className="skeleton-card" />
              <div className="skeleton-card" />
            </div>
          )}
          {!isLoading && raffles.length === 0 && (
            <div className="empty">
              {hasAnyOnChain ? (
                <>
                  {t('homeEmptyActive')} <Link href="/me">{t('navMe')}</Link>
                  {family === 'solana' && settled.length > 0 ? (
                    <>
                      {' '}
                      <a href="#archive">{t('homeArchiveLink')}</a>
                    </>
                  ) : null}
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
                  const [before = '', after = ''] = t('homeEmpty').split(
                    'NEXT_PUBLIC_SCOOP_DIAMOND',
                  )
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

          {family === 'solana' && !isLoading && settled.length > 0 && (
            <section className="me-sect archive-sect" id="archive">
              <h2 className="me-sect-h">{t('homeArchiveTitle')}</h2>
              <p className="muted small archive-lead">{t('homeArchiveLead')}</p>
              <div className="grid">
                {settled.map((r) => (
                  <RaffleCard key={`s-${r.orderId.toString()}`} {...r} onDone={() => refetch()} />
                ))}
              </div>
            </section>
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
              <li>
                <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer">
                  {t('aboutSource')}
                </a>
              </li>
              <li>
                <a href={PROTOCOL_DOC} target="_blank" rel="noopener noreferrer">
                  {t('aboutProtocol')}
                </a>
              </li>
            </ul>
          </div>
          <div className="sect">
            <h2>{family === 'solana' ? t('programTitle') : t('contractTitle')}</h2>
            {entryOk ? (
              <CopyableAddress
                value={entry}
                href={
                  family === 'solana'
                    ? solanaProgramExplorerUrl(entry)
                    : bscDiamondExplorerUrl(entry)
                }
                head={family === 'solana' ? 8 : 10}
                tail={family === 'solana' ? 6 : 8}
              />
            ) : (
              <p className="muted small">
                {family === 'solana' ? t('programUnset') : t('contractUnset')}
              </p>
            )}
          </div>
          <div className="sect">
            <h2>{t('rulesTitle')}</h2>
            <p className="muted small">
              {family === 'solana' ? t('rulesBodySolana') : t('rulesBody')}
            </p>
          </div>
          <div className="sect">
            <h2>{t('statusTitle')}</h2>
            <p className="muted small">{t('statusBody')}</p>
          </div>
        </aside>
      </div>
    </>
  )
}
