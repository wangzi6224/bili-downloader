import { describeError, ToolError } from './format'

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** 触发风控后这么久不再发检索请求，接着请求只会让风控更严，也会牵连下载 */
const COOLDOWN = 30_000
const TIMEOUT = 30_000

interface LaneOptions {
  /** 两次请求之间的最小间隔 */
  gapMs?: number
  cooldownMs?: number
  timeoutMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

/**
 * 检索请求的串行通道：agent 经常并行调用工具，而 B站对搜索、评论这类接口的风控很严，
 * 这里排成一队、保持间隔。biliFetch 没有超时，这里自带，免得一个挂起的请求堵住后面所有调用
 */
export class Lane {
  private tail: Promise<unknown> = Promise.resolve()
  private last = -Infinity
  private coolUntil = 0
  private gapMs: number
  private cooldownMs: number
  private timeoutMs: number
  private now: () => number
  private sleep: (ms: number) => Promise<void>

  constructor(opts: LaneOptions = {}) {
    this.gapMs = opts.gapMs ?? 1000
    this.cooldownMs = opts.cooldownMs ?? COOLDOWN
    this.timeoutMs = opts.timeoutMs ?? TIMEOUT
    this.now = opts.now ?? Date.now
    this.sleep = opts.sleep ?? defaultSleep
  }

  run<T>(fn: () => Promise<T>): Promise<T> {
    const out = this.tail.then(() => this.step(fn))
    // 前一个失败不能影响后面的
    this.tail = out.catch(() => {})
    return out
  }

  private async step<T>(fn: () => Promise<T>): Promise<T> {
    const cooling = this.coolUntil - this.now()
    if (cooling > 0) {
      throw new ToolError('RATE_LIMITED', `刚触发过 B站风控，${Math.ceil(cooling / 1000)} 秒内不再请求`, '等冷却结束再试，不要连续重试')
    }
    const wait = this.last + this.gapMs - this.now()
    if (wait > 0) await this.sleep(wait)
    try {
      return await this.limited(fn)
    } catch (e) {
      if (describeError(e).code === 'RATE_LIMITED') this.coolUntil = this.now() + this.cooldownMs
      throw e
    } finally {
      this.last = this.now()
    }
  }

  /** 超时后放开通道，原请求留在后台自然结束 */
  private limited<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new ToolError('FAILED', 'B站接口长时间没有响应，请稍后再试')), this.timeoutMs)
      fn()
        .then(resolve, reject)
        .finally(() => clearTimeout(timer))
    })
  }
}

/** 带过期时间的缓存。存的是 Promise，同一个 key 的并行调用只请求一次；失败的不留下 */
export class TtlCache<T> {
  private entries = new Map<string, { at: number; value: Promise<T> }>()

  constructor(
    private ttlMs: number,
    private max: number,
    private now: () => number = Date.now
  ) {}

  get(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key)
    if (hit && this.now() - hit.at < this.ttlMs) return hit.value
    const value = load()
    this.entries.delete(key)
    this.entries.set(key, { at: this.now(), value })
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key)
    })
    // Map 按插入顺序遍历，超出上限时丢掉最早的
    if (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value!)
    return value
  }

  delete(key: string): void {
    this.entries.delete(key)
  }
}
