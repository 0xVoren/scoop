'use client'

import { solanaClusterLabel, solanaProgramId } from '@/chain/env'
import { CopyableAddress } from '@/components/copyable-address'
import { chainLabel } from '@/lib/chains'
import { useT } from '@/lib/i18n'
import { scoopAddress } from '@/lib/scoop'
import {
  bscDiamondExplorerUrl,
  GITHUB_REPO,
  PROTOCOL_DOC,
  solanaProgramExplorerUrl,
} from '@/lib/site'

const ZERO = '0x0000000000000000000000000000000000000000'

export function SiteFooter() {
  const t = useT()
  const diamond = scoopAddress
  const program = solanaProgramId()
  const diamondOk = diamond && diamond.toLowerCase() !== ZERO
  const programOk = Boolean(program)

  return (
    <footer className="foot">
      <div>
        <div className="foot-brand">{t('footBrand')}</div>
        <p className="foot-rule">{t('footRule')}</p>
        <p className="foot-net">
          {t('footNetwork', { evm: chainLabel, sol: solanaClusterLabel() })}
        </p>
      </div>

      <div className="foot-grid">
        {diamondOk ? (
          <CopyableAddress
            label={t('footDiamond')}
            value={diamond}
            href={bscDiamondExplorerUrl(diamond)}
            head={10}
            tail={8}
          />
        ) : null}
        {programOk ? (
          <CopyableAddress
            label={t('footProgram')}
            value={program}
            href={solanaProgramExplorerUrl(program)}
            head={8}
            tail={6}
          />
        ) : null}
      </div>

      <nav className="foot-links" aria-label={t('footLinksAria')}>
        <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer">
          {t('footGitHub')}
        </a>
        {diamondOk ? (
          <a href={bscDiamondExplorerUrl(diamond)} target="_blank" rel="noopener noreferrer">
            {t('footBscScan')}
          </a>
        ) : null}
        {programOk ? (
          <a href={solanaProgramExplorerUrl(program)} target="_blank" rel="noopener noreferrer">
            {t('footSolanaExplorer')}
          </a>
        ) : null}
        <a href={PROTOCOL_DOC} target="_blank" rel="noopener noreferrer">
          {t('footProtocol')}
        </a>
      </nav>
    </footer>
  )
}
