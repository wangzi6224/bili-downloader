import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  windows: [] as unknown[],
  sessions: new Map<string, unknown>()
}))

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  class BrowserWindow extends EventEmitter {
    destroyed = false
    visible = false
    setTitle = vi.fn()
    focus = vi.fn()
    show = vi.fn(() => (this.visible = true))
    hide = vi.fn(() => (this.visible = false))
    destroy = vi.fn(() => (this.destroyed = true))
    isDestroyed = (): boolean => this.destroyed
    isVisible = (): boolean => this.visible
    webContents = Object.assign(new EventEmitter(), {
      setAudioMuted: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      loadURL: vi.fn((_url: string) => new Promise<void>(() => undefined)),
      executeJavaScript: vi.fn(async (code: string) => `ran:${code}`)
    })
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
          setUserAgent: vi.fn(),
          setPermissionRequestHandler: vi.fn(),
          webRequest: { onBeforeRequest: vi.fn() },
          setProxy: vi.fn(async () => undefined)
        })
        h.sessions.set(partition, ses)
      }
      return ses
    }
  }
  return { BrowserWindow, session }
})

const { createDyWindow, dySession, ENTRY_URL, isTrustedUrl } = await import('./window')

type Mocked = ReturnType<typeof vi.fn>
interface FakeWindow {
  options: Record<string, unknown>
  destroyed: boolean
  visible: boolean
  setTitle: Mocked
  focus: Mocked
  show: Mocked
  hide: Mocked
  destroy: Mocked
  emit: (name: string, ...args: unknown[]) => boolean
  listenerCount: (name: string) => number
  webContents: {
    setAudioMuted: Mocked
    setWindowOpenHandler: Mocked
    loadURL: Mocked
    executeJavaScript: Mocked
    emit: (name: string, ...args: unknown[]) => boolean
    listenerCount: (name: string) => number
  }
}
interface FakeSession {
  setUserAgent: Mocked
  setPermissionRequestHandler: Mocked
  setProxy: Mocked
  webRequest: { onBeforeRequest: Mocked }
  emit: (name: string, ...args: unknown[]) => boolean
}

let n = 0
/** 会话的通用设置只做一次，每个用例用自己的分区 */
const partition = (): string => `persist:douyin-test-${++n}`
const proxy = { mode: 'system' as const }
const make = async (p = partition()) => {
  const dy = await createDyWindow({ partition: p, userAgent: 'test-agent', proxy })
  return { dy, win: h.windows.at(-1) as FakeWindow, ses: h.sessions.get(p) as FakeSession }
}
const cancels = (ses: FakeSession, resourceType: string): boolean => {
  let cancel: boolean | undefined
  ses.webRequest.onBeforeRequest.mock.calls[0][0]({ resourceType }, (r: { cancel: boolean }) => (cancel = r.cancel))
  return cancel!
}

beforeEach(() => {
  h.windows.length = 0
})
afterEach(() => vi.useRealTimers())

describe('isTrustedUrl', () => {
  it('只信任 https 的抖音和字节系域名', () => {
    for (const url of [
      'https://www.douyin.com/user/self',
      'https://douyin.com/',
      'https://sso.douyin.com/x',
      'https://www.iesdouyin.com/share',
      'https://verify.zijieapi.com/captcha',
      'https://bytedance.com/',
      'https://rmc.bytedance.com/',
      'https://a.snssdk.com/'
    ]) expect(isTrustedUrl(url), url).toBe(true)
    for (const url of [
      'http://www.douyin.com/',
      'https://douyin.com.evil.example/',
      'https://evildouyin.com/',
      'https://notbytedance.com.example/',
      'https://xbytedance.com/',
      'file:///etc/hosts',
      '不是网址',
      ''
    ]) expect(isTrustedUrl(url), url).toBe(false)
  })
})

describe('dySession', () => {
  it('设置 UA、拒绝权限和下载，同一个分区只设置一次', () => {
    const p = partition()
    const first = dySession(p, 'test-agent') as unknown as FakeSession
    expect(dySession(p, 'other-agent')).toBe(first)
    expect(first.setUserAgent).toHaveBeenCalledExactlyOnceWith('test-agent', 'zh-CN,zh;q=0.9')
    expect(first.webRequest.onBeforeRequest).toHaveBeenCalledTimes(1)
    const done = vi.fn()
    first.setPermissionRequestHandler.mock.calls[0][0](null, 'notifications', done)
    expect(done).toHaveBeenCalledWith(false)
    const download = { preventDefault: vi.fn() }
    first.emit('will-download', download)
    expect(download.preventDefault).toHaveBeenCalled()
  })

  it('媒体总是拦掉；图片、字体、样式只在需要省流量时拦', async () => {
    const { dy, ses } = await make()
    expect(['media', 'image', 'font', 'stylesheet', 'script', 'xhr'].map((r) => cancels(ses, r))).toEqual([true, false, false, false, false, false])
    dy.setBlocking(true)
    expect(['media', 'image', 'font', 'stylesheet', 'script', 'xhr'].map((r) => cancels(ses, r))).toEqual([true, true, true, true, false, false])
    dy.setBlocking(false)
    expect(['media', 'image'].map((r) => cancels(ses, r))).toEqual([true, false])
  })
})

