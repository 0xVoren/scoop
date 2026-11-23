'use client'

import '@/polyfills'

import { darkTheme, RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { Toaster } from 'sonner'
import { WagmiProvider } from 'wagmi'
import { ActiveChainProvider } from '@/chain/selection'
import { SolanaWalletProvider } from '@/chain/solana/wallet-provider'
import { LocaleProvider, useI18n } from '@/lib/i18n'
import { wagmiConfig } from '@/lib/wagmi'
import '@rainbow-me/rainbowkit/styles.css'

function AppProviders({ children }: { children: React.ReactNode }) {
  const { locale } = useI18n()
  const [queryClient] = useState(() => new QueryClient())
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          key={locale}
          locale={locale === 'zh' ? 'zh-CN' : 'en-US'}
          theme={darkTheme({
            accentColor: '#0b6b53',
            accentColorForeground: '#ffffff',
            borderRadius: 'medium',
            fontStack: 'system',
            overlayBlur: 'small',
          })}
        >
          <SolanaWalletProvider>
            <ActiveChainProvider>
              {children}
              <Toaster
                position="top-center"
                richColors
                closeButton
                toastOptions={{
                  className: 'scoop-toast',
                  duration: 4200,
                }}
              />
            </ActiveChainProvider>
          </SolanaWalletProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <AppProviders>{children}</AppProviders>
    </LocaleProvider>
  )
}
