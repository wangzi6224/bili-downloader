import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getRaw: vi.fn(),
  setAuthExpiredHook: vi.fn(),
  updateWbiKeys: vi.fn(),
  send: vi.fn(),
  getCookie: vi.fn()
}))

vi.mock('../bili/http', () => ({
  NAV_URL: 'https://nav.test',
  getRaw: m.getRaw,
  setAuthExpiredHook: m.setAuthExpiredHook,
  updateWbiKeys: m.updateWbiKeys
}))
vi.mock('../windows', () => ({ send: m.send }))
vi.mock('./session', () => ({ getCookie: m.getCookie }))

const WBI = { img_url: 'https://i0/img.png', sub_url: 'https://i0/sub.png' }

const nav = (data: Record<string, unknown> | undefined, code = 0) => ({ code, data })
const loggedIn = (over: Record<string, unknown> = {}) =>
  nav({ isLogin: true, mid: 42, uname: '测试', face: 'f.jpg', vipStatus: 0, vipType: 0, wbi_img: WBI, ...over })
const loggedOut = () => nav({ isLogin: false, wbi_img: WBI })

let guard: typeof import('./authGuard')

beforeEach(async () => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(1_700_000_000_000)
  m.getCookie.mockResolvedValue(undefined)
  // 模块里有登录态、节流时间和监听器，每个用例都重新加载
  vi.resetModules()
  guard = await import('./authGuard')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('加载时', () => {
  it('把 requireLogin 注册为登录失效钩子，初始为未登录', () => {
    expect(m.setAuthExpiredHook).toHaveBeenCalledWith(guard.requireLogin)
    expect(guard.getAuthState()).toEqual({ loggedIn: false })
  })
})

describe('checkAuth', () => {
  it('已登录时映射用户信息，并更新 WBI 密钥和推送状态', async () => {
    m.getRaw.mockResolvedValue(loggedIn())
    const s = await guard.checkAuth()
    expect(m.getRaw).toHaveBeenCalledWith('https://nav.test')
    expect(m.updateWbiKeys).toHaveBeenCalledWith(WBI)
    expect(s).toEqual({ loggedIn: true, user: { mid: 42, uname: '测试', face: 'f.jpg', vipActive: false, vipLabel: '' } })
    expect(guard.getAuthState()).toBe(s)
    expect(m.send).toHaveBeenCalledWith('auth:changed', s)
  })

  it('大会员用接口给的标签，没有标签时回退到“大会员”', async () => {
    m.getRaw.mockResolvedValueOnce(loggedIn({ vipStatus: 1, vip_label: { text: '年度大会员' } }))
    expect(await guard.checkAuth()).toMatchObject({ user: { vipActive: true, vipLabel: '年度大会员' } })
    m.getRaw.mockResolvedValueOnce(loggedIn({ vipStatus: 1, vip_label: { text: '' } }))
    expect(await guard.checkAuth()).toMatchObject({ user: { vipActive: true, vipLabel: '大会员' } })
    m.getRaw.mockResolvedValueOnce(loggedIn({ vipStatus: 1 }))
    expect(await guard.checkAuth()).toMatchObject({ user: { vipActive: true, vipLabel: '大会员' } })
  })

  it('未登录且没有 SESSDATA 时不算过期', async () => {
    m.getRaw.mockResolvedValue(loggedOut())
    expect(await guard.checkAuth()).toEqual({ loggedIn: false, expired: false })
    expect(m.getCookie).toHaveBeenCalledWith('SESSDATA')
  })

  it('未登录但还有 SESSDATA 时判为过期', async () => {
    m.getRaw.mockResolvedValue(loggedOut())
    m.getCookie.mockResolvedValue('stale')
    expect(await guard.checkAuth()).toEqual({ loggedIn: false, expired: true })
  })

  it('接口返回错误码或没有 data 时按未登录处理', async () => {
    m.getRaw.mockResolvedValueOnce(loggedIn({ isLogin: true }))
    m.getRaw.mockResolvedValueOnce({ code: -101, data: { isLogin: true, wbi_img: WBI } })
    await guard.checkAuth()
    expect(await guard.checkAuth()).toEqual({ loggedIn: false, expired: false })
    m.getRaw.mockResolvedValueOnce({ code: -400 })
    expect(await guard.checkAuth()).toEqual({ loggedIn: false, expired: false })
    expect(m.updateWbiKeys).toHaveBeenLastCalledWith(undefined)
  })

  it('网络出错时保留原状态并抛错', async () => {
    m.getRaw.mockResolvedValueOnce(loggedIn())
    const before = await guard.checkAuth()
    m.send.mockClear()
    m.getRaw.mockRejectedValueOnce(new Error('offline'))
    await expect(guard.checkAuth()).rejects.toThrow('offline')
    expect(guard.getAuthState()).toBe(before)
    expect(m.send).not.toHaveBeenCalled()
  })
})

describe('onLoggedIn', () => {
  it('只在“未登录→已登录”时触发', async () => {
    const fn = vi.fn()
    guard.onLoggedIn(fn)
    m.getRaw.mockResolvedValue(loggedIn())
    await guard.checkAuth()
    await guard.checkAuth()
    expect(fn).toHaveBeenCalledTimes(1)

    m.getRaw.mockResolvedValueOnce(loggedOut())
    await guard.checkAuth()
    expect(fn).toHaveBeenCalledTimes(1)
    await guard.checkAuth()
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('requireLogin', () => {
  it('3 秒内只通知一次，过后再通知', () => {
    const fn = vi.fn()
    guard.onAuthRequired(fn)
    guard.requireLogin()
    guard.requireLogin()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(m.send.mock.calls.filter(([ch]) => ch === 'auth:required')).toHaveLength(1)

    vi.advanceTimersByTime(2999)
    guard.requireLogin()
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    guard.requireLogin()
    expect(fn).toHaveBeenCalledTimes(2)
    expect(m.send.mock.calls.filter(([ch]) => ch === 'auth:required')).toHaveLength(2)
  })

  it('已登录时先改为“已过期”，即使在去抖期内', async () => {
    guard.requireLogin()
    m.getRaw.mockResolvedValue(loggedIn())
    await guard.checkAuth()
    m.send.mockClear()

    guard.requireLogin()
    expect(guard.getAuthState()).toEqual({ loggedIn: false, expired: true })
    expect(m.send).toHaveBeenCalledWith('auth:changed', { loggedIn: false, expired: true })
    // 去抖期内不再弹登录框
    expect(m.send).not.toHaveBeenCalledWith('auth:required')
  })
})

describe('checkAuthThrottled', () => {
  it('距上次检查不足 minInterval 时直接返回缓存的状态', async () => {
    m.getRaw.mockResolvedValue(loggedIn())
    const first = await guard.checkAuthThrottled(60_000)
    expect(m.getRaw).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(59_999)
    expect(await guard.checkAuthThrottled(60_000)).toBe(first)
    expect(m.getRaw).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    await guard.checkAuthThrottled(60_000)
    expect(m.getRaw).toHaveBeenCalledTimes(2)
  })

  it('检查失败不算数，下次照样请求', async () => {
    m.getRaw.mockRejectedValueOnce(new Error('offline'))
    await expect(guard.checkAuthThrottled(60_000)).rejects.toThrow('offline')
    m.getRaw.mockResolvedValueOnce(loggedIn())
    expect(await guard.checkAuthThrottled(60_000)).toMatchObject({ loggedIn: true })
    expect(m.getRaw).toHaveBeenCalledTimes(2)
  })
})

describe('ensureLoggedIn', () => {
  it('已登录时直接通过', async () => {
    m.getRaw.mockResolvedValue(loggedIn())
    await expect(guard.ensureLoggedIn()).resolves.toBeUndefined()
    expect(m.send).not.toHaveBeenCalledWith('auth:required')
  })

  it('从未登录时弹登录框并提示先登录', async () => {
    m.getRaw.mockResolvedValue(loggedOut())
    await expect(guard.ensureLoggedIn()).rejects.toThrow('请先登录 B站账号')
    expect(m.send).toHaveBeenCalledWith('auth:required')
  })

  it('登录过期时提示重新登录', async () => {
    m.getRaw.mockResolvedValue(loggedOut())
    m.getCookie.mockResolvedValue('stale')
    await expect(guard.ensureLoggedIn()).rejects.toThrow('登录已过期，请重新登录')
    expect(m.send).toHaveBeenCalledWith('auth:required')
  })

  it('60 秒内复用上次的检查结果', async () => {
    m.getRaw.mockResolvedValue(loggedIn())
    await guard.ensureLoggedIn()
    await guard.ensureLoggedIn()
    expect(m.getRaw).toHaveBeenCalledTimes(1)
  })
})
