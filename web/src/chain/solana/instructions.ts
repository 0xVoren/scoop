import { type AccountMeta, PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js'
import { IX, NATIVE_MINT_PUBKEY, SLOT_HASHES_SYSVAR } from '@/chain/solana/constants'
import {
  buyerRecordPda,
  configPda,
  pendingPda,
  rafflePda,
  shareBoardPda,
} from '@/chain/solana/pdas'

/** Anchor Option account: pass programId to mean None. */
function optNone(programId: PublicKey): PublicKey {
  return programId
}

function meta(
  pubkey: PublicKey,
  opts: { isSigner?: boolean; isWritable?: boolean } = {},
): AccountMeta {
  return {
    pubkey,
    isSigner: !!opts.isSigner,
    isWritable: !!opts.isWritable,
  }
}

function writeBytes(target: Buffer, offset: number, src: Uint8Array): number {
  Buffer.from(src).copy(target, offset)
  return offset + src.length
}

export function buildCreateRaffleIx(args: {
  programId: PublicKey
  creator: PublicKey
  nextRaffleId: bigint
  prizeMint?: PublicKey
  paymentMint?: PublicKey
  prizeAmount: bigint
  pricePerShare: bigint
  totalShares: number
  deadline: bigint
  drawDelaySlots: number
  /** Required when prize is SPL. */
  creatorPrizeAta?: PublicKey
  prizeVaultAta?: PublicKey
  tokenProgram?: PublicKey
}): TransactionInstruction {
  const [config] = configPda(args.programId)
  const [raffle] = rafflePda(args.programId, args.nextRaffleId)
  const [shareBoard] = shareBoardPda(args.programId, args.nextRaffleId)
  const prizeMint = args.prizeMint ?? NATIVE_MINT_PUBKEY
  const paymentMint = args.paymentMint ?? NATIVE_MINT_PUBKEY
  const none = optNone(args.programId)

  const data = Buffer.alloc(8 + 32 + 32 + 8 + 8 + 4 + 8 + 4)
  let o = 0
  o = writeBytes(data, o, IX.create_raffle)
  prizeMint.toBuffer().copy(data, o)
  o += 32
  paymentMint.toBuffer().copy(data, o)
  o += 32
  data.writeBigUInt64LE(args.prizeAmount, o)
  o += 8
  data.writeBigUInt64LE(args.pricePerShare, o)
  o += 8
  data.writeUInt32LE(args.totalShares, o)
  o += 4
  data.writeBigInt64LE(args.deadline, o)
  o += 8
  data.writeUInt32LE(args.drawDelaySlots, o)

  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      meta(args.creator, { isSigner: true, isWritable: true }),
      meta(config, { isWritable: true }),
      meta(raffle, { isWritable: true }),
      meta(shareBoard, { isWritable: true }),
      meta(args.creatorPrizeAta ?? none, { isWritable: !!args.creatorPrizeAta }),
      meta(args.prizeVaultAta ?? none, { isWritable: !!args.prizeVaultAta }),
      meta(args.tokenProgram ?? none),
      meta(SystemProgram.programId),
    ],
    data,
  })
}

export function buildBuySharesIx(args: {
  programId: PublicKey
  buyer: PublicKey
  raffleId: bigint
  count: number
  buyerPaymentAta?: PublicKey
  paymentVaultAta?: PublicKey
  tokenProgram?: PublicKey
}): TransactionInstruction {
  const [raffle] = rafflePda(args.programId, args.raffleId)
  const [shareBoard] = shareBoardPda(args.programId, args.raffleId)
  const [pending] = pendingPda(args.programId)
  const [buyerRecord] = buyerRecordPda(args.programId, args.raffleId, args.buyer)
  const none = optNone(args.programId)
  const data = Buffer.alloc(12)
  writeBytes(data, 0, IX.buy_shares)
  data.writeUInt32LE(args.count, 8)

  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      meta(args.buyer, { isSigner: true, isWritable: true }),
      meta(raffle, { isWritable: true }),
      meta(shareBoard, { isWritable: true }),
      meta(buyerRecord, { isWritable: true }),
      meta(pending, { isWritable: true }),
      meta(args.buyerPaymentAta ?? none, { isWritable: !!args.buyerPaymentAta }),
      meta(args.paymentVaultAta ?? none, { isWritable: !!args.paymentVaultAta }),
      meta(args.tokenProgram ?? none),
      meta(SystemProgram.programId),
    ],
    data,
  })
}

