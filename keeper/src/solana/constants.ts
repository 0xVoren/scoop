/** Scoop Solana program constants — mirrors `programs/programs/scoop/src/constants.rs`. */

export const DEFAULT_PROGRAM_ID = 'FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT'

export const CONFIG_SEED = Buffer.from('config')
export const PENDING_SEED = Buffer.from('pending')
export const RAFFLE_SEED = Buffer.from('raffle')
export const SHARES_SEED = Buffer.from('shares')
export const BUYER_SEED = Buffer.from('buyer')

/** Native SOL sentinel mint = Pubkey::default() (32 zero bytes). */
export const NATIVE_MINT = new Uint8Array(32)

export const SLOT_HASHES_SYSVAR = 'SysvarS1otHashes111111111111111111111111111'

/** Anchor `global:<name>` discriminators (sha256[0..8]). */
export const IX = {
  initialize: Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]),
  create_raffle: Buffer.from([226, 206, 159, 34, 213, 207, 98, 126]),
  buy_shares: Buffer.from([40, 239, 138, 154, 8, 37, 106, 108]),
  draw: Buffer.from([61, 40, 62, 184, 31, 176, 24, 130]),
  draw_many: Buffer.from([44, 84, 107, 122, 142, 41, 2, 199]),
  claim_prize: Buffer.from([157, 233, 139, 121, 246, 62, 234, 235]),
  claim_proceeds: Buffer.from([44, 76, 121, 111, 124, 251, 237, 5]),
  refund: Buffer.from([2, 96, 183, 251, 63, 208, 46, 46]),
  recover_prize: Buffer.from([202, 95, 255, 238, 130, 236, 34, 215]),
  set_protocol_config: Buffer.from([203, 186, 218, 225, 142, 27, 24, 108]),
  set_fee_recipient: Buffer.from([227, 18, 215, 42, 237, 246, 151, 66]),
} as const

/** Classic SPL Token Program (MVP; Token-2022 rejected on-chain). */
export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
export const ASSOCIATED_TOKEN_PROGRAM_ID =
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'

export const LAUNCH = {
  shares: 11,
  priceDivisor: 10,
  drawDelaySlots: 5,
} as const

export enum RaffleStatus {
  Selling = 0,
  SoldOut = 1,
  Drawn = 2,
  Expired = 3,
}
