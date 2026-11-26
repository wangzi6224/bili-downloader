import { afterEach, describe, expect, it, vi } from 'vitest'
import { AbortError } from '../../download/errors'
import { DyError, DyVerifyError } from '../errors'
import { CAPTCHA_SCRIPT, PageBridge, READY_SCRIPT, requestScript, type BridgeOptions, type DyWindow } from './page'
import type { DyRequest } from './types'

const REQ: DyRequest = { endpoint: 'detail', query: { aweme_id: '700000000000000001' } }
const OK = { status: 200, body: '{"status_code":0}' }
const forever = (): Promise<never> => new Promise<never>(() => undefined)

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((a, b) => {
    resolve = a
    reject = b
  })
  return { promise, resolve, reject }
}

interface Behavior {
  ready?: () => unknown
  captcha?: () => unknown
  fetch?: (code: string) => unknown
  load?: () => Promise<void>
}

/** 假的网页窗口：按脚本内容决定返回什么 */
function fakeWindow(b: Behavior = {}) {
  let userClose: (() => void) | undefined
  let alive = true
  const win = {
    load: vi.fn(b.load ?? (async () => undefined)),
    evaluate: vi.fn(async (code: string): Promise<unknown> => {
      if (code === READY_SCRIPT) return b.ready ? b.ready() : true
      if (code === CAPTCHA_SCRIPT) return b.captcha ? b.captcha() : false
      return b.fetch ? b.fetch(code) : OK
    }),
    setBlocking: vi.fn(),
    show: vi.fn(),
    onUserClose: vi.fn((fn: () => void) => {
      userClose = fn
    }),
    isAlive: vi.fn(() => alive),
    destroy: vi.fn(() => {
      alive = false
    }),
    closeByUser: () => userClose?.(),
    die: () => {
      alive = false
    },
    captchaChecks: () => win.evaluate.mock.calls.filter(([code]) => code === CAPTCHA_SCRIPT).length
  }
  return win
}
type Fake = ReturnType<typeof fakeWindow>

/** sleep 换成让出一个宏任务：页面脚本的结果一定先到，时间只记不等 */
function make(behaviors: Behavior | ((n: number) => Behavior) = {}, options: BridgeOptions = {}, onSleep?: (n: number, wins: Fake[]) => void) {
  const wins: Fake[] = []
  const sleeps: number[] = []
  const open = vi.fn(async (_account: string | null): Promise<DyWindow> => {
    const win = fakeWindow(typeof behaviors === 'function' ? behaviors(wins.length) : behaviors)
    wins.push(win)
    return win as unknown as DyWindow
  })
  const sleep = vi.fn(async (ms: number) => {
    sleeps.push(ms)
    onSleep?.(sleeps.length, wins)
    await new Promise<void>((r) => setImmediate(r))
  })
  return { bridge: new PageBridge(open, { sleep, ...options }), open, wins, sleeps, sleep }
}

/** 用默认的 sleep，配合假计时器 */
function timed(behavior: Behavior = {}, options: BridgeOptions = {}) {
  const wins: Fake[] = []
  const open = vi.fn(async (_account: string | null): Promise<DyWindow> => {
    const win = fakeWindow(behavior)
    wins.push(win)
    return win as unknown as DyWindow
  })
  return { bridge: new PageBridge(open, options), open, wins }
}

afterEach(() => vi.useRealTimers())

