/** Static-export friendly paths (GitHub Pages has no server-side dynamic routes). */

export function rafflePath(orderId: bigint | number | string): string {
  return `/raffle/?id=${orderId.toString()}`
}

export function tokenPath(address: string): string {
  return `/token/?a=${address}`
}

export function userPath(address: string): string {
  return `/user/?a=${address}`
}
