import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  windows: [] as unknown[],
  sessions: new Map<string, unknown>(),
  main: vi.fn<() => unknown>(),
  loadError: undefined as Error | undefined,
  proxyError: undefined as Error | undefined
}))

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  class BrowserWindow extends EventEmitter {
    destroyed = false
    focus = vi.fn()
    webContents = Object.assign(new EventEmitter(), { setAudioMuted: vi.fn(), setWindowOpenHandler: vi.fn() })
    loadURL = vi.fn(async (_url: string) => {
      if (h.loadError) throw h.loadError
    })
    destroy = vi.fn(() => {
      this.destroyed = true
      this.emit('closed')
    })
    isDestroyed = (): boolean => this.destroyed
    constructor(public options: Record<string, unknown>) {
      super()
      h.windows.push(this)
    }
  }
  const session = {
    fromPartition: (partition: string) => {
      let ses = h.sessions.get(partition)
      if (!ses) {
        ses = Object.assign(new EventEmitter(), {
          cookies: new EventEmitter(),
          setUserAgent: vi.fn(),
          setPermissionRequestHandler: vi.fn(),
          webRequest: { onBeforeRequest: vi.fn() },
          setProxy: vi.fn(async () => {
            if (h.proxyError) throw h.proxyError
          })
        })
        h.sessions.set(partition, ses)
      }
      return ses
    }
  }
  return { BrowserWindow, session }
})
vi.mock('../windows', () => ({ getMainWindow: h.main }))

const { openDyLoginWindow } = await import('./login')
const { ENTRY_URL } = await import('./transport/window')

interface FakeWindow {
  options: { parent?: unknown; title: string; webPreferences: Record<string, unknown> }
  destroyed: boolean
  focus: () => void
  destroy: () => void
  loadURL: (url: string) => Promise<void>
  emit: (name: string, ...args: unknown[]) => boolean
  webContents: {
    setAudioMuted: ReturnType<typeof vi.fn>
    setWindowOpenHandler: ReturnType<typeof vi.fn>
    emit: (name: string, ...args: unknown[]) => boolean
  }
}
interface FakeSession {
  setProxy: ReturnType<typeof vi.fn>
  setUserAgent: ReturnType<typeof vi.fn>
  cookies: { emit: (name: string, ...args: unknown[]) => boolean; listenerCount: (name: string) => number }
}

const PARTITION = 'persist:douyin-test'
const proxy = { mode: 'direct' as const }
const open = (): Promise<boolean> => openDyLoginWindow({ partition: PARTITION, userAgent: 'test-agent', proxy })
const windows = (): FakeWindow[] => h.windows as FakeWindow[]
const ses = (): FakeSession => h.sessions.get(PARTITION) as FakeSession
const window_ = async (): Promise<FakeWindow> => {
  await vi.advanceTimersByTimeAsync(0)
  return windows().at(-1)!
}
const setCookie = (over: Record<string, unknown> = {}, removed = false): void => {
  ses().cookies.emit('changed', {}, { name: 'sessionid', value: 'test-session', domain: '.douyin.com', ...over }, 'explicit', removed)
}

beforeEach(() => {
  vi.useFakeTimers()
  h.windows.length = 0
  h.sessions.clear()
  h.main.mockReset().mockReturnValue(null)
  h.loadError = undefined
  h.proxyError = undefined
})
afterEach(() => vi.useRealTimers())

