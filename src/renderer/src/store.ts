import { flushSync } from 'react-dom'
import { create } from 'zustand'
import { t, type Lang } from '@shared/i18n'
import type {
  AccountState,
  AuthState,
  DyAccountsSnapshot,
  DyAccountState,
  LoginTarget,
  ParseRecord,
  ParseResult,
  Settings,
  SourceRef,
  TaskInfo,
  Site,
  UpdateState,
  YtAccountsSnapshot,
  YtEngineStatus
} from '@shared/types'
import { platformText } from './platform'

export type View = 'downloads' | 'subs' | 'history' | 'settings'

interface State {
  /** null 表示还在检查 */
  auth: AuthState | null
  loginOpen: boolean
  loginTarget?: LoginTarget
  accounts: AccountState | null
  accountRevision: number
  showAccountSettings: boolean
  /** 侧边栏当前选中的页面 */
  view: View
  /** 点了关闭按钮，询问退出还是后台运行 */
  closeAsk: boolean
  update: UpdateState | null
  /** 显示更新弹窗 */
  updateOpen: boolean
  settings: Settings | null
  /** 实际生效的界面语言，null 表示还没拿到 */
  lang: Lang | null
  tasks: TaskInfo[]
  parse: ParseResult | null
  source: SourceRef | null
  sourceAccountMid?: number
  parsing: boolean
  /** 批量解析、展开分P时的进度 */
  progress: { done: number; total: number; title?: string } | null
  error: string | null
  /** 不算错误的提示，例如“3 个视频已失效” */
  notice: string | null
  /** 正在打开去水印对话框的任务 */
  watermarkTaskId: string | null
  // ---- YouTube：和上面 B站的各存一份，切换平台时两边的输入、选集弹窗都保留 ----
  ytParse: ParseResult | null
  ytParsing: boolean
  ytProgress: { done: number; total: number; title?: string } | null
  ytError: string | null
  ytNotice: string | null
  ytAccounts: YtAccountsSnapshot | null
  ytEngine: YtEngineStatus | null
  ytLoginOpen: boolean
  // ---- 抖音：同样单独一份 ----
  dyParse: ParseResult | null
  dyParsing: boolean
  dyProgress: { done: number; total: number; title?: string } | null
  dyError: string | null
  dyNotice: string | null
  dyAccounts: DyAccountsSnapshot | null
  dyStatus: DyAccountState[]
  /** 验证窗口开着 */
  dyVerifying: boolean
  dyLoginOpen: boolean
  set: (patch: Partial<State>) => void
}

export const useStore = create<State>((set) => ({
  auth: null,
  loginOpen: false,
  accounts: null,
  accountRevision: 0,
  showAccountSettings: false,
  view: 'downloads',
  closeAsk: false,
  update: null,
  updateOpen: false,
  settings: null,
  lang: null,
  tasks: [],
  parse: null,
  source: null,
  sourceAccountMid: undefined,
  parsing: false,
  progress: null,
  error: null,
  notice: null,
  watermarkTaskId: null,
  ytParse: null,
  ytParsing: false,
  ytProgress: null,
  ytError: null,
  ytNotice: null,
  ytAccounts: null,
  ytEngine: null,
  ytLoginOpen: false,
  dyParse: null,
  dyParsing: false,
  dyProgress: null,
  dyError: null,
  dyNotice: null,
  dyAccounts: null,
  dyStatus: [],
  dyVerifying: false,
  dyLoginOpen: false,
  set: (patch) => set(patch)
}))

export const api = window.api
/** 和系统有关的文案（访达 / 文件管理器、⌘ / Ctrl 等）；文字是 getter，每次读取都按当前语言取 */
export const sysText = platformText(api.platform)

export function updateAuth(auth: AuthState): void {
  const { accounts, loginTarget, sourceAccountMid, set } = useStore.getState()
  const usesActiveAccount = !accounts || sourceAccountMid === accounts.activeMid
  const stale = usesActiveAccount && sourceAccountMid !== undefined && (!auth.loggedIn || sourceAccountMid !== auth.user.mid)
  set({
    auth,
    ...(auth.loggedIn && !loginTarget ? { loginOpen: false } : {}),
    ...(stale ? { parse: null, source: null, sourceAccountMid: undefined } : {})
  })
}

