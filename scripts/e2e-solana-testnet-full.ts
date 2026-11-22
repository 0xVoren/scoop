/**
 * Scoop Solana devnet/testnet **full** E2E + edges (symmetric with BSC).
 *
 * Gates:
 *   1) multi-buyer sell-out → delay → draw → claimPrize + claimProceeds
 *   2) deadline expire (unsold) → refund + recoverPrize
 *   3) late entropy (SlotHashes aged out) → draw fails → refund + recover
 *   4) edges: dup claim/refund fail; draw too early; share boundary; keeper draw_many
 *   5) optional SPL same-mint lifecycle (SKIP_SPL=1 to skip)
 *
 * No airdrop — fund buyers from authority.
 *
 * Env:
 *   SOLANA_RPC_URL / SOLANA_PROGRAM_ID / SOLANA_AUTHORITY_KEYPAIR
 *   SKIP_LATE=1  SKIP_SPL=1  SCOOP_PRIZE_LAMPORTS=…
 *   RESULTS_JSON=/tmp/scoop-solana-e2e-results.json
 */
import { writeFileSync } from 'node:fs'
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
  buildCreateRaffleIx,
  buildDrawIx,
  buildDrawManyIx,
  buildRecoverPrizeIx,
  buildRefundIx,
  collectReadyRaffleIds,
  configPda,
  decodeBuyerRecord,
  decodeConfig,
  decodePendingDraws,
  decodeRaffle,
  decodeShareBoard,
  pendingPda,
  rafflePda,
  shareBoardPda,
} from '../keeper/src/solana/index'
import { readFileSync } from 'node:fs'

const RPC = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'
const PROGRAM_ID = new PublicKey(process.env.SOLANA_PROGRAM_ID ?? DEFAULT_PROGRAM_ID)
const CLUSTER = process.env.SOLANA_EXPLORER_CLUSTER ?? 'devnet'
const SKIP_LATE = process.env.SKIP_LATE === '1'
const SKIP_SPL = process.env.SKIP_SPL === '1'
const RESULTS_JSON =
  process.env.RESULTS_JSON ?? '/tmp/scoop-solana-e2e-results.json'
const LATE_DRAW_EXTRA_SLOTS = Number(process.env.SCOOP_LATE_DRAW_EXTRA_SLOTS ?? 520)
const NATIVE = new PublicKey(NATIVE_MINT)

type Scenario = {
  name: string
  status: 'pass' | 'fail' | 'skipped'
  note: string
  txs: { hash: string; url: string }[]
}

const scenarios: Scenario[] = []

function loadKp(pathOrJson: string): Keypair {
  const t = pathOrJson.trim()
  const json = t.startsWith('[') ? t : readFileSync(t, 'utf8').trim()
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(json) as number[]))
}

function explorerTx(sig: string) {
  return `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`
}

function record(name: string, status: Scenario['status'], note: string, txs: string[]) {
  scenarios.push({
    name,
    status,
    note,
    txs: txs.filter(Boolean).map((hash) => ({ hash, url: explorerTx(hash) })),
  })
  console.log(`recorded ${name}=${status}`)
}

function flushResults(meta: Record<string, unknown>) {
  writeFileSync(
    RESULTS_JSON,
    JSON.stringify({ ...meta, scenarios }, null, 2),
  )
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
  const sig = await sendAndConfirmTransaction(connection, tx, [payer, ...signers], {
    commitment: 'confirmed',
  })
  console.log(`  tx ${explorerTx(sig)}`)
  return sig
}

async function expectFail(
  label: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn()
  } catch {
    console.log(`  OK expected-fail: ${label}`)
    return
  }
  throw new Error(`expected failure: ${label}`)
}

async function waitSlots(connection: Connection, targetSlot: number) {
  for (;;) {
    const slot = await connection.getSlot('processed')
    if (slot > targetSlot) return slot
    await new Promise((r) => setTimeout(r, 400))
  }
}

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

