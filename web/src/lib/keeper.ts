/** Optional remote keeper base URL (e.g. https://scoop-keeper.example.workers.dev). */
export const keeperBaseUrl = process.env.NEXT_PUBLIC_KEEPER_URL?.replace(/\/$/, '') || null

/**
 * Fire-and-forget POST `/trigger` so the keeper draws with its own wallet.
 * Failures are ignored — user can still tap Draw; cron is the offline fallback.
 */
export function pingKeeperTrigger(): void {
  if (!keeperBaseUrl) return
  const url = `${keeperBaseUrl}/trigger`
  void fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' } }).catch(
    () => undefined,
  )
}
