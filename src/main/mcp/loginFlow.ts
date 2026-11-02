import { EventEmitter } from 'node:events'
import type { AuthState, BrowserProfile } from '@shared/types'
import { ImportError } from '../auth/importError'
import { BiliError } from '../bili/http'

/**
 * Agent 发起的登录：优先导入浏览器里的登录信息，不行再让用户扫码。
 * 导入可能要等钥匙串授权、等用户回答对话框，比一次工具调用长得多，所以在后台跑，
 * 工具调用只是发起和等待（wait），结果在 snapshot 里。同一时间只有一个流程。
 */

export type LoginReason =
  | 'locked'
  | 'app_bound'
  | 'blocked'
  | 'no_login'
  | 'expired'
  | 'keychain_denied'
  | 'network'
  | 'declined'
  | 'confirm_timeout'
  | 'close_failed'
  | 'window_closed'
  | 'not_found'
  | 'failed'

export type LoginMethod = 'browser' | 'qr'

export interface LoginDeps {
  checkAuth: () => Promise<AuthState>
  authState: () => AuthState
  /** 登录、退出登录时回调；只注册一次，流程和应用同生共死 */
  onLoginChanged: (fn: () => void) => void
  listBrowsers: () => BrowserProfile[]
  importBrowser: (id: string, opts: { shouldApply: () => boolean }) => Promise<AuthState>
  /** 打开扫码窗口，窗口关闭时 resolve */
  openQr: () => Promise<AuthState>
  isQrOpen: () => boolean
  isLocked: (id: string) => boolean
  canClose: (key: string) => boolean
  confirmClose: (browser: string, appBound: boolean, signal: AbortSignal) => Promise<'close' | 'qr' | 'cancel'>
  closeBrowser: (key: string, isLocked: () => boolean, alive: () => boolean) => Promise<boolean>
  /** 只有 macOS 有这个系统设置页 */
  openPermissionSettings?: () => void
}

type Phase = 'idle' | 'checking' | 'importing' | 'awaiting_confirm' | 'closing' | 'qr_waiting' | 'failed'

export interface LoginSource {
  id: string
  browser: string
  profile: string
}

export interface LoginAttempt {
  browser: string
  profile: string
  reason: LoginReason
}

export interface LoginSnapshot {
  status: 'logged_in' | 'idle' | 'in_progress' | 'waiting_user' | 'failed'
  step?: 'checking' | 'importing' | 'confirm_close' | 'closing_browser' | 'qr'
  reason?: LoginReason
  message?: string
  source?: LoginSource
  tried: LoginAttempt[]
  alsoAvailable: LoginSource[]
  auth: AuthState
}

const STEPS: Partial<Record<Phase, LoginSnapshot['step']>> = {
  checking: 'checking',
  importing: 'importing',
  awaiting_confirm: 'confirm_close',
  closing: 'closing_browser',
  qr_waiting: 'qr'
}
const STATUSES: Record<Phase, Exclude<LoginSnapshot['status'], 'logged_in'>> = {
  idle: 'idle',
  checking: 'in_progress',
  importing: 'in_progress',
  closing: 'in_progress',
  awaiting_confirm: 'waiting_user',
  qr_waiting: 'waiting_user',
  failed: 'failed'
}
const MOVING = new Set<Phase>(['checking', 'importing', 'closing'])

/** 一次流程最多试这么多个配置档，免得挨个弹授权 */
const MAX_ATTEMPTS = 3
/** 对话框没人理就收起来，不让流程一直挂着 */
const CONFIRM_TIMEOUT = 120_000

export const browserKey = (p: BrowserProfile): string => p.id.split('::')[0]

const toSource = (p: BrowserProfile): LoginSource => ({ id: p.id, browser: p.browser, profile: p.profile })

/** blocked 的占位记录 id 形如 chrome::，不是真的配置档 */
const placeholder = (p: BrowserProfile): boolean => p.id.endsWith('::')

/** 保持枚举顺序（Chrome 在最前），同一浏览器里最近用过的配置档排前面 */
export function rankProfiles(list: BrowserProfile[]): BrowserProfile[] {
  const order = new Map<string, number>()
  for (const p of list) if (!order.has(browserKey(p))) order.set(browserKey(p), order.size)
  return [...list].sort(
    (a, b) => order.get(browserKey(a))! - order.get(browserKey(b))! || Number(Boolean(b.lastUsed)) - Number(Boolean(a.lastUsed))
  )
}

