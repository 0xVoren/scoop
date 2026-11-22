import { type Cluster, Connection, clusterApiUrl } from '@solana/web3.js'
import { solanaClusterLabel, solanaRpcUrl } from '@/chain/env'

let cached: { key: string; connection: Connection } | null = null

export function resolveSolanaEndpoint(): string {
  const custom = solanaRpcUrl()
  if (custom) return custom
  const cluster = solanaClusterLabel()
  if (cluster === 'localnet') return 'http://127.0.0.1:8899'
  return clusterApiUrl(cluster as Cluster)
}

/** Shared Connection for the configured cluster (browser-safe singleton). */
export function getSolanaConnection(): Connection {
  const endpoint = resolveSolanaEndpoint()
  if (cached?.key === endpoint) return cached.connection
  const connection = new Connection(endpoint, 'confirmed')
  cached = { key: endpoint, connection }
  return connection
}
