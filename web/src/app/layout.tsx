import type { Metadata, Viewport } from 'next'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { Providers } from './providers'
import './globals.css'

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '')

export const metadata: Metadata = {
  title: 'Scoop',
  description:
    'Scoop — dual-chain on-chain share raffle. Escrow a prize, sell fixed shares, draw on-chain. BSC testnet and Solana devnet.',
  icons: {
    icon: [{ url: `${basePath}/favicon.svg`, type: 'image/svg+xml' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#eef2f0',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <SiteHeader />
          <main className="page">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  )
}
