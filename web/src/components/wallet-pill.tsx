'use client'

import { useAccountModal, useChainModal, useConnectModal } from '@rainbow-me/rainbowkit'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useAccount, useChainId } from 'wagmi'
import { useChainFamily } from '@/chain/selection'
import { appChain } from '@/lib/chains'
import { useT } from '@/lib/i18n'

const wanted = appChain

function WalletIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M10.5 9.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0ZM1 3.75A1.75 1.75 0 0 1 2.75 2h9.5A1.75 1.75 0 0 1 14 3.75V5h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 14.25 14H2.75A1.75 1.75 0 0 1 1 12.25Zm1.5 0V5h10V3.75a.25.25 0 0 0-.25-.25h-9.5a.25.25 0 0 0-.25.25Zm0 2.75v5.75c0 .138.112.25.25.25h11.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25Z" />
    </svg>
  )
}

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function SolanaWalletPill() {
  const t = useT()
  const { publicKey, connected, disconnecting } = useWallet()
  const { setVisible } = useWalletModal()
  const addr = publicKey?.toBase58()

  if (!connected || !addr) {
    return (
      <button
        type="button"
        className="pill wbtn"
        aria-label={t('walletAria')}
        onClick={() => setVisible(true)}
      >
        <WalletIcon />
        <span className="lbl">{t('connectShort')}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      className="pill wbtn"
      aria-label={t('walletConnected', { a: short(addr) })}
      disabled={disconnecting}
      onClick={() => setVisible(true)}
    >
      <i className="dotg" />
      <span className="mono">{short(addr)}</span>
    </button>
  )
}

function EvmWalletPill() {
  const t = useT()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { openConnectModal } = useConnectModal()
  const { openAccountModal } = useAccountModal()
  const { openChainModal } = useChainModal()
  const wrong = isConnected && chainId !== wanted.id

  if (!isConnected) {
    return (
      <button
        type="button"
        className="pill wbtn"
        aria-label={t('walletAria')}
        onClick={() => openConnectModal?.()}
      >
        <WalletIcon />
        <span className="lbl">{t('connectShort')}</span>
      </button>
    )
  }

  return (
    <>
      {wrong && (
        <button type="button" className="pill" onClick={() => openChainModal?.()}>
          {t('switchChain', { n: wanted.name })}
        </button>
      )}
      <button
        type="button"
        className="pill wbtn"
        aria-label={t('walletConnected', { a: short(address!) })}
        onClick={() => openAccountModal?.()}
      >
        <i className="dotg" />
        <span className="mono">{short(address!)}</span>
      </button>
    </>
  )
}

/** Compact wallet control — EVM (RainbowKit) or Solana (wallet-adapter). */
export function WalletPill() {
  const { family } = useChainFamily()
  if (family === 'solana') return <SolanaWalletPill />
  return <EvmWalletPill />
}
