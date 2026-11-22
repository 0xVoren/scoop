/**
 * Scoop Solana testnet/devnet smoke: create → buy → delay → draw (+ optional claim).
 *
 * Differs from local E2E: **no airdrop**. Authority must already hold SOL; buyer is
 * funded by a transfer from authority.
 *
 * Env:
 *   SOLANA_RPC_URL=https://api.devnet.solana.com
 *   SOLANA_PROGRAM_ID=…
 *   SOLANA_AUTHORITY_KEYPAIR=path|json
 *   SKIP_CLAIM=1          — stop after draw
 *   RUN_KEEPER=1          — second raffle via keeper draw_many
 */
import { readFileSync } from 'node:fs'
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
  buildClaimPrizeIx,
  buildClaimProceedsIx,
  buildCreateRaffleIx,
  buildDrawIx,
  buildInitializeIx,
  collectReadyRaffleIds,
  configPda,
  decodeConfig,
  decodePendingDraws,
  decodeRaffle,
  decodeShareBoard,
  pendingPda,
  rafflePda,
  runSolanaTick,
  shareBoardPda,
} from '../keeper/src/solana/index'

const RPC = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'
const PROGRAM_ID = new PublicKey(process.env.SOLANA_PROGRAM_ID ?? DEFAULT_PROGRAM_ID)
const CLUSTER = process.env.SOLANA_EXPLORER_CLUSTER ?? 'devnet'
const SKIP_CLAIM = process.env.SKIP_CLAIM === '1'
const RUN_KEEPER = process.env.RUN_KEEPER === '1'

function loadKp(pathOrJson: string): Keypair {
  const t = pathOrJson.trim()
  const json = t.startsWith('[') ? t : readFileSync(t, 'utf8').trim()
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(json) as number[]))
}

function explorerTx(sig: string) {
  return `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`
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
  for (;;) {
    const slot = await connection.getSlot('processed')
    if (slot > targetSlot) return slot
    await new Promise((r) => setTimeout(r, 400))
  }
}

async function readRaffle(connection: Connection, id: bigint) {
  const [pk] = rafflePda(PROGRAM_ID, id)
  const info = await connection.getAccountInfo(pk)
  if (!info) throw new Error(`raffle ${id} missing`)
  return decodeRaffle(Buffer.from(info.data))
}

async function readPending(connection: Connection) {
  const [pk] = pendingPda(PROGRAM_ID)
  const info = await connection.getAccountInfo(pk)
  if (!info) throw new Error('pending missing — run deploy/initialize first')
  return decodePendingDraws(Buffer.from(info.data))
}

