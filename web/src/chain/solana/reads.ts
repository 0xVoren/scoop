import type { Connection } from '@solana/web3.js'
import { PublicKey } from '@solana/web3.js'
import {
  type BuyerRecordAccount,
  type ConfigAccount,
  decodeBuyerRecord,
  decodeConfig,
  decodeRaffle,
  decodeShareBoard,
  type RaffleAccount,
  raffleAccountToReadModel,
  type ShareBoardAccount,
} from '@/chain/solana/decode'
import { buyerRecordPda, configPda, rafflePda, shareBoardPda } from '@/chain/solana/pdas'
import type { RaffleReadModel } from '@/chain/types'

export async function fetchSolanaConfig(
  connection: Connection,
  programId: PublicKey,
): Promise<ConfigAccount | null> {
  const [pda] = configPda(programId)
  const info = await connection.getAccountInfo(pda)
  if (!info?.data) return null
  return decodeConfig(info.data)
}

export async function fetchSolanaRaffleAccount(
  connection: Connection,
  programId: PublicKey,
  raffleId: bigint,
): Promise<RaffleAccount | null> {
  const [pda] = rafflePda(programId, raffleId)
  const info = await connection.getAccountInfo(pda)
  if (!info?.data) return null
  return decodeRaffle(info.data)
}

/** Read a single raffle by id into the shared UI model. */
export async function fetchSolanaRaffleById(
  connection: Connection,
  programId: PublicKey | string,
  raffleId: bigint,
): Promise<RaffleReadModel | null> {
  const pid = typeof programId === 'string' ? new PublicKey(programId) : programId
  const account = await fetchSolanaRaffleAccount(connection, pid, raffleId)
  if (!account) return null
  return raffleAccountToReadModel(account)
}

/**
 * Rough sequential scan of raffle ids `1 .. next_raffle_id-1` (capped).
 *
 * NOT a full product index — Solana MVP has no creator/prize secondary indexes
 * and no event indexer. Callers must surface this limitation to users.
 */
export async function listSolanaRafflesRough(
  connection: Connection,
  programId: PublicKey | string,
  opts: { limit?: number } = {},
): Promise<{ raffles: RaffleReadModel[]; incomplete: true; nextRaffleId: bigint }> {
  const pid = typeof programId === 'string' ? new PublicKey(programId) : programId
  const config = await fetchSolanaConfig(connection, pid)
  if (!config) {
    return { raffles: [], incomplete: true, nextRaffleId: 1n }
  }
  const limit = opts.limit ?? 50
  const end = config.nextRaffleId
  const start = end > BigInt(limit) ? end - BigInt(limit) : 1n
  const raffles: RaffleReadModel[] = []
  for (let id = start; id < end; id++) {
    const r = await fetchSolanaRaffleById(connection, pid, id)
    if (r) raffles.push(r)
  }
  return { raffles, incomplete: true, nextRaffleId: end }
}

export async function fetchSolanaShareBoard(
  connection: Connection,
  programId: PublicKey | string,
  raffleId: bigint,
): Promise<ShareBoardAccount | null> {
  const pid = typeof programId === 'string' ? new PublicKey(programId) : programId
  const [pda] = shareBoardPda(pid, raffleId)
  const info = await connection.getAccountInfo(pda)
  if (!info?.data) return null
  return decodeShareBoard(info.data)
}

export async function fetchSolanaBuyerRecord(
  connection: Connection,
  programId: PublicKey | string,
  raffleId: bigint,
  buyer: PublicKey | string,
): Promise<BuyerRecordAccount | null> {
  const pid = typeof programId === 'string' ? new PublicKey(programId) : programId
  const buyerPk = typeof buyer === 'string' ? new PublicKey(buyer) : buyer
  const [pda] = buyerRecordPda(pid, raffleId, buyerPk)
  const info = await connection.getAccountInfo(pda)
  if (!info?.data) return null
  return decodeBuyerRecord(info.data)
}

/** Share count for a buyer from BuyerRecord PDA (0 if absent). */
export async function fetchSolanaShareCount(
  connection: Connection,
  programId: PublicKey | string,
  raffleId: bigint,
  buyer: PublicKey | string,
): Promise<number> {
  const rec = await fetchSolanaBuyerRecord(connection, programId, raffleId, buyer)
  return rec?.shareCount ?? 0
}

/** Winner pubkey for Drawn raffles via ShareBoard[winnerShareIndex]. */
export async function fetchSolanaShareOwner(
  connection: Connection,
  programId: PublicKey | string,
  raffleId: bigint,
  shareIndex: number,
): Promise<string | null> {
  const board = await fetchSolanaShareBoard(connection, programId, raffleId)
  if (!board || shareIndex < 0 || shareIndex >= board.owners.length) return null
  return board.owners[shareIndex]!.toBase58()
}
