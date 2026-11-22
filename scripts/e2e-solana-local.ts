/**
 * Scoop Solana local E2E gates (align EVM `e2e-local.sh` mental model):
 *   1) create → buy → draw → claim (native SOL)
 *   2) keeper pending → draw_many
 *   3) expire → refund + recoverPrize
 *   4) late entropy expired → refund/recover (no clamp-to-latest)
 *   5) SPL asset matrix (prize×payment subset)
 *
 * Run: `bash scripts/e2e-solana-local.sh`
 * Or against a live localnet:
 *   SOLANA_RPC_URL=http://127.0.0.1:8899 pnpm exec tsx scripts/e2e-solana-local.ts
 *
 * SPL matrix covered here:
 *   | prize  | payment | notes                          |
 *   |--------|---------|--------------------------------|
 *   | SOL    | SOL     | gate 1 (native main path)      |
 *   | SPL_A  | SPL_A   | same-mint SPL lifecycle        |
 *   | SOL    | SPL_A   | native prize / SPL payment     |
 *   | SPL_A  | SOL     | SPL prize / native payment     |
 *   | SPL_A  | SPL_B   | different mints (allowDifferent)|
 *
 * Intentionally not covered: Token-2022 (program rejects), fee-on-transfer
 * (balance-diff reject on-chain), wSOL wrap path, resize_pending.
 */
import { readFileSync } from 'node:fs'
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import {
  DEFAULT_PROGRAM_ID,
  LAUNCH,
  NATIVE_MINT,
  RaffleStatus,
  SLOT_HASHES_SYSVAR,
  buyerRecordPda,
  buildBuySharesIx,
  buildClaimPrizeIx,
  buildClaimProceedsIx,
  buildCloseBuyerRecordIx,
  buildCloseShareBoardIx,
  buildCreateRaffleIx,
  buildDrawIx,
  buildInitializeIx,
  buildRecoverPrizeIx,
  buildRefundIx,
  buildSetProtocolConfigIx,
  collectReadyRaffleIds,
  configPda,
  decodeBuyerRecord,
  decodeConfig,
  decodePendingDraws,
  decodeRaffle,
  decodeShareBoard,
  pendingPda,
  rafflePda,
  runSolanaTick,
  shareBoardPda,
} from '../keeper/src/solana/index'

const RPC = process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899'
const PROGRAM_ID = new PublicKey(process.env.SOLANA_PROGRAM_ID ?? DEFAULT_PROGRAM_ID)
const NATIVE = new PublicKey(NATIVE_MINT)
/** SlotHashes typically retains ~512 entries; wait past this + buffer for late clamp. */
const LATE_DRAW_EXTRA_SLOTS = Number(process.env.SCOOP_LATE_DRAW_EXTRA_SLOTS ?? 520)

function loadKp(pathOrJson: string): Keypair {
  const t = pathOrJson.trim()
  const json = t.startsWith('[') ? t : readFileSync(t, 'utf8').trim()
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(json) as number[]))
}

async function send(
  connection: Connection,
  payer: Keypair,
  ixs: Parameters<Transaction['add']>[0] | Parameters<Transaction['add']>[0][],
  signers: Keypair[] = [],
): Promise<string> {
  const tx = new Transaction()
  const list = Array.isArray(ixs) ? ixs : [ixs]
  for (const ix of list) tx.add(ix)
  return sendAndConfirmTransaction(connection, tx, [payer, ...signers], {
    commitment: 'confirmed',
  })
}

async function airdrop(connection: Connection, pk: PublicKey, sol: number) {
  const sig = await connection.requestAirdrop(pk, sol * LAMPORTS_PER_SOL)
  await connection.confirmTransaction(sig, 'confirmed')
}

async function waitSlots(connection: Connection, targetSlot: number) {
  for (;;) {
    const slot = await connection.getSlot('processed')
    if (slot > targetSlot) return slot
    await new Promise((r) => setTimeout(r, 200))
  }
}

/** Parse SlotHashes sysvar → sorted slots (newest-first in account). */
function parseSlotHashSlots(data: Buffer): number[] {
  if (data.length < 8) return []
  const n = Number(data.readBigUInt64LE(0))
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const off = 8 + i * 40
    if (off + 8 > data.length) break
    out.push(Number(data.readBigUInt64LE(off)))
  }
  return out
}

