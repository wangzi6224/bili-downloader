import { create } from 'zustand'
import { t, type Lang } from '@shared/i18n'
import type { AccountState, AuthState, LoginTarget, ParseRecord, ParseResult, Settings, SourceRef, TaskInfo, UpdateState } from '@shared/types'
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
