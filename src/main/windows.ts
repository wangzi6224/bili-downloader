import { app, dialog, type BrowserWindow, type MessageBoxOptions, type MessageBoxReturnValue } from 'electron'

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

/**
 * 系统对话框：窗口在前台时挂在窗口上，隐藏在后台时单独弹出。
 * 从托盘、程序坞操作时应用多半不在前台，先切过来，免得对话框被别的窗口挡住
 */
export function showDialog(opts: MessageBoxOptions): Promise<MessageBoxReturnValue> {
  app.focus({ steal: true })
  const win = getMainWindow()
  return win?.isVisible() ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts)
}

/** 向主窗口的渲染进程推送事件 */
export function send(channel: string, ...args: unknown[]): void {
  getMainWindow()?.webContents.send(channel, ...args)
}