describe('requestScript', () => {
  const run = (code: string, fetch: (url: string, init: RequestInit) => Promise<unknown>): Promise<unknown> =>
    new Function('fetch', `return ${code}`)(fetch) as Promise<unknown>
  const response = (status: number, body: string) => async () => ({ status, text: async () => body })

  it('GET：拼上通用参数和请求参数，带 cookie，不带请求体', async () => {
    const fetch = vi.fn(response(200, 'hello'))
    expect(await run(requestScript(REQ, 1234.6), fetch)).toEqual({ status: 200, body: 'hello' })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    const parsed = new URL(url, 'https://www.douyin.com')
    expect(parsed.pathname).toBe('/aweme/v1/web/aweme/detail/')
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      device_platform: 'webapp',
      aid: '6383',
      channel: 'channel_pc_web',
      aweme_id: '700000000000000001'
    })
    expect(init).toMatchObject({ method: 'GET', credentials: 'include', headers: { Accept: 'application/json, text/plain, */*' } })
    expect(init).not.toHaveProperty('body')
    expect(init.headers).not.toHaveProperty('Content-Type')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(requestScript(REQ, 1234.6)).toContain('AbortSignal.timeout(1235)')
  })

  it('POST：参数编码成表单', async () => {
    const fetch = vi.fn(response(200, ''))
    await run(requestScript({ endpoint: 'collection', method: 'POST', body: { cursor: '0', count: '18' } }, 1000), fetch)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/aweme/v1/web/aweme/listcollection/?device_platform=webapp&aid=6383&channel=channel_pc_web')
    expect(init).toMatchObject({ method: 'POST', body: 'cursor=0&count=18' })
    expect(init.headers).toHaveProperty('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8')
  })

  it('参数里的引号和反引号不会跑出字符串', async () => {
    const fetch = vi.fn(response(200, 'ok'))
    const nasty = '"`${alert(1)}\'\\\n</script>'
    await run(requestScript({ endpoint: 'detail', query: { aweme_id: nasty }, method: 'POST', body: { x: nasty } }, 1000), fetch)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(new URL(url, 'https://www.douyin.com').searchParams.get('aweme_id')).toBe(nasty)
    expect(new URLSearchParams(init.body as string).get('x')).toBe(nasty)
  })

  it('请求出错时返回原因；响应太大时不带回正文', async () => {
    const code = requestScript(REQ, 1000)
    expect(await run(code, async () => Promise.reject(new TypeError('Failed to fetch')))).toEqual({ error: 'TypeError: Failed to fetch' })
    const huge = 'a'.repeat(30 * 1024 * 1024 + 1)
    expect(await run(code, response(200, huge))).toEqual({ error: 'response too large' })
  })

  it('只能请求名单里的接口', () => {
    for (const endpoint of ['nope', 'toString', '__proto__', '']) {
      expect(() => requestScript({ endpoint: endpoint as 'detail' }, 1000)).toThrow('unknown endpoint')
    }
  })
})

describe('页面里的检查脚本', () => {
  it('fetch 被网页脚本接管后才算就绪', () => {
    const ready = (fetch: unknown): boolean => new Function('window', `return ${READY_SCRIPT}`)({ fetch }) as boolean
    expect(ready(Math.max)).toBe(false)
    expect(ready(function wrapped() { return 1 })).toBe(true)
  })

  it('只有看得见的验证框才算弹出了验证', () => {
    const box = (width: number, height: number, style: Record<string, string> = {}) => ({
      getBoundingClientRect: () => ({ width, height }),
      style: { display: 'block', visibility: 'visible', ...style }
    })
    const visible = (...boxes: ReturnType<typeof box>[]): boolean =>
      new Function('document', 'getComputedStyle', `return ${CAPTCHA_SCRIPT}`)(
        { querySelectorAll: (selector: string) => (selector === '#captcha_container' ? boxes : []) },
        (e: ReturnType<typeof box>) => e.style
      ) as boolean
    expect(visible()).toBe(false)
    // 常驻的 0×0 预加载框
    expect(visible(box(0, 0))).toBe(false)
    expect(visible(box(50, 300))).toBe(false)
    expect(visible(box(300, 50))).toBe(false)
    expect(visible(box(300, 300, { display: 'none' }))).toBe(false)
    expect(visible(box(300, 300, { visibility: 'hidden' }))).toBe(false)
    expect(visible(box(0, 0), box(300, 300))).toBe(true)
  })
})

