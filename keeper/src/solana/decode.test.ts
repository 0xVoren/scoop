import { PublicKey } from '@solana/web3.js'
import { describe, expect, it } from 'vitest'
import { RaffleStatus } from './constants'
import {
  decodeBuyerRecord,
  decodeConfig,
  decodePendingDraws,
  decodeRaffle,
  decodeShareBoard,
  eligibleSlot,
} from './decode'

function disc(): Buffer {
  return Buffer.alloc(8, 0xaa)
}

describe('solana decode', () => {
  it('decodes pending draws and raffle + eligibleSlot', () => {
    const bump = 7
    const ids = [1n, 42n]
    const pendingBody = Buffer.alloc(1 + 4 + 16)
    pendingBody[0] = bump
    pendingBody.writeUInt32LE(ids.length, 1)
    pendingBody.writeBigUInt64LE(ids[0]!, 5)
    pendingBody.writeBigUInt64LE(ids[1]!, 13)
    const pending = decodePendingDraws(Buffer.concat([disc(), pendingBody]))
    expect(pending.bump).toBe(bump)
    expect(pending.raffleIds).toEqual(ids)

    const creator = PublicKey.unique()
    const mint = PublicKey.unique()
    const body = Buffer.alloc(8 + 32 + 32 + 32 + 8 + 8 + 4 + 4 + 8 + 4 + 8 + 8 + 4 + 1 + 1 + 1 + 1 + 1 + 1)
    let o = 0
    body.writeBigUInt64LE(9n, o)
    o += 8
    creator.toBuffer().copy(body, o)
    o += 32
    mint.toBuffer().copy(body, o)
    o += 32
    mint.toBuffer().copy(body, o)
    o += 32
    body.writeBigUInt64LE(1_000n, o)
    o += 8
    body.writeBigUInt64LE(100n, o)
    o += 8
    body.writeUInt32LE(11, o)
    o += 4
    body.writeUInt32LE(11, o)
    o += 4
    body.writeBigInt64LE(1_700_000_000n, o)
    o += 8
    body.writeUInt32LE(32, o)
    o += 4
    body.writeBigUInt64LE(500n, o)
    o += 8
    body.writeBigUInt64LE(0n, o)
    o += 8
    body.writeUInt32LE(0, o)
    o += 4
    body[o++] = RaffleStatus.SoldOut
    body[o++] = 0
    body[o++] = 0
    body[o++] = 0
    body[o++] = 255
    body[o++] = 1

    const raffle = decodeRaffle(Buffer.concat([disc(), body]))
    expect(raffle.raffleId).toBe(9n)
    expect(raffle.creator.equals(creator)).toBe(true)
    expect(raffle.drawDelaySlots).toBe(32)
    expect(raffle.status).toBe(RaffleStatus.SoldOut)
    expect(eligibleSlot(raffle)).toBe(532n)
  })

  it('decodes config, share board, buyer record', () => {
    const authority = PublicKey.unique()
    const fee = PublicKey.unique()
    const cfg = Buffer.alloc(32 + 32 + 8 + 4 + 4 + 4 + 4 + 1)
    let o = 0
    authority.toBuffer().copy(cfg, o)
    o += 32
    fee.toBuffer().copy(cfg, o)
    o += 32
    cfg.writeBigUInt64LE(3n, o)
    o += 8
    cfg[o++] = 1
    cfg[o++] = 0
    cfg[o++] = 1
    cfg[o++] = 1
    cfg.writeUInt32LE(11, o)
    o += 4
    cfg.writeUInt32LE(10, o)
    o += 4
    cfg.writeUInt32LE(5, o)
    o += 4
    cfg[o++] = 200
    const config = decodeConfig(Buffer.concat([disc(), cfg]))
    expect(config.authority.equals(authority)).toBe(true)
    expect(config.nextRaffleId).toBe(3n)
    expect(config.protocolConfig.allowDifferentTokens).toBe(true)
    expect(config.protocolConfig.allowCustomDrawDelay).toBe(true)
    expect(config.bump).toBe(200)

    const owner = PublicKey.unique()
    const boardBody = Buffer.alloc(8 + 1 + 4 + 32)
    boardBody.writeBigUInt64LE(7n, 0)
    boardBody[8] = 9
    boardBody.writeUInt32LE(1, 9)
    owner.toBuffer().copy(boardBody, 13)
    const board = decodeShareBoard(Buffer.concat([disc(), boardBody]))
    expect(board.raffleId).toBe(7n)
    expect(board.owners[0]!.equals(owner)).toBe(true)

    const buyer = PublicKey.unique()
    const br = Buffer.alloc(8 + 32 + 8 + 4 + 1 + 1)
    br.writeBigUInt64LE(7n, 0)
    buyer.toBuffer().copy(br, 8)
    br.writeBigUInt64LE(500n, 40)
    br.writeUInt32LE(2, 48)
    br[52] = 1
    br[53] = 3
    const record = decodeBuyerRecord(Buffer.concat([disc(), br]))
    expect(record.buyer.equals(buyer)).toBe(true)
    expect(record.paid).toBe(500n)
    expect(record.shareCount).toBe(2)
    expect(record.refunded).toBe(true)
  })
})
