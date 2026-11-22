import { type Address, zeroAddress } from 'viem'
import { isNativeMint, NATIVE_MINT_PUBKEY } from '@/chain/solana/constants'

export const NATIVE = zeroAddress

/** Solana native SOL sentinel (Pubkey::default base58). */
export const SOLANA_NATIVE = NATIVE_MINT_PUBKEY.toBase58()

export const scoopAddress = (process.env.NEXT_PUBLIC_SCOOP_DIAMOND ??
  '0x0000000000000000000000000000000000000000') as Address

export const FEE_DENOMINATOR = BigInt(100)

export enum RaffleStatus {
  Selling = 0,
  SoldOut = 1,
  Drawn = 2,
  Expired = 3,
}

/** True for EVM address(0) or Solana Pubkey::default() (native asset sentinel). */
export function isNative(token: string): boolean {
  if (!token) return false
  if (token.toLowerCase() === NATIVE.toLowerCase()) return true
  return isNativeMint(token)
}

export function effectiveStatus(
  status: number,
  deadline: bigint,
  nowSec = Math.floor(Date.now() / 1000),
): number {
  // On-chain status stays Selling until first refund/recover; UI should treat past-deadline as expired.
  if (status === RaffleStatus.Selling && nowSec > Number(deadline)) return RaffleStatus.Expired
  return status
}

/** Homepage / browse: only sellable or awaiting draw (hide settled Drawn / Expired). */
export function isMarketplaceActive(status: number, deadline: bigint): boolean {
  const st = effectiveStatus(status, deadline)
  return st === RaffleStatus.Selling || st === RaffleStatus.SoldOut
}

/** Selling → SoldOut → Drawn → Expired; within bucket, earlier orderId first. */
export function marketplaceRank(status: number): number {
  switch (status) {
    case RaffleStatus.Selling:
      return 0
    case RaffleStatus.SoldOut:
      return 1
    case RaffleStatus.Drawn:
      return 2
    case RaffleStatus.Expired:
      return 3
    default:
      return 4
  }
}

export function sortByMarketplace<T extends { orderId: bigint; status: number; deadline: bigint }>(
  list: T[],
  opts?: { activeOnly?: boolean },
): T[] {
  const out = opts?.activeOnly
    ? list.filter((r) => isMarketplaceActive(r.status, r.deadline))
    : [...list]
  out.sort((a, b) => {
    const sa = effectiveStatus(a.status, a.deadline)
    const sb = effectiveStatus(b.status, b.deadline)
    const ra = marketplaceRank(sa)
    const rb = marketplaceRank(sb)
    if (ra !== rb) return ra - rb
    return a.orderId < b.orderId ? -1 : a.orderId > b.orderId ? 1 : 0
  })
  return out
}

export function statusMessageKey(
  status: number,
): 'statusSelling' | 'statusSoldOut' | 'statusDrawn' | 'statusExpired' | 'statusUnknown' {
  switch (status) {
    case RaffleStatus.Selling:
      return 'statusSelling'
    case RaffleStatus.SoldOut:
      return 'statusSoldOut'
    case RaffleStatus.Drawn:
      return 'statusDrawn'
    case RaffleStatus.Expired:
      return 'statusExpired'
    default:
      return 'statusUnknown'
  }
}

export function statusTone(status: number): 'green' | 'amber' | 'blue' | 'red' {
  switch (status) {
    case RaffleStatus.Selling:
      return 'green'
    case RaffleStatus.SoldOut:
      return 'amber'
    case RaffleStatus.Drawn:
      return 'blue'
    case RaffleStatus.Expired:
      return 'red'
    default:
      return 'blue'
  }
}
