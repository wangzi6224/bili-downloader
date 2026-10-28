import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthState } from '@shared/types'

type OpenHandler = (d: { url: string }) => { action: string }

const m = vi.hoisted(() => ({
  wins: [] as FakeWindow[],
  cookies: undefined as unknown as import('node:events').EventEmitter,
  openExternal: vi.fn(),
  checkAuth: vi.fn(),
  getAuthState: vi.fn(),
  mainWindow: null as unknown
}))

class FakeWindow extends EventEmitter {
  destroyed = false
  handler?: OpenHandler
  loadURL = vi.fn()
  focus = vi.fn()
  close = vi.fn(() => {
    this.destroyed = true
    this.emit('closed')
  })
  isDestroyed = (): boolean => this.destroyed
  webContents = {
    setUserAgent: vi.fn(),
    setWindowOpenHandler: vi.fn((fn: OpenHandler) => {
      this.handler = fn
    })
  }
  constructor(public opts: Record<string, unknown>) {
    super()
    m.wins.push(this)
  }
}

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(function (this: unknown, opts: Record<string, unknown>) {
    return new FakeWindow(opts)
  }),
  shell: { openExternal: m.openExternal }
}))
vi.mock('../windows', () => ({ getMainWindow: () => m.mainWindow }))
vi.mock('./authGuard', () => ({ checkAuth: m.checkAuth, getAuthState: m.getAuthState }))
// isBiliHost 用真实实现
vi.mock('./session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./session')>()),
  biliSession: () => ({ cookies: m.cookies })
}))

const IN: AuthState = { loggedIn: true, user: { mid: 1, uname: 'u', face: '', vipActive: false, vipLabel: '' } }
const OUT: AuthState = { loggedIn: false }

const sess = (value = 'x', removed = false, name = 'SESSDATA') =>
  m.cookies.emit('changed', {}, { name, value }, 'explicit', removed)

let openLoginWindow: typeof import('./loginWindow').openLoginWindow

