import { createHash } from 'node:crypto'
import { PublicKey } from '@solana/web3.js'
import { describe, expect, it } from 'vitest'

/** Mirror web BuyerRecord GPA constants — keep in sync with IDL / web constants. */
const BUYER_RECORD_DISCRIMINATOR = Uint8Array.from([107, 122, 54, 31, 4, 54, 209, 38])
const BUYER_RECORD_DATA_SIZE = 62
const BUYER_RECORD_BUYER_OFFSET = 16

function anchorAccountDisc(name: string): Uint8Array {
  const h = createHash('sha256').update(`account:${name}`).digest()
  return new Uint8Array(h.subarray(0, 8))
}

describe('BuyerRecord GPA discovery contract', () => {
  it('discriminator matches Anchor account:BuyerRecord', () => {
    expect([...anchorAccountDisc('BuyerRecord')]).toEqual([...BUYER_RECORD_DISCRIMINATOR])
  })

  it('buyer pubkey sits at offset 16 (8 disc + 8 raffle_id)', () => {
    expect(BUYER_RECORD_BUYER_OFFSET).toBe(16)
    expect(BUYER_RECORD_DATA_SIZE).toBe(8 + 8 + 32 + 8 + 4 + 1 + 1)
  })

  it('layout places buyer bytes where memcmp expects them', () => {
    const buyer = PublicKey.unique()
    const data = Buffer.alloc(BUYER_RECORD_DATA_SIZE)
    Buffer.from(BUYER_RECORD_DISCRIMINATOR).copy(data, 0)
    data.writeBigUInt64LE(42n, 8)
    buyer.toBuffer().copy(data, BUYER_RECORD_BUYER_OFFSET)
    expect(data.subarray(16, 48).equals(buyer.toBuffer())).toBe(true)
    expect(data.length).toBe(BUYER_RECORD_DATA_SIZE)
  })
})