async function readSlotHashesWindow(connection: Connection): Promise<{
  slots: number[]
  oldest: number
  newest: number
}> {
  const info = await connection.getAccountInfo(new PublicKey(SLOT_HASHES_SYSVAR))
  if (!info) throw new Error('SlotHashes sysvar missing')
  const slots = parseSlotHashSlots(Buffer.from(info.data))
  if (slots.length === 0) throw new Error('SlotHashes empty')
  return {
    slots,
    oldest: Math.min(...slots),
    newest: Math.max(...slots),
  }
}

/**
 * Wait until eligible is older than the oldest SlotHashes entry (late-draw clamp path).
 * Also requires current_slot > eligible (product TooEarly rule).
 */
async function waitEligibleOutsideWindow(
  connection: Connection,
  eligible: number,
): Promise<{ slot: number; oldest: number }> {
  const start = Date.now()
  let lastLog = 0
  for (;;) {
    const slot = await connection.getSlot('processed')
    const { oldest } = await readSlotHashesWindow(connection)
    if (slot > eligible && eligible < oldest) {
      return { slot, oldest }
    }
    // Progress: also ensure we have advanced enough slots past sell-out
    if (Date.now() - lastLog > 5000) {
      console.log(
        `  … late-draw wait slot=${slot} eligible=${eligible} oldest_hash=${oldest} (+${Math.floor((Date.now() - start) / 1000)}s)`,
      )
      lastLog = Date.now()
    }
    // Safety: if window never rolls (unlikely), fall through after extra slots
    if (slot > eligible + LATE_DRAW_EXTRA_SLOTS && eligible < oldest) {
      return { slot, oldest }
    }
    if (slot > eligible + LATE_DRAW_EXTRA_SLOTS * 3) {
      throw new Error(
        `late-draw wait timeout: slot=${slot} eligible=${eligible} oldest=${oldest}`,
      )
    }
    await new Promise((r) => setTimeout(r, 250))
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
  if (!info) throw new Error('pending missing')
  return decodePendingDraws(Buffer.from(info.data))
}

async function readBuyer(
  connection: Connection,
  raffleId: bigint,
  buyer: PublicKey,
) {
  const [pk] = buyerRecordPda(PROGRAM_ID, raffleId, buyer)
  const info = await connection.getAccountInfo(pk)
  if (!info) throw new Error('buyer record missing')
  return decodeBuyerRecord(Buffer.from(info.data))
}

async function nextRaffleId(connection: Connection): Promise<bigint> {
  const [configPk] = configPda(PROGRAM_ID)
  const config = decodeConfig(
    Buffer.from((await connection.getAccountInfo(configPk))!.data),
  )
  return config.nextRaffleId
}

async function ensureAta(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
  allowOwnerOffCurve = false,
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mint, owner, allowOwnerOffCurve)
  const ix = createAssociatedTokenAccountIdempotentInstruction(
    payer.publicKey,
    ata,
    owner,
    mint,
  )
  await send(connection, payer, ix)
  return ata
}

async function createMint(
  connection: Connection,
  payer: Keypair,
  decimals = 6,
): Promise<PublicKey> {
  const mint = Keypair.generate()
  const lamports = await getMinimumBalanceForRentExemptMint(connection)
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(
      mint.publicKey,
      decimals,
      payer.publicKey,
      null,
      TOKEN_PROGRAM_ID,
    ),
  )
  await sendAndConfirmTransaction(connection, tx, [payer, mint], {
    commitment: 'confirmed',
  })
  return mint.publicKey
}

async function mintToAta(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  dest: PublicKey,
  amount: bigint,
) {
  await send(
    connection,
    payer,
    createMintToInstruction(mint, dest, payer.publicKey, amount),
  )
}

async function tokenBalance(
  connection: Connection,
  ata: PublicKey,
): Promise<bigint> {
  const info = await connection.getTokenAccountBalance(ata)
  return BigInt(info.value.amount)
}

type AssetKind = 'SOL' | 'SPL'

