'use client'

import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { decodeEventLog, erc20Abi, formatUnits, isAddress, maxUint256, parseUnits } from 'viem'
import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi'
import { scoopAbi } from '@/abi/scoop'
import { useChainFamily } from '@/chain/selection'
import { useSolanaWrites } from '@/chain/solana/useSolanaWrites'
import { useRequireChain } from '@/hooks/useRequireChain'
import { useSolanaProtocolConfig } from '@/hooks/useSolanaRaffle'
import { useTokenDecimals } from '@/hooks/useTokenDecimals'
import { appChain } from '@/lib/chains'
import { useT } from '@/lib/i18n'
import { rafflePath } from '@/lib/paths'
import { isNative, NATIVE, SOLANA_NATIVE, scoopAddress } from '@/lib/scoop'
import { parseTokenInput } from '@/lib/tokens'
import { toastTxError, toastTxOk } from '@/lib/tx'

/** Mirrors LibConstants on-chain. */
const MIN_SHARES = 2
const MAX_SHARES = 10_000
const MIN_DRAW_DELAY = 1
const MAX_DRAW_DELAY = 128

type ProtocolConfig = {
  allowDifferentTokens: boolean
  allowCustomShares: boolean
  allowCustomPrice: boolean
  allowCustomDrawDelay: boolean
  defaultShares: number
  priceDivisor: number
  defaultDrawDelayBlocks: number
}

function isMaxish(allowance: bigint | undefined): boolean {
  return allowance !== undefined && allowance >= maxUint256 / BigInt(2)
}

