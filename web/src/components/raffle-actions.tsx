'use client'

import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { erc20Abi, maxUint256 } from 'viem'
import {
  useAccount,
  useBalance,
  useBlockNumber,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from 'wagmi'
import { scoopAbi } from '@/abi/scoop'
import type { EvmRaffleView } from '@/chain/adapters/evm'
import { solanaProgramId } from '@/chain/env'
import { useChainFamily } from '@/chain/selection'
import { rememberBoughtRaffleId } from '@/chain/solana/buyer-cache'
import { DEFAULT_PROGRAM_ID, isNativeMint } from '@/chain/solana/constants'
import { useSolanaWrites } from '@/chain/solana/useSolanaWrites'
import { useBuyerRefunded, useShareCount, useShareOwner } from '@/hooks/useRaffle'
import { useRequireChain } from '@/hooks/useRequireChain'
import { useSolanaSlot } from '@/hooks/useSolanaRaffle'
import { useTokenDecimals } from '@/hooks/useTokenDecimals'
import { appChain } from '@/lib/chains'
import { useT } from '@/lib/i18n'
import { pingKeeperTrigger } from '@/lib/keeper'
import { isNative, RaffleStatus, scoopAddress } from '@/lib/scoop'
import { formatAmount, sameAddress, shortAddress, tokenLabel } from '@/lib/tokens'
import { toastTxError, toastTxOk } from '@/lib/tx'

/** Shared UI view; drawDelayBlocks/soldOutBlock are blocks (EVM) or slots (Solana). */
export type RaffleView = EvmRaffleView

/** Treat as unlimited if allowance covers all remaining shares many times over, or is max. */
function isMaxish(allowance: bigint | undefined, need: bigint): boolean {
  if (allowance === undefined) return false
  if (allowance >= maxUint256 / BigInt(2)) return true
  if (need > BigInt(0) && allowance >= need * BigInt(1000)) return true
  return false
}

function SolanaRaffleActions({
  orderId,
  raffle,
  onDone,
  compact = false,
  hideShareHint = false,
}: {
  orderId: bigint
  raffle: RaffleView
  onDone: () => void
  compact?: boolean
  hideShareHint?: boolean
}) {
  const t = useT()
  const { publicKey, connected } = useWallet()
  const { connection } = useConnection()
  const writes = useSolanaWrites()
  const [count, setCount] = useState('1')
  const [pending, setPending] = useState(false)
  const address = publicKey?.toBase58()

  const { data: myShares } = useShareCount(orderId, address)
  const { data: winner } = useShareOwner(
    raffle.status === RaffleStatus.Drawn ? orderId : undefined,
    raffle.status === RaffleStatus.Drawn ? raffle.winnerShareIndex : undefined,
  )
  const { data: slot } = useSolanaSlot(raffle.status === RaffleStatus.SoldOut)

  const remaining = raffle.totalShares - raffle.soldShares
  const now = Math.floor(Date.now() / 1000)
  const expired = now > Number(raffle.deadline) && raffle.status === RaffleStatus.Selling
  // Contract: TooEarly when slot <= eligible; first valid head is eligible + 1.
  const eligibleSlot = Number(raffle.soldOutBlock) + raffle.drawDelayBlocks
  const drawTargetSlot = eligibleSlot + 1
  const canDraw = raffle.status === RaffleStatus.SoldOut
  const needsSpl = !isNative(raffle.paymentToken) && !isNativeMint(raffle.paymentToken)
  const selling = raffle.status === RaffleStatus.Selling && !expired
  const buyN = Math.max(1, Number(count) || 1)
  const buyCost = raffle.pricePerShare * BigInt(buyN)
  const heldShares = Number(myShares ?? 0)

  const { data: refunded } = useBuyerRefunded(
    expired && heldShares > 0 ? orderId : undefined,
    expired && heldShares > 0 ? address : undefined,
  )

  const raised = raffle.pricePerShare * BigInt(raffle.totalShares)
  const fee = raised / BigInt(100)
  const netProceeds = raised - fee
  const payDecimals = useTokenDecimals(raffle.paymentToken)

  const [lamports, setLamports] = useState<bigint | undefined>()
  useEffect(() => {
    if (!address || !selling || !isNative(raffle.paymentToken)) {
      setLamports(undefined)
      return
    }
    let cancelled = false
    void connection.getBalance(publicKey!).then((bal) => {
      if (!cancelled) setLamports(BigInt(bal))
    })
    return () => {
      cancelled = true
    }
  }, [address, selling, raffle.paymentToken, connection, publicKey])

  const paymentBal = isNative(raffle.paymentToken) ? lamports : undefined
  const balanceLow = paymentBal !== undefined && paymentBal < buyCost

  const slotsLeft = useMemo(() => {
    if (!canDraw || slot === undefined) return null
    const left = BigInt(drawTargetSlot) - BigInt(slot)
    return left > BigInt(0) ? Number(left) : 0
  }, [canDraw, slot, drawTargetSlot])

  const keeperPingedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!canDraw || slotsLeft === null || slotsLeft > 0) return
    const key = orderId.toString()
    if (keeperPingedRef.current === key) return
    keeperPingedRef.current = key
    pingKeeperTrigger()
  }, [canDraw, slotsLeft, orderId])

  async function run(
    label: 'buy' | 'draw' | 'claimPrize' | 'claimProceeds' | 'refund' | 'recover',
  ) {
    if (!connected || !publicKey) return toast.error(t('toastConnect'))
    if (label === 'buy') {
      const n = Number(count)
      if (!Number.isFinite(n) || n < 1) return toast.error(t('toastSharesInvalid'))
      if (n > remaining) return toast.error(t('toastSharesLeft'))
      if (balanceLow) return toast.error(t('errInsufficient'))
    } else if (label === 'draw') {
      if (slot !== undefined && slot < drawTargetSlot) {
        return toast.error(t('toastDrawWaitSlot', { need: drawTargetSlot, now: slot }))
      }
    }
    setPending(true)
    try {
      if (label === 'buy') {
        const { signature } = await writes.buy(orderId, Number(count))
        toastTxOk(t('toastBuyOk'), signature, t('viewTx'))
        // Cache raffle id so Me can recover if getProgramAccounts is blocked.
        rememberBoughtRaffleId(
          solanaProgramId() || DEFAULT_PROGRAM_ID,
          publicKey.toBase58(),
          orderId,
        )
      } else if (label === 'draw') {
        const { signature } = await writes.draw(orderId)
        toastTxOk(t('toastDrawOk'), signature, t('viewTx'))
      } else if (label === 'claimPrize') {
        const { signature } = await writes.claimPrize(orderId)
        toastTxOk(t('toastPrizeOk'), signature, t('viewTx'))
      } else if (label === 'claimProceeds') {
        const { signature } = await writes.claimProceeds(orderId)
        toastTxOk(t('toastProceedsOk'), signature, t('viewTx'))
      } else if (label === 'refund') {
        const { signature } = await writes.refund(orderId)
        toastTxOk(t('toastRefundOk'), signature, t('viewTx'))
      } else {
        const { signature } = await writes.recoverPrize(orderId)
        toastTxOk(t('toastRecoverOk'), signature, t('viewTx'))
      }
      onDone()
    } catch (e) {
      const failKey =
        label === 'buy'
          ? 'toastBuyFail'
          : label === 'draw'
            ? 'toastDrawFail'
            : label === 'refund'
              ? 'toastRefundFail'
              : label === 'recover'
                ? 'toastRecoverFail'
                : 'toastClaimFail'
      toastTxError(e, t, failKey)
    } finally {
      setPending(false)
    }
  }

  const payToken = tokenLabel(raffle.paymentToken)
  const showRefund = expired && heldShares > 0 && !refunded
  // needsSpl kept for future ATA balance checks; native SOL path is primary MVP.
  void needsSpl

  return (
    <div className={`actions${compact ? ' compact' : ''}`}>
      {address && !compact && (
        <p className="muted">
          {t('myShares')}
          <span className="num">{myShares?.toString() ?? '0'}</span>
        </p>
      )}

      {selling && (
        <div className="buy-stack">
          <div className="action-row">
            <input
              className="input touch"
              type="number"
              inputMode="numeric"
              min={1}
              max={remaining}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              aria-label={t('shareCountAria')}
            />
            <button
              className="btn primary touch"
              type="button"
              disabled={pending || balanceLow}
              onClick={() => void run('buy')}
            >
              {t('buy', { n: remaining })}
            </button>
          </div>
          <p className={`muted small${balanceLow ? ' warn-text' : ''}`}>
            {t('buyCost', {
              a: formatAmount(buyCost, payDecimals),
              token: payToken,
            })}
            {balanceLow ? ` · ${t('buyBalanceLow')}` : null}
          </p>
        </div>
      )}

      {canDraw && (
        <div className="buy-stack">
          <button
            className="btn primary touch"
            type="button"
            disabled={pending || (slotsLeft !== null && slotsLeft > 0)}
            onClick={() => void run('draw')}
          >
            {t('drawSlot', { n: drawTargetSlot })}
          </button>
          {slotsLeft !== null && (
            <p className="muted small">
              {slotsLeft > 0 ? t('drawWaitSlots', { n: slotsLeft }) : t('drawReady')}
            </p>
          )}
        </div>
      )}

      {raffle.status === RaffleStatus.Drawn &&
        winner &&
        address &&
        sameAddress(address, winner, 'solana') &&
        !raffle.prizeClaimed && (
          <button
            className="btn primary touch"
            type="button"
            disabled={pending}
            onClick={() => void run('claimPrize')}
          >
            {t('claimPrize')}
          </button>
        )}

      {raffle.status === RaffleStatus.Drawn &&
        address &&
        sameAddress(address, raffle.creator, 'solana') &&
        !raffle.proceedsClaimed && (
          <div className="buy-stack">
            <button
              className="btn touch"
              type="button"
              disabled={pending}
              onClick={() => void run('claimProceeds')}
            >
              {t('claimProceeds')}
            </button>
            {!compact && (
              <p className="muted small">
                {t('claimProceedsHint', {
                  raised: formatAmount(raised, payDecimals),
                  fee: formatAmount(fee, payDecimals),
                  net: formatAmount(netProceeds, payDecimals),
                  token: payToken,
                })}
              </p>
            )}
          </div>
        )}

      {showRefund && (
        <button
          className="btn touch"
          type="button"
          disabled={pending}
          onClick={() => void run('refund')}
        >
          {t('refund')}
        </button>
      )}

      {expired &&
        address &&
        sameAddress(address, raffle.creator, 'solana') &&
        !raffle.prizeRecovered && (
          <button
            className="btn danger touch"
            type="button"
            disabled={pending}
            onClick={() => void run('recover')}
          >
            {t('recover')}
          </button>
        )}

      {raffle.status === RaffleStatus.Drawn && winner && !compact && (
        <p className="muted small winner-row">
          {t('winner')}
          <button
            type="button"
            className="mono linkish"
            title={winner}
            onClick={() => {
              void navigator.clipboard.writeText(winner).then(
                () => toast.success(t('copyAddrOk')),
                () => toast.error(t('copyAddrFail')),
              )
            }}
          >
            {shortAddress(winner, 6)}
          </button>
        </p>
      )}

      {address && compact && !hideShareHint && myShares !== undefined && Number(myShares) > 0 && (
        <p className="muted small">
          {t('myShares')}
          <span className="num">{myShares.toString()}</span>
        </p>
      )}
    </div>
  )
}

