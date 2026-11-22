import { type GetProgramAccountsFilter, PublicKey } from '@solana/web3.js'
import {
  BUYER_RECORD_BUYER_OFFSET,
  BUYER_RECORD_DATA_SIZE,
  BUYER_RECORD_DISCRIMINATOR,
} from '@/chain/solana/constants'

/** bs58 alphabet — encode raw bytes without pulling an extra dependency. */
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function encodeBs58(bytes: Uint8Array): string {
  if (bytes.length === 0) return ''
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++
  const digits = [0]
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i]!
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j]! << 8
      digits[j] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }
  let out = ''
  for (let i = 0; i < zeros; i++) out += '1'
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]!]
  return out
}

/** GPA filters: BuyerRecord disc @0 + buyer pubkey @16 (+ exact size). */
export function buyerRecordFiltersForBuyer(buyer: PublicKey | string): GetProgramAccountsFilter[] {
  const buyerPk = typeof buyer === 'string' ? new PublicKey(buyer) : buyer
  return [
    { dataSize: BUYER_RECORD_DATA_SIZE },
    {
      memcmp: {
        offset: 0,
        bytes: encodeBs58(BUYER_RECORD_DISCRIMINATOR),
      },
    },
    {
      memcmp: {
        offset: BUYER_RECORD_BUYER_OFFSET,
        bytes: buyerPk.toBase58(),
      },
    },
  ]
}

export { encodeBs58 as encodeBuyerDiscBs58 }
