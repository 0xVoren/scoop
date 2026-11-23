/** Public product / docs links. Testnet addresses only — never invent mainnet. */

export const GITHUB_REPO = 'https://github.com/0xVoren/scoop'
export const PROTOCOL_DOC = `${GITHUB_REPO}/blob/main/docs/PROTOCOL.md`
export const PAGES_URL = 'https://0xvoren.github.io/scoop/'

export const BSC_TESTNET_DIAMOND = '0xfB2678ff49967B073F6537781EC3d35DE731a5DF'
export const SOLANA_DEVNET_PROGRAM = 'FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT'

export function bscDiamondExplorerUrl(address: string): string {
  return `https://testnet.bscscan.com/address/${address}`
}

export function solanaProgramExplorerUrl(programId: string): string {
  return `https://explorer.solana.com/address/${programId}?cluster=devnet`
}

export function shortId(value: string, head = 6, tail = 4): string {
  if (!value || value.length <= head + tail + 1) return value
  return `${value.slice(0, head)}…${value.slice(-tail)}`
}