function EvmRaffleActions({
  orderId,
  raffle,
  onDone,
  compact = false,
  hideShareHint = false,
}: {
  orderId: bigint
  raffle: RaffleView
  onDone: () => void
  compact?: boolean
  hideShareHint?: boolean
}) {
  const t = useT()
  const { address } = useAccount()
  const { requireChain } = useRequireChain()
  const publicClient = usePublicClient({ chainId: appChain.id })
  const [count, setCount] = useState('1')
  const { writeContractAsync, isPending } = useWriteContract()
  const { data: myShares } = useShareCount(orderId, address)
  const { data: winner } = useShareOwner(
    raffle.status === RaffleStatus.Drawn ? orderId : undefined,
    raffle.status === RaffleStatus.Drawn ? raffle.winnerShareIndex : undefined,
  )
  const { data: blockNumber } = useBlockNumber({
    chainId: appChain.id,
    watch: raffle.status === RaffleStatus.SoldOut,
    query: { enabled: raffle.status === RaffleStatus.SoldOut },
  })

  const remaining = raffle.totalShares - raffle.soldShares
  const now = Math.floor(Date.now() / 1000)
  const expired = now > Number(raffle.deadline) && raffle.status === RaffleStatus.Selling
  const eligibleBlock = Number(raffle.soldOutBlock) + raffle.drawDelayBlocks
  const drawTargetBlock = eligibleBlock + 1
  const canDraw = raffle.status === RaffleStatus.SoldOut
  const needsApprove = !isNative(raffle.paymentToken)
  const selling = raffle.status === RaffleStatus.Selling && !expired
  const maxBuyCost = raffle.pricePerShare * BigInt(Math.max(remaining, 1))
  const buyN = Math.max(1, Number(count) || 1)
  const buyCost = raffle.pricePerShare * BigInt(buyN)
  const heldShares = Number(myShares ?? 0)

  const { data: refunded } = useBuyerRefunded(
    expired && heldShares > 0 ? orderId : undefined,
    expired && heldShares > 0 ? address : undefined,
  )

  const raised = raffle.pricePerShare * BigInt(raffle.totalShares)
  const fee = raised / BigInt(100)
  const netProceeds = raised - fee

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: needsApprove ? (raffle.paymentToken as `0x${string}`) : undefined,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && needsApprove ? [address, scoopAddress] : undefined,
    chainId: appChain.id,
    query: { enabled: Boolean(address && needsApprove && selling) },
  })

  const { data: erc20Bal } = useReadContract({
    address: needsApprove ? (raffle.paymentToken as `0x${string}`) : undefined,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address && needsApprove ? [address] : undefined,
    chainId: appChain.id,
    query: { enabled: Boolean(address && needsApprove && selling) },
  })

  const { data: nativeBal } = useBalance({
    address,
    chainId: appChain.id,
    query: { enabled: Boolean(address && isNative(raffle.paymentToken) && selling) },
  })
  const payDecimals = useTokenDecimals(raffle.paymentToken)

  const paymentBal = isNative(raffle.paymentToken)
    ? nativeBal?.value
    : (erc20Bal as bigint | undefined)
  const balanceLow = paymentBal !== undefined && paymentBal < buyCost
  const maxApproved = isMaxish(allowance, maxBuyCost)

  const blocksLeft = useMemo(() => {
    if (!canDraw || blockNumber === undefined) return null
    const left = BigInt(drawTargetBlock) - blockNumber
    return left > BigInt(0) ? Number(left) : 0
  }, [canDraw, blockNumber, drawTargetBlock])

  const keeperPingedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!canDraw || blocksLeft === null || blocksLeft > 0) return
    const key = orderId.toString()
    if (keeperPingedRef.current === key) return
    keeperPingedRef.current = key
    pingKeeperTrigger()
  }, [canDraw, blocksLeft, orderId])

  async function approveMax() {
    if (!(await requireChain()) || !publicClient) return
    if (!needsApprove) return
    try {
      const tx = await writeContractAsync({
        address: raffle.paymentToken as `0x${string}`,
        abi: erc20Abi,
        functionName: 'approve',
        args: [scoopAddress, maxUint256],
      })
      await publicClient.waitForTransactionReceipt({ hash: tx })
      await refetchAllowance()
      toastTxOk(t('toastApproveOk'), tx, t('viewTx'))
    } catch (e) {
      toastTxError(e, t, 'toastApproveFail')
    }
  }

  async function buy() {
    if (!(await requireChain()) || !publicClient || !address) return
    const n = Number(count)
    if (!Number.isFinite(n) || n < 1) return toast.error(t('toastSharesInvalid'))
    if (n > remaining) return toast.error(t('toastSharesLeft'))
    if (balanceLow) return toast.error(t('errInsufficient'))
    const value = raffle.pricePerShare * BigInt(n)
    try {
      if (needsApprove) {
        const current =
          allowance ??
          (await publicClient.readContract({
            address: raffle.paymentToken as `0x${string}`,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [address, scoopAddress],
          }))
        if (current < value) return toast.error(t('toastNeedApprove'))
      }
      const tx = await writeContractAsync({
        address: scoopAddress,
        abi: scoopAbi,
        functionName: 'buyShares',
        args: [orderId, n],
        value: isNative(raffle.paymentToken) ? value : BigInt(0),
      })
      await publicClient.waitForTransactionReceipt({ hash: tx })
      toastTxOk(t('toastBuyOk'), tx, t('viewTx'))
      onDone()
    } catch (e) {
      toastTxError(e, t, 'toastBuyFail')
    }
  }

  async function draw() {
    if (!(await requireChain()) || !publicClient) return
    try {
      const bn = await publicClient.getBlockNumber()
      if (bn < BigInt(drawTargetBlock)) {
        return toast.error(t('toastDrawWait', { need: drawTargetBlock, now: bn.toString() }))
      }
      const tx = await writeContractAsync({
        address: scoopAddress,
        abi: scoopAbi,
        functionName: 'draw',
        args: [orderId],
      })
      await publicClient.waitForTransactionReceipt({ hash: tx })
      toastTxOk(t('toastDrawOk'), tx, t('viewTx'))
      onDone()
    } catch (e) {
      toastTxError(e, t, 'toastDrawFail')
    }
  }

  async function claimPrize() {
    if (!(await requireChain()) || !publicClient) return
    try {
      const tx = await writeContractAsync({
        address: scoopAddress,
        abi: scoopAbi,
        functionName: 'claimPrize',
        args: [orderId],
      })
      await publicClient.waitForTransactionReceipt({ hash: tx })
      toastTxOk(t('toastPrizeOk'), tx, t('viewTx'))
      onDone()
    } catch (e) {
      toastTxError(e, t, 'toastClaimFail')
    }
  }

  async function claimProceeds() {
    if (!(await requireChain()) || !publicClient) return
    try {
      const tx = await writeContractAsync({
        address: scoopAddress,
        abi: scoopAbi,
        functionName: 'claimProceeds',
        args: [orderId],
      })
      await publicClient.waitForTransactionReceipt({ hash: tx })
      toastTxOk(t('toastProceedsOk'), tx, t('viewTx'))
      onDone()
    } catch (e) {
      toastTxError(e, t, 'toastClaimFail')
    }
  }

  async function refund() {
    if (!(await requireChain()) || !publicClient) return
    try {
      const tx = await writeContractAsync({
        address: scoopAddress,
        abi: scoopAbi,
        functionName: 'refund',
        args: [orderId],
      })
      await publicClient.waitForTransactionReceipt({ hash: tx })
      toastTxOk(t('toastRefundOk'), tx, t('viewTx'))
      onDone()
    } catch (e) {
      toastTxError(e, t, 'toastRefundFail')
    }
  }

  async function recover() {
    if (!(await requireChain()) || !publicClient) return
    try {
      const tx = await writeContractAsync({
        address: scoopAddress,
        abi: scoopAbi,
        functionName: 'recoverPrize',
        args: [orderId],
      })
      await publicClient.waitForTransactionReceipt({ hash: tx })
      toastTxOk(t('toastRecoverOk'), tx, t('viewTx'))
      onDone()
    } catch (e) {
      toastTxError(e, t, 'toastRecoverFail')
    }
  }

  const payToken = tokenLabel(raffle.paymentToken)
  const showRefund = expired && heldShares > 0 && !refunded

  return (
    <div className={`actions${compact ? ' compact' : ''}`}>
      {address && !compact && (
        <p className="muted">
          {t('myShares')}
          <span className="num">{myShares?.toString() ?? '0'}</span>
        </p>
      )}

      {selling && (
        <div className="buy-stack">
          {needsApprove && address && (
            <button
              className={`btn touch${maxApproved ? '' : ' primary'}`}
              type="button"
              disabled={isPending || maxApproved}
              onClick={approveMax}
            >
              {isPending && !maxApproved
                ? t('approving')
                : maxApproved
                  ? t('approved')
                  : t('approveMax')}
            </button>
          )}
          <div className="action-row">
            <input
              className="input touch"
              type="number"
              inputMode="numeric"
              min={1}
              max={remaining}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              aria-label={t('shareCountAria')}
            />
            <button
              className="btn primary touch"
              type="button"
              disabled={
                isPending || balanceLow || (needsApprove && (allowance ?? BigInt(0)) < buyCost)
              }
              onClick={buy}
            >
              {t('buy', { n: remaining })}
            </button>
          </div>
          <p className={`muted small${balanceLow ? ' warn-text' : ''}`}>
            {t('buyCost', {
              a: formatAmount(buyCost, payDecimals),
              token: payToken,
            })}
            {balanceLow ? ` · ${t('buyBalanceLow')}` : null}
          </p>
        </div>
      )}

      {canDraw && (
        <div className="buy-stack">
          <button
            className="btn primary touch"
            type="button"
            disabled={isPending || (blocksLeft !== null && blocksLeft > 0)}
            onClick={draw}
          >
            {t('draw', { n: drawTargetBlock })}
          </button>
          {blocksLeft !== null && (
            <p className="muted small">
              {blocksLeft > 0 ? t('drawWaitBlocks', { n: blocksLeft }) : t('drawReady')}
            </p>
          )}
        </div>
      )}

      {raffle.status === RaffleStatus.Drawn &&
        winner &&
        address?.toLowerCase() === String(winner).toLowerCase() &&
        !raffle.prizeClaimed && (
          <button
            className="btn primary touch"
            type="button"
            disabled={isPending}
            onClick={claimPrize}
          >
            {t('claimPrize')}
          </button>
        )}

      {raffle.status === RaffleStatus.Drawn &&
        address?.toLowerCase() === raffle.creator.toLowerCase() &&
        !raffle.proceedsClaimed && (
          <div className="buy-stack">
            <button
              className="btn touch"
              type="button"
              disabled={isPending}
              onClick={claimProceeds}
            >
              {t('claimProceeds')}
            </button>
            {!compact && (
              <p className="muted small">
                {t('claimProceedsHint', {
                  raised: formatAmount(raised, payDecimals),
                  fee: formatAmount(fee, payDecimals),
                  net: formatAmount(netProceeds, payDecimals),
                  token: payToken,
                })}
              </p>
            )}
          </div>
        )}

      {showRefund && (
        <button className="btn touch" type="button" disabled={isPending} onClick={refund}>
          {t('refund')}
        </button>
      )}

      {expired &&
        address?.toLowerCase() === raffle.creator.toLowerCase() &&
        !raffle.prizeRecovered && (
          <button className="btn danger touch" type="button" disabled={isPending} onClick={recover}>
            {t('recover')}
          </button>
        )}

      {raffle.status === RaffleStatus.Drawn && winner && !compact && (
        <p className="muted small winner-row">
          {t('winner')}
          <button
            type="button"
            className="mono linkish"
            title={String(winner)}
            onClick={() => {
              void navigator.clipboard.writeText(String(winner)).then(
                () => toast.success(t('copyAddrOk')),
                () => toast.error(t('copyAddrFail')),
              )
            }}
          >
            {shortAddress(String(winner), 6)}
          </button>
        </p>
      )}

      {address && compact && !hideShareHint && myShares !== undefined && Number(myShares) > 0 && (
        <p className="muted small">
          {t('myShares')}
          <span className="num">{myShares.toString()}</span>
        </p>
      )}
    </div>
  )
}

export function RaffleActions(props: {
  orderId: bigint
  raffle: RaffleView
  onDone: () => void
  compact?: boolean
  hideShareHint?: boolean
}) {
  const { family } = useChainFamily()
  if (family === 'solana') return <SolanaRaffleActions {...props} />
  return <EvmRaffleActions {...props} />
}
