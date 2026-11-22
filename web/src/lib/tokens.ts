import { type Address, formatUnits } from 'viem'
import type { ChainFamily } from '@/chain/types'
import { isNative, NATIVE, SOLANA_NATIVE } from './scoop'

export function shortAddress(addr: string, size = 4): string {
  if (!addr) return ''
  if (isNative(addr)) return addr.toLowerCase() === NATIVE.toLowerCase() ? 'BNB' : 'SOL'
  if (addr.startsWith('0x')) return `${addr.slice(0, 2 + size)}…${addr.slice(-size)}`
  return `${addr.slice(0, size)}…${addr.slice(-size)}`
}

export function tokenLabel(addr: string): string {
  if (addr.toLowerCase() === NATIVE.toLowerCase()) return 'BNB'
  if (isNative(addr)) return 'SOL'
  return shortAddress(addr)
}

export function formatAmount(value: bigint, decimals = 18, maxFrac = 4): string {
  const s = formatUnits(value, decimals)
  const [i, f = ''] = s.split('.')
  if (!f || maxFrac === 0) return i
  return `${i}.${f.slice(0, maxFrac).replace(/0+$/, '').replace(/\.$/, '') || '0'}`
}

/** Parse user token input → native sentinel or address/mint string. */
export function parseTokenInput(raw: string, family: ChainFamily = 'evm'): string {
  const t = raw.trim()
  if (family === 'solana') {
    if (!t || t.toUpperCase() === 'SOL') return SOLANA_NATIVE
    return t
  }
  if (!t || t.toUpperCase() === 'BNB') return NATIVE
  return t as Address
}

export function sameAddress(a: string, b: string, family: ChainFamily): boolean {
  if (!a || !b) return false
  if (family === 'solana') return a === b
  return a.toLowerCase() === b.toLowerCase()
}
