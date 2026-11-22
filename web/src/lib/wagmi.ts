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

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? 'scoop-local-placeholder'
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