function SolanaCreateForm() {
  const t = useT()
  const router = useRouter()
  const { publicKey, connected } = useWallet()
  const { setVisible } = useWalletModal()
  const writes = useSolanaWrites()
  const { data: cfgAccount, isLoading: cfgLoading } = useSolanaProtocolConfig()
  const [pending, setPending] = useState(false)

  const config: ProtocolConfig | undefined = cfgAccount
    ? {
        allowDifferentTokens: cfgAccount.protocolConfig.allowDifferentTokens,
        allowCustomShares: cfgAccount.protocolConfig.allowCustomShares,
        allowCustomPrice: cfgAccount.protocolConfig.allowCustomPrice,
        allowCustomDrawDelay: cfgAccount.protocolConfig.allowCustomDrawDelay,
        defaultShares: cfgAccount.protocolConfig.defaultShares,
        priceDivisor: cfgAccount.protocolConfig.priceDivisor,
        defaultDrawDelayBlocks: cfgAccount.protocolConfig.defaultDrawDelaySlots,
      }
    : undefined

  const [prizeToken, setPrizeToken] = useState('SOL')
  const [paymentToken, setPaymentToken] = useState('SOL')
  const [prizeAmount, setPrizeAmount] = useState('1')
  const [pricePerShare, setPricePerShare] = useState('0.1')
  const [totalShares, setTotalShares] = useState('11')
  const [deadlineHours, setDeadlineHours] = useState('24')
  const [drawDelay, setDrawDelay] = useState('5')

  useEffect(() => {
    if (!config) return
    if (!config.allowCustomShares) setTotalShares(String(config.defaultShares))
    if (!config.allowCustomDrawDelay) setDrawDelay(String(config.defaultDrawDelayBlocks))
    if (!config.allowDifferentTokens) setPaymentToken(prizeToken)
  }, [config, prizeToken])

  const prize = useMemo(() => parseTokenInput(prizeToken, 'solana'), [prizeToken])
  const paymentAddr = useMemo(
    () =>
      config && !config.allowDifferentTokens ? prize : parseTokenInput(paymentToken, 'solana'),
    [config, prize, paymentToken],
  )
  const prizeDecimals = useTokenDecimals(prize)
  const paymentDecimals = useTokenDecimals(paymentAddr)

  const lockedPrice = useMemo(() => {
    if (!config || config.allowCustomPrice) return null
    try {
      const prizeWei = parseUnits(prizeAmount || '0', prizeDecimals)
      const divisor = BigInt(config.priceDivisor || 10)
      if (divisor === BigInt(0)) return null
      return formatUnits(prizeWei / divisor, paymentDecimals)
    } catch {
      return null
    }
  }, [config, prizeAmount, prizeDecimals, paymentDecimals])

  useEffect(() => {
    if (lockedPrice !== null) setPricePerShare(lockedPrice)
  }, [lockedPrice])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!connected || !publicKey) {
      setVisible(true)
      return toast.error(t('toastConnect'))
    }
    if (!config || !cfgAccount) return toast.error(t('toastCfg'))

    const payment = config.allowDifferentTokens ? parseTokenInput(paymentToken, 'solana') : prize
    const prizeWei = parseUnits(prizeAmount || '0', prizeDecimals)
    const shares = config.allowCustomShares ? Number(totalShares) : config.defaultShares
    const delay = config.allowCustomDrawDelay ? Number(drawDelay) : config.defaultDrawDelayBlocks
    const priceWei = config.allowCustomPrice
      ? parseUnits(pricePerShare || '0', paymentDecimals)
      : prizeWei / BigInt(config.priceDivisor)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + Number(deadlineHours) * 3600)
    const nextId = cfgAccount.nextRaffleId

    if (prizeWei === BigInt(0) || priceWei === BigInt(0)) return toast.error(t('toastAmount'))
    if (!Number.isFinite(shares) || shares < MIN_SHARES || shares > MAX_SHARES) {
      return toast.error(t('toastSharesRange', { min: MIN_SHARES, max: MAX_SHARES }))
    }
    if (!Number.isFinite(delay) || delay < MIN_DRAW_DELAY || delay > MAX_DRAW_DELAY) {
      return toast.error(t('toastDelayRange', { min: MIN_DRAW_DELAY, max: MAX_DRAW_DELAY }))
    }
    if (!config.allowCustomPrice && prizeWei % BigInt(config.priceDivisor) !== BigInt(0)) {
      return toast.error(t('toastDivisible', { d: config.priceDivisor }))
    }

    setPending(true)
    try {
      const { signature } = await writes.create({
        prizeToken: prize,
        paymentToken: payment,
        prizeAmount: prizeWei,
        pricePerShare: priceWei,
        totalShares: shares,
        deadline,
        drawDelay: delay,
      })
      toastTxOk(t('toastCreated', { id: nextId.toString() }), signature, t('viewTx'))
      router.push(rafflePath(nextId))
    } catch (err) {
      toastTxError(err, t, 'toastCreateFail')
    } finally {
      setPending(false)
    }
  }

  const lockedHint = !config
    ? cfgLoading
      ? t('createLoadingCfg')
      : t('toastCfg')
    : [
        !config.allowDifferentTokens ? t('createLockSame') : null,
        !config.allowCustomShares ? t('createLockShares', { n: config.defaultShares }) : null,
        !config.allowCustomPrice ? t('createLockPrice', { d: config.priceDivisor }) : null,
        !config.allowCustomDrawDelay
          ? t('createLockDelay', { n: config.defaultDrawDelayBlocks })
          : null,
      ]
        .filter(Boolean)
        .join(' · ')

  if (!connected) {
    return (
      <div className="empty" style={{ padding: 24 }}>
        <p style={{ marginBottom: 12 }}>{t('toastConnect')}</p>
        <button type="button" className="btn primary touch" onClick={() => setVisible(true)}>
          {t('connect')}
        </button>
      </div>
    )
  }

  return (
    <form className="create-form" onSubmit={onSubmit}>
      <p className={`flash${lockedHint ? ' warn' : ''}`}>{lockedHint || t('createAllCustom')}</p>
      <label>
        {t('createPrizeTokenSol')}
        <input
          className="input touch"
          value={prizeToken}
          onChange={(e) => setPrizeToken(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label>
        {t('createPaymentToken')}
        <input
          className="input touch"
          value={config && !config.allowDifferentTokens ? prizeToken : paymentToken}
          onChange={(e) => setPaymentToken(e.target.value)}
          disabled={!config?.allowDifferentTokens}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label>
        {t('createPrizeAmount')}
        <input
          className="input touch"
          inputMode="decimal"
          value={prizeAmount}
          onChange={(e) => setPrizeAmount(e.target.value)}
        />
      </label>
      <label>
        {t('createPrice')}
        <input
          className="input touch"
          inputMode="decimal"
          value={
            config && !config.allowCustomPrice ? (lockedPrice ?? pricePerShare) : pricePerShare
          }
          onChange={(e) => setPricePerShare(e.target.value)}
          disabled={!config?.allowCustomPrice}
        />
      </label>
      <label>
        {t('createShares')}
        <input
          className="input touch"
          inputMode="numeric"
          value={totalShares}
          onChange={(e) => setTotalShares(e.target.value)}
          disabled={!config?.allowCustomShares}
        />
      </label>
      <label>
        {t('createDeadline')}
        <input
          className="input touch"
          inputMode="numeric"
          value={deadlineHours}
          onChange={(e) => setDeadlineHours(e.target.value)}
        />
      </label>
      <label>
        {t('createDelaySlots')}
        <input
          className="input touch"
          inputMode="numeric"
          value={drawDelay}
          onChange={(e) => setDrawDelay(e.target.value)}
          disabled={!config?.allowCustomDrawDelay}
        />
      </label>
      <p className="muted small">
        {t('createHint')}
        <span className="mono">{SOLANA_NATIVE}</span>
      </p>
      <p className="muted small">
        {t('assetPolicyFoTHint')} {t('assetPolicyToken2022Hint')}
      </p>
      <button className="btn primary lg touch" type="submit" disabled={pending || !config}>
        {pending ? t('createSubmitting') : t('createSubmit')}
      </button>
    </form>
  )
}

function EvmCreateForm() {
  const t = useT()
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { requireChain } = useRequireChain()
  const publicClient = usePublicClient({ chainId: appChain.id })
  const { writeContractAsync, isPending } = useWriteContract()

  const { data: cfg } = useReadContract({
    address: scoopAddress,
    abi: scoopAbi,
    functionName: 'protocolConfig',
    chainId: appChain.id,
  })

  const config = cfg as ProtocolConfig | undefined

  const [prizeToken, setPrizeToken] = useState('BNB')
  const [paymentToken, setPaymentToken] = useState('BNB')
  const [prizeAmount, setPrizeAmount] = useState('1')
  const [pricePerShare, setPricePerShare] = useState('0.1')
  const [totalShares, setTotalShares] = useState('11')
  const [deadlineHours, setDeadlineHours] = useState('24')
  const [drawDelay, setDrawDelay] = useState('5')

  useEffect(() => {
    if (!config) return
    if (!config.allowCustomShares) setTotalShares(String(config.defaultShares))
    if (!config.allowCustomDrawDelay) setDrawDelay(String(config.defaultDrawDelayBlocks))
    if (!config.allowDifferentTokens) setPaymentToken(prizeToken)
  }, [config, prizeToken])

  const prize = useMemo(() => parseTokenInput(prizeToken, 'evm'), [prizeToken])
  const paymentAddr = useMemo(
    () => (config && !config.allowDifferentTokens ? prize : parseTokenInput(paymentToken, 'evm')),
    [config, prize, paymentToken],
  )
  const prizeDecimals = useTokenDecimals(prize)
  const paymentDecimals = useTokenDecimals(paymentAddr)
  const needsApprove = !isNative(prize) && (typeof prize === 'string' ? isAddress(prize) : false)

  const lockedPrice = useMemo(() => {
    if (!config || config.allowCustomPrice) return null
    try {
      const prizeWei = parseUnits(prizeAmount || '0', prizeDecimals)
      const divisor = BigInt(config.priceDivisor || 10)
      if (divisor === BigInt(0)) return null
      return formatUnits(prizeWei / divisor, paymentDecimals)
    } catch {
      return null
    }
  }, [config, prizeAmount, prizeDecimals, paymentDecimals])

  useEffect(() => {
    if (lockedPrice !== null) setPricePerShare(lockedPrice)
  }, [lockedPrice])

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: needsApprove ? (prize as `0x${string}`) : undefined,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && needsApprove ? [address, scoopAddress] : undefined,
    chainId: appChain.id,
    query: { enabled: Boolean(address && needsApprove) },
  })
  const maxApproved = isMaxish(allowance)

  async function approveMax() {
    if (!(await requireChain()) || !publicClient) return
    if (!needsApprove) return
    try {
      const tx = await writeContractAsync({
        address: prize as `0x${string}`,
        abi: erc20Abi,
        functionName: 'approve',
        args: [scoopAddress, maxUint256],
      })
      await publicClient.waitForTransactionReceipt({ hash: tx })
      await refetchAllowance()
      toastTxOk(t('toastApproveOk'), tx, t('viewTx'))
    } catch (err) {
      toastTxError(err, t, 'toastApproveFail')
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isConnected) {
      openConnectModal?.()
      return toast.error(t('toastConnect'))
    }
    if (!(await requireChain()) || !publicClient) return
    if (!config) return toast.error(t('toastCfg'))

    const payment = config.allowDifferentTokens ? parseTokenInput(paymentToken, 'evm') : prize
    const prizeWei = parseUnits(prizeAmount || '0', prizeDecimals)
    const shares = config.allowCustomShares ? Number(totalShares) : config.defaultShares
    const delay = config.allowCustomDrawDelay ? Number(drawDelay) : config.defaultDrawDelayBlocks
    const priceWei = config.allowCustomPrice
      ? parseUnits(pricePerShare || '0', paymentDecimals)
      : prizeWei / BigInt(config.priceDivisor)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + Number(deadlineHours) * 3600)

    if (prizeWei === BigInt(0) || priceWei === BigInt(0)) return toast.error(t('toastAmount'))
    if (!Number.isFinite(shares) || shares < MIN_SHARES || shares > MAX_SHARES) {
      return toast.error(t('toastSharesRange', { min: MIN_SHARES, max: MAX_SHARES }))
    }
    if (!Number.isFinite(delay) || delay < MIN_DRAW_DELAY || delay > MAX_DRAW_DELAY) {
      return toast.error(t('toastDelayRange', { min: MIN_DRAW_DELAY, max: MAX_DRAW_DELAY }))
    }
    if (!config.allowCustomPrice && prizeWei % BigInt(config.priceDivisor) !== BigInt(0)) {
      return toast.error(t('toastDivisible', { d: config.priceDivisor }))
    }
    if (needsApprove && (allowance ?? BigInt(0)) < prizeWei) {
      return toast.error(t('toastNeedApprove'))
    }

    try {
      const hash = await writeContractAsync({
        address: scoopAddress,
        abi: scoopAbi,
        functionName: 'createRaffle',
        args: [
          prize as `0x${string}`,
          payment as `0x${string}`,
          prizeWei,
          priceWei,
          shares,
          deadline,
          delay,
        ],
        value: isNative(prize) ? prizeWei : BigInt(0),
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      let orderId = BigInt(0)
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: scoopAbi,
            data: log.data,
            topics: log.topics,
          })
          if (decoded.eventName === 'RaffleCreated') {
            orderId = decoded.args.orderId as bigint
            break
          }
        } catch {
          // not our event
        }
      }
      toastTxOk(
        orderId ? t('toastCreated', { id: orderId.toString() }) : t('toastCreatedOk'),
        hash,
        t('viewTx'),
      )
      if (orderId > BigInt(0)) router.push(rafflePath(orderId))
      else router.push('/')
    } catch (err) {
      toastTxError(err, t, 'toastCreateFail')
    }
  }

  const lockedHint = !config
    ? t('createLoadingCfg')
    : [
        !config.allowDifferentTokens ? t('createLockSame') : null,
        !config.allowCustomShares ? t('createLockShares', { n: config.defaultShares }) : null,
        !config.allowCustomPrice ? t('createLockPrice', { d: config.priceDivisor }) : null,
        !config.allowCustomDrawDelay
          ? t('createLockDelay', { n: config.defaultDrawDelayBlocks })
          : null,
      ]
        .filter(Boolean)
        .join(' · ')

  if (!isConnected) {
    return (
      <div className="empty" style={{ padding: 24 }}>
        <p style={{ marginBottom: 12 }}>{t('toastConnect')}</p>
        <button type="button" className="btn primary touch" onClick={() => openConnectModal?.()}>
          {t('connect')}
        </button>
      </div>
    )
  }

  return (
    <form className="create-form" onSubmit={onSubmit}>
      <p className={`flash${lockedHint ? ' warn' : ''}`}>{lockedHint || t('createAllCustom')}</p>
      <label>
        {t('createPrizeToken')}
        <input
          className="input touch"
          value={prizeToken}
          onChange={(e) => setPrizeToken(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label>
        {t('createPaymentToken')}
        <input
          className="input touch"
          value={config && !config.allowDifferentTokens ? prizeToken : paymentToken}
          onChange={(e) => setPaymentToken(e.target.value)}
          disabled={!config?.allowDifferentTokens}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label>
        {t('createPrizeAmount')}
        <input
          className="input touch"
          inputMode="decimal"
          value={prizeAmount}
          onChange={(e) => setPrizeAmount(e.target.value)}
        />
      </label>
      <label>
        {t('createPrice')}
        <input
          className="input touch"
          inputMode="decimal"
          value={
            config && !config.allowCustomPrice ? (lockedPrice ?? pricePerShare) : pricePerShare
          }
          onChange={(e) => setPricePerShare(e.target.value)}
          disabled={!config?.allowCustomPrice}
        />
      </label>
      <label>
        {t('createShares')}
        <input
          className="input touch"
          inputMode="numeric"
          value={totalShares}
          onChange={(e) => setTotalShares(e.target.value)}
          disabled={!config?.allowCustomShares}
        />
      </label>
      <label>
        {t('createDeadline')}
        <input
          className="input touch"
          inputMode="numeric"
          value={deadlineHours}
          onChange={(e) => setDeadlineHours(e.target.value)}
        />
      </label>
      <label>
        {t('createDelay')}
        <input
          className="input touch"
          inputMode="numeric"
          value={drawDelay}
          onChange={(e) => setDrawDelay(e.target.value)}
          disabled={!config?.allowCustomDrawDelay}
        />
      </label>
      <p className="muted small">
        {t('createHint')}
        <span className="mono">{NATIVE}</span>
      </p>
      <p className="muted small">{t('assetPolicyFoTHint')}</p>
      {needsApprove && address && (
        <button
          className={`btn touch${maxApproved ? '' : ' primary'} lg`}
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
      <button
        className="btn primary lg touch"
        type="submit"
        disabled={(() => {
          if (isPending || !config) return true
          if (!needsApprove) return false
          try {
            return (allowance ?? BigInt(0)) < parseUnits(prizeAmount || '0', prizeDecimals)
          } catch {
            return true
          }
        })()}
      >
        {isPending ? t('createSubmitting') : t('createSubmit')}
      </button>
    </form>
  )
}

export function CreateForm() {
  const { family } = useChainFamily()
  if (family === 'solana') return <SolanaCreateForm />
  return <EvmCreateForm />
}
