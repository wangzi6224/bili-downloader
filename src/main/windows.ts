import type { BrowserWindow } from 'electron'

let mainWindow: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

/** 隐藏到后台；全屏时要先退出全屏，否则 macOS 会留下一块黑屏 */
export function hideMainWindow(): void {
  const win = getMainWindow()
  if (!win) return
  if (win.isFullScreen()) {
    win.once('leave-full-screen', () => win.hide())
    win.setFullScreen(false)
  } else win.hide()
}

/** 向主窗口的渲染进程推送事件 */
export function send(channel: string, ...args: unknown[]): void {
  getMainWindow()?.webContents.send(channel, ...args)
}
