'use client'

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

export type Locale = 'zh' | 'en'

const STORAGE_KEY = 'scoop.locale'

const dict = {
  zh: {
    navAria: '主导航',
    navRaffles: '进行中',
    navCreate: '创建',
    navMe: '我的',
    meTitle: '我的',
    meLead:
      '待办优先（开奖 / 领奖 / 领销售收入 / 退款），历史在下。购买记录由链上 SharesPurchased 事件索引。',
    meLeadSolana: '待办优先（开奖 / 领奖 / 退款），历史在下。购买记录由链上 BuyerRecord 账户发现。',
    meConnect: '连接钱包后可查看你参与过的场次。',
    meLoading: '加载中…',
    meEmpty: '暂无记录。可在「进行中」购买份额，或创建一场。',
    meSolanaNoIndex:
      '当前 RPC 无法扫描 BuyerRecord；已尝试本地缓存与近期场次探测。若仍缺项，请用 #ID 打开详情。',
    meSolanaHint: '也可从进行中列表进入详情。返回',
    meCreatedLink: '我创建的全部场次',
    meActionable: '待处理',
    meHistory: '历史',
    meLoadMore: '加载更早记录',
    meCreatorTag: '我创建的',
    solanaNoSecondaryIndex: 'Solana MVP 暂无创建者 / 奖池代币次级索引。',
    solanaOpenById: '请用场次 #ID 打开详情。返回',
    outcomeWon: '中奖',
    outcomeLost: '未中',
    outcomePending: '待开奖',
    langZh: '中文',
    langEn: 'EN',
    langToggle: '切换语言',
    searchPlaceholder: '搜索场次 #ID / 地址',
    searchAria: '搜索场次或地址',
    searchOpen: '搜索',
    connect: '连接钱包',
    connecting: '连接中…',
    connectShort: '连接',
    themeToggle: '切换浅色 / 深色',
    walletAria: '连接钱包',
    walletConnected: '钱包 {a}',

    heroAria: 'Scoop 介绍',
    heroHeadline: '托管奖池，按份出售，链上开奖。',
    heroLead:
      '双链份额夺宝协议：奖池托管后拆成固定份数出售；售罄并经过约定延迟后，以链上熵源抽取一份，中奖者领取全部奖池。当前为测试网部署。',
    heroCtaLive: '查看进行中',
    heroCtaCreate: '创建场次',
    homeTitle: '进行中的场次',
    homeLead: '仅展示可买入或待开奖的场次。已结算请到「我的」或按场次 ID 搜索。',
    homeLeadSolana:
      '仅展示可买入或待开奖的场次（顺序扫描近期 id，非全站索引）。已结束请搜场次 #ID。',
    homeCreate: '创建场次',
    homeLoading: '加载场次…',
    homeEmpty: '暂无场次。部署合约并设置 NEXT_PUBLIC_SCOOP_DIAMOND 后，再创建第一场。',
    homeEmptySolana: '暂无场次。部署程序并设置 NEXT_PUBLIC_SOLANA_PROGRAM_ID 后，再创建第一场。',
    homeEmptyActive: '当前没有进行中或待开奖场次。已结束记录见',
    homeSolanaIndexHint: '列表为顺序扫描近期 raffle id，不是全站索引；更早场次请直接搜 #ID。',
    homeLoadMore: '加载更多',
    aboutTitle: '协议说明',
    aboutBody:
      '类一元夺宝的链上份额夺宝：托管奖池、按固定份数出售；售罄后经 N 个区块，以 blockhash 抽取中奖份额，赢家领取全部奖池。参与前请确认网络与合约地址。',
    aboutBodySolana:
      '类一元夺宝的链上份额夺宝：托管奖池、按固定份数出售；售罄后经 N 个 slot，以 SlotHashes 抽取中奖份额，赢家领取全部奖池。参与前请确认集群与程序 ID。',
    aboutCreate: '创建场次',
    aboutMe: '我的购买与领奖',
    aboutSource: 'GitHub 源码',
    aboutProtocol: 'PROTOCOL',
    contractTitle: 'BSC 合约（测试网）',
    contractUnset: '未配置 NEXT_PUBLIC_SCOOP_DIAMOND',
    programTitle: 'Solana 程序（devnet）',
    programUnset: '未配置 NEXT_PUBLIC_SOLANA_PROGRAM_ID',
    rulesTitle: '规则摘要',
    rulesBody:
      '启动默认：同币买卖 · 11 份 · 单价 = 奖池 / 10 · N = 5 块。首页仅列进行中场次；结算后在「我的」处理。费用与资产限制见 PROTOCOL。',
    rulesBodySolana:
      '启动默认：同币买卖 · 11 份 · 单价 = 奖池 / 10 · N = 5 slot。首页顺序扫近期场次；结算后请搜 #ID。费用与资产限制见 PROTOCOL。',
    statusTitle: '部署状态',
    statusBody:
      '本站指向 BSC 测试网 Diamond 与 Solana devnet 程序。非主网；资金与结果均以对应测试网为准。',
    sideAria: '关于 Scoop',
    errRejected: '已取消签名',
    errInsufficient: '余额不足',
    errWrongChain: '请切换到正确的网络',
    errFeeOnTransfer: '该代币实际到账少于请求额（扣费/税币）。Scoop 拒绝此类资产。',
    errToken2022: '不支持 Token-2022。请使用经典 SPL Token。',
    assetPolicyFoTHint: '链上拒绝 fee-on-transfer / 税币（到账必须足额）。',
    assetPolicyToken2022Hint: 'Solana：仅经典 SPL Token；Token-2022 会被拒绝。',
    assetPolicySolanaIndexHint: 'Solana 列表只顺序扫近期 id，不是全站索引；更早场次请搜 #ID。',
    viewTx: '查看交易',
    copyLink: '复制链接',
    copyLinkOk: '链接已复制',
    copy: '复制',
    copied: '已复制',
    copyAddress: '复制地址',
    copyAddrOk: '地址已复制',
    copyAddrFail: '复制失败',
    viewExplorer: '浏览器',
    meLogsFallback: '事件查询失败，已回退为扫描近期场次（可能不全）。',
    buyCost: '合计 {a} {token}',
    buyBalanceLow: '余额不足',
    drawWaitBlocks: '还需约 {n} 块',
    drawWaitSlots: '还需约 {n} 个 slot',
    drawReady: '可以开奖',
    shareCountAria: '买入份数',
    userLoading: '加载创建记录…',
    tokenLoading: '加载场次…',

    createTitle: '创建场次',
    createLead:
      '托管奖池并开售。协议默认：同币、固定 11 份、单价 = 奖池 / 10。灰色字段为锁定默认值，可由管理员逐步放开。',
    createParams: '参数',
    createPrizeToken: '奖池代币（BNB 或合约地址）',
    createPrizeTokenSol: '奖池代币（SOL 或 mint）',
    createPaymentToken: '买份代币',
    createPrizeAmount: '奖池数量',
    createPrice: '每份价格',
    createShares: '总份数',
    createDeadline: '截止（小时后）',
    createDelay: '开奖等待区块数 N',
    createDelaySlots: '开奖等待 slot 数 N',
    createHint: '创建者售罄后收买份总额 99%（协议 1%）。中奖者拿满奖池。原生哨兵：',
    createSubmit: '创建场次',
    createSubmitting: '提交中…',
    createLoadingCfg: '加载协议配置…',
    createAllCustom: '全部参数可自定义',
    createLockSame: '同币买卖',
    createLockShares: '{n} 份固定',
    createLockPrice: '单价=奖池/{d}',
    createLockDelay: 'N={n}',
    toastConnect: '请先连接钱包',
    toastCfg: '配置未加载',
    toastAmount: '金额必须大于 0',
    toastDivisible: '奖池数量需能被 {d} 整除',
    toastCreated: '创建成功 #{id}',
    toastCreatedOk: '创建成功',
    toastCreateFail: '创建失败',

    backRaffles: '← 场次',
    detailLoading: '加载中…',
    detailMissing: '场次不存在',
    detailSold: '份已售',
    detailBox: '详情',
    detailActions: '操作',
    detailPrize: '奖池',
    detailPrice: '单价',
    detailProgress: '进度',
    detailDeadline: '截止',
    detailCreator: '创建者',
    detailPrizeToken: '奖池币',
    detailDelay: '开奖延迟 N',
    detailBlocks: '{n} 块',
    detailSlots: '{n} 个 slot',

    cardPerShare: '/ 份 · 共 {n} 份',
    cardDeadline: '· 截止 {d}',

    myShares: '我的份额：',
    approveMax: '授权 Max',
    approved: '已授权',
    approving: '授权中…',
    toastApproveOk: '授权成功（Max）',
    toastApproveFail: '授权失败',
    toastNeedApprove: '请先点击「授权 Max」',
    buy: '买入（剩余 {n}）',
    draw: '开奖（≥ 块 {n}）',
    drawSlot: '开奖（≥ slot {n}）',
    claimPrize: '领取奖池（100%）',
    claimProceeds: '领取销售收入（扣 1% 协议费）',
    claimProceedsHint: '筹集 {raised} {token} · 协议费 {fee} · 到手 {net}',
    refund: '退款',
    toastSharesRange: '份数须在 {min}–{max}',
    toastDelayRange: '开奖延迟须在 {min}–{max}',
    recover: '取回奖池',
    winner: '中奖地址：',
    toastSharesInvalid: '份数无效',
    toastSharesLeft: '剩余份数不足',
    toastBuyOk: '购买成功',
    toastBuyFail: '购买失败',
    toastDrawWait: '还需等待开奖，目标块 {need}，当前 {now}',
    toastDrawWaitSlot: '还需等待开奖，目标 slot {need}，当前 {now}',
    toastDrawOk: '开奖完成',
    toastDrawFail: '开奖失败',
    toastPrizeOk: '奖池已领取（无手续费）',
    toastClaimFail: '领取失败',
    toastProceedsOk: '销售收入已领取（含 1% 协议费）',
    toastRefundOk: '退款成功',
    toastRefundFail: '退款失败',
    toastRecoverOk: '奖池已取回',
    toastRecoverFail: '取回失败',

    userTitle: '创建者 {a}',
    userLead: '创建了 {n} 场 · 进行中优先，已结束折叠在下方',
    userEmpty: '该地址暂无创建记录',
    userActive: '进行中',
    userSettled: '已结束',
    tokenTitle: '奖池币 {token}',
    tokenLead: '进行中场次（已开奖/过期不展示，搜 #ID 可查）',
    tokenEmpty: '该代币下暂无进行中场次',

    statusSelling: '销售中',
    statusSoldOut: '待开奖',
    statusDrawn: '已开奖',
    statusExpired: '已过期',
    statusUnknown: '未知',

    footBrand: 'Scoop',
    footRule:
      '中奖者领取全部奖池；创建者收取销售收入的 99%（协议费 1%）。测试网部署，请自行核验合约。',
    footNetwork: '网络：{evm} · Solana {sol}',
    footDiamond: 'BSC Diamond（测试网）',
    footProgram: 'Solana Program（devnet）',
    footLinksAria: '源码与浏览器',
    footGitHub: 'GitHub',
    footBscScan: 'BscScan',
    footSolanaExplorer: 'Solana Explorer',
    footProtocol: 'PROTOCOL',

    switchChain: '切换到 {n}',
    disconnect: '断开',
    chainSwitchAria: '切换链',
    chainFamilyEvm: 'EVM',
    chainFamilySolana: 'Solana',
    chainSolanaStub: 'Solana：连接钱包后可创建 / 购买 / 开奖 / 领取',
  },
  en: {
    navAria: 'Main navigation',
    navRaffles: 'Live',
    navCreate: 'Create',
    navMe: 'Me',
    meTitle: 'Me',
    meLead:
      'Action items first (draw / claim prize / claim proceeds / refund), then history. Purchases indexed via SharesPurchased events.',
    meLeadSolana:
      'Action items first (draw / claim / refund), then history. Purchases discovered via on-chain BuyerRecord accounts.',
    meConnect: 'Connect a wallet to see raffles you joined.',
    meLoading: 'Loading…',
    meEmpty: 'No records yet. Buy shares under Live, or create a raffle.',
    meSolanaNoIndex:
      'This RPC could not scan BuyerRecords; tried local cache + recent-id probe. If something is missing, open by #ID.',
    meSolanaHint: 'Or open from Live. Back to',
    meCreatedLink: 'All raffles I created',
    meActionable: 'Needs action',
    meHistory: 'History',
    meLoadMore: 'Load older',
    meCreatorTag: 'Created by me',
    solanaNoSecondaryIndex: 'Solana MVP has no creator / prize-token secondary indexes.',
    solanaOpenById: 'Open a raffle by #ID. Back to',
    outcomeWon: 'Won',
    outcomeLost: 'Lost',
    outcomePending: 'Pending draw',
    langZh: '中文',
    langEn: 'EN',
    langToggle: 'Switch language',
    searchPlaceholder: 'Search raffle #ID / address',
    searchAria: 'Search raffles or addresses',
    searchOpen: 'Search',
    connect: 'Connect wallet',
    connecting: 'Connecting…',
    connectShort: 'Connect',
    themeToggle: 'Switch light or dark',
    walletAria: 'Connect a wallet',
    walletConnected: 'Wallet {a}',

    heroAria: 'Scoop introduction',
    heroHeadline: 'Escrow a prize. Sell fixed shares. Draw on-chain.',
    heroLead:
      'Dual-chain share raffle: escrow a prize, sell a fixed number of shares, then after the configured delay draw one winning share with on-chain entropy. Winner claims the full prize. This deployment targets testnets only.',
    heroCtaLive: 'View live raffles',
    heroCtaCreate: 'Create raffle',
    homeTitle: 'Live raffles',
    homeLead:
      'Buyable or awaiting-draw raffles only. Settled records are under Me, or search by raffle ID.',
    homeLeadSolana:
      'Buyable or awaiting-draw raffles only (recent ids scanned sequentially — not a full index). Settled: search by #ID.',
    homeCreate: 'Create raffle',
    homeLoading: 'Loading raffles…',
    homeEmpty:
      'No raffles yet. Deploy the diamond and set NEXT_PUBLIC_SCOOP_DIAMOND, then create the first one.',
    homeEmptySolana:
      'No raffles yet. Deploy the program and set NEXT_PUBLIC_SOLANA_PROGRAM_ID, then create the first one.',
    homeEmptyActive: 'Nothing live right now. Settled records are under',
    homeSolanaIndexHint:
      'List scans recent raffle ids in order — not a full site index. Older raffles: search by #ID.',
    homeLoadMore: 'Load more',
    aboutTitle: 'Protocol',
    aboutBody:
      'On-chain share raffle in the spirit of fixed-share prize draws: escrow a prize, sell a fixed number of shares, then after N blocks draw with blockhash. One share wins the whole prize. Verify network and contract before participating.',
    aboutBodySolana:
      'On-chain share raffle in the spirit of fixed-share prize draws: escrow a prize, sell a fixed number of shares, then after N slots draw with SlotHashes. One share wins the whole prize. Verify cluster and program ID before participating.',
    aboutCreate: 'Create a raffle',
    aboutMe: 'My purchases & claims',
    aboutSource: 'GitHub source',
    aboutProtocol: 'PROTOCOL',
    contractTitle: 'BSC contract (testnet)',
    contractUnset: 'NEXT_PUBLIC_SCOOP_DIAMOND not set',
    programTitle: 'Solana program (devnet)',
    programUnset: 'NEXT_PUBLIC_SOLANA_PROGRAM_ID not set',
    rulesTitle: 'Rules',
    rulesBody:
      'Launch defaults: same token · 11 shares · price = prize / 10 · N = 5 blocks. Home lists live raffles only; settle under Me. Fees and asset limits: see PROTOCOL.',
    rulesBodySolana:
      'Launch defaults: same token · 11 shares · price = prize / 10 · N = 5 slots. Home scans recent ids; after settlement search by #ID. Fees and asset limits: see PROTOCOL.',
    statusTitle: 'Deployment status',
    statusBody:
      'This site points at a BSC testnet Diamond and a Solana devnet program. Not mainnet; funds and outcomes follow those testnets.',
    sideAria: 'About Scoop',
    errRejected: 'Signature cancelled',
    errInsufficient: 'Insufficient balance',
    errWrongChain: 'Switch to the correct network',
    errFeeOnTransfer:
      'This token transfers less than requested (fee-on-transfer / tax). Scoop rejects it.',
    errToken2022: 'Token-2022 is not supported. Use classic SPL Token.',
    assetPolicyFoTHint: 'Fee-on-transfer and tax tokens are rejected on-chain.',
    assetPolicyToken2022Hint: 'Solana: classic SPL Token only — Token-2022 is rejected.',
    assetPolicySolanaIndexHint:
      'Solana lists scan recent ids only — not a full index. Older raffles: search #ID.',
    viewTx: 'View tx',
    copyLink: 'Copy link',
    copyLinkOk: 'Link copied',
    copy: 'Copy',
    copied: 'Copied',
    copyAddress: 'Copy address',
    copyAddrOk: 'Address copied',
    copyAddrFail: 'Copy failed',
    viewExplorer: 'Explorer',
    meLogsFallback: 'Event query failed; fell back to scanning recent raffles (may be incomplete).',
    buyCost: 'Total {a} {token}',
    buyBalanceLow: 'Insufficient balance',
    drawWaitBlocks: '~{n} blocks left',
    drawWaitSlots: '~{n} slots left',
    drawReady: 'Ready to draw',
    shareCountAria: 'Share count',
    userLoading: 'Loading created raffles…',
    tokenLoading: 'Loading raffles…',

    createTitle: 'Create raffle',
    createLead:
      'Escrow a prize and open sales. Protocol defaults: same token, fixed 11 shares, price = prize / 10. Grey fields are locked defaults until the owner opens them.',
    createParams: 'Parameters',
    createPrizeToken: 'Prize token (BNB or address)',
    createPrizeTokenSol: 'Prize token (SOL or mint)',
    createPaymentToken: 'Payment token',
    createPrizeAmount: 'Prize amount',
    createPrice: 'Price per share',
    createShares: 'Total shares',
    createDeadline: 'Deadline (hours from now)',
    createDelay: 'Draw delay blocks N',
    createDelaySlots: 'Draw delay slots N',
    createHint:
      'Creator receives 99% of sales (1% protocol fee). Winner takes the full prize. Native sentinel:',
    createSubmit: 'Create raffle',
    createSubmitting: 'Submitting…',
    createLoadingCfg: 'Loading protocol config…',
    createAllCustom: 'All parameters are customizable',
    createLockSame: 'Same-token only',
    createLockShares: '{n} shares fixed',
    createLockPrice: 'Price = prize/{d}',
    createLockDelay: 'N={n}',
    toastConnect: 'Connect wallet first',
    toastCfg: 'Config not loaded',
    toastAmount: 'Amount must be > 0',
    toastDivisible: 'Prize amount must be divisible by {d}',
    toastCreated: 'Created #{id}',
    toastCreatedOk: 'Created',
    toastCreateFail: 'Create failed',

    backRaffles: '← Raffles',
    detailLoading: 'Loading…',
    detailMissing: 'Raffle not found',
    detailSold: 'shares sold',
    detailBox: 'Details',
    detailActions: 'Actions',
    detailPrize: 'Prize',
    detailPrice: 'Price',
    detailProgress: 'Progress',
    detailDeadline: 'Deadline',
    detailCreator: 'Creator',
    detailPrizeToken: 'Prize token',
    detailDelay: 'Draw delay N',
    detailBlocks: '{n} blocks',
    detailSlots: '{n} slots',

    cardPerShare: '/ share · {n} total',
    cardDeadline: '· ends {d}',

    myShares: 'My shares: ',
    approveMax: 'Approve Max',
    approved: 'Approved',
    approving: 'Approving…',
    toastApproveOk: 'Approved (max)',
    toastApproveFail: 'Approve failed',
    toastNeedApprove: 'Tap “Approve Max” first',
    buy: 'Buy ({n} left)',
    draw: 'Draw (≥ block {n})',
    drawSlot: 'Draw (≥ slot {n})',
    claimPrize: 'Claim prize (100%)',
    claimProceeds: 'Claim proceeds (1% fee)',
    claimProceedsHint: 'Raised {raised} {token} · fee {fee} · net {net}',
    refund: 'Refund',
    toastSharesRange: 'Shares must be {min}–{max}',
    toastDelayRange: 'Draw delay must be {min}–{max}',
    recover: 'Recover prize',
    winner: 'Winner: ',
    toastSharesInvalid: 'Invalid share count',
    toastSharesLeft: 'Not enough shares left',
    toastBuyOk: 'Purchase successful',
    toastBuyFail: 'Purchase failed',
    toastDrawWait: 'Wait for draw: need block {need}, now {now}',
    toastDrawWaitSlot: 'Wait for draw: need slot {need}, now {now}',
    toastDrawOk: 'Drawn',
    toastDrawFail: 'Draw failed',
    toastPrizeOk: 'Prize claimed (no fee)',
    toastClaimFail: 'Claim failed',
    toastProceedsOk: 'Proceeds claimed (1% protocol fee)',
    toastRefundOk: 'Refunded',
    toastRefundFail: 'Refund failed',
    toastRecoverOk: 'Prize recovered',
    toastRecoverFail: 'Recover failed',

    userTitle: 'Creator {a}',
    userLead: 'Created {n} raffles · live first, settled below',
    userEmpty: 'No raffles from this address',
    userActive: 'Live',
    userSettled: 'Settled',
    tokenTitle: 'Prize token {token}',
    tokenLead: 'Live raffles only (settled hidden; search #ID)',
    tokenEmpty: 'No live raffles for this token',

    statusSelling: 'Selling',
    statusSoldOut: 'Pending draw',
    statusDrawn: 'Drawn',
    statusExpired: 'Expired',
    statusUnknown: 'Unknown',

    footBrand: 'Scoop',
    footRule:
      'Winner claims the full prize; creator keeps 99% of sales (1% protocol fee). Testnet deployment — verify contracts yourself.',
    footNetwork: 'Networks: {evm} · Solana {sol}',
    footDiamond: 'BSC Diamond (testnet)',
    footProgram: 'Solana program (devnet)',
    footLinksAria: 'Source and explorers',
    footGitHub: 'GitHub',
    footBscScan: 'BscScan',
    footSolanaExplorer: 'Solana Explorer',
    footProtocol: 'PROTOCOL',

    switchChain: 'Switch to {n}',
    disconnect: 'Disconnect',
    chainSwitchAria: 'Switch chain',
    chainFamilyEvm: 'EVM',
    chainFamilySolana: 'Solana',
    chainSolanaStub: 'Solana: connect wallet to create / buy / draw / claim',
  },
} as const

export type MessageKey = keyof typeof dict.zh

type Vars = Record<string, string | number>

type I18nValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, vars?: Vars) => string
}

const I18nContext = createContext<I18nValue | null>(null)

function format(template: string, vars?: Vars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] === undefined ? `{${k}}` : String(vars[k]),
  )
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('zh')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Locale | null
      if (saved === 'zh' || saved === 'en') {
        setLocaleState(saved)
        return
      }
    } catch {
      // ignore
    }
    if (typeof navigator !== 'undefined' && !navigator.language.toLowerCase().startsWith('zh')) {
      setLocaleState('en')
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore
    }
  }, [])

  const t = useCallback((key: MessageKey, vars?: Vars) => format(dict[locale][key], vars), [locale])

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within LocaleProvider')
  return ctx
}

export function useT() {
  return useI18n().t
}
