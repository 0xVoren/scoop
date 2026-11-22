import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import {
  type Connection,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from '@solana/web3.js'
import { isNativeMint } from '@/chain/solana/constants'
import { decodeConfig, decodeRaffle } from '@/chain/solana/decode'
import {
  buildBuySharesIx,
  buildClaimPrizeIx,
  buildClaimProceedsIx,
  buildCreateRaffleIx,
  buildDrawIx,
  buildRecoverPrizeIx,
  buildRefundIx,
} from '@/chain/solana/instructions'
import { configPda, rafflePda } from '@/chain/solana/pdas'
import type { CreateRaffleParams, ScoopChainWrites, TxResult } from '@/chain/types'

export type SolanaWriteDeps = {
  connection: Connection
  publicKey: PublicKey
  programId: PublicKey
  /**
   * Sign + send a prepared transaction. Wallet-adapter's `sendTransaction`
   * is fine; callers should await confirmation themselves or rely on this helper.
   */
  sendTransaction: (tx: Transaction, connection: Connection) => Promise<string>
}

function asTx(signature: string): TxResult {
  return { signature }
}

async function sendIx(deps: SolanaWriteDeps, ixs: TransactionInstruction[]): Promise<TxResult> {
  const tx = new Transaction().add(...ixs)
  tx.feePayer = deps.publicKey
  const { blockhash, lastValidBlockHeight } = await deps.connection.getLatestBlockhash('confirmed')
  tx.recentBlockhash = blockhash
  const signature = await deps.sendTransaction(tx, deps.connection)
  await deps.connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed',
  )
  return asTx(signature)
}

function mintPubkey(token: string): PublicKey {
  if (isNativeMint(token)) return PublicKey.default
  return new PublicKey(token)
}

function vaultAta(mint: PublicKey, raffle: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(
    mint,
    raffle,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )
}

function userAta(mint: PublicKey, owner: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )
}

/**
 * Real Solana writes against the Scoop Anchor program (SlotHashes draw; no VRF).
 * Native SOL uses Pubkey::default() sentinel; explicit wSOL is plain SPL.
 */