const readable = (p: BrowserProfile): boolean => p.hasBiliLogin && !p.locked && !p.blocked

function reasonOf(e: unknown): LoginReason {
  if (e instanceof ImportError) return e.code === 'cancelled' ? 'failed' : e.code
  return e instanceof BiliError ? 'network' : 'failed'
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** 换下一个配置档也没用，还会多弹一次授权 */
const STOPS = new Set<LoginReason>(['keychain_denied', 'network'])

export class LoginFlow extends EventEmitter {
  private phase: Phase = 'idle'
  /** 每次发起流程、或者登录状态变化时加一，旧流程的异步结果据此作废 */
  private generation = 0
  /** 状态变一次加一，wait 据此判断“开始等之后有没有变过” */
  private version = 0
  private reason?: LoginReason
  private message?: string
  private source?: LoginSource
  private tried: LoginAttempt[] = []
  private alsoAvailable: LoginSource[] = []
  private dismissDialog?: () => void
  /** Cookie 替换已经开始，中止不了：清分区时不能开登录窗，这期间的登录变化就是这次导入 */
  private swap?: Promise<void>

  constructor(private deps: LoginDeps) {
    super()
    deps.onLoginChanged(() => this.loginChanged())
  }

  private loggedIn(): boolean {
    return this.deps.authState().loggedIn
  }

  /** 确认中的内存状态可能是过期的，要等 checkAuth 的结果 */
  private done(): boolean {
    return this.phase !== 'checking' && this.loggedIn()
  }

  private loginChanged(): void {
    // checkAuth 发现登录已失效：这正是流程要确认的事，流程接着往下走
    if (this.phase === 'checking' && !this.loggedIn()) return this.touch()
    // 导入成功时这里比 importBrowser 返回得早，来源要留着；其他情况下登录和这次导入无关
    if (!this.swap) {
      this.source = undefined
      this.alsoAvailable = []
    }
    this.generation++
    this.dismissDialog?.()
    if (this.loggedIn()) {
      this.tried = []
      this.reason = this.message = undefined
    }
    this.phase = 'idle'
    this.touch()
  }

  private touch(): void {
    this.version++
    this.emit('change')
  }

  private enter(phase: Phase): void {
    this.phase = phase
    this.touch()
  }

  private fail(reason: LoginReason, message: string): void {
    this.reason = reason
    this.message = message
    this.enter('failed')
  }

  private reset(): number {
    this.dismissDialog?.()
    this.reason = this.message = this.source = undefined
    this.tried = []
    this.alsoAvailable = []
    return ++this.generation
  }

  /** 列出本机浏览器要读各家的 Cookie 库，是同步的，只在 agent 明确要看时才调 */
  browsers(): BrowserProfile[] {
    return this.deps.listBrowsers()
  }

  snapshot(): LoginSnapshot {
    const done = this.done()
    // 中途某个配置档失败不代表这次登录失败，只有流程结束才报原因
    const failed = this.phase === 'failed' && !done
    return {
      status: done ? 'logged_in' : STATUSES[this.phase],
      step: done ? undefined : STEPS[this.phase],
      reason: failed ? this.reason : undefined,
      message: failed ? this.message : undefined,
      source: this.source,
      tried: this.tried,
      alsoAvailable: this.alsoAvailable,
      auth: this.deps.authState()
    }
  }

  /** 这些阶段里再次要求导入就是同一个流程 */
  private get active(): boolean {
    return this.phase !== 'idle' && this.phase !== 'failed'
  }

  /**
   * 发起登录，立即返回，全部在后台跑：确认登录状态也可能卡在网络上，wait_seconds 要管得住。
   * 已登录就什么都不做，切换账号留给用户在应用里操作
   */
  start(method: LoginMethod, source?: string): void {
    if (method === 'browser' && this.active) return
    const gen = this.reset()
    this.enter('checking')
    void this.run(gen, method, source).catch((e) => {
      if (gen === this.generation) this.fail('failed', messageOf(e))
    })
  }

  private async run(gen: number, method: LoginMethod, source?: string): Promise<void> {
    // 上一次替换还在清写 Cookie 时，确认登录和开登录窗都会撞上它
    await this.swap
    if (gen !== this.generation) return
    let auth: AuthState
    try {
      // 刚启动时内存里的状态还没确认过，不能信
      auth = await this.deps.checkAuth()
    } catch (e) {
      if (gen === this.generation) this.fail('network', messageOf(e))
      return
    }
    if (gen !== this.generation) return
    if (auth.loggedIn) return this.enter('idle')
    if (method === 'qr') return this.startQr(gen)
    this.enter('importing')
    await this.runBrowser(gen, source)
  }

  private startQr(gen: number): void {
    this.enter('qr_waiting')
    this.deps.openQr().then(
      (s) => {
        if (gen !== this.generation) return
        if (s.loggedIn) this.enter('idle')
        else this.fail('window_closed', '登录窗口已关闭，但还没有登录成功')
      },
      (e) => {
        if (gen === this.generation) this.fail('failed', messageOf(e))
      }
    )
  }

  private async runBrowser(gen: number, source?: string): Promise<void> {
    // 用户正在登录窗里扫码，这时替换 Cookie 会打断登录
    if (this.deps.isQrOpen()) return this.startQr(gen)
    const profiles = rankProfiles(this.deps.listBrowsers())
    if (source) return this.runChosen(gen, profiles, source)
    const ready = profiles.filter(readable)
    if (await this.importFirst(gen, ready)) return
    if (this.phase === 'failed') return
    // 读得到的都试过了才去打扰用户关浏览器；启用了应用绑定加密的多半关了也读不出，不主动提
    const closable = profiles.find((p) => p.locked && !p.appBound && !placeholder(p) && this.deps.canClose(browserKey(p)))
    if (closable) return this.closeThenImport(gen, closable)
    this.failNothing(profiles)
  }

  /** 用户点名了浏览器：只看它，缺权限时直接带用户去授权 */
  private async runChosen(gen: number, profiles: BrowserProfile[], source: string): Promise<void> {
    const matches = profiles.filter((p) => p.id === source || browserKey(p) === source)
    if (!matches.length) return this.fail('not_found', `没有找到“${source}”，可以用 get_login_status include_browsers=true 查看本机的浏览器`)
    const ready = matches.filter(readable)
    if (await this.importFirst(gen, ready) || this.phase === 'failed') return
    if (ready.length) return this.fail(this.reason!, this.message!)
    const locked = matches.find((p) => p.locked)
    if (locked) {
      if (this.deps.canClose(browserKey(locked))) return this.closeThenImport(gen, locked)
      return this.fail('locked', `${locked.browser} 正在运行，需要用户手动退出后再导入`)
    }
    if (matches.some((p) => p.blocked)) {
      this.deps.openPermissionSettings?.()
      return this.fail('blocked', `没有权限读取 ${matches[0].browser} 的数据`)
    }
    this.fail('no_login', `${matches[0].browser} 里没有 B站登录信息`)
  }

  /** 依次导入；成功或流程作废返回 true。换个配置档也没用时进入 failed；其余失败由调用方决定还有没有后手 */
  private async importFirst(gen: number, list: BrowserProfile[]): Promise<boolean> {
    for (const [i, p] of list.slice(0, MAX_ATTEMPTS).entries()) {
      this.source = toSource(p)
      this.alsoAvailable = list.slice(i + 1).map(toSource)
      let finishSwap: (() => void) | undefined
      const shouldApply = (): boolean => {
        // 读浏览器可能等了很久：用户可能已经登录，或者打开了登录窗
        if (gen !== this.generation || this.loggedIn() || this.deps.isQrOpen()) return false
        this.swap = new Promise((resolve) => (finishSwap = resolve))
        return true
      }
      try {
        await this.deps.importBrowser(p.id, { shouldApply })
        if (gen === this.generation) this.enter('idle')
        return true
      } catch (e) {
        if (gen !== this.generation) return true
        if (e instanceof ImportError && e.code === 'cancelled' && this.deps.isQrOpen()) {
          this.source = undefined
          this.alsoAvailable = []
          this.startQr(gen)
          return true
        }
        const reason = reasonOf(e)
        this.tried.push({ browser: p.browser, profile: p.profile, reason })
        this.source = undefined
        this.alsoAvailable = []
        this.reason = reason
        this.message = messageOf(e)
        if (STOPS.has(reason)) {
          this.enter('failed')
          return false
        }
      } finally {
        // 已作废的导入没开始过替换，不能清掉新流程的标记
        if (finishSwap) {
          this.swap = undefined
          finishSwap()
        }
      }
    }
    return false
  }

  /** 没东西可导时给出最有用的原因 */
  private failNothing(profiles: BrowserProfile[]): void {
    if (this.tried.length) return this.fail(this.reason!, this.message!)
    const locked = profiles.find((p) => p.locked)
    if (locked?.appBound) return this.fail('app_bound', `${locked.browser} 启用了应用绑定加密，退出后也很可能读不出登录信息`)
    if (locked) return this.fail('locked', `${locked.browser} 正在运行，需要用户手动退出后再导入`)
    const blocked = profiles.find((p) => p.blocked)
    if (blocked && !profiles.some((p) => !p.blocked)) return this.fail('blocked', `没有权限读取 ${blocked.browser} 的数据`)
    if (!profiles.length) return this.fail('not_found', '没有找到支持的浏览器')
    this.fail('no_login', blocked ? `能读取的浏览器里都没有 B站登录信息，${blocked.browser} 没有读取权限` : '找到的浏览器里都没有 B站登录信息')
  }

  private async confirm(p: BrowserProfile): Promise<'close' | 'qr' | 'cancel' | 'timeout'> {
    const dialog = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      dialog.abort()
    }, CONFIRM_TIMEOUT)
    this.dismissDialog = () => dialog.abort()
    try {
      const choice = await this.deps.confirmClose(p.browser, Boolean(p.appBound), dialog.signal)
      return timedOut ? 'timeout' : choice
    } finally {
      clearTimeout(timer)
      this.dismissDialog = undefined
    }
  }

  private async closeThenImport(gen: number, p: BrowserProfile): Promise<void> {
    this.source = toSource(p)
    this.enter('awaiting_confirm')
    let choice: Awaited<ReturnType<LoginFlow['confirm']>>
    try {
      choice = await this.confirm(p)
    } catch (e) {
      if (gen === this.generation) this.fail('failed', messageOf(e))
      return
    }
    if (gen !== this.generation) return
    this.source = undefined
    if (choice === 'qr') return this.startQr(gen)
    if (choice === 'timeout') return this.fail('confirm_timeout', `用户没有回答是否关闭 ${p.browser} 的对话框`)
    if (choice === 'cancel') return this.fail('declined', `用户不同意关闭 ${p.browser}`)

    const key = browserKey(p)
    this.enter('closing')
    const closed = await this.deps.closeBrowser(
      key,
      () => this.deps.isLocked(p.id),
      () => gen === this.generation
    )
    if (gen !== this.generation) return
    if (!closed) return this.fail('close_failed', `没能关闭 ${p.browser}`)

    // 关之前读不到，现在才知道里面有没有登录、最近用的是哪个配置档
    this.enter('importing')
    const again = rankProfiles(this.deps.listBrowsers()).filter((x) => browserKey(x) === key)
    const ready = again.filter(readable)
    if (await this.importFirst(gen, ready) || this.phase === 'failed') return
    if (ready.length) return this.fail(this.reason!, this.message!)
    this.fail('no_login', `${p.browser} 已关闭，但里面没有 B站登录信息`)
  }

  /** 等到已登录、失败或需要用户操作；开始等时已经在等用户，就等状态变化 */
  async wait(ms: number): Promise<void> {
    const from = this.version
    const settled = (): boolean => this.done() || this.phase === 'failed' || (this.version !== from && !MOVING.has(this.phase))
    if (ms <= 0 || settled()) return
    await new Promise<void>((resolve) => {
      const check = (): void => {
        if (settled()) finish()
      }
      const finish = (): void => {
        clearTimeout(timer)
        this.off('change', check)
        resolve()
      }
      const timer = setTimeout(finish, ms)
      this.on('change', check)
    })
  }

  /** 应用退出：作废进行中的流程，收起对话框，迟到的结果不再动手 */
  dispose(): void {
    this.reset()
    this.phase = 'idle'
    this.touch()
  }
}