async function main() {
  const connection = new Connection(RPC, 'confirmed')
  const authority = loadKp(
    process.env.SOLANA_AUTHORITY_KEYPAIR ??
      process.env.SOLANA_KEEPER_KEYPAIR ??
      `${process.env.HOME}/.config/solana/id.json`,
  )
  const buyer = Keypair.generate()

  const bal = await connection.getBalance(authority.publicKey)
  console.log(`== rpc=${RPC} program=${PROGRAM_ID.toBase58()} ==`)
  console.log(`authority=${authority.publicKey.toBase58()} balance=${bal / LAMPORTS_PER_SOL} SOL`)
  console.log(`buyer=${buyer.publicKey.toBase58()} (ephemeral)`)

  // Prize 0.05 SOL + 11 * 0.005 + rent/fees — keep smoke cheap on testnet
  const prizeAmount = BigInt(Math.floor(0.05 * LAMPORTS_PER_SOL))
  const pricePerShare = prizeAmount / BigInt(LAUNCH.priceDivisor)
  const buyerNeed =
    Number(pricePerShare) * LAUNCH.shares + Math.floor(0.02 * LAMPORTS_PER_SOL)
  const minAuthority =
    Number(prizeAmount) + buyerNeed + Math.floor(0.15 * LAMPORTS_PER_SOL)

  if (bal < minAuthority) {
    console.error(
      `BLOCKER: authority needs ≥ ${minAuthority / LAMPORTS_PER_SOL} SOL for smoke (have ${bal / LAMPORTS_PER_SOL}).`,
    )
    console.error(
      `Fund ${authority.publicKey.toBase58()} then re-run. Faucet: https://faucet.solana.com`,
    )
    process.exit(2)
  }

  // Fund buyer from authority (no airdrop)
  await send(
    connection,
    authority,
    SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: buyer.publicKey,
      lamports: buyerNeed,
    }),
  )

  const [configPk] = configPda(PROGRAM_ID)
  const configInfo = await connection.getAccountInfo(configPk)
  if (!configInfo) {
    console.log('-- initialize --')
    await send(
      connection,
      authority,
      buildInitializeIx({
        programId: PROGRAM_ID,
        authority: authority.publicKey,
        feeRecipient: authority.publicKey,
        protocolConfig: {
          allowDifferentTokens: false,
          allowCustomShares: false,
          allowCustomPrice: false,
          allowCustomDrawDelay: false,
          defaultShares: LAUNCH.shares,
          priceDivisor: LAUNCH.priceDivisor,
          defaultDrawDelaySlots: LAUNCH.drawDelaySlots,
        },
      }),
    )
  } else {
    console.log('-- config already initialized --')
  }

  const config = decodeConfig(
    Buffer.from((await connection.getAccountInfo(configPk))!.data),
  )
  const raffleId = config.nextRaffleId
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400)

  console.log(`-- create → buy → draw (raffle_id=${raffleId}) --`)
  await send(
    connection,
    authority,
    buildCreateRaffleIx({
      programId: PROGRAM_ID,
      creator: authority.publicKey,
      nextRaffleId: raffleId,
      prizeAmount,
      pricePerShare,
      totalShares: LAUNCH.shares,
      deadline,
      drawDelaySlots: LAUNCH.drawDelaySlots,
    }),
  )

  let raffle = await readRaffle(connection, raffleId)
  if (raffle.status !== RaffleStatus.Selling) throw new Error('expected Selling')

  const [buyerRec] = buyerRecordPda(PROGRAM_ID, raffleId, buyer.publicKey)
  await send(
    connection,
    buyer,
    buildBuySharesIx({
      programId: PROGRAM_ID,
      buyer: buyer.publicKey,
      raffleId,
      buyerRecord: buyerRec,
      count: LAUNCH.shares,
    }),
  )

  raffle = await readRaffle(connection, raffleId)
  if (raffle.status !== RaffleStatus.SoldOut) throw new Error('expected SoldOut')
  const pending1 = await readPending(connection)
  if (!pending1.raffleIds.includes(raffleId)) throw new Error('not in pending')
  console.log(`sold_out_slot=${raffle.soldOutSlot} pending=${pending1.raffleIds.join(',')}`)

  const eligible = Number(raffle.soldOutSlot) + raffle.drawDelaySlots
  const head = await waitSlots(connection, eligible)
  console.log(`slot=${head} eligible=${eligible} → draw`)

  await send(
    connection,
    authority,
    buildDrawIx({
      programId: PROGRAM_ID,
      caller: authority.publicKey,
      raffleId,
    }),
  )

  raffle = await readRaffle(connection, raffleId)
  if (raffle.status !== RaffleStatus.Drawn) throw new Error('expected Drawn')
  const [boardPk] = shareBoardPda(PROGRAM_ID, raffleId)
  const board = decodeShareBoard(
    Buffer.from((await connection.getAccountInfo(boardPk))!.data),
  )
  const winner = board.owners[raffle.winnerShareIndex]!
  console.log(
    `Drawn winner=${winner.toBase58()} share=${raffle.winnerShareIndex} draw_slot=${raffle.drawSlot}`,
  )

  if (!SKIP_CLAIM) {
    const winnerKp = winner.equals(buyer.publicKey)
      ? buyer
      : winner.equals(authority.publicKey)
        ? authority
        : null
    if (!winnerKp) throw new Error('winner not in smoke keypairs')
    await send(
      connection,
      winnerKp,
      buildClaimPrizeIx({
        programId: PROGRAM_ID,
        winner: winnerKp.publicKey,
        raffleId,
      }),
    )
    await send(
      connection,
      authority,
      buildClaimProceedsIx({
        programId: PROGRAM_ID,
        creator: authority.publicKey,
        feeRecipient: config.feeRecipient,
        raffleId,
      }),
    )
    console.log('OK claim')
  }

  if (RUN_KEEPER) {
    const config2 = decodeConfig(
      Buffer.from((await connection.getAccountInfo(configPk))!.data),
    )
    const rid2 = config2.nextRaffleId
    console.log(`-- keeper path raffle_id=${rid2} --`)
    await send(
      connection,
      authority,
      buildCreateRaffleIx({
        programId: PROGRAM_ID,
        creator: authority.publicKey,
        nextRaffleId: rid2,
        prizeAmount,
        pricePerShare,
        totalShares: LAUNCH.shares,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 86400),
        drawDelaySlots: LAUNCH.drawDelaySlots,
      }),
    )
    const [buyerRec2] = buyerRecordPda(PROGRAM_ID, rid2, buyer.publicKey)
    // top up buyer if needed
    const bBal = await connection.getBalance(buyer.publicKey)
    if (bBal < Number(pricePerShare) * LAUNCH.shares + 5_000_000) {
      await send(
        connection,
        authority,
        SystemProgram.transfer({
          fromPubkey: authority.publicKey,
          toPubkey: buyer.publicKey,
          lamports: buyerNeed,
        }),
      )
    }
    await send(
      connection,
      buyer,
      buildBuySharesIx({
        programId: PROGRAM_ID,
        buyer: buyer.publicKey,
        raffleId: rid2,
        buyerRecord: buyerRec2,
        count: LAUNCH.shares,
      }),
    )
    const r2 = await readRaffle(connection, rid2)
    await waitSlots(connection, Number(r2.soldOutSlot) + r2.drawDelaySlots)
    const ready = await collectReadyRaffleIds(connection, PROGRAM_ID)
    console.log(`keeper ready=[${ready.join(',')}]`)
    const tick = await runSolanaTick({
      SOLANA_RPC_URL: RPC,
      SOLANA_PROGRAM_ID: PROGRAM_ID.toBase58(),
      SOLANA_KEEPER_KEYPAIR: JSON.stringify(Array.from(authority.secretKey)),
    })
    console.log('keeper tick:', tick)
    if (!tick.triggered) throw new Error(`keeper did not trigger: ${tick.reason}`)
    if (tick.signature) console.log(`  ${explorerTx(tick.signature)}`)
  }

  console.log('== SOLANA DEVNET/TESTNET SMOKE PASSED ==')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
