'use client'

import { useCallback } from 'react'
import { toast } from 'sonner'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { appChain } from '@/lib/chains'
import { useT } from '@/lib/i18n'

/** Ensure wallet connected + on appChain before a write. Tries switchChain when wrong. */
export function useRequireChain() {
  const t = useT()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()

  const requireChain = useCallback(async (): Promise<boolean> => {
    if (!isConnected || !address) {
      toast.error(t('toastConnect'))
      return false
    }
    if (chainId === appChain.id) return true
    try {
      await switchChainAsync({ chainId: appChain.id })
      return true
    } catch {
      toast.error(t('errWrongChain'))
      return false
    }
  }, [address, isConnected, chainId, switchChainAsync, t])

  return { requireChain, address, chainOk: isConnected && chainId === appChain.id }
}
