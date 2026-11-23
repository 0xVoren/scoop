'use client'

import { useChainFamily } from '@/chain/selection'
import { useT } from '@/lib/i18n'

/** EVM ↔ Solana family switcher (header pill). */
export function ChainSwitch() {
  const t = useT()
  const { family, setFamily, meta } = useChainFamily()

  return (
    <button
      type="button"
      className="pill mono"
      aria-label={t('chainSwitchAria')}
      title={meta.label}
      onClick={() => setFamily(family === 'evm' ? 'solana' : 'evm')}
    >
      {family === 'evm' ? t('chainFamilyEvm') : t('chainFamilySolana')}
      <span className="lbl" aria-hidden="true">
        {' '}
        · {meta.label}
      </span>
    </button>
  )
}