async function readSlotHashesWindow(connection: Connection) {
  const info = await connection.getAccountInfo(new PublicKey(SLOT_HASHES_SYSVAR))
  if (!info) throw new Error('SlotHashes sysvar missing')
  const slots = parseSlotHashSlots(Buffer.from(info.data))
  if (slots.length === 0) throw new Error('SlotHashes empty')
  return { oldest: Math.min(...slots), newest: Math.max(...slots) }
}

async function waitEligibleOutsideWindow(connection: Connection, eligible: number) {
  const start = Date.now()
  let lastLog = 0
  for (;;) {
    const slot = await connection.getSlot('processed')
    const { oldest } = await readSlotHashesWindow(connection)
    if (slot > eligible && eligible < oldest) return { slot, oldest }
    if (Date.now() - lastLog > 8000) {
      console.log(
        `  … late wait slot=${slot} eligible=${eligible} oldest=${oldest} (+${Math.floor((Date.now() - start) / 1000)}s)`,
      )
      lastLog = Date.now()
    }
    if (slot > eligible + LATE_DRAW_EXTRA_SLOTS * 4) {
      throw new Error(`late-draw timeout slot=${slot} eligible=${eligible} oldest=${oldest}`)
    }
    await new Promise((r) => setTimeout(r, 500))
  }
}

async function chainUnix(connection: Connection): Promise<number> {
  const slot = await connection.getSlot('processed')
  const bt = await connection.getBlockTime(slot)
  if (bt) return bt
  const clock = await connection.getAccountInfo(
    new PublicKey('SysvarC1ock11111111111111111111111111111111'),
  )
  if (!clock) throw new Error('Clock missing')
  return Number(clock.data.readBigInt64LE(32))
}

