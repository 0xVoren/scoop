'use client'

import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import Link from 'next/link'
import { useChainFamily } from '@/chain/selection'
import { RaffleCard } from '@/components/raffle-card'
import { useMyPurchases } from '@/hooks/useMyPurchases'
import { useSolanaMyPurchases } from '@/hooks/useSolanaMyPurchases'
import { useT } from '@/lib/i18n'
import { userPath } from '@/lib/paths'
import { shortAddress } from '@/lib/tokens'

export default function MePage() {
  const t = useT()
  const { family } = useChainFamily()
  const { openConnectModal } = useConnectModal()
  const { publicKey, connected } = useWallet()
  const { setVisible } = useWalletModal()
  const evm = useMyPurchases()
  const sol = useSolanaMyPurchases()

  if (family === 'solana') {
    const address = connected ? publicKey?.toBase58() : undefined
    const { actionable, history, isLoading, refetch, gpaFailed } = sol
    const hasAny = actionable.length > 0 || history.length > 0

    return (
      <>
        <div className="page-h">
          <div>
            <h1>{t('meTitle')}</h1>
            <p>
              {t('meLeadSolana')}
              {address ? (
                <>
                  {' '}
                  <span className="mono muted">{shortAddress(address)}</span>
                </>
              ) : null}
            </p>
          </div>
          {address ? (
            <Link href={userPath(address)} className="btn sm">
              {t('meCreatedLink')}
            </Link>
          ) : (
            <button type="button" className="btn primary sm touch" onClick={() => setVisible(true)}>
              {t('connect')}
            </button>
          )}
        </div>
        {!address && <div className="empty">{t('meConnect')}</div>}
        {address && isLoading && (
          <div className="skeleton-grid" role="status" aria-busy="true" aria-label={t('meLoading')}>
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        )}
        {address && !isLoading && gpaFailed && (
          <p className="flash warn" style={{ marginBottom: 16 }}>
            {t('meSolanaNoIndex')}
          </p>
        )}
        {address && !isLoading && !hasAny && (
          <div className="empty">
            {t('meEmpty')} <Link href="/">{t('navRaffles')}</Link>
            <p className="muted small" style={{ marginTop: 12 }}>
              {t('meSolanaHint')} <Link href="/">{t('navRaffles')}</Link>
            </p>
          </div>
        )}

        {address && !isLoading && actionable.length > 0 && (
          <section className="me-sect">
            <h2 className="me-sect-h">{t('meActionable')}</h2>
            <div className="grid">
              {actionable.map((p) => (
                <RaffleCard
                  key={p.orderId.toString()}
                  {...p}
                  myShares={p.myShares}
                  outcome={p.outcome}
                  creatorOnly={p.creatorOnly}
                  onDone={() => void refetch()}
                />
              ))}
            </div>
          </section>
        )}

        {address && !isLoading && history.length > 0 && (
          <section className="me-sect">
            <h2 className="me-sect-h">{t('meHistory')}</h2>
            <div className="grid">
              {history.map((p) => (
                <RaffleCard
                  key={p.orderId.toString()}
                  {...p}
                  myShares={p.myShares}
                  outcome={p.outcome}
                  creatorOnly={p.creatorOnly}
                  onDone={() => void refetch()}
                />
              ))}
            </div>
          </section>
        )}
      </>
    )
  }

  const { actionable, history, isLoading, refetch, address, logsFailed, canLoadMore, loadMore } =
    evm
  const hasAny = actionable.length > 0 || history.length > 0

  return (
    <>
      <div className="page-h">
        <div>
          <h1>{t('meTitle')}</h1>
          <p>
            {t('meLead')}
            {address ? (
              <>
                {' '}
                <span className="mono muted">{shortAddress(address)}</span>
              </>
            ) : null}
          </p>
        </div>
        {address ? (
          <Link href={userPath(address)} className="btn sm">
            {t('meCreatedLink')}
          </Link>
        ) : (
          <button
            type="button"
            className="btn primary sm touch"
            onClick={() => openConnectModal?.()}
          >
            {t('connect')}
          </button>
        )}
      </div>

      {!address && <div className="empty">{t('meConnect')}</div>}
      {address && isLoading && (
        <div className="skeleton-grid" role="status" aria-busy="true" aria-label={t('meLoading')}>
          <div className="skeleton-card" />
          <div className="skeleton-card" />
        </div>
      )}
      {address && !isLoading && logsFailed && (
        <p className="flash warn" style={{ marginBottom: 16 }}>
          {t('meLogsFallback')}
        </p>
      )}
      {address && !isLoading && !hasAny && (
        <div className="empty">
          {t('meEmpty')} <Link href="/">{t('navRaffles')}</Link>
        </div>
      )}

      {address && !isLoading && actionable.length > 0 && (
        <section className="me-sect">
          <h2 className="me-sect-h">{t('meActionable')}</h2>
          <div className="grid">
            {actionable.map((p) => (
              <RaffleCard
                key={p.orderId.toString()}
                {...p}
                myShares={p.myShares}
                outcome={p.outcome}
                creatorOnly={p.creatorOnly}
                onDone={() => refetch()}
              />
            ))}
          </div>
        </section>
      )}

      {address && !isLoading && history.length > 0 && (
        <section className="me-sect">
          <h2 className="me-sect-h">{t('meHistory')}</h2>
          <div className="grid">
            {history.map((p) => (
              <RaffleCard
                key={p.orderId.toString()}
                {...p}
                myShares={p.myShares}
                outcome={p.outcome}
                creatorOnly={p.creatorOnly}
                onDone={() => refetch()}
              />
            ))}
          </div>
        </section>
      )}

      {address && canLoadMore && (
        <div className="load-more">
          <button type="button" className="btn touch" onClick={() => loadMore()}>
            {t('meLoadMore')}
          </button>
        </div>
      )}
    </>
  )
}