beforeEach(async () => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  m.wins = []
  m.cookies = new EventEmitter()
  m.mainWindow = null
  m.checkAuth.mockResolvedValue(OUT)
  m.getAuthState.mockReturnValue(OUT)
  // 模块里记着正在打开的窗口，每个用例重新加载
  vi.resetModules()
  ;({ openLoginWindow } = await import('./loginWindow'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('openLoginWindow', () => {
  it('用 B站分区打开登录页，挂在主窗口下', () => {
    const parent = {}
    m.mainWindow = parent
    void openLoginWindow()
    const [win] = m.wins
    expect(win.opts).toMatchObject({
      parent,
      webPreferences: { partition: 'persist:bilibili', sandbox: true, contextIsolation: true }
    })
    expect(win.webContents.setUserAgent).toHaveBeenCalledWith(expect.stringContaining('Chrome/'))
    expect(win.loadURL).toHaveBeenCalledWith('https://passport.bilibili.com/login')
  })

  it('没有主窗口时不设 parent', () => {
    void openLoginWindow()
    expect(m.wins[0].opts.parent).toBeUndefined()
  })

  it('重复调用返回同一个 promise，并把窗口提到前面', () => {
    const a = openLoginWindow()
    const b = openLoginWindow()
    expect(b).toBe(a)
    expect(m.wins).toHaveLength(1)
    expect(m.wins[0].focus).toHaveBeenCalledTimes(1)
  })
})

describe('SESSDATA 变化', () => {
  it('去抖 800ms 后检查登录，登录成功就关窗口并返回状态', async () => {
    m.checkAuth.mockResolvedValue(IN)
    const p = openLoginWindow()
    const [win] = m.wins
    sess('a')
    await vi.advanceTimersByTimeAsync(500)
    sess('b')
    await vi.advanceTimersByTimeAsync(799)
    expect(m.checkAuth).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(win.close).toHaveBeenCalled()
    // 去抖后一次，关闭窗口时再一次
    expect(m.checkAuth).toHaveBeenCalledTimes(2)
    expect(await p).toBe(IN)
  })

  it('删除 Cookie、空值、其他 Cookie 都忽略', async () => {
    void openLoginWindow()
    sess('x', true)
    sess('')
    sess('x', false, 'bili_jct')
    await vi.advanceTimersByTimeAsync(2000)
    expect(m.checkAuth).not.toHaveBeenCalled()
  })

  it('检查结果未登录或检查失败时窗口保持打开', async () => {
    void openLoginWindow()
    const [win] = m.wins
    sess()
    await vi.advanceTimersByTimeAsync(800)
    m.checkAuth.mockRejectedValueOnce(new Error('offline'))
    sess()
    await vi.advanceTimersByTimeAsync(800)
    expect(m.checkAuth).toHaveBeenCalledTimes(2)
    expect(win.close).not.toHaveBeenCalled()
  })

  it('检查期间用户已关掉窗口时不再重复关闭', async () => {
    let finish: (s: AuthState) => void = () => {}
    m.checkAuth.mockReturnValueOnce(new Promise<AuthState>((r) => (finish = r)))
    const p = openLoginWindow()
    const [win] = m.wins
    sess()
    await vi.advanceTimersByTimeAsync(800)
    win.close()
    win.close.mockClear()
    finish(IN)
    await p
    expect(win.close).not.toHaveBeenCalled()
  })
})

describe('新窗口链接', () => {
  const open = (url: string) => {
    void openLoginWindow()
    const win = m.wins[0]
    return { win, result: win.handler!({ url }) }
  }

  it('B站自己的页面在登录窗口里打开', () => {
    const { win, result } = open('https://www.bilibili.com/protocal')
    expect(win.loadURL).toHaveBeenLastCalledWith('https://www.bilibili.com/protocal')
    expect(m.openExternal).not.toHaveBeenCalled()
    expect(result).toEqual({ action: 'deny' })
  })

  it('仿冒域名和其他网站交给外部浏览器', () => {
    expect(open('https://evilbilibili.com/x').result).toEqual({ action: 'deny' })
    expect(m.openExternal).toHaveBeenCalledWith('https://evilbilibili.com/x')
    expect(m.wins[0].loadURL).toHaveBeenCalledTimes(1)
    m.wins[0].handler!({ url: 'http://example.com/' })
    expect(m.openExternal).toHaveBeenLastCalledWith('http://example.com/')
  })

  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'file://bilibili.com/etc/passwd'])('%s 都不打开', (url) => {
    const { win, result } = open(url)
    expect(result).toEqual({ action: 'deny' })
    expect(win.loadURL).toHaveBeenCalledTimes(1)
    expect(m.openExternal).not.toHaveBeenCalled()
  })
})

describe('关闭窗口', () => {
  it('移除 Cookie 监听、取消待执行的检查，并返回最新状态', async () => {
    m.checkAuth.mockResolvedValue(IN)
    const p = openLoginWindow()
    const [win] = m.wins
    expect(m.cookies.listenerCount('changed')).toBe(1)
    sess()
    win.close()
    expect(m.cookies.listenerCount('changed')).toBe(0)
    expect(await p).toBe(IN)
    await vi.advanceTimersByTimeAsync(2000)
    // 只有关闭时的那一次
    expect(m.checkAuth).toHaveBeenCalledTimes(1)
  })

  it('检查失败时回落到当前状态', async () => {
    m.checkAuth.mockRejectedValue(new Error('offline'))
    const p = openLoginWindow()
    m.wins[0].close()
    expect(await p).toBe(OUT)
    expect(m.getAuthState).toHaveBeenCalled()
  })

  it('关闭后再打开会新建窗口', async () => {
    const p = openLoginWindow()
    m.wins[0].close()
    await p
    expect(openLoginWindow()).not.toBe(p)
    expect(m.wins).toHaveLength(2)
    expect(m.wins[0].focus).not.toHaveBeenCalled()
  })
})