describe('request：打开网页', () => {
  it('第一次请求打开网页：拦掉大资源、载入、等脚本就绪；之后复用', async () => {
    const { bridge, open, wins, sleeps } = make()
    expect(await bridge.request(REQ, { account: 'a' })).toEqual(OK)
    expect(open).toHaveBeenCalledExactlyOnceWith('a')
    expect(wins[0].setBlocking).toHaveBeenCalledWith(true)
    expect(wins[0].load).toHaveBeenCalled()
    expect(wins[0].evaluate.mock.calls.map(([c]) => c)).toEqual([READY_SCRIPT, requestScript(REQ, 20_000)])
    await bridge.request(REQ, { account: 'a' })
    expect(open).toHaveBeenCalledTimes(1)
    expect(sleeps).toEqual([500, 500])
    bridge.dispose()
  })

  it('每个账号（包括匿名）各开各的网页', async () => {
    const { bridge, open } = make()
    await bridge.request(REQ, { account: 'a' })
    await bridge.request(REQ, { account: null })
    await bridge.request(REQ, { account: 'b' })
    await bridge.request(REQ, { account: null })
    expect(open.mock.calls).toEqual([['a'], [null], ['b']])
    bridge.dispose()
  })

  it('脚本没就绪时隔半秒再看，检查出错也接着等', async () => {
    const answers = [(): boolean => false, (): never => { throw new Error('页面还在跳转') }, (): boolean => true]
    let i = 0
    const { bridge, sleeps, wins } = make({ ready: () => answers[i++]() })
    expect(await bridge.request(REQ, { account: null })).toEqual(OK)
    expect(wins[0].evaluate.mock.calls.filter(([c]) => c === READY_SCRIPT)).toHaveLength(3)
    expect(sleeps).toEqual([500, 500, 500])
    bridge.dispose()
  })

  it('一直没就绪时报页面没有响应，关掉网页，下次重新打开', async () => {
    const { bridge, open, wins } = make((n) => (n === 0 ? { ready: () => false } : {}), { readyTimeout: 1000 })
    const error = await bridge.request(REQ, { account: 'a' }).catch((e: Error) => e)
    expect(error).toBeInstanceOf(DyError)
    expect((error as Error).message).toBe('打开抖音网页失败（抖音页面没有响应，请重试）')
    expect(wins[0].evaluate).toHaveBeenCalledTimes(3)
    expect(wins[0].destroy).toHaveBeenCalled()
    expect(await bridge.request(REQ, { account: 'a' })).toEqual(OK)
    expect(open).toHaveBeenCalledTimes(2)
    bridge.dispose()
  })

  it('默认最多等 25 秒就绪', async () => {
    const { bridge, wins } = make({ ready: () => false })
    await expect(bridge.request(REQ, { account: null })).rejects.toThrow('打开抖音网页失败')
    expect(wins[0].evaluate).toHaveBeenCalledTimes(51)
  })

  it('就绪检查的结果回不来时按超时处理，接着再查', async () => {
    vi.useFakeTimers()
    let calls = 0
    const { bridge } = timed({ ready: () => (calls++ === 0 ? forever() : true) })
    const result = bridge.request(REQ, { account: null })
    await vi.advanceTimersByTimeAsync(6000)
    expect(await result).toEqual(OK)
    expect(calls).toBe(2)
    bridge.dispose()
  })

  // 已知问题：就绪时限只累计两次检查之间的等待，检查本身挂住时要约 280 秒才放弃
  it('就绪检查一直回不来时也在时限附近放弃', async () => {
    vi.useFakeTimers()
    const { bridge } = timed({ ready: forever })
    const done = vi.fn()
    void bridge.request(REQ, { account: null }).catch(done)
    await vi.advanceTimersByTimeAsync(35_000)
    expect(done).toHaveBeenCalled()
  })

  it('打开或载入失败时带上原因', async () => {
    const failing = new PageBridge(async () => {
      throw new Error('建不了窗口')
    })
    await expect(failing.request(REQ, { account: null })).rejects.toThrow('打开抖音网页失败（建不了窗口）')
    const { bridge, wins } = make({ load: async () => Promise.reject('ERR_FAILED') })
    await expect(bridge.request(REQ, { account: null })).rejects.toThrow('打开抖音网页失败（ERR_FAILED）')
    expect(wins[0].destroy).toHaveBeenCalled()
  })

  it('同时来的请求共用一个正在打开的网页；打开失败时后一个自己再试', async () => {
    const first = deferred<DyWindow>()
    const win = fakeWindow()
    const open = vi.fn<(account: string | null) => Promise<DyWindow>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementation(async () => win as unknown as DyWindow)
    const bridge = new PageBridge(open, { sleep: async () => new Promise<void>((r) => setImmediate(r)) })
    const a = bridge.request(REQ, { account: 'a' })
    const b = bridge.request(REQ, { account: 'a' })
    const failed = expect(a).rejects.toThrow('打开抖音网页失败（第一次失败）')
    first.reject(new Error('第一次失败'))
    await failed
    expect(await b).toEqual(OK)
    expect(open).toHaveBeenCalledTimes(2)
    bridge.dispose()
  })

  it('等着打开的时候网页被关掉：后来的请求重新打开', async () => {
    const first = deferred<DyWindow>()
    const old = fakeWindow()
    const next = fakeWindow()
    const open = vi.fn<(account: string | null) => Promise<DyWindow>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementation(async () => next as unknown as DyWindow)
    const bridge = new PageBridge(open, { sleep: async () => new Promise<void>((r) => setImmediate(r)) })
    const a = bridge.request(REQ, { account: 'a' })
    const b = bridge.request(REQ, { account: 'a' })
    bridge.dispose('a')
    first.resolve(old as unknown as DyWindow)
    expect(await b).toEqual(OK)
    await a
    expect(old.destroy).toHaveBeenCalled()
    expect(open).toHaveBeenCalledTimes(2)
    expect(next.destroy).not.toHaveBeenCalled()
    bridge.dispose()
  })

  it('网页已经销毁时重新打开', async () => {
    const { bridge, open, wins } = make()
    await bridge.request(REQ, { account: 'a' })
    wins[0].die()
    await bridge.request(REQ, { account: 'a' })
    expect(open).toHaveBeenCalledTimes(2)
    bridge.dispose()
  })

  it('打开途中被关掉后又打开失败，不影响之后的网页', async () => {
    const first = deferred<DyWindow>()
    const open = vi.fn<(account: string | null) => Promise<DyWindow>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementation(async () => fakeWindow() as unknown as DyWindow)
    const bridge = new PageBridge(open, { sleep: async () => new Promise<void>((r) => setImmediate(r)) })
    const a = bridge.request(REQ, { account: 'a' })
    const failed = expect(a).rejects.toThrow('打开抖音网页失败')
    bridge.dispose('a')
    const b = bridge.request(REQ, { account: 'a' })
    first.reject(new Error('晚到的失败'))
    await failed
    expect(await b).toEqual(OK)
    await bridge.request(REQ, { account: 'a' })
    expect(open).toHaveBeenCalledTimes(2)
    bridge.dispose()
  })
})