describe('createDyWindow', () => {
  it('在指定分区里建隐藏的沙盒窗口，静音、禁止弹窗', async () => {
    const p = partition()
    const { win, ses } = await make(p)
    expect(ses.setProxy).toHaveBeenCalledWith(proxy)
    expect(win.options).toMatchObject({
      show: false,
      webPreferences: { partition: p, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
    })
    expect(win.webContents.setAudioMuted).toHaveBeenCalledWith(true)
    expect(win.webContents.setWindowOpenHandler.mock.calls[0][0]()).toEqual({ action: 'deny' })
  })

  it('只允许跳到受信任的网页', async () => {
    const { win } = await make()
    const ok = { preventDefault: vi.fn() }
    win.webContents.emit('will-navigate', ok, 'https://verify.zijieapi.com/')
    expect(ok.preventDefault).not.toHaveBeenCalled()
    const bad = { preventDefault: vi.fn() }
    win.webContents.emit('will-navigate', bad, 'https://evil.example/')
    expect(bad.preventDefault).toHaveBeenCalled()
  })

  it('DOM 就绪就算载入完成', async () => {
    vi.useFakeTimers()
    const { dy, win } = await make()
    const done = vi.fn()
    void dy.load().then(done)
    expect(win.webContents.loadURL).toHaveBeenCalledWith(ENTRY_URL)
    await vi.advanceTimersByTimeAsync(10)
    expect(done).not.toHaveBeenCalled()
    win.webContents.emit('dom-ready')
    await vi.advanceTimersByTimeAsync(0)
    expect(done).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('迟迟没有就绪时 30 秒后按完成处理', async () => {
    vi.useFakeTimers()
    const { dy } = await make()
    const done = vi.fn()
    void dy.load().then(done)
    await vi.advanceTimersByTimeAsync(29_999)
    expect(done).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toHaveBeenCalled()
  })

  it('打开失败时抛出原因', async () => {
    vi.useFakeTimers()
    const { dy, win } = await make()
    win.webContents.loadURL.mockRejectedValue(Object.assign(new Error('断网了'), { code: 'ERR_INTERNET_DISCONNECTED' }))
    await expect(dy.load()).rejects.toThrow('断网了')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('页面自己又跳转导致首次载入中止时不算失败', async () => {
    vi.useFakeTimers()
    const { dy, win } = await make()
    win.webContents.loadURL.mockRejectedValue(Object.assign(new Error('aborted'), { code: 'ERR_ABORTED' }))
    const load = dy.load()
    await vi.advanceTimersByTimeAsync(0)
    win.webContents.emit('dom-ready')
    await expect(load).resolves.toBeUndefined()
  })

  it('在页面里执行脚本', async () => {
    const { dy } = await make()
    expect(await dy.evaluate('1+1')).toBe('ran:1+1')
  })

  it('亮出窗口时换标题并固定住、提到前面', async () => {
    const { dy, win } = await make()
    dy.show('请完成验证')
    expect(win.setTitle).toHaveBeenCalledWith('请完成验证')
    expect(win.show).toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalled()
    const e = { preventDefault: vi.fn() }
    win.emit('page-title-updated', e)
    expect(e.preventDefault).toHaveBeenCalled()
  })

  it('用户关掉亮出来的窗口：只藏起来并通知上层', async () => {
    const { dy, win } = await make()
    const closed = vi.fn()
    dy.onUserClose(closed)
    dy.show('验证')
    const e = { preventDefault: vi.fn() }
    win.emit('close', e)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(win.hide).toHaveBeenCalled()
    expect(closed).toHaveBeenCalledTimes(1)
    expect(win.destroy).not.toHaveBeenCalled()
  })

  it('没人等着、或窗口没亮出来时照常关闭', async () => {
    const { dy, win } = await make()
    const e = { preventDefault: vi.fn() }
    win.visible = true
    win.emit('close', e)
    const closed = vi.fn()
    dy.onUserClose(closed)
    win.visible = false
    win.emit('close', e)
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(closed).not.toHaveBeenCalled()
  })

  it('销毁后不再存活，重复销毁不报错', async () => {
    const { dy, win } = await make()
    expect(dy.isAlive()).toBe(true)
    dy.destroy()
    expect(dy.isAlive()).toBe(false)
    dy.destroy()
    expect(win.destroy).toHaveBeenCalledTimes(1)
  })
})
