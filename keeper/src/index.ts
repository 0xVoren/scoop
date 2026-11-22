/**
 * Scoop pendingDraw keeper (Cloudflare Workers).
 * - Cron: scan pending every minute; drawMany / draw_many when ready
 * - HTTP POST `/trigger`: frontend / local can kick immediately
 *
 * Routing: `KEEPER_CHAIN=evm|solana` (default evm). Solana needs `SOLANA_*` vars/secrets.
 */
import { runTick, type KeeperEnv } from './tick'
import { runSolanaTick, type SolanaKeeperEnv } from './solana/tick'
import { DEFAULT_PROGRAM_ID } from './solana/constants'

type WorkerEnv = KeeperEnv &
  Partial<SolanaKeeperEnv> & {
    KEEPER_TRIGGER_SECRET?: string
    KEEPER_CHAIN?: string
  }

async function tick(env: WorkerEnv, waitUntil: (p: Promise<unknown>) => void) {
  const chain = (env.KEEPER_CHAIN ?? 'evm').toLowerCase()
  if (chain === 'solana' || chain === 'svm') {
    return runSolanaTick({
      SOLANA_RPC_URL: env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899',
      SOLANA_PROGRAM_ID: env.SOLANA_PROGRAM_ID ?? DEFAULT_PROGRAM_ID,
      SOLANA_KEEPER_KEYPAIR: env.SOLANA_KEEPER_KEYPAIR ?? '',
      SOLANA_USE_DRAW_MANY: env.SOLANA_USE_DRAW_MANY,
    })
  }
  return runTick(env, waitUntil)
}

export default {
  async scheduled(
    _event: ScheduledController,
    env: WorkerEnv,
    ctx: ExecutionContext,
  ): Promise<void> {
    await tick(env, ctx.waitUntil.bind(ctx))
  },

  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-keeper-secret',
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    const url = new URL(request.url)
    if (url.pathname !== '/trigger') {
      return new Response('not found', { status: 404, headers: cors })
    }
    if (request.method !== 'POST') {
      return new Response('method not allowed', { status: 405, headers: cors })
    }
    if (env.KEEPER_TRIGGER_SECRET && request.headers.get('x-keeper-secret') !== env.KEEPER_TRIGGER_SECRET) {
      return new Response('forbidden', { status: 403, headers: cors })
    }
    const result = await tick(env, ctx.waitUntil.bind(ctx))
    return Response.json(result, { headers: cors })
  },
}
