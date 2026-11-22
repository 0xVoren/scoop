import {
  createPublicClient,
  createWalletClient,
  http,
  type Chain,
  type Hex,
  type PublicClient,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bsc, bscTestnet, hardhat } from 'viem/chains'

const ABI = [
  {
    type: 'function',
    name: 'pendingDrawCount',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'pendingDrawAt',
    inputs: [{ name: 'index', type: 'uint256' }],
    outputs: [
      { name: 'orderId', type: 'uint256' },
      { name: 'eligibleBlock', type: 'uint64' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'drawMany',
    inputs: [{ name: 'orderIds', type: 'uint256[]' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

export type KeeperEnv = {
  KEEPER_PRIVATE_KEY: string
  RPC_URL: string
  DIAMOND_ADDRESS: string
  CHAIN: string
}

export type TickResult = {
  triggered: boolean
  reason: string
  readyIds: string[]
  hash?: Hex
}

export function resolveChain(chainEnv: string): Chain {
  if (chainEnv === 'mainnet') return bsc
  if (chainEnv === 'testnet') return bscTestnet
  return hardhat
}

/** Collect pending orderIds whose eligibleBlock has been passed (`block.number > eligible`). */
export async function collectReadyIds(
  publicClient: PublicClient,
  diamond: `0x${string}`,
): Promise<bigint[]> {
  const count = await publicClient.readContract({
    address: diamond,
    abi: ABI,
    functionName: 'pendingDrawCount',
  })
  if (count === BigInt(0)) return []

  const head = await publicClient.getBlockNumber()
  const ready: bigint[] = []
  for (let i = BigInt(0); i < count; i++) {
    const [orderId, eligible] = await publicClient.readContract({
      address: diamond,
      abi: ABI,
      functionName: 'pendingDrawAt',
      args: [i],
    })
    if (head > eligible) ready.push(orderId)
  }
  return ready
}

/**
 * One keeper tick: scan pendingDraw → simulate + drawMany for ready ids.
 * Permissionless race is fine — simulate revert → skip, no wasted gas.
 */
export async function runTick(
  env: KeeperEnv,
  waitUntil: (p: Promise<unknown>) => void = () => {},
): Promise<TickResult> {
  const diamond = env.DIAMOND_ADDRESS as `0x${string}`
  if (!diamond || diamond === '0x0000000000000000000000000000000000000000') {
    return { triggered: false, reason: 'diamond-unconfigured', readyIds: [] }
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(env.KEEPER_PRIVATE_KEY)) {
    return { triggered: false, reason: 'key-invalid', readyIds: [] }
  }

  const chain = resolveChain(env.CHAIN)
  const transport = http(env.RPC_URL)
  const publicClient = createPublicClient({ chain, transport })

  let ready: bigint[]
  try {
    ready = await collectReadyIds(publicClient, diamond)
  } catch (err) {
    console.error('pendingDraw read failed:', (err as Error).message)
    return { triggered: false, reason: 'rpc-error', readyIds: [] }
  }

  const readyIds = ready.map((id) => id.toString())
  if (ready.length === 0) {
    console.log('no ready pendingDraw')
    return { triggered: false, reason: 'not-ready', readyIds }
  }

  console.log(`ready orderIds=[${readyIds.join(',')}], drawing`)

  const account = privateKeyToAccount(env.KEEPER_PRIVATE_KEY as Hex)
  const walletClient = createWalletClient({ account, chain, transport })

  try {
    const { request } = await publicClient.simulateContract({
      account,
      address: diamond,
      abi: ABI,
      functionName: 'drawMany',
      args: [ready],
    })
    const hash = await walletClient.writeContract(request)
    console.log('drawMany sent:', hash)
    waitUntil(
      publicClient
        .waitForTransactionReceipt({ hash })
        .then((r) => console.log('drawMany confirmed:', r.status))
        .catch((err) => console.warn('wait for receipt failed:', (err as Error).message)),
    )
    return { triggered: true, reason: 'sent', readyIds, hash }
  } catch (err) {
    console.warn('drawMany skipped (raced / conditions changed):', (err as Error).message)
    return { triggered: false, reason: 'skipped-or-raced', readyIds }
  }
}
