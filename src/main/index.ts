import { join } from 'node:path'
import { app, BrowserWindow, Menu, shell } from 'electron'
import { checkAuth, checkAuthThrottled, onAuthRequired, onLoggedIn, requireLogin } from './auth/authGuard'
import { DownloadManager } from './download/manager'
import { registerIpc, restoreSimulatedExpiry, simulateExpiry } from './ipc'
import { applyPower } from './power'
import { getSettings, onSettingsChange } from './settings'
import { getMainWindow, send, setMainWindow } from './windows'

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL)

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    title: 'B站下载器',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f6f7f8',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })
  setMainWindow(win)
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => setMainWindow(null))
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // 窗口切回前台时顺便检查登录状态（至少间隔 10 分钟）
  win.on('focus', () => {
    checkAuthThrottled(10 * 60_000)
      .then((s) => {
        if (!s.loggedIn) requireLogin()
      })
      .catch(() => {})
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]
  if (isDev) {
    template.push({
      label: '调试',
      submenu: [
        { label: '模拟登录过期', click: () => void simulateExpiry() },
        { label: '恢复真实登录', click: () => void restoreSimulatedExpiry() }
      ]
    })
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.setName('B站下载器')

app.whenReady().then(() => {
  const manager = new DownloadManager(
    join(app.getPath('userData'), 'tmp'),
    join(app.getPath('userData'), 'tasks.json'),
    getSettings
  )
  manager.on('update', (tasks) => send('dl:update', tasks))
  manager.on('active', (active: boolean) => applyPower(active, getSettings().powerMode))
  onSettingsChange((s) => {
    applyPower(manager.list().some((t) => ['fetching', 'downloading', 'merging', 'extras'].includes(t.status)), s.powerMode)
    manager.schedule()
  })
  onAuthRequired(() => manager.blockForAuth())
  onLoggedIn(() => manager.unblockAuth())

  app.on('before-quit', () => manager.flush())

  registerIpc(manager)
  buildMenu()
  createWindow()

  // 启动时确认登录状态，未登录就弹出登录
  getMainWindow()?.webContents.once('did-finish-load', () => {
    checkAuth()
      .then((s) => {
        if (!s.loggedIn) requireLogin()
      })
      .catch(() => {})
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
