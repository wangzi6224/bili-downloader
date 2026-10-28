import type { BrowserWindow } from 'electron'

let mainWindow: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

/** 向主窗口的渲染进程推送事件 */
export function send(channel: string, ...args: unknown[]): void {
  getMainWindow()?.webContents.send(channel, ...args)
}
