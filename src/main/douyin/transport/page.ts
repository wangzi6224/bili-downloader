// 页面桥：每个账号一个按需打开的隐藏网页，在网页里用它自己的 fetch 发请求，签名由网页脚本补上。
// 这里只有流程，窗口本身在 window.ts，测试时换成假的
import { t } from '@shared/i18n'
import { AbortError } from '../../download/errors'
import { DyError, DyVerifyError } from '../errors'
import { DY_PATHS, type DouyinTransport, type DyRawResponse, type DyRequest, type DyRequestOptions } from './types'

/** 一个网页窗口 */
export interface DyWindow {
  /** 打开入口页，DOM 就绪或超时后返回 */
  load(): Promise<void>
  evaluate<T>(code: string): Promise<T>
  /** 平时拦掉图片、字体、样式省流量和内存；要给用户看时得放开 */
  setBlocking(blocking: boolean): void
  show(title: string): void
  /** 用户关掉了亮出来的窗口 */
  onUserClose(fn: () => void): void
  isAlive(): boolean
  destroy(): void
}

export type WindowFactory = (account: string | null) => Promise<DyWindow>

export interface BridgeOptions {
  sleep?: (ms: number) => Promise<void>
  /** 多久没有请求就关掉网页 */
  idleMs?: number
  readyTimeout?: number
  requestTimeout?: number
  /** 等用户完成验证最多多久 */
  verifyTimeout?: number
  /** 请求进行中每隔多久看一次页面 */
  pollMs?: number
}

const COMMON: Record<string, string> = { device_platform: 'webapp', aid: '6383', channel: 'channel_pc_web' }
const MAX_BODY = 30 * 1024 * 1024
/** 一次页面状态检查最多等多久 */
const CHECK_MS = 5000

/** 网页脚本就绪后 fetch 会被它接管 */
export const READY_SCRIPT = `!/\\[native code\\]/.test(String(window.fetch))`

/** 页面上有没有看得见的验证框；常驻的 0×0 预加载框不算 */
export const CAPTCHA_SCRIPT = `[...document.querySelectorAll('#captcha_container')].some((e) => {
  const r = e.getBoundingClientRect()
  const s = getComputedStyle(e)
  return r.width > 50 && r.height > 50 && s.display !== 'none' && s.visibility !== 'hidden'
})`

