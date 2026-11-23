/** Mirrors `programs/programs/scoop/src/constants.rs` + keeper discriminators. */

import { PublicKey } from '@solana/web3.js'

export const DEFAULT_PROGRAM_ID = 'FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT'

export const CONFIG_SEED = Buffer.from('config')
export const PENDING_SEED = Buffer.from('pending')
export const RAFFLE_SEED = Buffer.from('raffle')
export const SHARES_SEED = Buffer.from('shares')
export const BUYER_SEED = Buffer.from('buyer')

/** Native SOL sentinel = Pubkey::default() (32 zero bytes). */
export const NATIVE_MINT_BYTES = new Uint8Array(32)
export const NATIVE_MINT_PUBKEY = new PublicKey(NATIVE_MINT_BYTES)

/** Explicit wSOL — SPL path only; never auto-wrap native SOL. */
export const WSOL_MINT = 'So11111111111111111111111111111111111111112'

export const SLOT_HASHES_SYSVAR = 'SysvarS1otHashes111111111111111111111111111'
export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

/** Anchor `global:<name>` discriminators (sha256[0..8]). */
export const IX = {
  initialize: Uint8Array.from([175, 175, 109, 31, 13, 152, 155, 237]),
  create_raffle: Uint8Array.from([226, 206, 159, 34, 213, 207, 98, 126]),
  buy_shares: Uint8Array.from([40, 239, 138, 154, 8, 37, 106, 108]),
  draw: Uint8Array.from([61, 40, 62, 184, 31, 176, 24, 130]),
  draw_many: Uint8Array.from([44, 84, 107, 122, 142, 41, 2, 199]),
  claim_prize: Uint8Array.from([157, 233, 139, 121, 246, 62, 234, 235]),
  claim_proceeds: Uint8Array.from([44, 76, 121, 111, 124, 251, 237, 5]),
  refund: Uint8Array.from([2, 96, 183, 251, 63, 208, 46, 46]),
  recover_prize: Uint8Array.from([202, 95, 255, 238, 130, 236, 34, 215]),
} as const

/** Anchor `account:BuyerRecord` discriminator (sha256[0..8]). */
export const BUYER_RECORD_DISCRIMINATOR = Uint8Array.from([107, 122, 54, 31, 4, 54, 209, 38])

/**
 * Layout: 8 disc + 8 raffle_id + 32 buyer + 8 paid + 4 share_count + 1 refunded + 1 bump.
 * buyer pubkey starts at offset 16.
 */
export const BUYER_RECORD_DATA_SIZE = 62
export const BUYER_RECORD_BUYER_OFFSET = 16

/** Anchor `account:Raffle` discriminator (sha256[0..8]). */
export const RAFFLE_DISCRIMINATOR = Uint8Array.from([143, 133, 63, 173, 138, 10, 142, 200])

/**
 * Fixed Raffle account size (InitSpace + 8 disc).
 * creator @16, prize_mint @48 after disc+raffle_id.
 */
export const RAFFLE_DATA_SIZE = 174
export const RAFFLE_CREATOR_OFFSET = 16
export const RAFFLE_PRIZE_MINT_OFFSET = 48

export enum RaffleStatus {
  Selling = 0,
  SoldOut = 1,
  Drawn = 2,
  Expired = 3,
}

export function isNativeMint(mint: PublicKey | string): boolean {
  if (typeof mint === 'string') {
    return mint === NATIVE_MINT_PUBKEY.toBase58() || mint === '11111111111111111111111111111111'
  }
  return mint.equals(NATIVE_MINT_PUBKEY)
}
