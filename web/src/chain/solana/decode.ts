import { PublicKey } from '@solana/web3.js'
import type { RaffleStatus } from '@/chain/solana/constants'
import type { RaffleReadModel } from '@/chain/types'

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

function asBuf(data: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data)
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
export function decodePendingDraws(data: Buffer | Uint8Array): PendingDrawsAccount {
  const buf = asBuf(data)
  let o = 8
  const bump = buf[o++]!
  const len = u32(buf, o)
  o += 4
  const raffleIds: bigint[] = []
  for (let i = 0; i < len; i++) {
    raffleIds.push(u64(buf, o))
    o += 8
  }
  return { bump, raffleIds }
}

export function decodeRaffle(data: Buffer | Uint8Array): RaffleAccount {
  const buf = asBuf(data)
  let o = 8
  const raffleId = u64(buf, o)
  o += 8
  const creator = pubkey(buf, o)
  o += 32
  const prizeMint = pubkey(buf, o)
  o += 32
  const paymentMint = pubkey(buf, o)
  o += 32
  const prizeAmount = u64(buf, o)
  o += 8
  const pricePerShare = u64(buf, o)
  o += 8
  const totalShares = u32(buf, o)
  o += 4
  const soldShares = u32(buf, o)
  o += 4
  const deadline = i64(buf, o)
  o += 8
  const drawDelaySlots = u32(buf, o)
  o += 4
  const soldOutSlot = u64(buf, o)
  o += 8
  const drawSlot = u64(buf, o)
  o += 8
  const winnerShareIndex = u32(buf, o)
  o += 4
  const status = buf[o++]! as RaffleStatus
  const prizeClaimed = buf[o++]! !== 0
  const proceedsClaimed = buf[o++]! !== 0
  const prizeRecovered = buf[o++]! !== 0
  const bump = buf[o++]!
  const vaultBump = buf[o++]!
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

export function decodeConfig(data: Buffer | Uint8Array): ConfigAccount {
  const buf = asBuf(data)
  let o = 8
  const authority = pubkey(buf, o)
  o += 32
  const feeRecipient = pubkey(buf, o)
  o += 32
  const nextRaffleId = u64(buf, o)
  o += 8
  const allowDifferentTokens = buf[o++]! !== 0
  const allowCustomShares = buf[o++]! !== 0
  const allowCustomPrice = buf[o++]! !== 0
  const allowCustomDrawDelay = buf[o++]! !== 0
  const defaultShares = u32(buf, o)
  o += 4
  const priceDivisor = u32(buf, o)
  o += 4
  const defaultDrawDelaySlots = u32(buf, o)
  o += 4
  const bump = buf[o++]!
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

export function decodeShareBoard(data: Buffer | Uint8Array): ShareBoardAccount {
  const buf = asBuf(data)
  let o = 8
  const raffleId = u64(buf, o)
  o += 8
  const bump = buf[o++]!
  const len = u32(buf, o)
  o += 4
  const owners: PublicKey[] = []
  for (let i = 0; i < len; i++) {
    owners.push(pubkey(buf, o))
    o += 32
  }
  return { raffleId, bump, owners }
}

/** BuyerRecord: raffle_id + buyer + paid + share_count + refunded + bump. */
export function decodeBuyerRecord(data: Buffer | Uint8Array): BuyerRecordAccount {
  const buf = asBuf(data)
  let o = 8
  const raffleId = u64(buf, o)
  o += 8
  const buyer = pubkey(buf, o)
  o += 32
  const paid = u64(buf, o)
  o += 8
  const shareCount = u32(buf, o)
  o += 4
  const refunded = buf[o++]! !== 0
  const bump = buf[o++]!
  return { raffleId, buyer, paid, shareCount, refunded, bump }
}

/** eligible_slot = sold_out_slot + draw_delay_slots */
export function eligibleSlot(raffle: RaffleAccount): bigint {
  return raffle.soldOutSlot + BigInt(raffle.drawDelaySlots)
}

/** Map on-chain raffle account → shared UI read model. */
export function raffleAccountToReadModel(r: RaffleAccount): RaffleReadModel {
  return {
    raffleId: r.raffleId,
    creator: r.creator.toBase58(),
    prizeToken: r.prizeMint.toBase58(),
    paymentToken: r.paymentMint.toBase58(),
    prizeAmount: r.prizeAmount,
    pricePerShare: r.pricePerShare,
    totalShares: r.totalShares,
    soldShares: r.soldShares,
    deadline: r.deadline,
    drawDelay: r.drawDelaySlots,
    soldOutAt: r.soldOutSlot,
    drawAt: r.drawSlot,
    winnerShareIndex: r.winnerShareIndex,
    // Secondary indexes not mirrored on Solana MVP.
    tokenOrderId: 0,
    userOrderId: 0,
    status: r.status,
    prizeClaimed: r.prizeClaimed,
    proceedsClaimed: r.proceedsClaimed,
    prizeRecovered: r.prizeRecovered,
  }
}
