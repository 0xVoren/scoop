import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js'
import { IX, NATIVE_MINT, SLOT_HASHES_SYSVAR, TOKEN_PROGRAM_ID } from './constants'
import { configPda, pendingPda, rafflePda, shareBoardPda } from './pdas'

/** Anchor Option account: pass programId to mean None. */
function optNone(programId: PublicKey): PublicKey {
  return programId
}

function meta(
  pubkey: PublicKey,
  opts: { isSigner?: boolean; isWritable?: boolean } = {},
) {
  return {
    pubkey,
    isSigner: !!opts.isSigner,
    isWritable: !!opts.isWritable,
  }
}

function isNativeMint(mint: PublicKey): boolean {
  return mint.equals(new PublicKey(NATIVE_MINT))
}

export type ProtocolConfigArgs = {
  allowDifferentTokens: boolean
  allowCustomShares: boolean
  allowCustomPrice: boolean
  allowCustomDrawDelay: boolean
  defaultShares: number
  priceDivisor: number
  defaultDrawDelaySlots: number
}

export type SplAccounts = {
  /** User ATA (source or destination). */
  userAta?: PublicKey
  /** Raffle vault ATA (authority = raffle PDA). */
  vaultAta?: PublicKey
  /** Extra ATA (fee recipient / creator payment / etc.). */
  extraAta?: PublicKey
  tokenProgram?: PublicKey
}

export function encodeProtocolConfig(c: ProtocolConfigArgs): Buffer {
  const buf = Buffer.alloc(4 + 12)
  let o = 0
  buf[o++] = c.allowDifferentTokens ? 1 : 0
  buf[o++] = c.allowCustomShares ? 1 : 0
  buf[o++] = c.allowCustomPrice ? 1 : 0
  buf[o++] = c.allowCustomDrawDelay ? 1 : 0
  buf.writeUInt32LE(c.defaultShares, o)
  o += 4
  buf.writeUInt32LE(c.priceDivisor, o)
  o += 4
  buf.writeUInt32LE(c.defaultDrawDelaySlots, o)
  return buf
}

export function buildInitializeIx(args: {
  programId: PublicKey
  authority: PublicKey
  feeRecipient: PublicKey
  protocolConfig: ProtocolConfigArgs
}): TransactionInstruction {
  const [config] = configPda(args.programId)
  const [pending] = pendingPda(args.programId)
  const data = Buffer.concat([
    IX.initialize,
    args.feeRecipient.toBuffer(),
    encodeProtocolConfig(args.protocolConfig),
  ])
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      meta(args.authority, { isSigner: true, isWritable: true }),
      meta(config, { isWritable: true }),
      meta(pending, { isWritable: true }),
      meta(SystemProgram.programId),
    ],
    data,
  })
}

export function buildSetProtocolConfigIx(args: {
  programId: PublicKey
  authority: PublicKey
  protocolConfig: ProtocolConfigArgs
}): TransactionInstruction {
  const [config] = configPda(args.programId)
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      meta(args.authority, { isSigner: true }),
      meta(config, { isWritable: true }),
    ],
    data: Buffer.concat([IX.set_protocol_config, encodeProtocolConfig(args.protocolConfig)]),
  })
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
  const prizeMint = args.prizeMint ?? new PublicKey(NATIVE_MINT)
  const paymentMint = args.paymentMint ?? new PublicKey(NATIVE_MINT)
  const prizeIsSpl = !isNativeMint(prizeMint)

  const data = Buffer.alloc(8 + 32 + 32 + 8 + 8 + 4 + 8 + 4)
  let o = 0
  IX.create_raffle.copy(data, o)
  o += 8
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

  const none = optNone(args.programId)
  const tokenProgram = args.tokenProgram ?? new PublicKey(TOKEN_PROGRAM_ID)
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      meta(args.creator, { isSigner: true, isWritable: true }),
      meta(config, { isWritable: true }),
      meta(raffle, { isWritable: true }),
      meta(shareBoard, { isWritable: true }),
      meta(prizeIsSpl ? args.creatorPrizeAta! : none, {
        isWritable: prizeIsSpl,
      }),
      meta(prizeIsSpl ? args.prizeVaultAta! : none, {
        isWritable: prizeIsSpl,
      }),
      meta(prizeIsSpl ? tokenProgram : none),
      meta(SystemProgram.programId),
    ],
    data,
  })
}

