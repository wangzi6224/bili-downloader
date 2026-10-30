import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMainWindow, hideMainWindow, send, setMainWindow, showDialog } from './windows'

const h = vi.hoisted(() => ({ focus: vi.fn(), showMessageBox: vi.fn() }))
vi.mock('electron', () => ({ app: { focus: h.focus }, dialog: { showMessageBox: h.showMessageBox } }))

function fakeWindow(o: { destroyed?: boolean; fullScreen?: boolean; visible?: boolean } = {}) {
  const state = { destroyed: o.destroyed ?? false, fullScreen: o.fullScreen ?? false, visible: o.visible ?? true }
  return Object.assign(new EventEmitter(), {
    isDestroyed: () => state.destroyed,
    isFullScreen: () => state.fullScreen,
    isVisible: () => state.visible,
    setFullScreen: vi.fn((v: boolean) => {
      state.fullScreen = v
    }),
    hide: vi.fn(),
    webContents: { send: vi.fn() }
  })
}
const use = (win: ReturnType<typeof fakeWindow>): void => setMainWindow(win as unknown as BrowserWindow)

afterEach(() => {
  setMainWindow(null)
  vi.clearAllMocks()
})

describe('showDialog', () => {
  const opts = { message: '确定吗？' }

  it('窗口可见时挂在窗口上', () => {
    const win = fakeWindow()
    use(win)
    void showDialog(opts)
    expect(h.showMessageBox).toHaveBeenCalledWith(win, opts)
  })

  it.each([
    ['窗口隐藏', () => use(fakeWindow({ visible: false }))],
    ['没有窗口', () => {}]
  ])('%s时单独弹出', (_, arrange) => {
    arrange()
    void showDialog(opts)
    expect(h.showMessageBox).toHaveBeenCalledWith(opts)
  })

  it('弹出前先把应用切到前台', () => {
    void showDialog(opts)
    expect(h.focus).toHaveBeenCalledWith({ steal: true })
    expect(h.focus.mock.invocationCallOrder[0]).toBeLessThan(h.showMessageBox.mock.invocationCallOrder[0])
  })
})

describe('windows', () => {
  it('没有窗口时推送和隐藏什么都不做', () => {
    expect(getMainWindow()).toBeNull()
    expect(() => {
      send('dl:update', [])
      hideMainWindow()
    }).not.toThrow()
  })

  it('窗口已销毁视为没有窗口', () => {
    const win = fakeWindow({ destroyed: true })
    use(win)
    expect(getMainWindow()).toBeNull()
    send('dl:update', [])
    hideMainWindow()
    expect(win.webContents.send).not.toHaveBeenCalled()
    expect(win.hide).not.toHaveBeenCalled()
  })

  it('向渲染进程推送事件', () => {
    const win = fakeWindow()
    use(win)
    expect(getMainWindow()).toBe(win)
    send('parse:progress', { done: 1, total: 2 })
    expect(win.webContents.send).toHaveBeenCalledWith('parse:progress', { done: 1, total: 2 })
  })

  it('普通窗口直接隐藏', () => {
    const win = fakeWindow()
    use(win)
    hideMainWindow()
    expect(win.hide).toHaveBeenCalledOnce()
    expect(win.setFullScreen).not.toHaveBeenCalled()
  })

  it('全屏时先退出全屏，退出完成后再隐藏', () => {
    const win = fakeWindow({ fullScreen: true })
    use(win)
    hideMainWindow()
    expect(win.setFullScreen).toHaveBeenCalledWith(false)
    expect(win.hide).not.toHaveBeenCalled()
    win.emit('leave-full-screen')
    expect(win.hide).toHaveBeenCalledOnce()
  })
})