export function updateAccounts(accounts: AccountState): void {
  const state = useStore.getState()
  if (state.accounts && state.accounts.activeMid !== accounts.activeMid) {
    state.set({ accounts, accountRevision: state.accountRevision + 1, parse: null, source: null,
      sourceAccountMid: undefined, parsing: false, progress: null })
  } else {
    const owner = accounts.accounts.find((account) => account.mid === state.sourceAccountMid)
    const unavailable = owner?.status === 'expired' || owner?.status === 'removed'
    state.set({ accounts, ...(unavailable ? { parse: null, source: null, sourceAccountMid: undefined } : {}) })
  }
}

export function openLogin(target: LoginTarget = { mode: 'add' }): void {
  const state = useStore.getState()
  if (!state.loginOpen) state.set({ loginOpen: true, loginTarget: target })
}

export async function openSource(source: SourceRef, isCurrent: () => boolean): Promise<void> {
  const revision = useStore.getState().accountRevision
  const { result, accountMid } = await api.sources.open(source)
  const { auth, view, parse, parsing, accounts, accountRevision, set } = useStore.getState()
  if (!isCurrent() || view !== 'subs' || parse || parsing || revision !== accountRevision) return
  if (accountMid !== undefined && !(accounts && source.type === 'subscription') && (!auth?.loggedIn || auth.user.mid !== accountMid)) return
  set({ parse: { ...result, defaultSelected: [] }, source, sourceAccountMid: accountMid, error: null, notice: null, progress: null })
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  try {
    useStore.getState().set({ settings: await api.settings.set(patch) })
  } catch (e) {
    useStore.getState().set({ error: (e as Error).message })
  }
}

let parseRequestId = 0

async function runParse(fn: () => Promise<ParseResult>, accountMid?: number): Promise<void> {
  const { set, accountRevision, accounts, auth } = useStore.getState()
  const owner = accountMid ?? accounts?.activeMid ?? (auth?.loggedIn ? auth.user.mid : undefined)
  const requestId = ++parseRequestId
  const isCurrent = (): boolean => requestId === parseRequestId && useStore.getState().accountRevision === accountRevision
  set({ parsing: true, error: null, notice: null, progress: null })
  try {
    const result = await fn()
    if (!isCurrent()) return
    set({ parse: result, source: null, sourceAccountMid: owner })
    if (result.failures?.length) {
      const errors = result.failures.map((f) => f.error).join(t('input.separator'))
      set({ notice: t('input.parseFailures', { count: result.failures.length, errors }) })
    }
  } catch (e) {
    if (isCurrent()) set({ error: (e as Error).message })
  } finally {
    if (isCurrent()) set({ parsing: false, progress: null })
  }
}

export const parseLink = (input: string): Promise<void> => runParse(() => api.parse(input))

export function reopenParseRecord({ input, accountMid }: Pick<ParseRecord, 'input' | 'accountMid'>): Promise<void> {
  useStore.getState().set({ view: 'downloads' })
  return accountMid === undefined ? parseLink(input) : runParse(() => api.parse(input, accountMid), accountMid)
}

export const parseBatch = (inputs: string[]): Promise<void> => runParse(() => api.parseBatch(inputs))

// ---------------- YouTube ----------------

/** 界面当前显示的平台 */
export const useSite = (): Site => useStore((s) => s.settings?.uiSite ?? 'bili')

/**
 * 一键切换平台：只改界面，下载队列、账号、两边各自的解析结果都不动。
 * from 是切换按钮的中心（视口坐标）：支持 View Transitions 时整个界面从那里圆形展开成另一个平台
 */
export function switchSite(site: Site, from?: { x: number; y: number }): Promise<void> {
  const { settings, set } = useStore.getState()
  if (!settings || settings.uiSite === site) return Promise.resolve()
  let saved: Promise<void> | undefined
  // 本地先切过去、再保存：放在一起做，动画回调推迟执行时两边也不会错开；用当时最新的设置，免得盖掉期间别处的修改
  const apply = (): void => {
    const latest = useStore.getState().settings ?? settings
    const next = { ...latest, uiSite: site }
    if (typeof document === 'undefined') set({ settings: next })
    else {
      flushSync(() => set({ settings: next }))
      document.documentElement.dataset.brand = site
    }
    saved = updateSettings({ uiSite: site })
  }
  if (!canAnimateSwitch()) {
    apply()
    return saved!
  }
  const root = document.documentElement
  if (from) {
    root.style.setProperty('--vt-x', `${from.x}px`)
    root.style.setProperty('--vt-y', `${from.y}px`)
    // 圆要盖住离按钮最远的那个角
    const r = Math.hypot(Math.max(from.x, innerWidth - from.x), Math.max(from.y, innerHeight - from.y))
    root.style.setProperty('--vt-r', `${Math.ceil(r)}px`)
  }
  // 展开期间新界面直接用最终配色，不再做颜色渐变
  root.classList.add('vt-site')
  let transition: ViewTransition
  try {
    transition = document.startViewTransition(apply)
  } catch {
    root.classList.remove('vt-site')
    apply()
    return saved!
  }
  void transition.finished.finally(() => root.classList.remove('vt-site')).catch(() => undefined)
  // 回调出错（没执行完）时直接切换，保证一定会切过去
  return transition.updateCallbackDone.then(
    () => saved!,
    () => {
      if (!saved) apply()
      return saved!
    }
  )
}

