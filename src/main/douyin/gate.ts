// 按账号排队发请求：一次一个、间隔一段时间；被要求验证、限流、登录失效时挡住后续请求
import { DyCooldownError, DyLoginError, DyVerifyError } from './errors'
import { t } from '@shared/i18n'
import { AbortError } from '../download/errors'
import type { DyRequest } from './transport/types'

export type DyGateState = 'ok' | 'verify' | 'cooling' | 'expired'

export interface DyGateSnapshot {
  state: DyGateState
  /** 冷却结束时间 */
  until?: number
}

export interface GateDeps {
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  random?: () => number
  /** 两个请求之间至少隔多久，另加 0～jitter 的随机量 */
  interval?: number
  jitter?: number
  /** 状态变化（包括冷却结束） */
  onChange?: (account: string | null, snapshot: DyGateSnapshot) => void
}

/** 连续被限流时依次等这么久 */
const COOLDOWNS = [5, 15, 60].map((m) => m * 60_000)

interface Entry {
  state: DyGateState
  until: number
  level: number
  probe?: DyRequest
  /** 上一个请求开始的时间 */
  last: number
  busy: boolean
  /** 排队的请求：界面发起的插在后台任务前面 */
  waiting: { background: boolean; start: () => void }[]
  timer?: ReturnType<typeof setTimeout>
}

export interface RunOptions {
  /** 订阅检查、批量下载取详情这类后台请求 */
  background?: boolean
  signal?: AbortSignal
}

export class DouyinGate {
  private entries = new Map<string, Entry>()
  private now: () => number
  private sleep: (ms: number) => Promise<void>
  private random: () => number

  constructor(private deps: GateDeps = {}) {
    this.now = deps.now ?? Date.now
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.random = deps.random ?? Math.random
  }

  private entry(account: string | null): Entry {
    const key = account ?? ''
    let e = this.entries.get(key)
    if (!e) this.entries.set(key, (e = { state: 'ok', until: 0, level: 0, last: -Infinity, busy: false, waiting: [] }))
    return e
  }

  /** 当前状态；冷却到时间了就算 ok */
  snapshot(account: string | null): DyGateSnapshot {
    const e = this.entry(account)
    if (e.state === 'cooling') return this.now() < e.until ? { state: 'cooling', until: e.until } : { state: 'ok' }
    return { state: e.state }
  }

  /** 触发验证的请求 */
  probe(account: string | null): DyRequest | undefined {
    return this.entry(account).probe
  }

  /** 状态不允许发请求时抛对应的错误 */
  check(account: string | null): void {
    const s = this.snapshot(account)
    if (s.state === 'verify') throw new DyVerifyError(this.probe(account))
    if (s.state === 'expired') throw new DyLoginError(t('dy.errExpired'))
    if (s.state === 'cooling') throw new DyCooldownError(s.until!, this.now())
  }

  async run<T>(account: string | null, task: () => Promise<T>, o: RunOptions = {}): Promise<T> {
    this.check(account)
    const e = this.entry(account)
    await this.turn(e, o)
    try {
      // 排队期间状态可能变了
      this.check(account)
      const wait = e.last + (this.deps.interval ?? 2000) + this.random() * (this.deps.jitter ?? 1000) - this.now()
      if (wait > 0) await this.sleep(wait)
      if (o.signal?.aborted) throw new AbortError()
      e.last = this.now()
      return await task()
    } finally {
      this.release(e)
    }
  }

  private turn(e: Entry, o: RunOptions): Promise<void> {
    if (o.signal?.aborted) return Promise.reject(new AbortError())
    if (!e.busy) {
      e.busy = true
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      const ticket = {
        background: Boolean(o.background),
        start: (): void => {
          o.signal?.removeEventListener('abort', cancel)
          resolve()
        }
      }
      const cancel = (): void => {
        e.waiting.splice(e.waiting.indexOf(ticket), 1)
        reject(new AbortError())
      }
      o.signal?.addEventListener('abort', cancel, { once: true })
      const at = ticket.background ? -1 : e.waiting.findIndex((w) => w.background)
      if (at < 0) e.waiting.push(ticket)
      else e.waiting.splice(at, 0, ticket)
    })
  }

  private release(e: Entry): void {
    const next = e.waiting.shift()
    if (next) next.start()
    else e.busy = false
  }

  private set(account: string | null, patch: Partial<Entry>): void {
    const e = this.entry(account)
    clearTimeout(e.timer)
    e.timer = undefined
    Object.assign(e, patch)
    this.deps.onChange?.(account, this.snapshot(account))
  }

  /** 请求成功：恢复正常，限流等级归零 */
  ok(account: string | null): void {
    const e = this.entry(account)
    if (e.state === 'ok' && !e.level) return
    this.set(account, { state: 'ok', level: 0, probe: undefined })
  }

  requireVerify(account: string | null, probe?: DyRequest): void {
    this.set(account, { state: 'verify', probe })
  }

  expire(account: string | null): void {
    this.set(account, { state: 'expired', probe: undefined })
  }

  /** 进入冷却，返回结束时间；冷却结束时通知一次 */
  cool(account: string | null): number {
    const e = this.entry(account)
    const length = COOLDOWNS[Math.min(e.level, COOLDOWNS.length - 1)]
    const until = this.now() + length
    this.set(account, { state: 'cooling', until, level: e.level + 1 })
    const entry = this.entry(account)
    entry.timer = setTimeout(() => {
      entry.timer = undefined
      this.deps.onChange?.(account, { state: 'ok' })
    }, length)
    entry.timer.unref?.()
    return until
  }

  /** 账号重新登录或删除：丢掉记录的状态 */
  reset(account: string | null): void {
    this.set(account, { state: 'ok', level: 0, probe: undefined })
  }
}
