import { PublicKey } from '@solana/web3.js'
import {
  BUYER_SEED,
  CONFIG_SEED,
  PENDING_SEED,
  RAFFLE_SEED,
  SHARES_SEED,
} from './constants'

export function configPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], programId)
}

export function pendingPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([PENDING_SEED], programId)
}

export function rafflePda(programId: PublicKey, raffleId: bigint | number): [PublicKey, number] {
  const id = Buffer.alloc(8)
  id.writeBigUInt64LE(BigInt(raffleId))
  return PublicKey.findProgramAddressSync([RAFFLE_SEED, id], programId)
}

export function shareBoardPda(
  programId: PublicKey,
  raffleId: bigint | number,
): [PublicKey, number] {
  const id = Buffer.alloc(8)
  id.writeBigUInt64LE(BigInt(raffleId))
  return PublicKey.findProgramAddressSync([SHARES_SEED, id], programId)
}

export function buyerRecordPda(
  programId: PublicKey,
  raffleId: bigint | number,
  buyer: PublicKey,
): [PublicKey, number] {
  const id = Buffer.alloc(8)
  id.writeBigUInt64LE(BigInt(raffleId))
  return PublicKey.findProgramAddressSync([BUYER_SEED, id, buyer.toBuffer()], programId)
}

export function raffleIdLe(raffleId: bigint | number): Buffer {
  const id = Buffer.alloc(8)
  id.writeBigUInt64LE(BigInt(raffleId))
  return id
}
