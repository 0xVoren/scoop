import { toast } from 'sonner'
import { explorerTxUrl } from '@/lib/chains'
import type { MessageKey } from '@/lib/i18n'

export type TxErrorKind =
  | 'rejected'
  | 'insufficient'
  | 'wrongChain'
  | 'feeOnTransfer'
  | 'token2022'
  | 'unknown'

export function classifyTxError(err: unknown): TxErrorKind {
  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase()
  if (
    msg.includes('user rejected') ||
    msg.includes('user denied') ||
    msg.includes('rejected the request') ||
    msg.includes('request rejected')
  ) {
    return 'rejected'
  }
  if (
    msg.includes('insufficient funds') ||
    msg.includes('exceeds balance') ||
    msg.includes('transfer amount exceeds balance') ||
    msg.includes('erc20: transfer amount exceeds balance')
  ) {
    return 'insufficient'
  }
  if (
    msg.includes('chain mismatch') ||
    msg.includes('wrong network') ||
    msg.includes('unsupported chain')
  ) {
    return 'wrongChain'
  }
  if (
    msg.includes('transferamountmismatch') ||
    msg.includes('transfer amount mismatch') ||
    msg.includes('fee-on-transfer') ||
    msg.includes('credited fewer tokens')
  ) {
    return 'feeOnTransfer'
  }
  if (
    msg.includes('unsupportedtokenprogram') ||
    msg.includes('unsupported token program') ||
    msg.includes('token-2022') ||
    msg.includes('token2022')
  ) {
    return 'token2022'
  }
  return 'unknown'
}

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

export function toastTxError(err: unknown, t: Translate, fallbackKey: MessageKey) {
  const kind = classifyTxError(err)
  if (kind === 'rejected') return toast.error(t('errRejected'))
  if (kind === 'insufficient') return toast.error(t('errInsufficient'))
  if (kind === 'wrongChain') return toast.error(t('errWrongChain'))
  if (kind === 'feeOnTransfer') return toast.error(t('errFeeOnTransfer'))
  if (kind === 'token2022') return toast.error(t('errToken2022'))
  if (err instanceof Error && err.message && err.message.length < 120) {
    return toast.error(err.message)
  }
  return toast.error(t(fallbackKey))
}

/** EVM `0x…` hash or Solana base58 signature. */
export function toastTxOk(message: string, hash?: string, viewLabel?: string) {
  const url = hash ? explorerTxUrl(hash) : null
  if (url && viewLabel) {
    toast.success(message, {
      action: {
        label: viewLabel,
        onClick: () => window.open(url, '_blank', 'noopener,noreferrer'),
      },
    })
    return
  }
  toast.success(message)
}
