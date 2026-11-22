import { PublicKey } from '@solana/web3.js'
import { RaffleStatus } from './constants'

export type PendingDrawsAccount = {
  bump: number
  raffleIds: bigint[]
}

export type RaffleAccount = {
  raffleId: bigint
  creator: PublicKey
  prizeMint: PublicKey
  paymentMint: PublicKey
  prizeAmount: bigint
  pricePerShare: bigint
  totalShares: number
  soldShares: number
  deadline: bigint
  drawDelaySlots: number
  soldOutSlot: bigint
  drawSlot: bigint
  winnerShareIndex: number
  status: RaffleStatus
  prizeClaimed: boolean
  proceedsClaimed: boolean
  prizeRecovered: boolean
  bump: number
  vaultBump: number
}

export type ConfigAccount = {
  authority: PublicKey
  feeRecipient: PublicKey
  nextRaffleId: bigint
  protocolConfig: {
    allowDifferentTokens: boolean
    allowCustomShares: boolean
    allowCustomPrice: boolean
    allowCustomDrawDelay: boolean
    defaultShares: number
    priceDivisor: number
    defaultDrawDelaySlots: number
  }
  bump: number
}

export type ShareBoardAccount = {
  raffleId: bigint
  bump: number
  owners: PublicKey[]
}

export type BuyerRecordAccount = {
  raffleId: bigint
  buyer: PublicKey
  paid: bigint
  shareCount: number
  refunded: boolean
  bump: number
}

function u64(buf: Buffer, o: number): bigint {
  return buf.readBigUInt64LE(o)
}
function i64(buf: Buffer, o: number): bigint {
  return buf.readBigInt64LE(o)
}
function u32(buf: Buffer, o: number): number {
  return buf.readUInt32LE(o)
}
function pubkey(buf: Buffer, o: number): PublicKey {
  return new PublicKey(buf.subarray(o, o + 32))
}

/** Decode Anchor account body (skip 8-byte discriminator). */
export function decodePendingDraws(data: Buffer): PendingDrawsAccount {
  let o = 8
  const bump = data[o++]
  const len = u32(data, o)
  o += 4
  const raffleIds: bigint[] = []
  for (let i = 0; i < len; i++) {
    raffleIds.push(u64(data, o))
    o += 8
  }
  return { bump, raffleIds }
}

export function decodeRaffle(data: Buffer): RaffleAccount {
  let o = 8
  const raffleId = u64(data, o)
  o += 8
  const creator = pubkey(data, o)
  o += 32
  const prizeMint = pubkey(data, o)
  o += 32
  const paymentMint = pubkey(data, o)
  o += 32
  const prizeAmount = u64(data, o)
  o += 8
  const pricePerShare = u64(data, o)
  o += 8
  const totalShares = u32(data, o)
  o += 4
  const soldShares = u32(data, o)
  o += 4
  const deadline = i64(data, o)
  o += 8
  const drawDelaySlots = u32(data, o)
  o += 4
  const soldOutSlot = u64(data, o)
  o += 8
  const drawSlot = u64(data, o)
  o += 8
  const winnerShareIndex = u32(data, o)
  o += 4
  const status = data[o++] as RaffleStatus
  const prizeClaimed = data[o++] !== 0
  const proceedsClaimed = data[o++] !== 0
  const prizeRecovered = data[o++] !== 0
  const bump = data[o++]
  const vaultBump = data[o++]
  return {
    raffleId,
    creator,
    prizeMint,
    paymentMint,
    prizeAmount,
    pricePerShare,
    totalShares,
    soldShares,
    deadline,
    drawDelaySlots,
    soldOutSlot,
    drawSlot,
    winnerShareIndex,
    status,
    prizeClaimed,
    proceedsClaimed,
    prizeRecovered,
    bump,
    vaultBump,
  }
}

export function decodeConfig(data: Buffer): ConfigAccount {
  let o = 8
  const authority = pubkey(data, o)
  o += 32
  const feeRecipient = pubkey(data, o)
  o += 32
  const nextRaffleId = u64(data, o)
  o += 8
  const allowDifferentTokens = data[o++] !== 0
  const allowCustomShares = data[o++] !== 0
  const allowCustomPrice = data[o++] !== 0
  const allowCustomDrawDelay = data[o++] !== 0
  const defaultShares = u32(data, o)
  o += 4
  const priceDivisor = u32(data, o)
  o += 4
  const defaultDrawDelaySlots = u32(data, o)
  o += 4
  const bump = data[o++]
  return {
    authority,
    feeRecipient,
    nextRaffleId,
    protocolConfig: {
      allowDifferentTokens,
      allowCustomShares,
      allowCustomPrice,
      allowCustomDrawDelay,
      defaultShares,
      priceDivisor,
      defaultDrawDelaySlots,
    },
    bump,
  }
}

export function decodeShareBoard(data: Buffer): ShareBoardAccount {
  let o = 8
  const raffleId = u64(data, o)
  o += 8
  const bump = data[o++]
  const len = u32(data, o)
  o += 4
  const owners: PublicKey[] = []
  for (let i = 0; i < len; i++) {
    owners.push(pubkey(data, o))
    o += 32
  }
  return { raffleId, bump, owners }
}

export function decodeBuyerRecord(data: Buffer): BuyerRecordAccount {
  let o = 8
  const raffleId = u64(data, o)
  o += 8
  const buyer = pubkey(data, o)
  o += 32
  const paid = u64(data, o)
  o += 8
  const shareCount = u32(data, o)
  o += 4
  const refunded = data[o++] !== 0
  const bump = data[o++]
  return { raffleId, buyer, paid, shareCount, refunded, bump }
}

/** eligible_slot = sold_out_slot + draw_delay_slots (product rule). */
export function eligibleSlot(raffle: RaffleAccount): bigint {
  return raffle.soldOutSlot + BigInt(raffle.drawDelaySlots)
}
