/**
 * Seed Solana devnet demo raffles in varied states for UI / GPA discovery.
 *
 * States:
 *   - Selling (partial fills)
 *   - SoldOut (pending draw)
 *   - Drawn
 *   - Expired path (short deadline, leave Selling past deadline — UI shows Expired)
 *
 * Env:
 *   SOLANA_RPC_URL=https://api.devnet.solana.com
 *   SOLANA_PROGRAM_ID=FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT
 *   SOLANA_AUTHORITY_KEYPAIR=~/.config/solana/id.json
 *
 * Does not drain the wallet; leaves residual SOL for authority.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  sendAndConfirmTransaction,
  Transaction,
} from '@solana/web3.js'
import {
  DEFAULT_PROGRAM_ID,
  LAUNCH,
  RaffleStatus,
  buyerRecordPda,
  buildBuySharesIx,
  buildCreateRaffleIx,
  buildDrawIx,
  configPda,
  decodeConfig,
  decodeRaffle,
  rafflePda,
} from '../keeper/src/solana/index'

const RPC = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'
const PROGRAM_ID = new PublicKey(process.env.SOLANA_PROGRAM_ID ?? DEFAULT_PROGRAM_ID)
const CLUSTER = process.env.SOLANA_EXPLORER_CLUSTER ?? 'devnet'
/** Small prize so several seeds leave residual SOL. */
const PRIZE = BigInt(Math.floor(0.01 * LAMPORTS_PER_SOL))
const PRICE = PRIZE / BigInt(LAUNCH.priceDivisor)
const MIN_RESIDUAL = Math.floor(0.5 * LAMPORTS_PER_SOL)

function loadKp(pathOrJson: string): Keypair {
  const t = pathOrJson.trim()
  const json = t.startsWith('[') ? t : readFileSync(t, 'utf8').trim()
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(json) as number[]))
}

function explorerTx(sig: string) {
  return `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`
}

function explorerRaffle(id: bigint) {
  const [pda] = rafflePda(PROGRAM_ID, id)
  return `https://explorer.solana.com/address/${pda.toBase58()}?cluster=${CLUSTER}`
}

async function send(
  connection: Connection,
  payer: Keypair,
  ix: Parameters<Transaction['add']>[0],
  signers: Keypair[] = [],
): Promise<string> {
  const tx = new Transaction().add(ix)
  const sig = await sendAndConfirmTransaction(connection, tx, [payer, ...signers], {
    commitment: 'confirmed',
  })
  console.log(`  tx ${explorerTx(sig)}`)
  return sig
}

async function waitSlots(connection: Connection, targetSlot: number) {
  // Draw requires current_slot > sold_out_slot + delay; pad a few slots for
  // SlotHashes lag between processed and confirmed.
  const need = targetSlot + 3
  for (;;) {
    const slot = await connection.getSlot('confirmed')
    if (slot > need) return slot
    await new Promise((r) => setTimeout(r, 500))
  }
}

async function readRaffle(connection: Connection, id: bigint) {
  const [pk] = rafflePda(PROGRAM_ID, id)
  const info = await connection.getAccountInfo(pk)
  if (!info) throw new Error(`raffle ${id} missing`)
  return decodeRaffle(Buffer.from(info.data))
}

async function nextId(connection: Connection): Promise<bigint> {
  const [configPk] = configPda(PROGRAM_ID)
  const info = await connection.getAccountInfo(configPk)
  if (!info) throw new Error('config missing — deploy/initialize first')
  return decodeConfig(Buffer.from(info.data)).nextRaffleId
}

async function createRaffle(
  connection: Connection,
  authority: Keypair,
  deadlineSec: number,
): Promise<bigint> {
  const id = await nextId(connection)
  await send(
    connection,
    authority,
    buildCreateRaffleIx({
      programId: PROGRAM_ID,
      creator: authority.publicKey,
      nextRaffleId: id,
      prizeAmount: PRIZE,
      pricePerShare: PRICE,
      totalShares: LAUNCH.shares,
      deadline: BigInt(deadlineSec),
      drawDelaySlots: LAUNCH.drawDelaySlots,
    }),
  )
  return id
}

async function buy(
  connection: Connection,
  buyer: Keypair,
  raffleId: bigint,
  count: number,
) {
  const [buyerRec] = buyerRecordPda(PROGRAM_ID, raffleId, buyer.publicKey)
  await send(
    connection,
    buyer,
    buildBuySharesIx({
      programId: PROGRAM_ID,
      buyer: buyer.publicKey,
      raffleId,
      buyerRecord: buyerRec,
      count,
    }),
  )
}

type SeedRow = {
  id: string
  intent: string
  status: string
  sold: string
  deadline: string
  explorer: string
  pages: string
}

