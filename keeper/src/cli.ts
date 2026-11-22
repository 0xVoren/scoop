/**
 * Local one-shot tick.
 *
 * EVM:   KEEPER_CHAIN=evm DIAMOND_ADDRESS=0x… pnpm tick
 * Solana: KEEPER_CHAIN=solana SOLANA_KEEPER_KEYPAIR=… pnpm tick
 */
import { readFileSync } from 'node:fs'
import { runTick, type KeeperEnv } from './tick'
import { runSolanaTick, type SolanaKeeperEnv } from './solana/tick'
import { DEFAULT_PROGRAM_ID } from './solana/constants'

const chain = (process.env.KEEPER_CHAIN ?? process.env.CHAIN_FAMILY ?? 'evm').toLowerCase()

if (chain === 'solana' || chain === 'svm') {
  const keyRaw =
    process.env.SOLANA_KEEPER_KEYPAIR ??
    process.env.SOLANA_KEYPAIR ??
    `${process.env.HOME ?? ''}/.config/solana/id.json`
  const keypairJson = keyRaw.trim().startsWith('[')
    ? keyRaw.trim()
    : readFileSync(keyRaw, 'utf8').trim()
  const env: SolanaKeeperEnv = {
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899',
    SOLANA_PROGRAM_ID: process.env.SOLANA_PROGRAM_ID ?? DEFAULT_PROGRAM_ID,
    SOLANA_KEEPER_KEYPAIR: keypairJson,
    SOLANA_USE_DRAW_MANY: process.env.SOLANA_USE_DRAW_MANY,
  }
  const result = await runSolanaTick(env)
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.triggered || result.reason === 'not-ready' ? 0 : 1)
}

const env: KeeperEnv = {
  KEEPER_PRIVATE_KEY:
    process.env.KEEPER_PRIVATE_KEY ??
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  RPC_URL: process.env.RPC_URL ?? 'http://127.0.0.1:8545',
  DIAMOND_ADDRESS: process.env.DIAMOND_ADDRESS ?? process.env.NEXT_PUBLIC_SCOOP_DIAMOND ?? '',
  CHAIN: process.env.CHAIN ?? process.env.NEXT_PUBLIC_CHAIN ?? 'local',
}

if (!env.DIAMOND_ADDRESS) {
  console.error('Set DIAMOND_ADDRESS or NEXT_PUBLIC_SCOOP_DIAMOND (or KEEPER_CHAIN=solana)')
  process.exit(1)
}

const result = await runTick(env)
console.log(JSON.stringify(result, null, 2))
process.exit(result.triggered || result.reason === 'not-ready' ? 0 : 1)