export function buildBuySharesIx(args: {
  programId: PublicKey
  buyer: PublicKey
  raffleId: bigint
  buyerRecord: PublicKey
  count: number
  /** Required when payment is SPL. */
  paymentMint?: PublicKey
  buyerPaymentAta?: PublicKey
  paymentVaultAta?: PublicKey
  tokenProgram?: PublicKey
}): TransactionInstruction {
  const [raffle] = rafflePda(args.programId, args.raffleId)
  const [shareBoard] = shareBoardPda(args.programId, args.raffleId)
  const [pending] = pendingPda(args.programId)
  const none = optNone(args.programId)
  const paymentMint = args.paymentMint ?? new PublicKey(NATIVE_MINT)
  const paymentIsSpl = !isNativeMint(paymentMint)
  const tokenProgram = args.tokenProgram ?? new PublicKey(TOKEN_PROGRAM_ID)
  const data = Buffer.alloc(12)
  IX.buy_shares.copy(data, 0)
  data.writeUInt32LE(args.count, 8)

  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      meta(args.buyer, { isSigner: true, isWritable: true }),
      meta(raffle, { isWritable: true }),
      meta(shareBoard, { isWritable: true }),
      meta(args.buyerRecord, { isWritable: true }),
      meta(pending, { isWritable: true }),
      meta(paymentIsSpl ? args.buyerPaymentAta! : none, {
        isWritable: paymentIsSpl,
      }),
      meta(paymentIsSpl ? args.paymentVaultAta! : none, {
        isWritable: paymentIsSpl,
      }),
      meta(paymentIsSpl ? tokenProgram : none),
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

/**
 * draw_many remaining_accounts layout: [raffle_0, share_board_0, raffle_1, share_board_1, ...]
 */
export function buildDrawManyIx(args: {
  programId: PublicKey
  caller: PublicKey
  raffleIds: bigint[]
}): TransactionInstruction {
  const [pending] = pendingPda(args.programId)
  const keys = [
    meta(args.caller, { isSigner: true }),
    meta(pending, { isWritable: true }),
    meta(new PublicKey(SLOT_HASHES_SYSVAR)),
  ]
  for (const id of args.raffleIds) {
    const [raffle] = rafflePda(args.programId, id)
    const [shareBoard] = shareBoardPda(args.programId, id)
    keys.push(meta(raffle, { isWritable: true }), meta(shareBoard))
  }
  return new TransactionInstruction({
    programId: args.programId,
    keys,
    data: Buffer.from(IX.draw_many),
  })
}

export function buildClaimPrizeIx(args: {
  programId: PublicKey
  winner: PublicKey
  raffleId: bigint
  prizeMint?: PublicKey
  prizeVaultAta?: PublicKey
  winnerPrizeAta?: PublicKey
  tokenProgram?: PublicKey
}): TransactionInstruction {
  const [raffle] = rafflePda(args.programId, args.raffleId)
  const [shareBoard] = shareBoardPda(args.programId, args.raffleId)
  const none = optNone(args.programId)
  const prizeMint = args.prizeMint ?? new PublicKey(NATIVE_MINT)
  const prizeIsSpl = !isNativeMint(prizeMint)
  const tokenProgram = args.tokenProgram ?? new PublicKey(TOKEN_PROGRAM_ID)
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      meta(args.winner, { isSigner: true, isWritable: true }),
      meta(raffle, { isWritable: true }),
      meta(shareBoard),
      meta(prizeIsSpl ? args.prizeVaultAta! : none, { isWritable: prizeIsSpl }),
      meta(prizeIsSpl ? args.winnerPrizeAta! : none, { isWritable: prizeIsSpl }),
      meta(prizeIsSpl ? tokenProgram : none),
    ],
    data: Buffer.from(IX.claim_prize),
  })
}