/** 在页面里发请求的脚本。路径只能是名单里的接口，参数都经过 JSON 序列化 */
export function requestScript(req: DyRequest, timeoutMs: number): string {
  const path = Object.hasOwn(DY_PATHS, req.endpoint) ? DY_PATHS[req.endpoint] : undefined
  if (!path) throw new Error(`unknown endpoint ${req.endpoint}`)
  const url = `${path}?${new URLSearchParams({ ...COMMON, ...req.query })}`
  const init = {
    method: req.method ?? 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json, text/plain, */*',
      ...(req.body ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } : {})
    },
    ...(req.body ? { body: new URLSearchParams(req.body).toString() } : {})
  }
  return `(async () => {
  try {
    const res = await fetch(${JSON.stringify(url)}, { ...${JSON.stringify(init)}, signal: AbortSignal.timeout(${Math.round(timeoutMs)}) })
    const body = await res.text()
    return body.length > ${MAX_BODY} ? { error: 'response too large' } : { status: res.status, body }
  } catch (e) {
    return { error: String(e) }
  }
})()`
}

type ScriptResult = { status: number; body: string } | { error: string }

interface Slot {
  window: Promise<DyWindow>
  /** 正在用这个网页的请求数 */
  active: number
  idle?: ReturnType<typeof setTimeout>
}

export class PageBridge implements DouyinTransport {
  private slots = new Map<string, Slot>()
  /** 正在让用户验证的窗口 */
  private checking = new Map<string, DyWindow>()

  constructor(
    private open: WindowFactory,
    private o: BridgeOptions = {}
  ) {}

  private sleep(ms: number): Promise<void> {
    return this.o.sleep ? this.o.sleep(ms) : new Promise((r) => setTimeout(r, ms))
  }

  /** 打开网页并等脚本就绪 */
  private async prepare(account: string | null, blocking: boolean): Promise<DyWindow> {
    let win: DyWindow | undefined
    try {
      win = await this.open(account)
      win.setBlocking(blocking)
      await win.load()
      const step = 500
      for (let waited = 0; waited <= (this.o.readyTimeout ?? 25_000); waited += step) {
        const ready = await this.evaluate<boolean>(win, READY_SCRIPT, CHECK_MS).catch(() => {
          // 脚本一直没返回时，等掉的时间也要算进总时限
          waited += CHECK_MS
          return false
        })
        if (ready) return win
        await this.sleep(step)
      }
      throw new Error(t('dy.errTimeout'))
    } catch (e) {
      win?.destroy()
      throw new DyError(t('dy.errPage', { reason: e instanceof Error ? e.message : String(e) }))
    }
  }

  /** 网页重载或导航时脚本的结果永远回不来，主进程这边要自己限时 */
  private evaluate<T>(win: DyWindow, code: string, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout>
    const limit = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new DyError(t('dy.errTimeout'))), timeoutMs)
    })
    return Promise.race([win.evaluate<T>(code), limit]).finally(() => clearTimeout(timer))
  }

  private async acquire(account: string | null): Promise<{ slot: Slot; win: DyWindow }> {
    const key = account ?? ''
    let slot = this.slots.get(key)
    if (slot) {
      const existing = await slot.window.catch(() => undefined)
      if (this.slots.get(key) !== slot || !existing?.isAlive()) {
        if (this.slots.get(key) === slot) this.slots.delete(key)
        return this.acquire(account)
      }
    } else {
      slot = { window: this.prepare(account, true), active: 0 }
      this.slots.set(key, slot)
      slot.window.catch(() => {
        if (this.slots.get(key) === slot) this.slots.delete(key)
      })
    }
    clearTimeout(slot.idle)
    slot.active++
    try {
      return { slot, win: await slot.window }
    } catch (e) {
      slot.active--
      throw e
    }
  }

  private release(account: string | null, slot: Slot): void {
    if (--slot.active > 0 || this.slots.get(account ?? '') !== slot) return
    slot.idle = setTimeout(() => this.dispose(account), this.o.idleMs ?? 4 * 60_000)
    slot.idle.unref?.()
  }

  async request(req: DyRequest, o: DyRequestOptions): Promise<DyRawResponse> {
    if (o.signal?.aborted) throw new AbortError()
    const timeout = this.o.requestTimeout ?? 20_000
    const code = requestScript(req, timeout)
    const { slot, win } = await this.acquire(o.account)
    try {
      let done: { value: ScriptResult } | { error: unknown } | undefined
      void this.evaluate<ScriptResult>(win, code, timeout + 5000).then(
        (value) => (done = { value }),
        (error: unknown) => (done = { error })
      )
      const step = this.o.pollMs ?? 500
      // 弹出验证时网页脚本会把请求一直挂着：边等边看页面上有没有验证框
      for (let waited = step; ; waited += step) {
        await this.sleep(step)
        if (o.signal?.aborted) throw new AbortError()
        const finished = done as { value: ScriptResult } | { error: unknown } | undefined
        if (finished && 'value' in finished && 'status' in finished.value) return finished.value
        if (finished || waited >= 2000) {
          const captcha = await this.evaluate<boolean>(win, CAPTCHA_SCRIPT, 3000).catch(() => false)
          if (captcha && (!finished || 'error' in finished || 'error' in finished.value)) {
            this.dispose(o.account)
            throw new DyVerifyError(req)
          }
        }
        if (finished) {
          // 网页状态不对了，下次重新打开
          this.dispose(o.account)
          if ('error' in finished) throw finished.error
          throw new DyError(t('dy.errNetwork', { reason: (finished.value as { error: string }).error }))
        }
      }
    } finally {
      this.release(o.account, slot)
    }
  }

  async verify(account: string | null, probe: DyRequest, signal?: AbortSignal): Promise<DyRawResponse> {
    this.dispose(account)
    const timeout = this.o.verifyTimeout ?? 5 * 60_000
    const code = requestScript(probe, timeout)
    const key = account ?? ''
    const win = await this.prepare(account, false)
    this.checking.set(key, win)
    try {
      let closed = false
      win.onUserClose(() => (closed = true))
      let done: { value: ScriptResult } | { error: unknown } | undefined
      void this.evaluate<ScriptResult>(win, code, timeout).then(
        (value) => (done = { value }),
        (error: unknown) => (done = { error })
      )
      let shown = false
      const step = this.o.pollMs ?? 500
      for (let waited = step; ; waited += step) {
        await this.sleep(step)
        if (signal?.aborted) throw new AbortError()
        if (closed || !win.isAlive()) throw new DyError(t('dy.errVerifyClosed'))
        const finished = done as { value: ScriptResult } | { error: unknown } | undefined
        if (finished) {
          if ('error' in finished) throw finished.error
          if ('status' in finished.value) return finished.value
          throw new DyError(t('dy.errNetwork', { reason: finished.value.error }))
        }
        if (!shown && waited >= 1000 && (await this.evaluate<boolean>(win, CAPTCHA_SCRIPT, 3000).catch(() => false))) {
          shown = true
          win.show(t('dy.verifyTitle'))
        }
      }
    } finally {
      if (this.checking.get(key) === win) this.checking.delete(key)
      win.destroy()
    }
  }

  dispose(account?: string | null): void {
    // 关掉全部（退出应用、关主窗口）时，亮着的验证窗口也要关，否则会拦住退出
    if (account === undefined) for (const win of this.checking.values()) win.destroy()
    const keys = account === undefined ? [...this.slots.keys()] : [account ?? '']
    for (const key of keys) {
      const slot = this.slots.get(key)
      if (!slot) continue
      this.slots.delete(key)
      clearTimeout(slot.idle)
      void slot.window.then((w) => w.destroy()).catch(() => undefined)
    }
  }
}