async function runLifecycleMatrixCase(
  connection: Connection,
  authority: Keypair,
  buyer: Keypair,
  label: string,
  prizeKind: AssetKind,
  paymentKind: AssetKind,
  prizeMint: PublicKey,
  paymentMint: PublicKey,
  prizeAmount: bigint,
  pricePerShare: bigint,
) {
  const raffleId = await nextRaffleId(connection)
  const [rafflePk] = rafflePda(PROGRAM_ID, raffleId)
  console.log(
    `  [${label}] raffle_id=${raffleId} prize=${prizeKind} payment=${paymentKind}`,
  )

  let creatorPrizeAta: PublicKey | undefined
  let prizeVaultAta: PublicKey | undefined
  let buyerPaymentAta: PublicKey | undefined
  let paymentVaultAta: PublicKey | undefined
  let feePaymentAta: PublicKey | undefined
  let creatorPaymentAta: PublicKey | undefined
  let winnerPrizeAta: PublicKey | undefined

  if (prizeKind === 'SPL') {
    creatorPrizeAta = await ensureAta(connection, authority, prizeMint, authority.publicKey)
    prizeVaultAta = await ensureAta(connection, authority, prizeMint, rafflePk, true)
    await mintToAta(connection, authority, prizeMint, creatorPrizeAta, prizeAmount)
  }
  if (paymentKind === 'SPL') {
    paymentVaultAta = await ensureAta(connection, authority, paymentMint, rafflePk, true)
    buyerPaymentAta = await ensureAta(connection, authority, paymentMint, buyer.publicKey)
    feePaymentAta = await ensureAta(connection, authority, paymentMint, authority.publicKey)
    creatorPaymentAta = feePaymentAta // same wallet in this harness
    const need = pricePerShare * BigInt(LAUNCH.shares)
    await mintToAta(connection, authority, paymentMint, buyerPaymentAta, need)
  }

  await send(
    connection,
    authority,
    buildCreateRaffleIx({
      programId: PROGRAM_ID,
      creator: authority.publicKey,
      nextRaffleId: raffleId,
      prizeMint,
      paymentMint,
      prizeAmount,
      pricePerShare,
      totalShares: LAUNCH.shares,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 86400),
      drawDelaySlots: LAUNCH.drawDelaySlots,
      creatorPrizeAta,
      prizeVaultAta,
    }),
  )

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
      paymentMint,
      buyerPaymentAta,
      paymentVaultAta,
    }),
  )

  let raffle = await readRaffle(connection, raffleId)
  if (raffle.status !== RaffleStatus.SoldOut) {
    throw new Error(`[${label}] expected SoldOut`)
  }
  const eligible = Number(raffle.soldOutSlot) + raffle.drawDelaySlots
  // Draw requires Clock.slot > eligible; wait one past to avoid processed/confirmed races.
  await waitSlots(connection, eligible + 1)

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
  if (raffle.status !== RaffleStatus.Drawn) throw new Error(`[${label}] expected Drawn`)

  const [boardPk] = shareBoardPda(PROGRAM_ID, raffleId)
  const board = decodeShareBoard(
    Buffer.from((await connection.getAccountInfo(boardPk))!.data),
  )
  const winner = board.owners[raffle.winnerShareIndex]!
  const winnerKp =
    winner.equals(authority.publicKey) ? authority : winner.equals(buyer.publicKey) ? buyer : null
  if (!winnerKp) throw new Error(`[${label}] winner not in test keypairs`)

  if (prizeKind === 'SPL') {
    winnerPrizeAta = await ensureAta(
      connection,
      authority,
      prizeMint,
      winnerKp.publicKey,
    )
  }

  const prizeBefore =
    prizeKind === 'SPL' ? await tokenBalance(connection, winnerPrizeAta!) : 0n

  await send(
    connection,
    winnerKp,
    buildClaimPrizeIx({
      programId: PROGRAM_ID,
      winner: winnerKp.publicKey,
      raffleId,
      prizeMint,
      prizeVaultAta,
      winnerPrizeAta,
    }),
  )

  if (prizeKind === 'SPL') {
    const prizeAfter = await tokenBalance(connection, winnerPrizeAta!)
    if (prizeAfter - prizeBefore !== prizeAmount) {
      throw new Error(
        `[${label}] prize delta ${prizeAfter - prizeBefore} != ${prizeAmount}`,
      )
    }
  }

  await send(
    connection,
    authority,
    buildClaimProceedsIx({
      programId: PROGRAM_ID,
      creator: authority.publicKey,
      feeRecipient: authority.publicKey,
      raffleId,
      paymentMint,
      paymentVaultAta,
      feeRecipientAta: feePaymentAta,
      creatorPaymentAta,
    }),
  )
  console.log(`  [${label}] OK`)
}

