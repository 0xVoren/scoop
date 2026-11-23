'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { shortId } from '@/lib/site'

type Props = {
  value: string
  href?: string | null
  label?: string
  /** Characters kept at each end when truncating. */
  head?: number
  tail?: number
  className?: string
}

export function CopyableAddress({ value, href, label, head = 8, tail = 6, className = '' }: Props) {
  const t = useT()
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success(t('copyAddrOk'))
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error(t('copyAddrFail'))
    }
  }

  return (
    <div className={`addr ${className}`.trim()}>
      {label ? <span className="addr-label">{label}</span> : null}
      <div className="addr-row">
        {href ? (
          <a
            className="addr-value mono"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={value}
          >
            {shortId(value, head, tail)}
          </a>
        ) : (
          <span className="addr-value mono" title={value}>
            {shortId(value, head, tail)}
          </span>
        )}
        <button
          type="button"
          className="addr-copy"
          onClick={() => void copy()}
          aria-label={copied ? t('copyAddrOk') : t('copyAddress')}
        >
          {copied ? t('copied') : t('copy')}
        </button>
      </div>
    </div>
  )
}
