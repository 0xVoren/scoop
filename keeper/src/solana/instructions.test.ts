import { PublicKey } from '@solana/web3.js'
import { describe, expect, it } from 'vitest'
import { IX, LAUNCH, NATIVE_MINT, SLOT_HASHES_SYSVAR } from './constants'
import {
  buildBuySharesIx,
  buildClaimPrizeIx,
  buildClaimProceedsIx,
  buildCloseBuyerRecordIx,
  buildCloseShareBoardIx,
  buildCreateRaffleIx,
  buildDrawIx,
  buildDrawManyIx,
  buildInitializeIx,
  buildRecoverPrizeIx,
  buildRefundIx,
  buildSetProtocolConfigIx,
  encodeProtocolConfig,
} from './instructions'
import { configPda, pendingPda, rafflePda, shareBoardPda } from './pdas'

const PROGRAM_ID = PublicKey.unique()

describe('solana instructions', () => {
  it('encodes protocol config and initialize / set_protocol_config', () => {
    const cfg = {
      allowDifferentTokens: false,
      allowCustomShares: false,
      allowCustomPrice: false,
      allowCustomDrawDelay: true,
      defaultShares: LAUNCH.shares,
      priceDivisor: LAUNCH.priceDivisor,
      defaultDrawDelaySlots: LAUNCH.drawDelaySlots,
    }
    const encoded = encodeProtocolConfig(cfg)
    expect(encoded[3]).toBe(1)
    expect(encoded.readUInt32LE(4)).toBe(LAUNCH.shares)

    const authority = PublicKey.unique()
    const fee = PublicKey.unique()
    const init = buildInitializeIx({
      programId: PROGRAM_ID,
      authority,
      feeRecipient: fee,
      protocolConfig: cfg,
    })
    expect(init.programId.equals(PROGRAM_ID)).toBe(true)
    expect(init.data.subarray(0, 8).equals(IX.initialize)).toBe(true)
    expect(init.keys[0]!.pubkey.equals(authority)).toBe(true)
    expect(init.keys[0]!.isSigner).toBe(true)
    const [config] = configPda(PROGRAM_ID)
    const [pending] = pendingPda(PROGRAM_ID)
    expect(init.keys[1]!.pubkey.equals(config)).toBe(true)
    expect(init.keys[2]!.pubkey.equals(pending)).toBe(true)

    const setCfg = buildSetProtocolConfigIx({
      programId: PROGRAM_ID,
      authority,
      protocolConfig: cfg,
    })
    expect(setCfg.data.subarray(0, 8).equals(IX.set_protocol_config)).toBe(true)
  })

  it('builds create / buy / draw / draw_many with native mints', () => {
    const creator = PublicKey.unique()
    const create = buildCreateRaffleIx({
      programId: PROGRAM_ID,
      creator,
      nextRaffleId: 3n,
      prizeAmount: 1_000n,
      pricePerShare: 100n,
      totalShares: 11,
      deadline: 1_800_000_000n,
      drawDelaySlots: 32,
    })
    expect(create.data.subarray(0, 8).equals(IX.create_raffle)).toBe(true)
    expect(create.data.readUInt32LE(8 + 32 + 32 + 8 + 8 + 4 + 8)).toBe(32)
    const [raffle] = rafflePda(PROGRAM_ID, 3n)
    const [board] = shareBoardPda(PROGRAM_ID, 3n)
    expect(create.keys[2]!.pubkey.equals(raffle)).toBe(true)
    expect(create.keys[3]!.pubkey.equals(board)).toBe(true)
    // Optional SPL accounts → programId sentinel (None)
    expect(create.keys[4]!.pubkey.equals(PROGRAM_ID)).toBe(true)

    const buyer = PublicKey.unique()
    const buyerRecord = PublicKey.unique()
    const buy = buildBuySharesIx({
      programId: PROGRAM_ID,
      buyer,
      raffleId: 3n,
      buyerRecord,
      count: 11,
    })
    expect(buy.data.subarray(0, 8).equals(IX.buy_shares)).toBe(true)
    expect(buy.data.readUInt32LE(8)).toBe(11)

    const draw = buildDrawIx({ programId: PROGRAM_ID, caller: creator, raffleId: 3n })
    expect(draw.data.equals(IX.draw)).toBe(true)
    expect(draw.keys.at(-1)!.pubkey.equals(new PublicKey(SLOT_HASHES_SYSVAR))).toBe(true)

    const many = buildDrawManyIx({
      programId: PROGRAM_ID,
      caller: creator,
      raffleIds: [3n, 4n],
    })
    expect(many.data.equals(IX.draw_many)).toBe(true)
    expect(many.keys.length).toBe(3 + 4) // caller+pending+sysvar + 2*(raffle,board)
  })

  it('builds claim / refund / recover native paths', () => {
    const actor = PublicKey.unique()
    const fee = PublicKey.unique()
    const record = PublicKey.unique()
    const claimPrize = buildClaimPrizeIx({
      programId: PROGRAM_ID,
      winner: actor,
      raffleId: 1n,
    })
    expect(claimPrize.data.equals(IX.claim_prize)).toBe(true)
    expect(new PublicKey(NATIVE_MINT).equals(new PublicKey(new Uint8Array(32)))).toBe(true)

    const claimProceeds = buildClaimProceedsIx({
      programId: PROGRAM_ID,
      creator: actor,
      feeRecipient: fee,
      raffleId: 1n,
    })
    expect(claimProceeds.data.equals(IX.claim_proceeds)).toBe(true)

    const refund = buildRefundIx({
      programId: PROGRAM_ID,
      buyer: actor,
      raffleId: 1n,
      buyerRecord: record,
    })
    expect(refund.data.equals(IX.refund)).toBe(true)

    const recover = buildRecoverPrizeIx({
      programId: PROGRAM_ID,
      creator: actor,
      raffleId: 1n,
    })
    expect(recover.data.equals(IX.recover_prize)).toBe(true)
  })

  it('builds close_share_board / close_buyer_record with authority + config', () => {
    const authority = PublicKey.unique()
    const recipient = PublicKey.unique()
    const buyer = PublicKey.unique()
    const record = PublicKey.unique()
    const [config] = configPda(PROGRAM_ID)

    const closeBoard = buildCloseShareBoardIx({
      programId: PROGRAM_ID,
      authority,
      recipient,
      raffleId: 7n,
    })
    expect(closeBoard.data.equals(IX.close_share_board)).toBe(true)
    expect(closeBoard.keys[0]!.pubkey.equals(authority)).toBe(true)
    expect(closeBoard.keys[0]!.isSigner).toBe(true)
    expect(closeBoard.keys[1]!.pubkey.equals(config)).toBe(true)
    expect(closeBoard.keys[2]!.pubkey.equals(recipient)).toBe(true)
    expect(closeBoard.keys[2]!.isWritable).toBe(true)
    expect(closeBoard.keys[2]!.isSigner).toBe(false)

    const closeBuyer = buildCloseBuyerRecordIx({
      programId: PROGRAM_ID,
      authority,
      recipient,
      raffleId: 7n,
      buyer,
      buyerRecord: record,
    })
    expect(closeBuyer.data.equals(IX.close_buyer_record)).toBe(true)
    expect(closeBuyer.keys[0]!.isSigner).toBe(true)
    expect(closeBuyer.keys[1]!.pubkey.equals(config)).toBe(true)
    expect(closeBuyer.keys[4]!.pubkey.equals(buyer)).toBe(true)
    expect(closeBuyer.keys[5]!.pubkey.equals(record)).toBe(true)
  })
})
