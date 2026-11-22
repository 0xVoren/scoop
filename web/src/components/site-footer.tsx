'use client'

import { useT } from '@/lib/i18n'

export function SiteFooter() {
  const t = useT()
  return (
    <footer className="foot">
      <span>{t('footBrand')}</span>
      <span className="muted">{t('footRule')}</span>
    </footer>
  )
}
