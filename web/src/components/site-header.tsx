'use client'

import { PublicKey } from '@solana/web3.js'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useState } from 'react'
import { isAddress } from 'viem'
import { usePublicClient } from 'wagmi'
import { scoopAbi } from '@/abi/scoop'
import { ChainSwitch } from '@/chain/components/chain-switch'
import { useChainFamily } from '@/chain/selection'
import { NATIVE_MINT_PUBKEY } from '@/chain/solana/constants'
import { WalletPill } from '@/components/wallet-pill'
import { useI18n } from '@/lib/i18n'
import { rafflePath, tokenPath, userPath } from '@/lib/paths'
import { NATIVE, scoopAddress } from '@/lib/scoop'

const THEME_KEY = 'scoop-theme'

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 20V3.6" />
      <path d="M9 14.4C9 10 15.4 10.5 15.4 6.8" />
      <circle className="d" cx="9" cy="20" r="2.4" />
      <circle className="e" cx="15.4" cy="5.1" r="1.8" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
    </svg>
  )
}

function ThemeIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 2.4a5.6 5.6 0 0 1 0 11.2z" fill="currentColor" />
    </svg>
  )
}

function applyTheme(theme: 'light' | 'dark') {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // ignore
  }
}

export function SiteHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const publicClient = usePublicClient()
  const { family } = useChainFamily()
  const { locale, setLocale, t } = useI18n()
  const [q, setQ] = useState('')
  const [mobileSearch, setMobileSearch] = useState(false)
  const onCreate = pathname.startsWith('/create')
  const onMe = pathname.startsWith('/me')
  const onHome =
    pathname === '/' ||
    pathname.startsWith('/raffle') ||
    pathname.startsWith('/token') ||
    pathname.startsWith('/user')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null
      if (saved === 'light' || saved === 'dark') {
        applyTheme(saved)
        return
      }
    } catch {
      // ignore
    }
    // Product default: light formal surface (dark remains an opt-in toggle).
    applyTheme('light')
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey) return
      const tag = (document.activeElement as HTMLElement | null)?.tagName || ''
      if (/input|textarea|select/i.test(tag)) return
      e.preventDefault()
      setMobileSearch(true)
      requestAnimationFrame(() => document.getElementById('hdQ')?.focus())
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
    applyTheme(cur === 'dark' ? 'light' : 'dark')
  }

  async function onSearch(e: FormEvent) {
    e.preventDefault()
    const raw = q.trim()
    if (!raw) return
    const id = raw.replace(/^#/, '')
    if (/^\d+$/.test(id)) {
      router.push(rafflePath(id))
      setQ('')
      setMobileSearch(false)
      return
    }

    if (family === 'solana') {
      try {
        const pk = new PublicKey(raw)
        const b58 = pk.toBase58()
        // Native SOL sentinel → prize-mint browse; otherwise creator browse.
        const goToken = pk.equals(NATIVE_MINT_PUBKEY)
        router.push(goToken ? tokenPath(b58) : userPath(b58))
        setQ('')
        setMobileSearch(false)
      } catch {
        // ignore invalid pubkey
      }
      return
    }

    if (!isAddress(raw)) return
    if (raw.toLowerCase() === NATIVE.toLowerCase()) {
      router.push(tokenPath(NATIVE))
      setQ('')
      setMobileSearch(false)
      return
    }
    let goToken = false
    try {
      if (publicClient) {
        const n = await publicClient.readContract({
          address: scoopAddress,
          abi: scoopAbi,
          functionName: 'tokenOrderCount',
          args: [raw as `0x${string}`],
        })
        goToken = Number(n) > 0
      }
    } catch {
      goToken = false
    }
    router.push(goToken ? tokenPath(raw) : userPath(raw))
    setQ('')
    setMobileSearch(false)
  }

  const searchForm = (
    <search>
      <form onSubmit={onSearch}>
        <label className="sr" htmlFor="hdQ">
          {t('searchAria')}
        </label>
        <SearchIcon />
        <input
          id="hdQ"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('searchPlaceholder')}
          autoComplete="off"
          spellCheck={false}
        />
        <kbd>/</kbd>
      </form>
    </search>
  )

  return (
    <header className="hd">
      <div className="hd-row">
        <Link href="/" className="hd-brand" aria-label="Scoop">
          <Mark />
          <span>Scoop</span>
        </Link>

        <div className="hd-search desktop-search">{searchForm}</div>

        <div className="hd-acts">
          <button
            type="button"
            className="pill icon mobile-search-btn"
            aria-label={t('searchOpen')}
            aria-expanded={mobileSearch}
            onClick={() => {
              setMobileSearch((v) => !v)
              requestAnimationFrame(() => document.getElementById('hdQ')?.focus())
            }}
          >
            <SearchIcon />
          </button>
          <button
            type="button"
            className="pill"
            onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
            aria-label={t('langToggle')}
            title={locale === 'zh' ? t('langEn') : t('langZh')}
          >
            {locale === 'zh' ? t('langEn') : t('langZh')}
          </button>
          <ChainSwitch />
          <WalletPill />
          <button
            type="button"
            className="pill icon"
            aria-label={t('themeToggle')}
            onClick={toggleTheme}
          >
            <ThemeIcon />
          </button>
        </div>
      </div>

      {mobileSearch && <div className="hd-search mobile-search">{searchForm}</div>}

      <nav className="tabs" aria-label={t('navAria')}>
        <Link href="/" className={`tab${onHome && !onCreate && !onMe ? ' on' : ''}`}>
          {t('navRaffles')}
        </Link>
        <Link href="/create" className={`tab${onCreate ? ' on' : ''}`}>
          {t('navCreate')}
        </Link>
        <Link href="/me" className={`tab${onMe ? ' on' : ''}`}>
          {t('navMe')}
        </Link>
      </nav>
    </header>
  )
}
