import type { Metadata, Viewport } from 'next'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { Providers } from './providers'
import './globals.css'

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '')

export const metadata: Metadata = {
  title: 'Scoop',
  description: 'On-chain share raffle',
  icons: {
    icon: [{ url: `${basePath}/favicon.svg`, type: 'image/svg+xml' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#010409',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
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
