'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { toast } from 'sonner'
import { useChainFamily } from '@/chain/selection'
import { RaffleActions } from '@/components/raffle-actions'
import { useRaffle } from '@/hooks/useRaffle'
import { useTokenDecimals } from '@/hooks/useTokenDecimals'
import { explorerAddressUrl } from '@/lib/chains'
import { useI18n } from '@/lib/i18n'
import { tokenPath, userPath } from '@/lib/paths'
import { effectiveStatus, isNative, statusMessageKey, statusTone } from '@/lib/scoop'
import { formatAmount, shortAddress, tokenLabel } from '@/lib/tokens'

function RaffleDetailInner() {
  const search = useSearchParams()
  const { family } = useChainFamily()
  const rawId = search.get('id') || '0'
  let orderId = BigInt(0)
  try {
    orderId = BigInt(rawId)
  } catch {
    orderId = BigInt(0)
  }
  const { data, isLoading, refetch } = useRaffle(orderId > BigInt(0) ? orderId : undefined)
  const { locale, t } = useI18n()
  const dateLocale = locale === 'zh' ? 'zh-CN' : 'en-US'
  const prizeDec = useTokenDecimals(data?.prizeToken)
  const payDec = useTokenDecimals(data?.paymentToken)

  if (!rawId || orderId <= BigInt(0)) {
    return <div className="empty">{t('detailMissing')}</div>
  }
  if (isLoading) return <div className="empty">{t('detailLoading')}</div>
  if (
    !data?.creator ||
    data.creator === '0x0000000000000000000000000000000000000000' ||
    data.creator === '11111111111111111111111111111111'
  ) {
    return <div className="empty">{t('detailMissing')}</div>
  }

  const r = data
  const pct = r.totalShares === 0 ? 0 : Math.round((r.soldShares / r.totalShares) * 100)
  const uiStatus = effectiveStatus(r.status, r.deadline)
  const creatorExplorer = explorerAddressUrl(r.creator)
  const tokenExplorer = isNative(r.prizeToken) ? null : explorerAddressUrl(r.prizeToken)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success(t('copyLinkOk'))
    } catch {
      toast.error(t('copyLink'))
    }
  }

  return (
    <>
      <div className="page-h">
        <div>
          <p className="muted small" style={{ marginBottom: 8 }}>
            <Link href="/">{t('backRaffles')}</Link>
          </p>
          <h1>
            #{orderId.toString()}{' '}
            <span className={`label ${statusTone(uiStatus)}`}>{t(statusMessageKey(uiStatus))}</span>
          </h1>
          <p>
            {formatAmount(r.prizeAmount, prizeDec)} {tokenLabel(r.prizeToken)} · {r.soldShares}/
            {r.totalShares} {t('detailSold')}
          </p>
        </div>
        <button type="button" className="btn sm touch" onClick={() => void copyLink()}>
          {t('copyLink')}
        </button>
      </div>

      <div className="layout">
        <div className="box">
          <div className="box-h">
            <h2>{t('detailBox')}</h2>
            <span className="counter">{pct}%</span>
          </div>
          <div className="box-b">
            <div
              className="progress"
              style={{ marginTop: 0 }}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="progress-bar" style={{ width: `${pct}%` }} />
            </div>
            <div className="meta-list" style={{ marginTop: 16 }}>
              <div>
                <span className="k">{t('detailPrize')}</span>
                <span className="v">
                  {formatAmount(r.prizeAmount, prizeDec)} {tokenLabel(r.prizeToken)}
                </span>
              </div>
              <div>
                <span className="k">{t('detailPrice')}</span>
                <span className="v">
                  {formatAmount(r.pricePerShare, payDec)} {tokenLabel(r.paymentToken)}
                </span>
              </div>
              <div>
                <span className="k">{t('detailProgress')}</span>
                <span className="v">
                  {r.soldShares}/{r.totalShares}
                </span>
              </div>
              <div>
                <span className="k">{t('detailDeadline')}</span>
                <span className="v">
                  {new Date(Number(r.deadline) * 1000).toLocaleString(dateLocale)}
                </span>
              </div>
              <div>
                <span className="k">{t('detailCreator')}</span>
                <span className="v meta-links">
                  {family === 'evm' ? (
                    <Link href={userPath(r.creator)}>{shortAddress(r.creator)}</Link>
                  ) : (
                    <span className="mono">{shortAddress(r.creator)}</span>
                  )}
                  {creatorExplorer && (
                    <a href={creatorExplorer} target="_blank" rel="noreferrer">
                      {t('viewExplorer')}
                    </a>
                  )}
                </span>
              </div>
              <div>
                <span className="k">{t('detailPrizeToken')}</span>
                <span className="v meta-links">
                  {family === 'evm' ? (
                    <Link href={tokenPath(r.prizeToken)}>{tokenLabel(r.prizeToken)}</Link>
                  ) : (
                    <span>{tokenLabel(r.prizeToken)}</span>
                  )}
                  {tokenExplorer && (
                    <a href={tokenExplorer} target="_blank" rel="noreferrer">
                      {t('viewExplorer')}
                    </a>
                  )}
                </span>
              </div>
              <div>
                <span className="k">{t('detailDelay')}</span>
                <span className="v">
                  {family === 'solana'
                    ? t('detailSlots', { n: r.drawDelayBlocks })
                    : t('detailBlocks', { n: r.drawDelayBlocks })}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="box">
          <div className="box-h">
            <h2>{t('detailActions')}</h2>
          </div>
          <div className="box-b">
            <RaffleActions orderId={orderId} raffle={r} onDone={() => refetch()} />
          </div>
        </div>
      </div>
    </>
  )
}

export default function RaffleDetailPage() {
  return (
    <Suspense fallback={<div className="empty">…</div>}>
      <RaffleDetailInner />
    </Suspense>
  )
}