async function main() {
  const connection = new Connection(RPC, 'confirmed')
  const authority = loadKp(
    process.env.SOLANA_AUTHORITY_KEYPAIR ??
      process.env.SOLANA_KEEPER_KEYPAIR ??
      `${process.env.HOME}/.config/solana/id.json`,
  )
  const buyer = Keypair.generate()

  console.log(`== rpc=${RPC} program=${PROGRAM_ID.toBase58()} ==`)
  console.log(`authority=${authority.publicKey.toBase58()}`)
  console.log(`buyer=${buyer.publicKey.toBase58()}`)

  await airdrop(connection, authority.publicKey, 50)
  await airdrop(connection, buyer.publicKey, 20)

  const protocolConfig = {
    allowDifferentTokens: true,
    allowCustomShares: false,
    allowCustomPrice: false,
    allowCustomDrawDelay: false,
    defaultShares: LAUNCH.shares,
    priceDivisor: LAUNCH.priceDivisor,
    defaultDrawDelaySlots: LAUNCH.drawDelaySlots,
  }

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
        protocolConfig,
      }),
    )
  } else {
    console.log('-- config already initialized; set_protocol_config(allowDifferentTokens) --')
    await send(
      connection,
      authority,
      buildSetProtocolConfigIx({
        programId: PROGRAM_ID,
        authority: authority.publicKey,
        protocolConfig,
      }),
    )
  }

  const config = decodeConfig(
    Buffer.from((await connection.getAccountInfo(configPk))!.data),
  )
  if (!config.protocolConfig.allowDifferentTokens) {
    throw new Error('allowDifferentTokens still false')
  }

  const prizeAmount = BigInt(LAMPORTS_PER_SOL) // 1 SOL
  const pricePerShare = prizeAmount / BigInt(LAUNCH.priceDivisor) // 0.1 SOL
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400)

  // ========== 1) native lifecycle ==========
  const raffleId = config.nextRaffleId
  console.log(`-- 1) create → buy → draw → claim (raffle_id=${raffleId}) --`)
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
      count: 10,
    }),
  )

  const [creatorRec] = buyerRecordPda(PROGRAM_ID, raffleId, authority.publicKey)
  await send(
    connection,
    authority,
    buildBuySharesIx({
      programId: PROGRAM_ID,
      buyer: authority.publicKey,
      raffleId,
      buyerRecord: creatorRec,
      count: 1,
    }),
  )

  raffle = await readRaffle(connection, raffleId)
  if (raffle.status !== RaffleStatus.SoldOut) throw new Error('expected SoldOut')
  const pending1 = await readPending(connection)
  if (!pending1.raffleIds.includes(raffleId)) throw new Error('not in pending')
  console.log(`sold_out_slot=${raffle.soldOutSlot} pending=${pending1.raffleIds.join(',')}`)

  const eligible = Number(raffle.soldOutSlot) + raffle.drawDelaySlots
  const head = await waitSlots(connection, eligible + 1)
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
  console.log(`winner=${winner.toBase58()} share=${raffle.winnerShareIndex} draw_slot=${raffle.drawSlot}`)

  const winnerKp =
    winner.equals(authority.publicKey) ? authority : winner.equals(buyer.publicKey) ? buyer : null
  if (!winnerKp) throw new Error('winner not in test keypairs')

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
  console.log('OK lifecycle')

  // ========== 1b) close_* authority gate (buyer/stranger denied; authority ok) ==========
  console.log(`-- 1b) close permission (raffle_id=${raffleId}) --`)
  const stranger = Keypair.generate()
  await airdrop(connection, stranger.publicKey, 1)

  let buyerCloseDenied = false
  try {
    await send(
      connection,
      buyer,
      buildCloseBuyerRecordIx({
        programId: PROGRAM_ID,
        authority: buyer.publicKey,
        recipient: buyer.publicKey,
        raffleId,
        buyer: buyer.publicKey,
        buyerRecord: buyerRec,
      }),
    )
  } catch {
    buyerCloseDenied = true
  }
  if (!buyerCloseDenied) throw new Error('buyer must not close_buyer_record')

  let strangerCloseDenied = false
  try {
    await send(
      connection,
      stranger,
      buildCloseBuyerRecordIx({
        programId: PROGRAM_ID,
        authority: stranger.publicKey,
        recipient: stranger.publicKey,
        raffleId,
        buyer: buyer.publicKey,
        buyerRecord: buyerRec,
      }),
    )
  } catch {
    strangerCloseDenied = true
  }
  if (!strangerCloseDenied) throw new Error('stranger must not close_buyer_record')

  let strangerBoardDenied = false
  try {
    await send(
      connection,
      stranger,
      buildCloseShareBoardIx({
        programId: PROGRAM_ID,
        authority: stranger.publicKey,
        recipient: stranger.publicKey,
        raffleId,
      }),
    )
  } catch {
    strangerBoardDenied = true
  }
  if (!strangerBoardDenied) throw new Error('stranger must not close_share_board')

  await send(
    connection,
    authority,
    buildCloseBuyerRecordIx({
      programId: PROGRAM_ID,
      authority: authority.publicKey,
      recipient: config.feeRecipient,
      raffleId,
      buyer: buyer.publicKey,
      buyerRecord: buyerRec,
    }),
  )
  if (await connection.getAccountInfo(buyerRec)) {
    throw new Error('buyer_record should be closed by authority')
  }
  await send(
    connection,
    authority,
    buildCloseShareBoardIx({
      programId: PROGRAM_ID,
      authority: authority.publicKey,
      recipient: config.feeRecipient,
      raffleId,
    }),
  )
  if (await connection.getAccountInfo(boardPk)) {
    throw new Error('share_board should be closed by authority')
  }
  console.log('OK close permission (buyer/stranger denied; authority reclaim)')

  // ========== 2) keeper draw_many ==========
  const rid2 = await nextRaffleId(connection)
  console.log(`-- 2) keeper pending → draw_many (raffle_id=${rid2}) --`)
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
  if (r2.status !== RaffleStatus.SoldOut) throw new Error('raffle2 not SoldOut')
  await waitSlots(connection, Number(r2.soldOutSlot) + r2.drawDelaySlots)

  const ready = await collectReadyRaffleIds(connection, PROGRAM_ID)
  console.log(`keeper ready=[${ready.join(',')}]`)
  if (!ready.includes(rid2)) throw new Error('raffle2 not ready for keeper')

  const tick = await runSolanaTick({
    SOLANA_RPC_URL: RPC,
    SOLANA_PROGRAM_ID: PROGRAM_ID.toBase58(),
    SOLANA_KEEPER_KEYPAIR: JSON.stringify(Array.from(authority.secretKey)),
  })
  console.log('keeper tick:', tick)
  if (!tick.triggered) throw new Error(`keeper did not trigger: ${tick.reason}`)

  const r2after = await readRaffle(connection, rid2)
  if (r2after.status !== RaffleStatus.Drawn) throw new Error('raffle2 not Drawn after keeper')
  const pendingAfter = await readPending(connection)
  if (pendingAfter.raffleIds.includes(rid2)) throw new Error('raffle2 still pending')
  console.log('OK keeper')

  const tick2 = await runSolanaTick({
    SOLANA_RPC_URL: RPC,
    SOLANA_PROGRAM_ID: PROGRAM_ID.toBase58(),
    SOLANA_KEEPER_KEYPAIR: JSON.stringify(Array.from(authority.secretKey)),
  })
  if (tick2.reason !== 'not-ready' && tick2.triggered) {
    console.warn('unexpected second tick', tick2)
  }

  // ========== 3) expire / refund / recoverPrize ==========
  const rid3 = await nextRaffleId(connection)
  console.log(`-- 3) expire refund + recoverPrize (raffle_id=${rid3}) --`)
  // Short deadline relative to on-chain Clock (test-validator may lag wall time)
  const clockInfo = await connection.getAccountInfo(
    new PublicKey('SysvarC1ock11111111111111111111111111111111'),
  )
  if (!clockInfo) throw new Error('Clock sysvar missing')
  const chainNow = Number(clockInfo.data.readBigInt64LE(32))
  const deadline3 = BigInt(chainNow + 12)
  await send(
    connection,
    authority,
    buildCreateRaffleIx({
      programId: PROGRAM_ID,
      creator: authority.publicKey,
      nextRaffleId: rid3,
      prizeAmount,
      pricePerShare,
      totalShares: LAUNCH.shares,
      deadline: deadline3,
      drawDelaySlots: LAUNCH.drawDelaySlots,
    }),
  )
  const [buyerRec3] = buyerRecordPda(PROGRAM_ID, rid3, buyer.publicKey)
  const buyerLamportsBefore = await connection.getBalance(buyer.publicKey)
  await send(
    connection,
    buyer,
    buildBuySharesIx({
      programId: PROGRAM_ID,
      buyer: buyer.publicKey,
      raffleId: rid3,
      buyerRecord: buyerRec3,
      count: 1,
    }),
  )
  console.log(`  waiting past deadline=${deadline3} (on-chain Clock)…`)
  // test-validator Clock can lag wall time; wait on getBlockTime / Clock, not Date.now().
  for (;;) {
    const slot = await connection.getSlot('processed')
    const blockTime = await connection.getBlockTime(slot)
    const now =
      blockTime ??
      Number(
        (
          await connection.getAccountInfo(
            new PublicKey('SysvarC1ock11111111111111111111111111111111'),
          )
        )?.data.readBigInt64LE(32) ?? 0n,
      )
    if (now > Number(deadline3)) {
      console.log(`  chain now=${now} > deadline; slot=${slot}`)
      break
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  await waitSlots(connection, (await connection.getSlot('processed')) + 2)

  await send(
    connection,
    buyer,
    buildRefundIx({
      programId: PROGRAM_ID,
      buyer: buyer.publicKey,
      raffleId: rid3,
      buyerRecord: buyerRec3,
    }),
  )
  const buyerAfter = await readBuyer(connection, rid3, buyer.publicKey)
  if (!buyerAfter.refunded) throw new Error('buyer not refunded')
  if (buyerAfter.paid !== pricePerShare) throw new Error('unexpected paid')
  const r3 = await readRaffle(connection, rid3)
  if (r3.status !== RaffleStatus.Expired) throw new Error('expected Expired')
  const buyerLamportsAfter = await connection.getBalance(buyer.publicKey)
  // Refund returns payment; net of tx fees should still show recovery of most of pricePerShare
  if (buyerLamportsAfter <= buyerLamportsBefore - Number(pricePerShare)) {
    throw new Error('buyer lamports did not reflect refund')
  }

  const creatorBefore = await connection.getBalance(authority.publicKey)
  await send(
    connection,
    authority,
    buildRecoverPrizeIx({
      programId: PROGRAM_ID,
      creator: authority.publicKey,
      raffleId: rid3,
    }),
  )
  const r3b = await readRaffle(connection, rid3)
  if (!r3b.prizeRecovered) throw new Error('prize not recovered')
  const creatorAfter = await connection.getBalance(authority.publicKey)
  if (creatorAfter <= creatorBefore) throw new Error('creator did not receive prize')
  console.log(`OK refund buyerRefunded=${buyerAfter.refunded} prizeRecovered=${r3b.prizeRecovered}`)

  // ========== 4) late entropy → refund (no clamp-to-latest hash) ==========
  const rid4 = await nextRaffleId(connection)
  console.log(`-- 4) late entropy expired → refund (raffle_id=${rid4}) --`)
  await send(
    connection,
    authority,
    buildCreateRaffleIx({
      programId: PROGRAM_ID,
      creator: authority.publicKey,
      nextRaffleId: rid4,
      prizeAmount,
      pricePerShare,
      totalShares: LAUNCH.shares,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 86400),
      drawDelaySlots: LAUNCH.drawDelaySlots,
    }),
  )
  const [buyerRec4] = buyerRecordPda(PROGRAM_ID, rid4, buyer.publicKey)
  await send(
    connection,
    buyer,
    buildBuySharesIx({
      programId: PROGRAM_ID,
      buyer: buyer.publicKey,
      raffleId: rid4,
      buyerRecord: buyerRec4,
      count: LAUNCH.shares,
    }),
  )
  const r4 = await readRaffle(connection, rid4)
  if (r4.status !== RaffleStatus.SoldOut) throw new Error('raffle4 not SoldOut')
  const eligible4 = Number(r4.soldOutSlot) + r4.drawDelaySlots
  console.log(`  sold_out=${r4.soldOutSlot} eligible=${eligible4} → wait until SlotHashes aged out`)
  const { slot: lateSlot, oldest } = await waitEligibleOutsideWindow(connection, eligible4)
  console.log(`  slot=${lateSlot} oldest_hash=${oldest} eligible=${eligible4}`)
  if (!(eligible4 < oldest)) {
    throw new Error(`eligible ${eligible4} still inside window (oldest=${oldest})`)
  }

  // Anchored draw must fail (no clamp to newer slot)
  let drawFailed = false
  try {
    await send(
      connection,
      authority,
      buildDrawIx({
        programId: PROGRAM_ID,
        caller: authority.publicKey,
        raffleId: rid4,
      }),
    )
  } catch {
    drawFailed = true
  }
  if (!drawFailed) throw new Error('late draw should fail with DrawEntropyExpired')

  // Also require retention heuristic window for refund gate (eligible + 512)
  const retentionNeed = eligible4 + LATE_DRAW_EXTRA_SLOTS
  while ((await connection.getSlot('processed')) <= retentionNeed) {
    await new Promise((r) => setTimeout(r, 250))
  }

  await send(
    connection,
    buyer,
    buildRefundIx({
      programId: PROGRAM_ID,
      buyer: buyer.publicKey,
      raffleId: rid4,
      buyerRecord: buyerRec4,
    }),
  )
  const r4after = await readRaffle(connection, rid4)
  if (r4after.status !== RaffleStatus.Expired) {
    throw new Error(`expected Expired after late refund, got ${r4after.status}`)
  }
  await send(
    connection,
    authority,
    buildRecoverPrizeIx({
      programId: PROGRAM_ID,
      creator: authority.publicKey,
      raffleId: rid4,
    }),
  )
  const r4b = await readRaffle(connection, rid4)
  if (!r4b.prizeRecovered) throw new Error('late recoverPrize failed')
  console.log(`OK late entropy → refund+recover (draw correctly refused)`)

  // ========== 5) SPL asset matrix ==========
  console.log('-- 5) SPL asset matrix --')
  const mintA = await createMint(connection, authority, 6)
  const mintB = await createMint(connection, authority, 6)
  const splPrize = 1_000_000n // 1.0 with 6 decimals
  // allowCustomPrice=false → pricePerShare must equal prizeAmount / priceDivisor
  const priceFromPrize = (prize: bigint) => prize / BigInt(LAUNCH.priceDivisor)
  const nativePrize = prizeAmount

  // SPL_A / SPL_A
  await runLifecycleMatrixCase(
    connection,
    authority,
    buyer,
    'SPL_A/SPL_A',
    'SPL',
    'SPL',
    mintA,
    mintA,
    splPrize,
    priceFromPrize(splPrize),
  )
  // SOL / SPL_A — payment amount is still prize/divisor (SPL base units)
  await runLifecycleMatrixCase(
    connection,
    authority,
    buyer,
    'SOL/SPL_A',
    'SOL',
    'SPL',
    NATIVE,
    mintA,
    nativePrize,
    priceFromPrize(nativePrize),
  )
  // SPL_A / SOL — payment amount is prize/divisor (lamports)
  await runLifecycleMatrixCase(
    connection,
    authority,
    buyer,
    'SPL_A/SOL',
    'SPL',
    'SOL',
    mintA,
    NATIVE,
    splPrize,
    priceFromPrize(splPrize),
  )
  // SPL_A / SPL_B
  await runLifecycleMatrixCase(
    connection,
    authority,
    buyer,
    'SPL_A/SPL_B',
    'SPL',
    'SPL',
    mintA,
    mintB,
    splPrize,
    priceFromPrize(splPrize),
  )
  console.log('OK SPL matrix')

  console.log('== ALL SOLANA E2E PASSED ==')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