describe('openDyLoginWindow', () => {
  it('先给会话设好代理，再打开沙盒里的静音窗口载入抖音', async () => {
    const result = open()
    const win = await window_()
    expect(ses().setProxy).toHaveBeenCalledWith(proxy)
    expect(ses().setUserAgent).toHaveBeenCalledWith('test-agent', 'zh-CN,zh;q=0.9')
    expect(win.options).toMatchObject({
      parent: undefined,
      title: '抖音登录：用手机抖音扫码',
      webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true }
    })
    expect(win.webContents.setAudioMuted).toHaveBeenCalledWith(true)
    expect(win.webContents.setWindowOpenHandler.mock.calls[0][0]()).toEqual({ action: 'deny' })
    expect(win.loadURL).toHaveBeenCalledWith(ENTRY_URL)
    win.emit('closed')
    expect(await result).toBe(false)
  })

  it('标题不跟着网页变；只允许跳到抖音和字节的网页', async () => {
    const result = open()
    const win = await window_()
    const title = { preventDefault: vi.fn() }
    win.emit('page-title-updated', title)
    expect(title.preventDefault).toHaveBeenCalled()
    const trusted = { preventDefault: vi.fn() }
    win.webContents.emit('will-navigate', trusted, 'https://sso.douyin.com/login')
    expect(trusted.preventDefault).not.toHaveBeenCalled()
    const outside = { preventDefault: vi.fn() }
    win.webContents.emit('will-navigate', outside, 'https://evil.example/')
    expect(outside.preventDefault).toHaveBeenCalled()
    win.destroy()
    await result
  })

  it.each([
    ['主窗口可见时挂在它上面', true, false, true],
    ['主窗口隐藏时单独弹出', false, false, false],
    ['主窗口最小化时单独弹出', true, true, false]
  ])('%s', async (_name, visible, minimized, attached) => {
    const main = { isVisible: () => visible, isMinimized: () => minimized }
    h.main.mockReturnValue(main)
    const result = open()
    const win = await window_()
    expect(win.options.parent).toBe(attached ? main : undefined)
    win.destroy()
    await result
  })

  it('出现登录 cookie 后等页面写完其余 cookie，关掉窗口返回成功', async () => {
    let done: boolean | undefined
    const result = open()
    void result.then((ok) => (done = ok))
    const win = await window_()
    setCookie()
    await vi.advanceTimersByTimeAsync(1000)
    // 又写了一次登录 cookie：重新计时
    setCookie({ value: 'newer' })
    await vi.advanceTimersByTimeAsync(1499)
    expect(done).toBeUndefined()
    expect(win.destroy).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(await result).toBe(true)
    expect(win.destroy).toHaveBeenCalledTimes(1)
    expect(ses().cookies.listenerCount('changed')).toBe(0)
  })

  it('删除、别的名字、空值、别的域名的 cookie 变化都不算登录', async () => {
    const result = open()
    const win = await window_()
    setCookie({}, true)
    setCookie({ name: 'ttwid' })
    setCookie({ value: '' })
    setCookie({ domain: '.evil.example' })
    setCookie({ domain: undefined })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(win.destroy).not.toHaveBeenCalled()
    win.emit('closed')
    expect(await result).toBe(false)
    // 窗口自己关掉时不用再销毁已经不存在的窗口
    expect(win.destroy).toHaveBeenCalledTimes(1)
  })

  it('刚拿到登录 cookie 就关了窗口也算登录成功', async () => {
    const result = open()
    const win = await window_()
    setCookie()
    win.destroyed = true
    win.emit('closed')
    expect(await result).toBe(true)
    expect(win.destroy).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(win.destroy).not.toHaveBeenCalled()
  })

  it('同时只开一个：重复打开时把已有的窗口提到前面，结束后可以再开', async () => {
    const first = open()
    // 窗口还没建出来时重复调用
    const early = open()
    const win = await window_()
    const again = open()
    expect(early).toBe(first)
    expect(again).toBe(first)
    expect(win.focus).toHaveBeenCalledTimes(1)
    expect(windows()).toHaveLength(1)
    win.destroy()
    expect(await again).toBe(false)
    const next = open()
    expect(next).not.toBe(first)
    const second = await window_()
    expect(windows()).toHaveLength(2)
    second.destroy()
    await next
  })

  it('页面载入失败时窗口留着，由用户决定关不关', async () => {
    h.loadError = new Error('ERR_FAILED')
    const result = open()
    const win = await window_()
    await vi.advanceTimersByTimeAsync(100)
    expect(win.destroy).not.toHaveBeenCalled()
    win.destroy()
    expect(await result).toBe(false)
  })

  it('设置代理失败时抛出原因，之后可以重新打开', async () => {
    h.proxyError = new Error('代理无效')
    await expect(open()).rejects.toThrow('代理无效')
    expect(windows()).toHaveLength(0)
    h.proxyError = undefined
    const result = open()
    const win = await window_()
    win.destroy()
    expect(await result).toBe(false)
  })
})