async function waitPastDeadline(connection: Connection, deadline: bigint) {
  for (;;) {
    const now = await chainUnix(connection)
    if (now > Number(deadline)) {
      console.log(`  chain now=${now} > deadline=${deadline}`)
      return
    }
    console.log(`  … expire wait now=${now} need>${deadline}`)
    await new Promise((r) => setTimeout(r, 2000))
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

async function readBuyer(connection: Connection, raffleId: bigint, buyer: PublicKey) {
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

async function fund(
  connection: Connection,
  from: Keypair,
  to: PublicKey,
  lamports: number,
) {
  return send(
    connection,
    from,
    SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports }),
  )
}

async function main() {
  const connection = new Connection(RPC, 'confirmed')
  const authority = loadKp(
    process.env.SOLANA_AUTHORITY_KEYPAIR ??
      process.env.SOLANA_KEEPER_KEYPAIR ??
      `${process.env.HOME}/.config/solana/id.json`,
  )
  const buyer = Keypair.generate()
  const buyer2 = Keypair.generate()

  const prizeEnv = (process.env.SCOOP_PRIZE_LAMPORTS ?? '').trim()
  const prizeAmount = BigInt(
    prizeEnv !== '' ? prizeEnv : Math.floor(0.02 * LAMPORTS_PER_SOL),
  )
  if (prizeAmount <= 0n) throw new Error(`prizeAmount must be > 0 (got ${prizeAmount})`)
  const pricePerShare = prizeAmount / BigInt(LAUNCH.priceDivisor)
  const cost11 = pricePerShare * BigInt(LAUNCH.shares)

  const bal = await connection.getBalance(authority.publicKey)
  console.log(`== Solana testnet FULL E2E ==`)
  console.log(`rpc=${RPC} program=${PROGRAM_ID.toBase58()}`)
  console.log(`authority=${authority.publicKey.toBase58()} balance=${bal / LAMPORTS_PER_SOL} SOL`)
  console.log(`buyer=${buyer.publicKey.toBase58()}`)
  console.log(`buyer2=${buyer2.publicKey.toBase58()}`)
  console.log(`prize=${Number(prizeAmount) / LAMPORTS_PER_SOL} SOL`)

  // Budget: several prizes + buys + SPL mint rent + fees
  const minNeed =
    Number(prizeAmount) * 6 +
    Number(cost11) * 4 +
    Math.floor(0.4 * LAMPORTS_PER_SOL)
  if (bal < minNeed) {
    console.error(
      `BLOCKER: authority needs ≥ ${minNeed / LAMPORTS_PER_SOL} SOL (have ${bal / LAMPORTS_PER_SOL}). Fund ${authority.publicKey.toBase58()}`,
    )
    process.exit(2)
  }

  const [configPk] = configPda(PROGRAM_ID)
  const configInfo = await connection.getAccountInfo(configPk)
  if (!configInfo) {
    console.error('BLOCKER: config missing — run scripts/deploy-solana-devnet.sh first')
    process.exit(2)
  }
  const config = decodeConfig(Buffer.from(configInfo.data))
  console.log(`fee_recipient=${config.feeRecipient.toBase58()} next=${config.nextRaffleId}`)

  flushResults({
    chain: 'solana-devnet',
    program: PROGRAM_ID.toBase58(),
    authority: authority.publicKey.toBase58(),
    feeRecipient: config.feeRecipient.toBase58(),
  })

  // Fund buyers
  const buyerNeed = Number(cost11) + Math.floor(0.05 * LAMPORTS_PER_SOL)
  await fund(connection, authority, buyer.publicKey, buyerNeed)
  await fund(connection, authority, buyer2.publicKey, buyerNeed)

  const longDeadline = BigInt(Math.floor(Date.now() / 1000) + 86400)

  // NOTE: do NOT bootstrap a late-entropy SoldOut raffle before keeper/draw_many —
  // draw_many/tick could clear it. Late raffle is created after keeper.

  console.log('-- bootstrap expire raffle --')
  const ridExp = await nextRaffleId(connection)
  const nowChain = await chainUnix(connection)
  const deadlineExp = BigInt(nowChain + 75)
  const expCreate = await send(
    connection,
    authority,
    buildCreateRaffleIx({
      programId: PROGRAM_ID,
      creator: authority.publicKey,
      nextRaffleId: ridExp,
      prizeAmount,
      pricePerShare,
      totalShares: LAUNCH.shares,
      deadline: deadlineExp,
      drawDelaySlots: LAUNCH.drawDelaySlots,
    }),
  )
  const [buyerRecExp] = buyerRecordPda(PROGRAM_ID, ridExp, buyer.publicKey)
  const expBuy = await send(
    connection,
    buyer,
    buildBuySharesIx({
      programId: PROGRAM_ID,
      buyer: buyer.publicKey,
      raffleId: ridExp,
      buyerRecord: buyerRecExp,
      count: 1,
    }),
  )

  // ── 1) multi-buyer lifecycle ────────────────────────────────
  console.log('-- 1) multi-buyer → draw → claim --')
  const rid1 = await nextRaffleId(connection)
  const c1 = await send(
    connection,
    authority,
    buildCreateRaffleIx({
      programId: PROGRAM_ID,
      creator: authority.publicKey,
      nextRaffleId: rid1,
      prizeAmount,
      pricePerShare,
      totalShares: LAUNCH.shares,
      deadline: longDeadline,
      drawDelaySlots: LAUNCH.drawDelaySlots,
    }),
  )
  const [recB] = buyerRecordPda(PROGRAM_ID, rid1, buyer.publicKey)
  const b10 = await send(
    connection,
    buyer,
    buildBuySharesIx({
      programId: PROGRAM_ID,
      buyer: buyer.publicKey,
      raffleId: rid1,
      buyerRecord: recB,
      count: 10,
    }),
  )
  const [recB2] = buyerRecordPda(PROGRAM_ID, rid1, buyer2.publicKey)
  const b1 = await send(
    connection,
    buyer2,
    buildBuySharesIx({
      programId: PROGRAM_ID,
      buyer: buyer2.publicKey,
      raffleId: rid1,
      buyerRecord: recB2,
      count: 1,
    }),
  )
  let r1 = await readRaffle(connection, rid1)
  if (r1.status !== RaffleStatus.SoldOut) throw new Error('lifecycle not SoldOut')
  const elig1 = Number(r1.soldOutSlot) + r1.drawDelaySlots

  await expectFail('draw-too-early', () =>
    send(
      connection,
      authority,
      buildDrawIx({ programId: PROGRAM_ID, caller: authority.publicKey, raffleId: rid1 }),
    ),
  )

  await waitSlots(connection, elig1 + 1)
  const d1 = await send(
    connection,
    authority,
    buildDrawIx({ programId: PROGRAM_ID, caller: authority.publicKey, raffleId: rid1 }),
  )
  r1 = await readRaffle(connection, rid1)
  if (r1.status !== RaffleStatus.Drawn) throw new Error('not Drawn')
  const [boardPk] = shareBoardPda(PROGRAM_ID, rid1)
  const board = decodeShareBoard(
    Buffer.from((await connection.getAccountInfo(boardPk))!.data),
  )
  const winner = board.owners[r1.winnerShareIndex]!
  console.log(`  winner=${winner.toBase58()} share=${r1.winnerShareIndex}`)
  const winnerKp = winner.equals(buyer.publicKey)
    ? buyer
    : winner.equals(buyer2.publicKey)
      ? buyer2
      : winner.equals(authority.publicKey)
        ? authority
        : null
  if (!winnerKp) throw new Error('winner not in harness keypairs')

  const cp = await send(
    connection,
    winnerKp,
    buildClaimPrizeIx({
      programId: PROGRAM_ID,
      winner: winnerKp.publicKey,
      raffleId: rid1,
    }),
  )
  const cr = await send(
    connection,
    authority,
    buildClaimProceedsIx({
      programId: PROGRAM_ID,
      creator: authority.publicKey,
      feeRecipient: config.feeRecipient,
      raffleId: rid1,
    }),
  )
  r1 = await readRaffle(connection, rid1)
  if (!r1.prizeClaimed || !r1.proceedsClaimed) throw new Error('claims not flagged')

  await expectFail('dup-claimPrize', () =>
    send(
      connection,
      winnerKp,
      buildClaimPrizeIx({
        programId: PROGRAM_ID,
        winner: winnerKp.publicKey,
        raffleId: rid1,
      }),
    ),
  )
  await expectFail('dup-claimProceeds', () =>
    send(
      connection,
      authority,
      buildClaimProceedsIx({
        programId: PROGRAM_ID,
        creator: authority.publicKey,
        feeRecipient: config.feeRecipient,
        raffleId: rid1,
      }),
    ),
  )

  record(
    '1-multi-buy-draw-claim',
    'pass',
    `rid=${rid1} winner=${winner.toBase58()} share=${r1.winnerShareIndex} fee=1%`,
    [c1, b10, b1, d1, cp, cr],
  )

  // ── 4) keeper draw_many ─────────────────────────────────────
  console.log('-- 4) pending + keeper draw_many --')
  // top up buyer
  if ((await connection.getBalance(buyer.publicKey)) < Number(cost11) + 5_000_000) {
    await fund(connection, authority, buyer.publicKey, buyerNeed)
  }
  const ridK = await nextRaffleId(connection)
  const kc = await send(
    connection,
    authority,
    buildCreateRaffleIx({
      programId: PROGRAM_ID,
      creator: authority.publicKey,
      nextRaffleId: ridK,
      prizeAmount,
      pricePerShare,
      totalShares: LAUNCH.shares,
      deadline: longDeadline,
      drawDelaySlots: LAUNCH.drawDelaySlots,
    }),
  )
  const [recK] = buyerRecordPda(PROGRAM_ID, ridK, buyer.publicKey)
  const kb = await send(
    connection,
    buyer,
    buildBuySharesIx({
      programId: PROGRAM_ID,
      buyer: buyer.publicKey,
      raffleId: ridK,
      buyerRecord: recK,
      count: LAUNCH.shares,
    }),
  )
  const pendingBefore = await readPending(connection)
  if (!pendingBefore.raffleIds.includes(ridK)) throw new Error('not pending')
  const rK = await readRaffle(connection, ridK)
  await waitSlots(connection, Number(rK.soldOutSlot) + rK.drawDelaySlots + 1)
  const ready = await collectReadyRaffleIds(connection, PROGRAM_ID)
  console.log(`  keeper ready=[${ready.join(',')}]`)
  if (!ready.includes(ridK)) throw new Error(`ridK=${ridK} not ready`)
  // Draw only this raffle (avoid drawing other pending SoldOut left from earlier runs)
  const kd = await send(
    connection,
    authority,
    buildDrawManyIx({
      programId: PROGRAM_ID,
      caller: authority.publicKey,
      raffleIds: [ridK],
    }),
  )
  const rK2 = await readRaffle(connection, ridK)
  if (rK2.status !== RaffleStatus.Drawn) throw new Error('draw_many failed')
  record('4-drawMany-pending', 'pass', `rid=${ridK} pending_ready=${ready.join(',')}`, [
    kc,
    kb,
    kd,
  ])

  // ── 5) SPL same-mint ────────────────────────────────────────
  if (SKIP_SPL) {
    record('5-spl-same-mint', 'skipped', 'SKIP_SPL=1', [])
  } else {
    console.log('-- 5) SPL same-mint lifecycle --')
    const mint = Keypair.generate()
    const lamports = await getMinimumBalanceForRentExemptMint(connection)
    const mintTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: mint.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(
        mint.publicKey,
        6,
        authority.publicKey,
        null,
        TOKEN_PROGRAM_ID,
      ),
    )
    const mintSig = await sendAndConfirmTransaction(connection, mintTx, [authority, mint], {
      commitment: 'confirmed',
    })
    console.log(`  mint ${mint.publicKey.toBase58()} ${explorerTx(mintSig)}`)

    const splPrize = 1_000_000n
    const splPrice = splPrize / BigInt(LAUNCH.priceDivisor)
    const ridS = await nextRaffleId(connection)
    const [rafflePk] = rafflePda(PROGRAM_ID, ridS)
    const creatorAta = getAssociatedTokenAddressSync(mint.publicKey, authority.publicKey)
    const prizeVault = getAssociatedTokenAddressSync(mint.publicKey, rafflePk, true)
    const buyerAta = getAssociatedTokenAddressSync(mint.publicKey, buyer.publicKey)
    const payVault = getAssociatedTokenAddressSync(mint.publicKey, rafflePk, true)
    const feeAta = getAssociatedTokenAddressSync(mint.publicKey, config.feeRecipient)

    await send(connection, authority, [
      createAssociatedTokenAccountIdempotentInstruction(
        authority.publicKey,
        creatorAta,
        authority.publicKey,
        mint.publicKey,
      ),
      createAssociatedTokenAccountIdempotentInstruction(
        authority.publicKey,
        prizeVault,
        rafflePk,
        mint.publicKey,
      ),
      createAssociatedTokenAccountIdempotentInstruction(
        authority.publicKey,
        buyerAta,
        buyer.publicKey,
        mint.publicKey,
      ),
      createAssociatedTokenAccountIdempotentInstruction(
        authority.publicKey,
        payVault,
        rafflePk,
        mint.publicKey,
      ),
      createAssociatedTokenAccountIdempotentInstruction(
        authority.publicKey,
        feeAta,
        config.feeRecipient,
        mint.publicKey,
      ),
      createMintToInstruction(mint.publicKey, creatorAta, authority.publicKey, Number(splPrize)),
      createMintToInstruction(
        mint.publicKey,
        buyerAta,
        authority.publicKey,
        Number(splPrice * BigInt(LAUNCH.shares)),
      ),
    ])

    const sc = await send(
      connection,
      authority,
      buildCreateRaffleIx({
        programId: PROGRAM_ID,
        creator: authority.publicKey,
        nextRaffleId: ridS,
        prizeMint: mint.publicKey,
        paymentMint: mint.publicKey,
        prizeAmount: splPrize,
        pricePerShare: splPrice,
        totalShares: LAUNCH.shares,
        deadline: longDeadline,
        drawDelaySlots: LAUNCH.drawDelaySlots,
        creatorPrizeAta: creatorAta,
        prizeVaultAta: prizeVault,
      }),
    )
    const [recS] = buyerRecordPda(PROGRAM_ID, ridS, buyer.publicKey)
    const sb = await send(
      connection,
      buyer,
      buildBuySharesIx({
        programId: PROGRAM_ID,
        buyer: buyer.publicKey,
        raffleId: ridS,
        buyerRecord: recS,
        count: LAUNCH.shares,
        paymentMint: mint.publicKey,
        buyerPaymentAta: buyerAta,
        paymentVaultAta: payVault,
      }),
    )
    let rS = await readRaffle(connection, ridS)
    await waitSlots(connection, Number(rS.soldOutSlot) + rS.drawDelaySlots + 1)
    const sd = await send(
      connection,
      authority,
      buildDrawIx({ programId: PROGRAM_ID, caller: authority.publicKey, raffleId: ridS }),
    )
    rS = await readRaffle(connection, ridS)
    const [boardSPk] = shareBoardPda(PROGRAM_ID, ridS)
    const boardS = decodeShareBoard(
      Buffer.from((await connection.getAccountInfo(boardSPk))!.data),
    )
    const winS = boardS.owners[rS.winnerShareIndex]!
    const winKp = winS.equals(buyer.publicKey)
      ? buyer
      : winS.equals(authority.publicKey)
        ? authority
        : null
    if (!winKp) throw new Error('SPL winner not in harness')
    const winnerAta = getAssociatedTokenAddressSync(mint.publicKey, winKp.publicKey)
    await send(
      connection,
      authority,
      createAssociatedTokenAccountIdempotentInstruction(
        authority.publicKey,
        winnerAta,
        winKp.publicKey,
        mint.publicKey,
      ),
    )
    const scp = await send(
      connection,
      winKp,
      buildClaimPrizeIx({
        programId: PROGRAM_ID,
        winner: winKp.publicKey,
        raffleId: ridS,
        prizeMint: mint.publicKey,
        prizeVaultAta: prizeVault,
        winnerPrizeAta: winnerAta,
      }),
    )
    const creatorPayAta = getAssociatedTokenAddressSync(mint.publicKey, authority.publicKey)
    const scr = await send(
      connection,
      authority,
      buildClaimProceedsIx({
        programId: PROGRAM_ID,
        creator: authority.publicKey,
        feeRecipient: config.feeRecipient,
        raffleId: ridS,
        paymentMint: mint.publicKey,
        paymentVaultAta: payVault,
        feeRecipientAta: feeAta,
        creatorPaymentAta: creatorPayAta,
      }),
    )
    record('5-spl-same-mint', 'pass', `rid=${ridS} mint=${mint.publicKey.toBase58()}`, [
      mintSig,
      sc,
      sb,
      sd,
      scp,
      scr,
    ])
  }

  // ── 2) expire ───────────────────────────────────────────────
  console.log('-- 2) expire → refund + recover --')
  await waitPastDeadline(connection, deadlineExp)
  await waitSlots(connection, (await connection.getSlot('processed')) + 1)
  const expRef = await send(
    connection,
    buyer,
    buildRefundIx({
      programId: PROGRAM_ID,
      buyer: buyer.publicKey,
      raffleId: ridExp,
      buyerRecord: buyerRecExp,
    }),
  )
  const buyerExp = await readBuyer(connection, ridExp, buyer.publicKey)
  if (!buyerExp.refunded) throw new Error('not refunded')
  await expectFail('dup-refund', () =>
    send(
      connection,
      buyer,
      buildRefundIx({
        programId: PROGRAM_ID,
        buyer: buyer.publicKey,
        raffleId: ridExp,
        buyerRecord: buyerRecExp,
      }),
    ),
  )
  const expRec = await send(
    connection,
    authority,
    buildRecoverPrizeIx({
      programId: PROGRAM_ID,
      creator: authority.publicKey,
      raffleId: ridExp,
    }),
  )
  await expectFail('dup-recover', () =>
    send(
      connection,
      authority,
      buildRecoverPrizeIx({
        programId: PROGRAM_ID,
        creator: authority.publicKey,
        raffleId: ridExp,
      }),
    ),
  )
  record('2-expire-refund-recover', 'pass', `rid=${ridExp}`, [
    expCreate,
    expBuy,
    expRef,
    expRec,
  ])

  // ── 3) late entropy (created HERE so keeper cannot draw it earlier) ──
  if (SKIP_LATE) {
    record('3-late-entropy', 'skipped', 'SKIP_LATE=1', [])
  } else {
    console.log('-- 3) late entropy → refund/recover --')
    if ((await connection.getBalance(buyer.publicKey)) < Number(cost11) + 5_000_000) {
      await fund(connection, authority, buyer.publicKey, buyerNeed)
    }
    const ridLate = await nextRaffleId(connection)
    const lateCreate = await send(
      connection,
      authority,
      buildCreateRaffleIx({
        programId: PROGRAM_ID,
        creator: authority.publicKey,
        nextRaffleId: ridLate,
        prizeAmount,
        pricePerShare,
        totalShares: LAUNCH.shares,
        deadline: longDeadline,
        drawDelaySlots: LAUNCH.drawDelaySlots,
      }),
    )
    const [buyerRecLate] = buyerRecordPda(PROGRAM_ID, ridLate, buyer.publicKey)
    const lateBuy = await send(
      connection,
      buyer,
      buildBuySharesIx({
        programId: PROGRAM_ID,
        buyer: buyer.publicKey,
        raffleId: ridLate,
        buyerRecord: buyerRecLate,
        count: LAUNCH.shares,
      }),
    )
    const rLate = await readRaffle(connection, ridLate)
    if (rLate.status !== RaffleStatus.SoldOut) throw new Error('late not SoldOut')
    const eligLate = Number(rLate.soldOutSlot) + rLate.drawDelaySlots
    console.log(`  rid_late=${ridLate} eligible=${eligLate}`)

    const { slot, oldest } = await waitEligibleOutsideWindow(connection, eligLate)
    console.log(`  slot=${slot} oldest=${oldest} elig=${eligLate}`)
    await expectFail('late-draw', () =>
      send(
        connection,
        authority,
        buildDrawIx({
          programId: PROGRAM_ID,
          caller: authority.publicKey,
          raffleId: ridLate,
        }),
      ),
    )
    // retention gate for refund path (align local e2e)
    const retentionNeed = eligLate + LATE_DRAW_EXTRA_SLOTS
    while ((await connection.getSlot('processed')) <= retentionNeed) {
      await new Promise((r) => setTimeout(r, 500))
    }
    const lateRef = await send(
      connection,
      buyer,
      buildRefundIx({
        programId: PROGRAM_ID,
        buyer: buyer.publicKey,
        raffleId: ridLate,
        buyerRecord: buyerRecLate,
      }),
    )
    const rLate2 = await readRaffle(connection, ridLate)
    if (rLate2.status !== RaffleStatus.Expired) {
      throw new Error(`expected Expired got ${rLate2.status}`)
    }
    const lateRec = await send(
      connection,
      authority,
      buildRecoverPrizeIx({
        programId: PROGRAM_ID,
        creator: authority.publicKey,
        raffleId: ridLate,
      }),
    )
    record('3-late-entropy', 'pass', `rid=${ridLate} elig=${eligLate}`, [
      lateCreate,
      lateBuy,
      lateRef,
      lateRec,
    ])
  }

  flushResults({
    chain: 'solana-devnet',
    program: PROGRAM_ID.toBase58(),
    authority: authority.publicKey.toBase58(),
    feeRecipient: config.feeRecipient.toBase58(),
  })
  console.log(`== SOLANA TESTNET FULL E2E PASSED == results=${RESULTS_JSON}`)
}

main().catch((err) => {
  console.error(err)
  flushResults({ chain: 'solana-devnet', error: String(err) })
  process.exit(1)
})
