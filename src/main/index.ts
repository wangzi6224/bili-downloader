import { join } from 'node:path'
import { app, BrowserWindow, Menu, nativeTheme, Notification, screen, shell } from 'electron'
import type { TaskInfo } from '@shared/types'
import { checkAuth, checkAuthThrottled, onAuthRequired, onLoggedIn, requireLogin } from './auth/authGuard'
import { DownloadManager } from './download/manager'
import { recordDownload } from './history'
import { limiter } from './download/rateLimiter'
import { registerIpc, restoreSimulatedExpiry, simulateExpiry } from './ipc'
import { initLogger, logDir } from './logger'
import { applyPower } from './power'
import { getSettings, onSettingsChange } from './settings'
import { readJson, writeJson } from './store'
import { getMainWindow, send, setMainWindow } from './windows'

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL)
const windowStateFile = (): string => join(app.getPath('userData'), 'window.json')

type Bounds = { x: number; y: number; width: number; height: number }

/** 上次的窗口位置；所在的显示器已经不在了就不用 */
function savedBounds(): Partial<Bounds> {
  const b = readJson<Bounds>(windowStateFile())
  if (!b) return {}
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea
    return b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y
  })
  return visible ? b : { width: b.width, height: b.height }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    ...savedBounds(),
    minWidth: 900,
    minHeight: 600,
    title: 'B站下载器',
    titleBarStyle: 'hiddenInset',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#17181a' : '#f6f7f8',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })
  setMainWindow(win)
  win.once('ready-to-show', () => win.show())
  win.on('close', () => {
    if (!win.isFullScreen() && !win.isMinimized()) writeJson(windowStateFile(), win.getNormalBounds())
  })
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

function showMainWindow(): void {
  const win = getMainWindow() ?? createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: '打开日志文件夹', click: () => void shell.openPath(logDir()) },
        { label: '打开数据文件夹', click: () => void shell.openPath(app.getPath('userData')) }
      ]
    }
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

// 只允许运行一个实例：再次打开时激活已有窗口
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showMainWindow)
  app.whenReady().then(start)
}

function start(): void {
  initLogger()
  const settings = getSettings()
  nativeTheme.themeSource = settings.theme
  limiter.setLimit(settings.speedLimit)

  const manager = new DownloadManager(
    join(app.getPath('userData'), 'tmp'),
    join(app.getPath('userData'), 'tasks.json'),
    getSettings
  )
  manager.on('update', (tasks) => send('dl:update', tasks))
  manager.on('done', (t: TaskInfo) =>
    recordDownload({ key: t.item.key, title: t.title, groupTitle: t.groupTitle, path: t.outputPath ?? '', at: Date.now() })
  )
  manager.on('active', (active: boolean) => applyPower(active, getSettings().powerMode))
  manager.on('idle', ({ done, failed }: { done: number; failed: number }) => {
    if (!getSettings().notify || !Notification.isSupported()) return
    const n = new Notification({
      title: failed ? '下载结束，有任务失败' : '下载完成',
      body: failed ? `完成 ${done} 个，失败 ${failed} 个` : `${done} 个任务已全部完成`
    })
    n.on('click', showMainWindow)
    n.show()
  })
  onSettingsChange((s) => {
    nativeTheme.themeSource = s.theme
    limiter.setLimit(s.speedLimit)
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

  app.on('activate', showMainWindow)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
