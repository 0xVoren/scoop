import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from '@solana/web3.js'
import { DEFAULT_PROGRAM_ID, RaffleStatus } from './constants'
import { decodePendingDraws, decodeRaffle, eligibleSlot } from './decode'
import { buildDrawIx, buildDrawManyIx } from './instructions'
import { pendingPda, rafflePda } from './pdas'

export type SolanaKeeperEnv = {
  SOLANA_RPC_URL: string
  SOLANA_PROGRAM_ID: string
  /** JSON byte array `[1,2,…]`, base58 secret, or path to keypair JSON file (Node only). */
  SOLANA_KEEPER_KEYPAIR: string
  /** Prefer batch draw_many when >1 ready (default true). */
  SOLANA_USE_DRAW_MANY?: string
}

export type SolanaTickResult = {
  triggered: boolean
  reason: string
  readyIds: string[]
  signature?: string
}

/**
 * Parse keeper keypair from JSON byte array string.
 * Node CLI may pass a filesystem path — resolve with `resolveKeypairEnv` first.
 */
export function loadKeypair(raw: string): Keypair {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('[')) {
    throw new Error('SOLANA_KEEPER_KEYPAIR must be a JSON byte array (or resolve a path first)')
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed) as number[]))
}

/** Node helper: if value is a path to keypair.json, read it; else return as-is. */
export function resolveKeypairEnv(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('[')) return trimmed
  if (trimmed.includes('/') || trimmed.endsWith('.json')) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    return readFileSync(trimmed, 'utf8').trim()
  }
  return trimmed
}

/** Scan PendingDraws → ready raffle ids (Clock.slot > sold_out_slot + draw_delay_slots). */
export async function collectReadyRaffleIds(
  connection: Connection,
  programId: PublicKey,
): Promise<bigint[]> {
  const [pendingPk] = pendingPda(programId)
  const info = await connection.getAccountInfo(pendingPk)
  if (!info) return []

  const pending = decodePendingDraws(Buffer.from(info.data))
  if (pending.raffleIds.length === 0) return []

  const slot = BigInt(await connection.getSlot('processed'))
  /** Align with on-chain `SLOT_HASHES_RETENTION` — past this, draw is impossible; users refund. */
  const SLOT_HASHES_RETENTION = 512n
  const ready: bigint[] = []

  for (const id of pending.raffleIds) {
    const [rafflePk] = rafflePda(programId, id)
    const raffleInfo = await connection.getAccountInfo(rafflePk)
    if (!raffleInfo) continue
    const raffle = decodeRaffle(Buffer.from(raffleInfo.data))
    if (raffle.status !== RaffleStatus.SoldOut) continue
    const eligible = eligibleSlot(raffle)
    if (slot <= eligible) continue
    // Entropy aged out: skip (do not hammer draw); refund/recover is the user path.
    if (slot > eligible + SLOT_HASHES_RETENTION) {
      console.warn(
        `raffle ${id} entropy expired (slot=${slot} eligible=${eligible}); skip draw — users should refund`,
      )
      continue
    }
    ready.push(id)
  }
  return ready
}

/**
 * One Solana keeper tick: scan pending → draw_many (or single draw).
 * Permissionless — race/skip is fine.
 */
export async function runSolanaTick(env: SolanaKeeperEnv): Promise<SolanaTickResult> {
  const programIdStr = env.SOLANA_PROGRAM_ID || DEFAULT_PROGRAM_ID
  if (!programIdStr) {
    return { triggered: false, reason: 'program-unconfigured', readyIds: [] }
  }
  if (!env.SOLANA_KEEPER_KEYPAIR) {
    return { triggered: false, reason: 'keypair-missing', readyIds: [] }
  }

  let payer: Keypair
  try {
    payer = loadKeypair(env.SOLANA_KEEPER_KEYPAIR)
  } catch (err) {
    console.error('keypair invalid:', (err as Error).message)
    return { triggered: false, reason: 'keypair-invalid', readyIds: [] }
  }

  const connection = new Connection(env.SOLANA_RPC_URL || 'http://127.0.0.1:8899', 'confirmed')
  const programId = new PublicKey(programIdStr)

  let ready: bigint[]
  try {
    ready = await collectReadyRaffleIds(connection, programId)
  } catch (err) {
    console.error('pending read failed:', (err as Error).message)
    return { triggered: false, reason: 'rpc-error', readyIds: [] }
  }

  const readyIds = ready.map((id) => id.toString())
  if (ready.length === 0) {
    console.log('no ready Solana pendingDraw')
    return { triggered: false, reason: 'not-ready', readyIds }
  }

  console.log(`ready raffle_ids=[${readyIds.join(',')}], drawing`)

  const useMany = (env.SOLANA_USE_DRAW_MANY ?? 'true') !== 'false'
  const ix =
    useMany || ready.length > 1
      ? buildDrawManyIx({ programId, caller: payer.publicKey, raffleIds: ready })
      : buildDrawIx({ programId, caller: payer.publicKey, raffleId: ready[0]! })

  try {
    const tx = new Transaction().add(ix)
    const signature = await sendAndConfirmTransaction(connection, tx, [payer], {
      commitment: 'confirmed',
    })
    console.log('draw confirmed:', signature)
    return { triggered: true, reason: 'sent', readyIds, signature }
  } catch (err) {
    console.warn('draw skipped (raced / conditions changed):', (err as Error).message)
    return { triggered: false, reason: 'skipped-or-raced', readyIds }
  }
}
