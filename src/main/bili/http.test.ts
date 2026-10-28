import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encWbi } from './wbi'

const auth = vi.hoisted(() => ({
  cookie: 'SESSDATA=abc',
  buvid3: 'has-buvid' as string | undefined,
  getCookie: vi.fn(),
  setBiliCookies: vi.fn()
}))

vi.mock('../auth/session', () => ({
  UA: 'test-ua',
  cookieHeader: async () => auth.cookie,
  getCookie: auth.getCookie,
  setBiliCookies: auth.setBiliCookies
}))

const NAV_URL = 'https://api.bilibili.com/x/web-interface/nav'
const SPI_URL = 'https://api.bilibili.com/x/frontend/finger/spi'
const API = 'https://api.bilibili.com/x/test'
// wbi 文档里的示例密钥
const IMG = '7cd084941338484aae1ad9425b84077c'
const SUB = '4932caff0ff746eab6f01bf08b70ac45'
const WBI_IMG = { img_url: `https://i0.hdslb.com/bfs/wbi/${IMG}.png`, sub_url: `https://i0.hdslb.com/bfs/wbi/${SUB}.png` }

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status })

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>
let handler: Handler
let navBody: unknown
let spiBody: unknown
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
const callsTo = (prefix: string): number => fetchMock.mock.calls.filter(([u]) => u.startsWith(prefix)).length

// http.ts 有模块级状态（WBI 密钥、buvid、登录失效钩子），每个用例重新导入
const load = async () => {
  vi.resetModules()
  return import('./http')
}

