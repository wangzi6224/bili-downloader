import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  quit: vi.fn(),
  showDialog: vi.fn(),
  hideMainWindow: vi.fn(),
  onShutdown: undefined as undefined | (() => void)
}))
vi.mock('electron', () => ({
  app: { whenReady: () => Promise.resolve(), quit: h.quit },
  powerMonitor: {
    on: (event: string, fn: () => void) => {
      if (event === 'shutdown') h.onShutdown = fn
    }
  }
}))
vi.mock('./windows', () => ({ hideMainWindow: h.hideMainWindow, showDialog: h.showDialog }))

let guard: typeof import('./quitGuard')
const flush = (): Promise<void> => new Promise((r) => setImmediate(r))
const quitEvent = () => ({ preventDefault: vi.fn() })
const allow = (e: ReturnType<typeof quitEvent>, pending: number): boolean => guard.allowQuit(e as unknown as Electron.Event, pending)

beforeEach(async () => {
  vi.clearAllMocks()
  h.onShutdown = undefined
  // “已确认退出”记在模块里，每个用例重新加载
  vi.resetModules()
  guard = await import('./quitGuard')
  await flush()
})

describe('allowQuit', () => {
  it('没有未完成的任务直接放行', () => {
    const e = quitEvent()
    expect(allow(e, 0)).toBe(true)
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(h.showDialog).not.toHaveBeenCalled()
  })

  it('有未完成的任务时拦下退出并询问', async () => {
    h.showDialog.mockResolvedValue({ response: 2 })
    const e = quitEvent()
    expect(allow(e, 3)).toBe(false)
    expect(e.preventDefault).toHaveBeenCalled()
    const args = h.showDialog.mock.calls[0]
    expect(args[0].message).toBe('还有 3 个任务没下载完，确定要退出吗？')
    expect(args[0].buttons).toEqual(['后台运行', '退出', '取消'])
  })

  it('选“后台运行”就隐藏窗口，不退出', async () => {
    h.showDialog.mockResolvedValue({ response: 0 })
    allow(quitEvent(), 1)
    await flush()
    expect(h.hideMainWindow).toHaveBeenCalled()
    expect(h.quit).not.toHaveBeenCalled()
  })

  it('选“退出”就真正退出，之后的退出直接放行', async () => {
    h.showDialog.mockResolvedValue({ response: 1 })
    allow(quitEvent(), 1)
    await flush()
    expect(h.quit).toHaveBeenCalledOnce()
    const e = quitEvent()
    expect(allow(e, 1)).toBe(true)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('选“取消”什么都不做，下次退出还会询问', async () => {
    h.showDialog.mockResolvedValue({ response: 2 })
    allow(quitEvent(), 1)
    await flush()
    expect(h.quit).not.toHaveBeenCalled()
    expect(h.hideMainWindow).not.toHaveBeenCalled()
    expect(allow(quitEvent(), 1)).toBe(false)
    expect(h.showDialog).toHaveBeenCalledTimes(2)
  })

  it('弹窗还开着时再按退出不重复弹', async () => {
    let answer!: (r: { response: number }) => void
    h.showDialog.mockReturnValue(new Promise((r) => (answer = r)))
    allow(quitEvent(), 1)
    expect(allow(quitEvent(), 1)).toBe(false)
    expect(h.showDialog).toHaveBeenCalledOnce()
    answer({ response: 2 })
    await flush()
    h.showDialog.mockResolvedValue({ response: 2 })
    allow(quitEvent(), 1)
    expect(h.showDialog).toHaveBeenCalledTimes(2)
  })

  it('关机、注销时直接放行', () => {
    h.onShutdown!()
    const e = quitEvent()
    expect(allow(e, 5)).toBe(true)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })
})

describe('quitConfirmed', () => {
  it('界面里已经确认过的退出直接放行', () => {
    guard.quitConfirmed()
    expect(h.quit).toHaveBeenCalledOnce()
    expect(allow(quitEvent(), 2)).toBe(true)
  })
})