describe('request：等结果', () => {
  it('已经取消的请求不打开网页', async () => {
    const { bridge, open } = make()
    await expect(bridge.request(REQ, { account: null, signal: AbortSignal.abort() })).rejects.toBeInstanceOf(AbortError)
    expect(open).not.toHaveBeenCalled()
  })

  it('等待中被取消时抛 AbortError，网页留着', async () => {
    const ac = new AbortController()
    const { bridge, wins } = make({ fetch: forever }, {}, (n) => {
      if (n === 2) ac.abort()
    })
    await expect(bridge.request(REQ, { account: null, signal: ac.signal })).rejects.toBeInstanceOf(AbortError)
    expect(wins[0].destroy).not.toHaveBeenCalled()
    bridge.dispose()
  })

  it('请求挂住两秒后开始看有没有验证框；没有就接着等', async () => {
    const response = deferred<typeof OK>()
    let checks = 0
    const checkedAt: number[] = []
    const { bridge, wins, sleeps } = make({
      fetch: () => response.promise,
      captcha: () => {
        checkedAt.push(sleeps.length)
        if (++checks === 2) response.resolve(OK)
        return false
      }
    })
    expect(await bridge.request(REQ, { account: null })).toEqual(OK)
    expect(checkedAt.slice(0, 2)).toEqual([4, 5])
    expect(wins[0].destroy).not.toHaveBeenCalled()
    bridge.dispose()
  })

  it('弹出验证框导致请求一直挂着：抛 DyVerifyError 带上这个请求，关掉网页', async () => {
    const { bridge, open, wins, sleeps } = make({ fetch: forever, captcha: () => true })
    const error = await bridge.request(REQ, { account: 'a' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DyVerifyError)
    expect((error as DyVerifyError).probe).toBe(REQ)
    expect(sleeps).toHaveLength(4)
    expect(wins[0].destroy).toHaveBeenCalled()
    await bridge.request(REQ, { account: 'a' }).catch(() => undefined)
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('检查验证框本身出错时当作没有', async () => {
    const response = deferred<typeof OK>()
    const { bridge } = make({
      fetch: () => response.promise,
      captcha: () => {
        response.resolve(OK)
        throw new Error('页面在跳转')
      }
    })
    expect(await bridge.request(REQ, { account: null })).toEqual(OK)
    bridge.dispose()
  })

  it('页面里的请求出错：报网络错误并关掉网页', async () => {
    const { bridge, wins } = make({ fetch: () => ({ error: 'TypeError: Failed to fetch' }) })
    const error = await bridge.request(REQ, { account: null }).catch((e: Error) => e)
    expect(error).toBeInstanceOf(DyError)
    expect((error as Error).message).toBe('连接抖音失败（TypeError: Failed to fetch）')
    expect(wins[0].captchaChecks()).toBe(1)
    expect(wins[0].destroy).toHaveBeenCalled()
  })

  it('请求出错同时页面上有验证框：按需要验证处理', async () => {
    const { bridge } = make({ fetch: () => ({ error: 'TimeoutError' }), captcha: () => true })
    await expect(bridge.request(REQ, { account: null })).rejects.toBeInstanceOf(DyVerifyError)
  })

  it('执行脚本失败时原样抛出；页面上有验证框时按需要验证处理', async () => {
    const broken = new Error('Script failed to execute')
    const plain = make({ fetch: () => Promise.reject(broken) })
    await expect(plain.bridge.request(REQ, { account: null })).rejects.toBe(broken)
    expect(plain.wins[0].destroy).toHaveBeenCalled()
    const captcha = make({ fetch: () => Promise.reject(broken), captcha: () => true })
    await expect(captcha.bridge.request(REQ, { account: null })).rejects.toBeInstanceOf(DyVerifyError)
  })

  it('请求已经拿到响应时即使页面上有验证框也照常返回', async () => {
    const response = deferred<typeof OK>()
    const { bridge, wins } = make({ fetch: () => response.promise, captcha: () => true }, {}, (n) => {
      if (n === 4) response.resolve(OK)
    })
    expect(await bridge.request(REQ, { account: null })).toEqual(OK)
    expect(wins[0].captchaChecks()).toBe(0)
    bridge.dispose()
  })

  it('网页重载后脚本结果永远回不来：主进程超时后报错并关掉网页', async () => {
    vi.useFakeTimers()
    const { bridge, wins } = timed({ fetch: forever })
    const done = vi.fn()
    const result = bridge.request(REQ, { account: null }).catch((e: unknown) => e)
    void result.then(done)
    await vi.advanceTimersByTimeAsync(24_999)
    expect(done).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(501)
    const error = await result
    expect(error).toBeInstanceOf(DyError)
    expect((error as Error).message).toBe('抖音页面没有响应，请重试')
    expect(wins[0].destroy).toHaveBeenCalled()
  })

  it('轮询间隔和请求时限可以设置', async () => {
    const { bridge, wins, sleeps } = make({}, { pollMs: 100, requestTimeout: 7000 })
    await bridge.request(REQ, { account: null })
    expect(sleeps).toEqual([100])
    expect(wins[0].evaluate).toHaveBeenLastCalledWith(requestScript(REQ, 7000))
    bridge.dispose()
  })
})

describe('空闲关闭', () => {
  const finish = async (p: Promise<unknown>): Promise<unknown> => {
    await vi.advanceTimersByTimeAsync(500)
    return p
  }

  it('默认 4 分钟没有请求就关掉网页，有新请求时重新计时', async () => {
    vi.useFakeTimers()
    const { bridge, open, wins } = timed()
    await finish(bridge.request(REQ, { account: 'a' }))
    await vi.advanceTimersByTimeAsync(200_000)
    await finish(bridge.request(REQ, { account: 'a' }))
    await vi.advanceTimersByTimeAsync(239_999)
    expect(wins[0].destroy).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(wins[0].destroy).toHaveBeenCalledTimes(1)
    await finish(bridge.request(REQ, { account: 'a' }))
    expect(open).toHaveBeenCalledTimes(2)
    bridge.dispose()
  })

  it('还有请求在用时不计时', async () => {
    vi.useFakeTimers()
    const slow = deferred<typeof OK>()
    let n = 0
    const { bridge, wins } = timed({ fetch: () => (n++ === 0 ? slow.promise : OK) }, { idleMs: 1000, requestTimeout: 100_000 })
    const first = bridge.request(REQ, { account: null })
    await finish(bridge.request(REQ, { account: null }))
    await vi.advanceTimersByTimeAsync(5000)
    expect(wins[0].destroy).not.toHaveBeenCalled()
    slow.resolve(OK)
    await finish(first)
    await vi.advanceTimersByTimeAsync(1000)
    expect(wins[0].destroy).toHaveBeenCalledTimes(1)
  })

  it('请求途中网页已经被关掉时不再计时', async () => {
    vi.useFakeTimers()
    const slow = deferred<typeof OK>()
    const { bridge, wins } = timed({ fetch: () => slow.promise })
    const result = bridge.request(REQ, { account: null })
    await vi.advanceTimersByTimeAsync(0)
    bridge.dispose(null)
    slow.resolve(OK)
    await finish(result)
    expect(wins[0].destroy).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('dispose', () => {
  it('可以只关一个账号的网页，不传账号时全部关掉；没有网页的账号忽略', async () => {
    const { bridge, wins } = make()
    await bridge.request(REQ, { account: 'a' })
    await bridge.request(REQ, { account: null })
    await bridge.request(REQ, { account: 'b' })
    bridge.dispose('nobody')
    bridge.dispose('a')
    await new Promise<void>((r) => setImmediate(r))
    expect(wins.map((w) => w.destroy.mock.calls.length)).toEqual([1, 0, 0])
    bridge.dispose()
    await new Promise<void>((r) => setImmediate(r))
    expect(wins.map((w) => w.destroy.mock.calls.length)).toEqual([1, 1, 1])
  })
})

describe('verify', () => {
  const PROBE: DyRequest = { endpoint: 'self' }

  it('开一个放开资源的新网页重发请求，一秒后看到验证框就亮出来一次，用户完成后返回响应', async () => {
    const response = deferred<typeof OK>()
    const { bridge, wins, sleeps } = make({ fetch: () => response.promise, captcha: () => true }, {}, (n) => {
      if (n === 5) response.resolve(OK)
    })
    expect(await bridge.verify('a', PROBE)).toEqual(OK)
    const [win] = wins
    expect(win.setBlocking).toHaveBeenCalledWith(false)
    expect(win.evaluate).toHaveBeenCalledWith(requestScript(PROBE, 300_000))
    expect(win.show).toHaveBeenCalledExactlyOnceWith('抖音安全验证：请在这个窗口里手动完成')
    expect(win.captchaChecks()).toBe(1)
    expect(sleeps).toHaveLength(5)
    expect(win.destroy).toHaveBeenCalled()
  })

  it('先关掉这个账号原来的网页', async () => {
    const { bridge, wins } = make()
    await bridge.request(REQ, { account: 'a' })
    await bridge.verify('a', PROBE)
    expect(wins).toHaveLength(2)
    expect(wins[0].destroy).toHaveBeenCalled()
  })

  it('不用验证就返回了结果时不亮窗口', async () => {
    const { bridge, wins } = make()
    expect(await bridge.verify(null, PROBE)).toEqual(OK)
    expect(wins[0].show).not.toHaveBeenCalled()
    expect(wins[0].destroy).toHaveBeenCalled()
  })

  it('一直没出现验证框时每次接着查，查失败当作没有', async () => {
    const response = deferred<typeof OK>()
    let checks = 0
    const { bridge, wins } = make({
      fetch: () => response.promise,
      captcha: () => {
        if (++checks === 1) return false
        if (checks === 2) throw new Error('页面在跳转')
        response.resolve(OK)
        return false
      }
    })
    await bridge.verify(null, PROBE)
    expect(checks).toBe(3)
    expect(wins[0].show).not.toHaveBeenCalled()
  })

  it('用户关掉窗口：报验证没有完成', async () => {
    const { bridge, wins } = make({ fetch: forever, captcha: () => true }, {}, (n, all) => {
      if (n === 3) all[0].closeByUser()
    })
    await expect(bridge.verify(null, PROBE)).rejects.toThrow('验证没有完成：窗口已关闭')
    expect(wins[0].destroy).toHaveBeenCalled()
  })

  it('取消时抛 AbortError 并销毁窗口', async () => {
    const ac = new AbortController()
    const { bridge, wins } = make({ fetch: forever }, {}, (n) => {
      if (n === 1) ac.abort()
    })
    await expect(bridge.verify(null, PROBE, ac.signal)).rejects.toBeInstanceOf(AbortError)
    expect(wins[0].destroy).toHaveBeenCalled()
  })

  it('请求出错时报网络错误；脚本执行失败时原样抛出', async () => {
    const failed = make({ fetch: () => ({ error: '断开了' }) })
    await expect(failed.bridge.verify(null, PROBE)).rejects.toThrow('连接抖音失败（断开了）')
    expect(failed.wins[0].destroy).toHaveBeenCalled()
    const broken = new Error('执行失败')
    const thrown = make({ fetch: () => Promise.reject(broken) })
    await expect(thrown.bridge.verify(null, PROBE)).rejects.toBe(broken)
  })

  it('用户迟迟不完成时超时结束', async () => {
    vi.useFakeTimers()
    const { bridge, wins } = timed({ fetch: forever }, { verifyTimeout: 3000 })
    const result = bridge.verify(null, PROBE).catch((e: Error) => e.message)
    await vi.advanceTimersByTimeAsync(3500)
    expect(await result).toBe('抖音页面没有响应，请重试')
    expect(wins[0].destroy).toHaveBeenCalled()
  })

  it('网页打不开时报错', async () => {
    const { bridge } = make({ load: async () => Promise.reject(new Error('断网')) })
    await expect(bridge.verify(null, PROBE)).rejects.toThrow('打开抖音网页失败（断网）')
  })
})
