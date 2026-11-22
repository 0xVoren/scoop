/** Client-side cache of raffle ids this wallet bought — backup when GPA is flaky. */

const PREFIX = 'scoop.solana.bought.'

function key(programId: string, buyer: string): string {
  return `${PREFIX}${programId}.${buyer}`
}

export function readBoughtRaffleIds(programId: string, buyer: string): bigint[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(key(programId, buyer))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: bigint[] = []
    const seen = new Set<string>()
    for (const item of parsed) {
      const id = typeof item === 'string' || typeof item === 'number' ? BigInt(item) : null
      if (id === null || id <= 0n) continue
      const k = id.toString()
      if (seen.has(k)) continue
      seen.add(k)
      out.push(id)
    }
    return out
  } catch {
    return []
  }
}

export function rememberBoughtRaffleId(programId: string, buyer: string, raffleId: bigint): void {
  if (typeof window === 'undefined') return
  if (raffleId <= 0n) return
  try {
    const existing = readBoughtRaffleIds(programId, buyer)
    const k = raffleId.toString()
    if (existing.some((id) => id.toString() === k)) return
    const next = [raffleId, ...existing].slice(0, 200)
    localStorage.setItem(key(programId, buyer), JSON.stringify(next.map((id) => id.toString())))
  } catch {
    // quota / private mode — ignore
  }
}