export function buildDrawIx(args: {
  programId: PublicKey
  caller: PublicKey
  raffleId: bigint
}): TransactionInstruction {
  const [raffle] = rafflePda(args.programId, args.raffleId)
  const [shareBoard] = shareBoardPda(args.programId, args.raffleId)
  const [pending] = pendingPda(args.programId)
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      meta(args.caller, { isSigner: true }),
      meta(raffle, { isWritable: true }),
      meta(shareBoard),
      meta(pending, { isWritable: true }),
      meta(new PublicKey(SLOT_HASHES_SYSVAR)),
    ],
    data: Buffer.from(IX.draw),
  })
}

export function buildClaimPrizeIx(args: {
  programId: PublicKey
  winner: PublicKey
  raffleId: bigint
  prizeVaultAta?: PublicKey
  winnerPrizeAta?: PublicKey
  tokenProgram?: PublicKey
}): TransactionInstruction {
  const [raffle] = rafflePda(args.programId, args.raffleId)
  const [shareBoard] = shareBoardPda(args.programId, args.raffleId)
  const none = optNone(args.programId)
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      meta(args.winner, { isSigner: true, isWritable: true }),
      meta(raffle, { isWritable: true }),
      meta(shareBoard),
      meta(args.prizeVaultAta ?? none, { isWritable: !!args.prizeVaultAta }),
      meta(args.winnerPrizeAta ?? none, { isWritable: !!args.winnerPrizeAta }),
      meta(args.tokenProgram ?? none),
    ],
    data: Buffer.from(IX.claim_prize),
  })
}

export function buildClaimProceedsIx(args: {
  programId: PublicKey
  creator: PublicKey
  feeRecipient: PublicKey
  raffleId: bigint
  paymentVaultAta?: PublicKey
  feeRecipientAta?: PublicKey
  creatorPaymentAta?: PublicKey
  tokenProgram?: PublicKey
}): TransactionInstruction {
  const [config] = configPda(args.programId)
  const [raffle] = rafflePda(args.programId, args.raffleId)
  const none = optNone(args.programId)
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      meta(args.creator, { isSigner: true, isWritable: true }),
      meta(config),
      meta(raffle, { isWritable: true }),
      meta(args.feeRecipient, { isWritable: true }),
      meta(args.paymentVaultAta ?? none, { isWritable: !!args.paymentVaultAta }),
      meta(args.feeRecipientAta ?? none, { isWritable: !!args.feeRecipientAta }),
      meta(args.creatorPaymentAta ?? none, { isWritable: !!args.creatorPaymentAta }),
      meta(args.tokenProgram ?? none),
    ],
    data: Buffer.from(IX.claim_proceeds),
  })
}

export function buildRefundIx(args: {
  programId: PublicKey
  buyer: PublicKey
  raffleId: bigint
  paymentVaultAta?: PublicKey
  buyerPaymentAta?: PublicKey
  tokenProgram?: PublicKey
}): TransactionInstruction {
  const [raffle] = rafflePda(args.programId, args.raffleId)
  const [buyerRecord] = buyerRecordPda(args.programId, args.raffleId, args.buyer)
  const [pending] = pendingPda(args.programId)
  const none = optNone(args.programId)
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      meta(args.buyer, { isSigner: true, isWritable: true }),
      meta(raffle, { isWritable: true }),
      meta(buyerRecord, { isWritable: true }),
      meta(pending, { isWritable: true }),
      meta(args.paymentVaultAta ?? none, { isWritable: !!args.paymentVaultAta }),
      meta(args.buyerPaymentAta ?? none, { isWritable: !!args.buyerPaymentAta }),
      meta(args.tokenProgram ?? none),
    ],
    data: Buffer.from(IX.refund),
  })
}

export function buildRecoverPrizeIx(args: {
  programId: PublicKey
  creator: PublicKey
  raffleId: bigint
  prizeVaultAta?: PublicKey
  creatorPrizeAta?: PublicKey
  tokenProgram?: PublicKey
}): TransactionInstruction {
  const [raffle] = rafflePda(args.programId, args.raffleId)
  const [pending] = pendingPda(args.programId)
  const none = optNone(args.programId)
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      meta(args.creator, { isSigner: true, isWritable: true }),
      meta(raffle, { isWritable: true }),
      meta(pending, { isWritable: true }),
      meta(args.prizeVaultAta ?? none, { isWritable: !!args.prizeVaultAta }),
      meta(args.creatorPrizeAta ?? none, { isWritable: !!args.creatorPrizeAta }),
      meta(args.tokenProgram ?? none),
    ],
    data: Buffer.from(IX.recover_prize),
  })
}