beforeEach(() => {
  auth.cookie = 'SESSDATA=abc'
  auth.buvid3 = 'has-buvid'
  auth.getCookie.mockReset().mockImplementation(async (name: string) => (name === 'buvid3' ? auth.buvid3 : undefined))
  auth.setBiliCookies.mockReset().mockResolvedValue(undefined)
  navBody = { code: 0, data: { wbi_img: WBI_IMG } }
  spiBody = { code: 0, data: { b_3: 'B3', b_4: 'B4' } }
  handler = () => json({ code: 0, data: { ok: true } })
  fetchMock.mockReset().mockImplementation(async (url, init) => {
    if (url.startsWith(NAV_URL)) return json(navBody)
    if (url.startsWith(SPI_URL)) return json(spiBody)
    return handler(url, init)
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('biliFetch', () => {
  it('请求头按 BASE_HEADERS < Cookie < init.headers 的顺序合并', async () => {
    const { biliFetch, BASE_HEADERS } = await load()
    await biliFetch(API)
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ ...BASE_HEADERS, Cookie: 'SESSDATA=abc' })

    await biliFetch(API, { method: 'POST', headers: { Cookie: 'override', 'User-Agent': 'custom', 'X-A': '1' } })
    const init = fetchMock.mock.calls[1][1]
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({
      'User-Agent': 'custom',
      Referer: 'https://www.bilibili.com/',
      Origin: 'https://www.bilibili.com',
      Cookie: 'override',
      'X-A': '1'
    })
    expect(BASE_HEADERS['User-Agent']).toBe('test-ua')
  })

  it('412 视为风控并按 1s / 2s / 4s 退避重试，共 retries + 1 次', async () => {
    vi.useFakeTimers()
    const { biliFetch, BiliError } = await load()
    handler = () => json({}, 412)
    const p = biliFetch(API)
    const done = expect(p).rejects.toSatisfy((e) => e instanceof BiliError && e.code === 412 && e.message.includes('风控'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(4000)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    await done
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[retry 1/3]'))
  })

  it('5xx 抛 BiliError 并重试，retries 可以自定义', async () => {
    vi.useFakeTimers()
    const { biliFetch } = await load()
    handler = () => json({}, 503)
    const p = biliFetch(API, {}, 1)
    const done = expect(p).rejects.toMatchObject({ code: 503, message: 'B站服务器错误（HTTP 503）' })
    await vi.runAllTimersAsync()
    await done
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('重试途中成功就返回该次的响应', async () => {
    vi.useFakeTimers()
    const { biliFetch } = await load()
    handler = vi.fn<Handler>().mockReturnValueOnce(json({}, 500)).mockReturnValueOnce(json({ code: 0 }, 200))
    const p = biliFetch(API)
    await vi.runAllTimersAsync()
    expect((await p).status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('其他 4xx 原样返回，不重试', async () => {
    const { biliFetch } = await load()
    handler = () => json({ code: -404 }, 404)
    const res = await biliFetch(API)
    expect(res.status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('非 BiliError 重试用尽后包装成“网络请求失败”', async () => {
    vi.useFakeTimers()
    const { biliFetch, BiliError } = await load()
    handler = () => {
      throw new TypeError('fetch failed')
    }
    const p = biliFetch(API, {}, 2)
    const done = expect(p).rejects.toSatisfy(
      (e) => e instanceof BiliError && e.code === -1 && e.message === '网络请求失败：TypeError: fetch failed'
    )
    await vi.runAllTimersAsync()
    await done
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('signal 已中止时直接抛出原错误，不再重试', async () => {
    const { biliFetch, BiliError } = await load()
    const ac = new AbortController()
    ac.abort()
    const abortErr = new DOMException('aborted', 'AbortError')
    handler = () => {
      throw abortErr
    }
    const err = await biliFetch(API, { signal: ac.signal }).catch((e: unknown) => e)
    expect(err).toBe(abortErr)
    expect(err).not.toBeInstanceOf(BiliError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('cookie 加请求超过 1.5 秒时打印慢请求日志', async () => {
    vi.useFakeTimers()
    const { biliFetch } = await load()
    handler = () => {
      vi.setSystemTime(Date.now() + 2000)
      return json({})
    }
    await biliFetch(`${API}?a=1`)
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/^\[slow\] .*HTTP 200 https:\/\/api\.bilibili\.com\/x\/test$/))
  })
})

describe('getRaw', () => {
  it('丢掉 undefined 参数，布尔值转成 0 / 1', async () => {
    const { getRaw } = await load()
    const r = await getRaw(API, { a: 1, b: undefined, c: true, d: false, e: 'x y' })
    expect(r).toEqual({ code: 0, data: { ok: true } })
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}?a=1&c=1&d=0&e=x+y`)
  })

  it('没有参数时不带问号', async () => {
    const { getRaw } = await load()
    await getRaw(API)
    expect(fetchMock.mock.calls[0][0]).toBe(API)
  })

  it('响应不是 JSON 时报错并带上 HTTP 状态码', async () => {
    const { getRaw, BiliError } = await load()
    handler = () => new Response('<html>oops</html>', { status: 404 })
    const err = await getRaw(API).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(BiliError)
    expect(err).toMatchObject({ code: 404, message: '接口返回了无法解析的内容（HTTP 404）' })
  })
})

describe('api', () => {
  it('code 为 0 时返回 data，没有 data 时返回 result', async () => {
    const { api } = await load()
    expect(await api(API)).toEqual({ ok: true })
    handler = () => json({ code: 0, result: { pgc: 1 } })
    expect(await api(API)).toEqual({ pgc: 1 })
  })

  it('code 非 0 时抛 BiliError，没有 message 时给出错误码', async () => {
    const { api, BiliError } = await load()
    handler = () => json({ code: -400, message: '请求错误' })
    await expect(api(API)).rejects.toSatisfy((e) => e instanceof BiliError && e.code === -400 && e.message === '请求错误')
    handler = () => json({ code: 62002, message: '' })
    await expect(api(API)).rejects.toMatchObject({ code: 62002, message: '接口错误（62002）' })
  })

  it('-101 时触发登录失效钩子并抛 AuthExpiredError', async () => {
    const { api, setAuthExpiredHook, AuthExpiredError, BiliError } = await load()
    handler = () => json({ code: -101, message: '账号未登录' })
    // 没设置钩子时也不会出错
    await expect(api(API)).rejects.toBeInstanceOf(AuthExpiredError)
    const hook = vi.fn()
    setAuthExpiredHook(hook)
    const err = await api(API).catch((e: unknown) => e)
    expect(hook).toHaveBeenCalledTimes(1)
    expect(err).toBeInstanceOf(AuthExpiredError)
    expect(err).toBeInstanceOf(BiliError)
    expect(err).toMatchObject({ code: -101, message: '登录已失效，请重新登录' })
  })
})

describe('WBI 签名', () => {
  it('从 nav 取密钥签名，密钥缓存 1 小时', async () => {
    vi.useFakeTimers({ now: 1702204169_000 })
    const { api } = await load()
    await api(API, { foo: '114', bar: '514', zab: 1919810 }, { wbi: true })
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(`${API}?${encWbi({ foo: '114', bar: '514', zab: 1919810 }, IMG, SUB)}`)
    expect(callsTo(NAV_URL)).toBe(1)

    vi.setSystemTime(Date.now() + 3600_000)
    await api(API, {}, { wbi: true })
    expect(callsTo(NAV_URL)).toBe(1)

    vi.setSystemTime(Date.now() + 1)
    await api(API, {}, { wbi: true })
    expect(callsTo(NAV_URL)).toBe(2)
  })

  it('updateWbiKeys 可以预填密钥，缺字段时忽略', async () => {
    const { api, updateWbiKeys } = await load()
    updateWbiKeys(undefined)
    updateWbiKeys({ img_url: WBI_IMG.img_url, sub_url: '' })
    updateWbiKeys({ img_url: `https://x/${SUB}.png`, sub_url: `https://x/${IMG}.png` })
    await api(API, { a: 1 }, { wbi: true })
    expect(callsTo(NAV_URL)).toBe(0)
    const qs = fetchMock.mock.calls[0][0].split('?')[1]
    const wts = Number(new URLSearchParams(qs).get('wts'))
    // 用的是预填的密钥（img / sub 互换过）
    expect(qs).toBe(encWbi({ a: 1 }, SUB, IMG, wts))
  })

  it('nav 里没有 wbi_img 时报错', async () => {
    const { api, BiliError } = await load()
    navBody = { code: -101, data: { isLogin: false } }
    await expect(api(API, {}, { wbi: true })).rejects.toSatisfy(
      (e) => e instanceof BiliError && e.message === '获取 WBI 签名密钥失败'
    )
  })

  it.each([-352, -403])('%i 时清空密钥并重新签名一次', async (code) => {
    const { api } = await load()
    handler = vi
      .fn<Handler>()
      .mockReturnValueOnce(json({ code, message: '风控校验失败' }))
      .mockReturnValueOnce(json({ code: 0, data: 'second' }))
    expect(await api(API, {}, { wbi: true })).toBe('second')
    expect(callsTo(NAV_URL)).toBe(2)
    expect(callsTo(API)).toBe(2)
  })

  it('重签后仍失败就抛出，只重试一次', async () => {
    const { api } = await load()
    handler = () => json({ code: -352, message: '风控校验失败' })
    await expect(api(API, {}, { wbi: true })).rejects.toMatchObject({ code: -352, message: '风控校验失败' })
    expect(callsTo(API)).toBe(2)
  })

  it('不带 wbi 时 -352 不重试', async () => {
    const { api } = await load()
    handler = () => json({ code: -352, message: '风控校验失败' })
    await expect(api(API)).rejects.toMatchObject({ code: -352 })
    expect(callsTo(API)).toBe(1)
    expect(callsTo(NAV_URL)).toBe(0)
  })
})

describe('buvid', () => {
  it('缺少 buvid3 时补上 buvid3 和 buvid4，每个模块实例只补一次', async () => {
    vi.useFakeTimers({ now: 1_700_000_000_000 })
    auth.buvid3 = undefined
    const { api } = await load()
    await api(API)
    await api(API)
    expect(callsTo(SPI_URL)).toBe(1)
    expect(auth.getCookie).toHaveBeenCalledTimes(1)
    expect(auth.getCookie).toHaveBeenCalledWith('buvid3')
    const expires = 1_700_000_000 + 365 * 86400
    const base = { domain: '.bilibili.com', path: '/', secure: false, httpOnly: false, sameSite: 'unspecified', expires }
    expect(auth.setBiliCookies).toHaveBeenCalledWith([
      { ...base, name: 'buvid3', value: 'B3' },
      { ...base, name: 'buvid4', value: 'B4' }
    ])

    // 重新导入后是新的模块实例，会再检查一次
    const again = await load()
    await again.api(API)
    expect(callsTo(SPI_URL)).toBe(2)
  })

  it('已有 buvid3 时跳过', async () => {
    const { api } = await load()
    await api(API)
    expect(callsTo(SPI_URL)).toBe(0)
    expect(auth.setBiliCookies).not.toHaveBeenCalled()
  })

  it('spi 没有 data 时不写 cookie', async () => {
    auth.buvid3 = undefined
    spiBody = { code: -1 }
    const { api } = await load()
    expect(await api(API)).toEqual({ ok: true })
    expect(auth.setBiliCookies).not.toHaveBeenCalled()
  })

  it('获取或写入失败时吞掉错误，不影响原请求', async () => {
    auth.buvid3 = undefined
    auth.setBiliCookies.mockRejectedValue(new Error('写入失败'))
    const first = await load()
    expect(await first.api(API)).toEqual({ ok: true })
    expect(auth.setBiliCookies).toHaveBeenCalledTimes(1)

    fetchMock.mockImplementation(async (url, init) =>
      url.startsWith(SPI_URL) ? new Response('not json') : handler(url, init)
    )
    const second = await load()
    expect(await second.api(API)).toEqual({ ok: true })
  })
})
