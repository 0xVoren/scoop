/**
 * Smoke: list BuyerRecords for a wallet via getProgramAccounts.
 *
 *   SOLANA_RPC_URL=... SOLANA_PROGRAM_ID=... BUYER=<pubkey> pnpm exec tsx scripts/smoke-solana-buyer-index.ts
 */
import { createHash } from 'node:crypto'
import { Connection, PublicKey, type GetProgramAccountsFilter } from '@solana/web3.js'

const DISC = (() => {
  const h = createHash('sha256').update('account:BuyerRecord').digest()
  return Uint8Array.from(h.subarray(0, 8))
})()

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function bs58(bytes: Uint8Array): string {
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
  let out = '1'.repeat(zeros)
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]!]
  return out
}

function filters(buyer: PublicKey): GetProgramAccountsFilter[] {
  return [
    { dataSize: 62 },
    { memcmp: { offset: 0, bytes: bs58(DISC) } },
    { memcmp: { offset: 16, bytes: buyer.toBase58() } },
  ]
}

async function main() {
  const rpc = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL
  const programId = process.env.SOLANA_PROGRAM_ID || process.env.NEXT_PUBLIC_SOLANA_PROGRAM_ID
  const buyerStr = process.env.BUYER
  if (!rpc || !programId || !buyerStr) {
    console.error('Need SOLANA_RPC_URL, SOLANA_PROGRAM_ID, BUYER')
    process.exit(1)
  }
  const connection = new Connection(rpc, 'confirmed')
  const pid = new PublicKey(programId)
  const buyer = new PublicKey(buyerStr)
  console.log('program', pid.toBase58())
  console.log('buyer', buyer.toBase58())
  try {
    const accounts = await connection.getProgramAccounts(pid, {
      commitment: 'confirmed',
      filters: filters(buyer),
    })
    console.log('gpa_ok', accounts.length)
    for (const a of accounts) {
      const data = Buffer.from(a.account.data)
      const raffleId = data.readBigUInt64LE(8)
      const shareCount = data.readUInt32LE(48)
      const refunded = data[52] !== 0
      console.log({ pubkey: a.pubkey.toBase58(), raffleId: raffleId.toString(), shareCount, refunded })
    }
  } catch (e) {
    console.error('gpa_failed', e instanceof Error ? e.message : e)
    process.exit(2)
  }
}

void main()
