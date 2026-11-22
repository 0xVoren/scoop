'use client'

import { type Adapter, WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare'
import { type ReactNode, useMemo } from 'react'
import { solanaClusterLabel } from '@/chain/env'
import { resolveSolanaEndpoint } from '@/chain/solana/connection'

import '@solana/wallet-adapter-react-ui/styles.css'

function toAdapterNetwork(cluster: string): WalletAdapterNetwork | undefined {
  if (cluster === 'mainnet-beta') return WalletAdapterNetwork.Mainnet
  if (cluster === 'devnet') return WalletAdapterNetwork.Devnet
  if (cluster === 'testnet') return WalletAdapterNetwork.Testnet
  return undefined
}

/**
 * Minimal Solana wallet-adapter tree. Safe under `output: 'export'` when mounted
 * from a client Providers tree (no SSR dynamic route required).
 */
export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => resolveSolanaEndpoint(), [])
  const network = useMemo(() => toAdapterNetwork(solanaClusterLabel()), [])
  const wallets = useMemo((): Adapter[] => {
    const list: Adapter[] = [new PhantomWalletAdapter()]
    if (network) list.push(new SolflareWalletAdapter({ network }))
    else list.push(new SolflareWalletAdapter())
    return list
  }, [network])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