export function buildClaimProceedsIx(args: {
  programId: PublicKey
  creator: PublicKey
  feeRecipient: PublicKey
  raffleId: bigint
  paymentMint?: PublicKey
  paymentVaultAta?: PublicKey
  feeRecipientAta?: PublicKey
  creatorPaymentAta?: PublicKey
  tokenProgram?: PublicKey
}): TransactionInstruction {
  const [config] = configPda(args.programId)
  const [raffle] = rafflePda(args.programId, args.raffleId)
  const none = optNone(args.programId)
  const paymentMint = args.paymentMint ?? new PublicKey(NATIVE_MINT)
  const paymentIsSpl = !isNativeMint(paymentMint)
  const tokenProgram = args.tokenProgram ?? new PublicKey(TOKEN_PROGRAM_ID)
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      meta(args.creator, { isSigner: true, isWritable: true }),
      meta(config),
      meta(raffle, { isWritable: true }),
      meta(args.feeRecipient, { isWritable: true }),
      meta(paymentIsSpl ? args.paymentVaultAta! : none, {
        isWritable: paymentIsSpl,
      }),
      meta(paymentIsSpl ? args.feeRecipientAta! : none, {
        isWritable: paymentIsSpl,
      }),
      meta(paymentIsSpl ? args.creatorPaymentAta! : none, {
        isWritable: paymentIsSpl,
      }),
      meta(paymentIsSpl ? tokenProgram : none),
    ],
    data: Buffer.from(IX.claim_proceeds),
  })
}

export function buildRefundIx(args: {
  programId: PublicKey
  buyer: PublicKey
  raffleId: bigint
  buyerRecord: PublicKey
  paymentMint?: PublicKey
  paymentVaultAta?: PublicKey
  buyerPaymentAta?: PublicKey
  tokenProgram?: PublicKey
}): TransactionInstruction {
  const [raffle] = rafflePda(args.programId, args.raffleId)
  const [pending] = pendingPda(args.programId)
  const none = optNone(args.programId)
  const paymentMint = args.paymentMint ?? new PublicKey(NATIVE_MINT)
  const paymentIsSpl = !isNativeMint(paymentMint)
  const tokenProgram = args.tokenProgram ?? new PublicKey(TOKEN_PROGRAM_ID)
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      meta(args.buyer, { isSigner: true, isWritable: true }),
      meta(raffle, { isWritable: true }),
      meta(args.buyerRecord, { isWritable: true }),
      meta(pending, { isWritable: true }),
      meta(paymentIsSpl ? args.paymentVaultAta! : none, {
        isWritable: paymentIsSpl,
      }),
      meta(paymentIsSpl ? args.buyerPaymentAta! : none, {
        isWritable: paymentIsSpl,
      }),
      meta(paymentIsSpl ? tokenProgram : none),
    ],
    data: Buffer.from(IX.refund),
  })
}

export function buildRecoverPrizeIx(args: {
  programId: PublicKey
  creator: PublicKey
  raffleId: bigint
  prizeMint?: PublicKey
  prizeVaultAta?: PublicKey
  creatorPrizeAta?: PublicKey
  tokenProgram?: PublicKey
}): TransactionInstruction {
  const [raffle] = rafflePda(args.programId, args.raffleId)
  const [pending] = pendingPda(args.programId)
  const none = optNone(args.programId)
  const prizeMint = args.prizeMint ?? new PublicKey(NATIVE_MINT)
  const prizeIsSpl = !isNativeMint(prizeMint)
  const tokenProgram = args.tokenProgram ?? new PublicKey(TOKEN_PROGRAM_ID)
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      meta(args.creator, { isSigner: true, isWritable: true }),
      meta(raffle, { isWritable: true }),
      meta(pending, { isWritable: true }),
      meta(prizeIsSpl ? args.prizeVaultAta! : none, { isWritable: prizeIsSpl }),
      meta(prizeIsSpl ? args.creatorPrizeAta! : none, { isWritable: prizeIsSpl }),
      meta(prizeIsSpl ? tokenProgram : none),
    ],
    data: Buffer.from(IX.recover_prize),
  })
}
