import { createHash } from 'node:crypto'
import { PublicKey } from '@solana/web3.js'
import { describe, expect, it } from 'vitest'

/** Mirror web Raffle GPA constants — keep in sync with IDL / web constants. */
const RAFFLE_DISCRIMINATOR = Uint8Array.from([143, 133, 63, 173, 138, 10, 142, 200])
const RAFFLE_DATA_SIZE = 174
const RAFFLE_CREATOR_OFFSET = 16
const RAFFLE_PRIZE_MINT_OFFSET = 48

function anchorAccountDisc(name: string): Uint8Array {
  const h = createHash('sha256').update(`account:${name}`).digest()
  return new Uint8Array(h.subarray(0, 8))
}

describe('Raffle GPA discovery contract', () => {
  it('discriminator matches Anchor account:Raffle', () => {
    expect([...anchorAccountDisc('Raffle')]).toEqual([...RAFFLE_DISCRIMINATOR])
  })

  it('fixed size and pubkey offsets match InitSpace layout', () => {
    // 8 disc + body fields in decodeRaffle
    const body =
      8 + // raffle_id
      32 + // creator
      32 + // prize_mint
      32 + // payment_mint
      8 + // prize_amount
      8 + // price_per_share
      4 + // total_shares
      4 + // sold_shares
      8 + // deadline
      4 + // draw_delay_slots
      8 + // sold_out_slot
      8 + // draw_slot
      4 + // winner_share_index
      1 + // status
      1 + // prize_claimed
      1 + // proceeds_claimed
      1 + // prize_recovered
      1 + // bump
      1 // vault_bump
    expect(RAFFLE_DATA_SIZE).toBe(8 + body)
    expect(RAFFLE_CREATOR_OFFSET).toBe(8 + 8)
    expect(RAFFLE_PRIZE_MINT_OFFSET).toBe(8 + 8 + 32)
  })

  it('layout places creator / prize mint where memcmp expects them', () => {
    const creator = PublicKey.unique()
    const mint = PublicKey.unique()
    const data = Buffer.alloc(RAFFLE_DATA_SIZE)
    Buffer.from(RAFFLE_DISCRIMINATOR).copy(data, 0)
    data.writeBigUInt64LE(7n, 8)
    creator.toBuffer().copy(data, RAFFLE_CREATOR_OFFSET)
    mint.toBuffer().copy(data, RAFFLE_PRIZE_MINT_OFFSET)
    expect(data.subarray(16, 48).equals(creator.toBuffer())).toBe(true)
    expect(data.subarray(48, 80).equals(mint.toBuffer())).toBe(true)
    expect(data.length).toBe(RAFFLE_DATA_SIZE)
  })
})