async function main() {
  const connection = new Connection(RPC, 'confirmed')
  const authority = loadKp(
    process.env.SOLANA_AUTHORITY_KEYPAIR ??
      process.env.SOLANA_KEEPER_KEYPAIR ??
      join(homedir(), '.config/solana/id.json'),
  )
  const buyer = Keypair.generate()

  const bal0 = await connection.getBalance(authority.publicKey)
  console.log(`== seed solana demo ==`)
  console.log(`rpc=${RPC}`)
  console.log(`program=${PROGRAM_ID.toBase58()}`)
  console.log(`authority=${authority.publicKey.toBase58()} balance=${bal0 / LAMPORTS_PER_SOL} SOL`)

  // Budget: 4 prizes + buys + rent/fees, keep ≥ MIN_RESIDUAL
  const buyBudget =
    Number(PRICE) * LAUNCH.shares * 3 + Math.floor(0.05 * LAMPORTS_PER_SOL)
  const need =
    Number(PRIZE) * 4 + buyBudget + Math.floor(0.2 * LAMPORTS_PER_SOL) + MIN_RESIDUAL
  if (bal0 < need) {
    console.error(
      `BLOCKER: need ≥ ${need / LAMPORTS_PER_SOL} SOL (have ${bal0 / LAMPORTS_PER_SOL}) to seed + residual.`,
    )
    process.exit(2)
  }

  await send(
    connection,
    authority,
    SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: buyer.publicKey,
      lamports: buyBudget,
    }),
  )
  console.log(`buyer=${buyer.publicKey.toBase58()} funded`)

  const rows: SeedRow[] = []
  const now = Math.floor(Date.now() / 1000)
  const day = now + 86400
  const pagesBase = 'https://0xvoren.github.io/scoop/raffle/?id='

  // 1) Selling — partial
  console.log('-- Selling (partial) --')
  const sellingId = await createRaffle(connection, authority, day)
  await buy(connection, buyer, sellingId, 3)
  let r = await readRaffle(connection, sellingId)
  if (r.status !== RaffleStatus.Selling) throw new Error('expected Selling')
  rows.push({
    id: sellingId.toString(),
    intent: 'Selling (partial)',
    status: 'Selling',
    sold: `${r.soldShares}/${r.totalShares}`,
    deadline: new Date(Number(r.deadline) * 1000).toISOString(),
    explorer: explorerRaffle(sellingId),
    pages: `${pagesBase}${sellingId}`,
  })

  // 2) SoldOut — pending draw
  console.log('-- SoldOut (pending draw) --')
  const soldOutId = await createRaffle(connection, authority, day)
  await buy(connection, buyer, soldOutId, LAUNCH.shares)
  r = await readRaffle(connection, soldOutId)
  if (r.status !== RaffleStatus.SoldOut) throw new Error('expected SoldOut')
  rows.push({
    id: soldOutId.toString(),
    intent: 'SoldOut (pending draw)',
    status: 'SoldOut',
    sold: `${r.soldShares}/${r.totalShares}`,
    deadline: new Date(Number(r.deadline) * 1000).toISOString(),
    explorer: explorerRaffle(soldOutId),
    pages: `${pagesBase}${soldOutId}`,
  })

  // 3) Drawn
  console.log('-- Drawn --')
  const drawnId = await createRaffle(connection, authority, day)
  await buy(connection, buyer, drawnId, LAUNCH.shares)
  r = await readRaffle(connection, drawnId)
  const eligible = Number(r.soldOutSlot) + r.drawDelaySlots
  await waitSlots(connection, eligible)
  await send(
    connection,
    authority,
    buildDrawIx({
      programId: PROGRAM_ID,
      caller: authority.publicKey,
      raffleId: drawnId,
    }),
  )
  r = await readRaffle(connection, drawnId)
  if (r.status !== RaffleStatus.Drawn) throw new Error('expected Drawn')
  rows.push({
    id: drawnId.toString(),
    intent: 'Drawn',
    status: 'Drawn',
    sold: `${r.soldShares}/${r.totalShares}`,
    deadline: new Date(Number(r.deadline) * 1000).toISOString(),
    explorer: explorerRaffle(drawnId),
    pages: `${pagesBase}${drawnId}`,
  })

  // 4) Expired path — short deadline, partial buy, wait past deadline (on-chain stays Selling)
  console.log('-- Expired path (short deadline) --')
  const expiredId = await createRaffle(connection, authority, now + 75)
  await buy(connection, buyer, expiredId, 2)
  console.log('  waiting past deadline…')
  for (;;) {
    const t = Math.floor(Date.now() / 1000)
    if (t > now + 80) break
    await new Promise((r) => setTimeout(r, 2000))
  }
  r = await readRaffle(connection, expiredId)
  rows.push({
    id: expiredId.toString(),
    intent: 'Expired path (UI Expired; on-chain Selling past deadline)',
    status: `Selling@chain / Expired@ui (deadline passed)`,
    sold: `${r.soldShares}/${r.totalShares}`,
    deadline: new Date(Number(r.deadline) * 1000).toISOString(),
    explorer: explorerRaffle(expiredId),
    pages: `${pagesBase}${expiredId}`,
  })

  const bal1 = await connection.getBalance(authority.publicKey)
  console.log(`\n== seeded ${rows.length} raffles ==`)
  for (const row of rows) {
    console.log(`#${row.id}  ${row.intent}  ${row.sold}  ${row.pages}`)
  }
  console.log(`authority residual: ${bal1 / LAMPORTS_PER_SOL} SOL (was ${bal0 / LAMPORTS_PER_SOL})`)

  const out = {
    chain: 'solana-devnet',
    programId: PROGRAM_ID.toBase58(),
    authority: authority.publicKey.toBase58(),
    seededAt: new Date().toISOString(),
    prizeLamports: PRIZE.toString(),
    residualSol: bal1 / LAMPORTS_PER_SOL,
    raffles: rows,
  }
  const outPath = join(
    process.env.SCOOP_SEED_OUT ?? join(homedir(), 'Code/active/scoop/scripts'),
    'seed-solana-devnet-demo.result.json',
  )
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`)
  console.log(`wrote ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
