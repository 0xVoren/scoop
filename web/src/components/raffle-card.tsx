'use client'

import Link from 'next/link'
import { RaffleActions, type RaffleView } from '@/components/raffle-actions'
import { useTokenDecimals } from '@/hooks/useTokenDecimals'
import { useI18n } from '@/lib/i18n'
import { rafflePath } from '@/lib/paths'
import { effectiveStatus, RaffleStatus, statusMessageKey, statusTone } from '@/lib/scoop'
import { formatAmount, tokenLabel } from '@/lib/tokens'

type Props = RaffleView & {
  orderId: bigint
  onDone?: () => void
  myShares?: number
  outcome?: 'won' | 'lost' | 'pending'
  creatorOnly?: boolean
}

export function RaffleCard(p: Props) {
  const { locale, t } = useI18n()
  const pct = p.totalShares === 0 ? 0 : Math.round((p.soldShares / p.totalShares) * 100)
  const deadline = new Date(Number(p.deadline) * 1000)
  const dateLocale = locale === 'zh' ? 'zh-CN' : 'en-US'
  const { orderId, onDone, myShares, outcome, creatorOnly, ...raffle } = p
  const uiStatus = effectiveStatus(p.status, p.deadline)
  const href = rafflePath(orderId)
  const prizeDec = useTokenDecimals(p.prizeToken)
  const payDec = useTokenDecimals(p.paymentToken)

  return (
    <article className="raffle-card">
      <div className="raffle-card-top">
        <Link href={href} className="order-id raffle-card-link">
          #{orderId.toString()}
        </Link>
        <div className="raffle-card-tags">
          <span className={`label ${statusTone(uiStatus)}`}>{t(statusMessageKey(uiStatus))}</span>
          {creatorOnly && <span className="label blue">{t('meCreatorTag')}</span>}
          {outcome === 'won' && <span className="label green">{t('outcomeWon')}</span>}
          {outcome === 'lost' && <span className="label red">{t('outcomeLost')}</span>}
          {outcome === 'pending' && uiStatus === RaffleStatus.SoldOut && (
            <span className="label amber">{t('outcomePending')}</span>
          )}
        </div>
      </div>
      <h3>
        <Link href={href} className="raffle-card-link">
          {formatAmount(p.prizeAmount, prizeDec)} {tokenLabel(p.prizeToken)}
        </Link>
      </h3>
      <p className="muted small">
        <span className="num">
          {formatAmount(p.pricePerShare, payDec)} {tokenLabel(p.paymentToken)}
        </span>{' '}
        {t('cardPerShare', { n: p.totalShares })}
      </p>
      <div
        className="progress"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <p className="muted small">
        <span className="num">
          {p.soldShares}/{p.totalShares}
        </span>{' '}
        {t('cardDeadline', { d: deadline.toLocaleString(dateLocale) })}
      </p>
      {myShares !== undefined && myShares > 0 && (
        <p className="muted small">
          {t('myShares')}
          <span className="num">{myShares}</span>
        </p>
      )}
      <div className="raffle-card-buy">
        <RaffleActions
          orderId={orderId}
          raffle={raffle}
          onDone={() => onDone?.()}
          compact
          hideShareHint={myShares !== undefined && myShares > 0}
        />
      </div>
    </article>
  )
}