/** 支持 View Transitions、窗口可见、系统没开“减弱动态效果”时才做切换动画 */
export function canAnimateSwitch(): boolean {
  return typeof document !== 'undefined'
    && typeof document.startViewTransition === 'function'
    // 窗口在后台时浏览器不出新帧，动画回调会一直等着
    && document.visibilityState === 'visible'
    && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

let ytRequestId = 0

async function runYtParse(fn: () => Promise<ParseResult>): Promise<void> {
  const { set } = useStore.getState()
  const requestId = ++ytRequestId
  const isCurrent = (): boolean => requestId === ytRequestId
  set({ ytParsing: true, ytError: null, ytNotice: null, ytProgress: null })
  try {
    const result = await fn()
    if (!isCurrent()) return
    set({ ytParse: result })
    if (result.failures?.length) {
      const errors = result.failures.map((f) => f.error).join(t('input.separator'))
      set({ ytNotice: t('input.parseFailures', { count: result.failures.length, errors }) })
    }
  } catch (e) {
    if (isCurrent()) set({ ytError: (e as Error).message })
  } finally {
    if (isCurrent()) set({ ytParsing: false, ytProgress: null })
  }
}

export const ytParseLink = (input: string): Promise<void> => runYtParse(() => api.yt.parse(input))
export const ytParseBatch = (inputs: string[]): Promise<void> => runYtParse(() => api.yt.parseBatch(inputs))

/** 从解析记录重新打开：切到对应平台的下载页 */
export function reopenYtParseRecord(input: string): Promise<void> {
  useStore.getState().set({ view: 'downloads' })
  return ytParseLink(input)
}

// ---------------- 抖音 ----------------

let dyRequestId = 0

async function runDyParse(fn: () => Promise<ParseResult>): Promise<void> {
  const { set } = useStore.getState()
  const requestId = ++dyRequestId
  const isCurrent = (): boolean => requestId === dyRequestId
  set({ dyParsing: true, dyError: null, dyNotice: null, dyProgress: null })
  try {
    const result = await fn()
    if (!isCurrent()) return
    set({ dyParse: result })
    if (result.failures?.length) {
      const errors = result.failures.map((f) => f.error).join(t('input.separator'))
      set({ dyNotice: t('input.parseFailures', { count: result.failures.length, errors }) })
    }
  } catch (e) {
    if (isCurrent()) set({ dyError: (e as Error).message })
  } finally {
    if (isCurrent()) set({ dyParsing: false, dyProgress: null })
  }
}

export const dyParseLink = (input: string): Promise<void> => runDyParse(() => api.dy.parse(input))
export const dyParseBatch = (inputs: string[]): Promise<void> => runDyParse(() => api.dy.parseBatch(inputs))

/** 从解析记录、订阅和“我的”列表打开：切到下载页解析 */
export function reopenDyParseRecord(input: string): Promise<void> {
  useStore.getState().set({ view: 'downloads' })
  return dyParseLink(input)
}

/** 亮出窗口让用户完成抖音的安全验证 */
export async function verifyDouyin(account: string | null): Promise<void> {
  const { set, dyVerifying } = useStore.getState()
  if (dyVerifying) return
  set({ dyVerifying: true, dyError: null })
  try {
    set({ dyStatus: await api.dy.verify(account) })
  } catch (e) {
    set({ dyError: (e as Error).message })
  } finally {
    set({ dyVerifying: false })
  }
}

/** 按平台重新打开一条解析记录或订阅链接 */
export const reopenOnSite: Record<Site, (record: Pick<ParseRecord, 'input' | 'accountMid'>) => Promise<void>> = {
  bili: reopenParseRecord,
  youtube: (r) => reopenYtParseRecord(r.input),
  douyin: (r) => reopenDyParseRecord(r.input)
}
