/**
 * Idempotent Scoop `initialize` against any cluster.
 *
 * Env:
 *   SOLANA_RPC_URL
 *   SOLANA_PROGRAM_ID
 *   SOLANA_AUTHORITY_KEYPAIR  — path or JSON array (prefer path; never commit)
 *   FEE_RECIPIENT             — base58 (default = authority)
 */
import { readFileSync } from 'node:fs'
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from '@solana/web3.js'
import {
  DEFAULT_PROGRAM_ID,
  LAUNCH,
  buildInitializeIx,
  configPda,
  decodeConfig,
} from '../keeper/src/solana/index'

const RPC = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'
const PROGRAM_ID = new PublicKey(process.env.SOLANA_PROGRAM_ID ?? DEFAULT_PROGRAM_ID)
const CLUSTER = process.env.SOLANA_EXPLORER_CLUSTER ?? 'devnet'

function loadKp(pathOrJson: string): Keypair {
  const t = pathOrJson.trim()
  const json = t.startsWith('[') ? t : readFileSync(t, 'utf8').trim()
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(json) as number[]))
}

async function main() {
  const authority = loadKp(
    process.env.SOLANA_AUTHORITY_KEYPAIR ??
      `${process.env.HOME}/.config/solana/id.json`,
  )
  const feeRecipient = new PublicKey(
    process.env.FEE_RECIPIENT ?? authority.publicKey.toBase58(),
  )
  const connection = new Connection(RPC, 'confirmed')
  const [configPk] = configPda(PROGRAM_ID)

  console.log(`rpc=${RPC}`)
  console.log(`program=${PROGRAM_ID.toBase58()}`)
  console.log(`authority=${authority.publicKey.toBase58()}`)
  console.log(`fee_recipient=${feeRecipient.toBase58()}`)
  console.log(`config_pda=${configPk.toBase58()}`)

  const existing = await connection.getAccountInfo(configPk)
  if (existing) {
    const cfg = decodeConfig(Buffer.from(existing.data))
    console.log('-- config already initialized --')
    console.log(`authority=${cfg.authority.toBase58()}`)
    console.log(`fee_recipient=${cfg.feeRecipient.toBase58()}`)
    console.log(`next_raffle_id=${cfg.nextRaffleId}`)
    console.log(
      `explorer=https://explorer.solana.com/address/${configPk.toBase58()}?cluster=${CLUSTER}`,
    )
    return
  }

  const ix = buildInitializeIx({
    programId: PROGRAM_ID,
    authority: authority.publicKey,
    feeRecipient,
    protocolConfig: {
      allowDifferentTokens: false,
      allowCustomShares: false,
      allowCustomPrice: false,
      allowCustomDrawDelay: false,
      defaultShares: LAUNCH.shares,
      priceDivisor: LAUNCH.priceDivisor,
      defaultDrawDelaySlots: LAUNCH.drawDelaySlots,
    },
  })
  const sig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(ix),
    [authority],
    { commitment: 'confirmed' },
  )
  console.log(`initialize_sig=${sig}`)
  console.log(`explorer=https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`)

  const info = await connection.getAccountInfo(configPk)
  if (!info) throw new Error('config PDA missing after initialize')
  const cfg = decodeConfig(Buffer.from(info.data))
  console.log(`next_raffle_id=${cfg.nextRaffleId}`)
  console.log(
    `config_explorer=https://explorer.solana.com/address/${configPk.toBase58()}?cluster=${CLUSTER}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
