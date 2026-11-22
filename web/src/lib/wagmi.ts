'use client'

import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  binanceWallet,
  injectedWallet,
  metaMaskWallet,
  okxWallet,
  trustWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { bsc, bscTestnet, hardhat } from 'viem/chains'
import { createConfig, http } from 'wagmi'

/**
 * WalletConnect Cloud projectId (32 hex, public in the frontend).
 *
 * GitHub Actions injects unset Variables as "" — `??` does not catch that, so
 * RainbowKit throws "No projectId found" on the client and Pages shows a
 * blank Application error. Fall back to RainbowKit's documented placeholder
 * (`YOUR_PROJECT_ID`), which their runtime rewrites to the public example id.
 */
const projectId = (process.env.NEXT_PUBLIC_WC_PROJECT_ID || '').trim() || 'YOUR_PROJECT_ID'
const rpc = process.env.NEXT_PUBLIC_BSC_RPC
const chains = [hardhat, bscTestnet, bsc] as const

const connectors =
  typeof window === 'undefined'
    ? []
    : connectorsForWallets(
        [
          {
            groupName: 'Suggested',
            wallets: [binanceWallet, metaMaskWallet, okxWallet, trustWallet, injectedWallet],
          },
          {
            groupName: 'Other',
            wallets: [walletConnectWallet],
          },
        ],
        { appName: 'Scoop', projectId },
      )

export const wagmiConfig = createConfig({
  chains,
  connectors,
  transports: {
    [hardhat.id]: http(),
    [bscTestnet.id]: http(rpc || undefined),
    [bsc.id]: http(rpc || undefined),
  },
  ssr: true,
})
