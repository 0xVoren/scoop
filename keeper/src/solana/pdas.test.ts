import { PublicKey } from '@solana/web3.js'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PROGRAM_ID } from './constants'
import {
  buyerRecordPda,
  configPda,
  pendingPda,
  raffleIdLe,
  rafflePda,
  shareBoardPda,
} from './pdas'

const PROGRAM_ID = new PublicKey(DEFAULT_PROGRAM_ID)

describe('solana pdas', () => {
  it('derives stable config / pending PDAs', () => {
    const [a1, b1] = configPda(PROGRAM_ID)
    const [a2, b2] = configPda(PROGRAM_ID)
    expect(a1.equals(a2)).toBe(true)
    expect(b1).toBe(b2)

    const [p1] = pendingPda(PROGRAM_ID)
    const [p2] = pendingPda(PROGRAM_ID)
    expect(p1.equals(p2)).toBe(true)
    expect(p1.equals(a1)).toBe(false)
  })

  it('encodes raffle id little-endian and scopes PDAs by id', () => {
    expect(raffleIdLe(1).equals(Buffer.from([1, 0, 0, 0, 0, 0, 0, 0]))).toBe(true)
    const [r1] = rafflePda(PROGRAM_ID, 1)
    const [r2] = rafflePda(PROGRAM_ID, 2)
    expect(r1.equals(r2)).toBe(false)

    const [s1] = shareBoardPda(PROGRAM_ID, 1n)
    expect(s1.equals(r1)).toBe(false)

    const buyer = PublicKey.unique()
    const [b1] = buyerRecordPda(PROGRAM_ID, 1, buyer)
    const [b2] = buyerRecordPda(PROGRAM_ID, 1, PublicKey.unique())
    expect(b1.equals(b2)).toBe(false)
  })
})