export function createSolanaWrites(deps: SolanaWriteDeps): ScoopChainWrites {
  const { connection, publicKey, programId } = deps

  async function loadConfig() {
    const [pda] = configPda(programId)
    const info = await connection.getAccountInfo(pda)
    if (!info?.data) throw new Error('Scoop Config PDA not found — initialize program first')
    return decodeConfig(info.data)
  }

  async function loadRaffle(raffleId: bigint) {
    const [pda] = rafflePda(programId, raffleId)
    const info = await connection.getAccountInfo(pda)
    if (!info?.data) throw new Error(`Raffle ${raffleId} not found`)
    return { account: decodeRaffle(info.data), pda }
  }

  return {
    async create(params: CreateRaffleParams) {
      const config = await loadConfig()
      const nextId = config.nextRaffleId
      const prizeMint = mintPubkey(params.prizeToken)
      const paymentMint = mintPubkey(params.paymentToken)
      const [raffle] = rafflePda(programId, nextId)
      const ixs: TransactionInstruction[] = []

      let creatorPrizeAta: PublicKey | undefined
      let prizeVaultAta: PublicKey | undefined
      let tokenProgram: PublicKey | undefined

      if (!isNativeMint(prizeMint)) {
        creatorPrizeAta = userAta(prizeMint, publicKey)
        prizeVaultAta = vaultAta(prizeMint, raffle)
        tokenProgram = TOKEN_PROGRAM_ID
        ixs.push(
          createAssociatedTokenAccountIdempotentInstruction(
            publicKey,
            prizeVaultAta,
            raffle,
            prizeMint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
          ),
        )
      }

      if (!isNativeMint(paymentMint)) {
        // Pre-create payment vault for later buys (authority = raffle PDA).
        const paymentVault = vaultAta(paymentMint, raffle)
        ixs.push(
          createAssociatedTokenAccountIdempotentInstruction(
            publicKey,
            paymentVault,
            raffle,
            paymentMint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
          ),
        )
      }

      ixs.push(
        buildCreateRaffleIx({
          programId,
          creator: publicKey,
          nextRaffleId: nextId,
          prizeMint,
          paymentMint,
          prizeAmount: params.prizeAmount,
          pricePerShare: params.pricePerShare,
          totalShares: params.totalShares,
          deadline: params.deadline,
          drawDelaySlots: params.drawDelay,
          creatorPrizeAta,
          prizeVaultAta,
          tokenProgram,
        }),
      )
      return sendIx(deps, ixs)
    },

    async buy(raffleId, shareCount) {
      const { account, pda } = await loadRaffle(raffleId)
      const ixs: TransactionInstruction[] = []
      let buyerPaymentAta: PublicKey | undefined
      let paymentVaultAta: PublicKey | undefined
      let tokenProgram: PublicKey | undefined

      if (!isNativeMint(account.paymentMint)) {
        buyerPaymentAta = userAta(account.paymentMint, publicKey)
        paymentVaultAta = vaultAta(account.paymentMint, pda)
        tokenProgram = TOKEN_PROGRAM_ID
        ixs.push(
          createAssociatedTokenAccountIdempotentInstruction(
            publicKey,
            paymentVaultAta,
            pda,
            account.paymentMint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
          ),
        )
      }

      ixs.push(
        buildBuySharesIx({
          programId,
          buyer: publicKey,
          raffleId,
          count: shareCount,
          buyerPaymentAta,
          paymentVaultAta,
          tokenProgram,
        }),
      )
      return sendIx(deps, ixs)
    },

    async draw(raffleId) {
      return sendIx(deps, [buildDrawIx({ programId, caller: publicKey, raffleId })])
    },

    async claimPrize(raffleId) {
      const { account, pda } = await loadRaffle(raffleId)
      const ixs: TransactionInstruction[] = []
      let prizeVaultAta: PublicKey | undefined
      let winnerPrizeAta: PublicKey | undefined
      let tokenProgram: PublicKey | undefined

      if (!isNativeMint(account.prizeMint)) {
        prizeVaultAta = vaultAta(account.prizeMint, pda)
        winnerPrizeAta = userAta(account.prizeMint, publicKey)
        tokenProgram = TOKEN_PROGRAM_ID
        ixs.push(
          createAssociatedTokenAccountIdempotentInstruction(
            publicKey,
            winnerPrizeAta,
            publicKey,
            account.prizeMint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
          ),
        )
      }

      ixs.push(
        buildClaimPrizeIx({
          programId,
          winner: publicKey,
          raffleId,
          prizeVaultAta,
          winnerPrizeAta,
          tokenProgram,
        }),
      )
      return sendIx(deps, ixs)
    },

    async claimProceeds(raffleId) {
      const config = await loadConfig()
      const { account, pda } = await loadRaffle(raffleId)
      const ixs: TransactionInstruction[] = []
      let paymentVaultAta: PublicKey | undefined
      let feeRecipientAta: PublicKey | undefined
      let creatorPaymentAta: PublicKey | undefined
      let tokenProgram: PublicKey | undefined

      if (!isNativeMint(account.paymentMint)) {
        paymentVaultAta = vaultAta(account.paymentMint, pda)
        feeRecipientAta = userAta(account.paymentMint, config.feeRecipient)
        creatorPaymentAta = userAta(account.paymentMint, publicKey)
        tokenProgram = TOKEN_PROGRAM_ID
        ixs.push(
          createAssociatedTokenAccountIdempotentInstruction(
            publicKey,
            feeRecipientAta,
            config.feeRecipient,
            account.paymentMint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
          ),
          createAssociatedTokenAccountIdempotentInstruction(
            publicKey,
            creatorPaymentAta,
            publicKey,
            account.paymentMint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
          ),
        )
      }

      ixs.push(
        buildClaimProceedsIx({
          programId,
          creator: publicKey,
          feeRecipient: config.feeRecipient,
          raffleId,
          paymentVaultAta,
          feeRecipientAta,
          creatorPaymentAta,
          tokenProgram,
        }),
      )
      return sendIx(deps, ixs)
    },

    async refund(raffleId) {
      const { account, pda } = await loadRaffle(raffleId)
      const ixs: TransactionInstruction[] = []
      let paymentVaultAta: PublicKey | undefined
      let buyerPaymentAta: PublicKey | undefined
      let tokenProgram: PublicKey | undefined

      if (!isNativeMint(account.paymentMint)) {
        paymentVaultAta = vaultAta(account.paymentMint, pda)
        buyerPaymentAta = userAta(account.paymentMint, publicKey)
        tokenProgram = TOKEN_PROGRAM_ID
        ixs.push(
          createAssociatedTokenAccountIdempotentInstruction(
            publicKey,
            buyerPaymentAta,
            publicKey,
            account.paymentMint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
          ),
        )
      }

      ixs.push(
        buildRefundIx({
          programId,
          buyer: publicKey,
          raffleId,
          paymentVaultAta,
          buyerPaymentAta,
          tokenProgram,
        }),
      )
      return sendIx(deps, ixs)
    },

    async recoverPrize(raffleId) {
      const { account, pda } = await loadRaffle(raffleId)
      const ixs: TransactionInstruction[] = []
      let prizeVaultAta: PublicKey | undefined
      let creatorPrizeAta: PublicKey | undefined
      let tokenProgram: PublicKey | undefined

      if (!isNativeMint(account.prizeMint)) {
        prizeVaultAta = vaultAta(account.prizeMint, pda)
        creatorPrizeAta = userAta(account.prizeMint, publicKey)
        tokenProgram = TOKEN_PROGRAM_ID
        ixs.push(
          createAssociatedTokenAccountIdempotentInstruction(
            publicKey,
            creatorPrizeAta,
            publicKey,
            account.prizeMint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
          ),
        )
      }

      ixs.push(
        buildRecoverPrizeIx({
          programId,
          creator: publicKey,
          raffleId,
          prizeVaultAta,
          creatorPrizeAta,
          tokenProgram,
        }),
      )
      return sendIx(deps, ixs)
    },
  }
}

/** Placeholder writes that explain missing wallet wiring (for ActiveChainProvider default). */
export function createSolanaWritesUnwired(): ScoopChainWrites {
  const err = (method: string): never => {
    throw new Error(
      `Solana ${method}: connect a Solana wallet and use createSolanaWritesWith(deps) / useSolanaWrites()`,
    )
  }
  return {
    create: async () => err('create'),
    buy: async () => err('buy'),
    draw: async () => err('draw'),
    claimPrize: async () => err('claimPrize'),
    claimProceeds: async () => err('claimProceeds'),
    refund: async () => err('refund'),
    recoverPrize: async () => err('recoverPrize'),
  }
}
