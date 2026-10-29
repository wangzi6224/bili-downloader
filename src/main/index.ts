import { join } from 'node:path'
import { app, BrowserWindow, Menu, nativeTheme, Notification, screen, shell } from 'electron'
import type { TaskInfo } from '@shared/types'
import { checkAuth, checkAuthThrottled, onAuthRequired, onLoggedIn, requireLogin } from './auth/authGuard'
import { expandLazy, loadAllPages } from './bili/lists'
import { DownloadManager } from './download/manager'
import { makeEnqueue } from './enqueue'
import { downloadedKeys, recordDownload, removeDownloads } from './history'
import { limiter } from './download/rateLimiter'
import { parseAndRecord, registerIpc, restoreSimulatedExpiry, simulateExpiry } from './ipc'
import { initLogger, logDir } from './logger'
import { stopsBatch } from './mcp/format'
import { McpServer } from './mcp/server'
import { McpTools } from './mcp/tools'
import { applyNetwork } from './net/network'
import { applyPower } from './power'
import { allowQuit } from './quitGuard'
import { getSettings, onSettingsChange, updateSettings } from './settings'
import { readJson, writeJson } from './store'
import { SubscriptionManager } from './subscriptions'
import { Updater } from './update/updater'
import { closeDecision, restoreBounds, type Bounds } from './windowState'
import { getMainWindow, hideMainWindow, send, setMainWindow } from './windows'

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL)
/** ⌘Q、程序坞“退出”等真正退出（确认放行后）时，关窗口不再拦截 */
let quitting = false
const windowStateFile = (): string => join(app.getPath('userData'), 'window.json')

/** 上次的窗口位置；所在的显示器已经不在了就不用 */
const savedBounds = (): Partial<Bounds> =>
  restoreBounds(readJson<Bounds>(windowStateFile()), screen.getAllDisplays().map((d) => d.workArea))

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    ...savedBounds(),
    minWidth: 900,
    minHeight: 600,
    title: 'B站下载器',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    // 侧边栏透出系统毛玻璃，内容区由页面自己铺底色
    vibrancy: 'sidebar',
    visualEffectState: 'followWindow',
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })
  setMainWindow(win)
  win.once('ready-to-show', () => win.show())
  win.on('close', (e) => {
    if (!win.isFullScreen() && !win.isMinimized()) writeJson(windowStateFile(), win.getNormalBounds())
    const decision = closeDecision({ quitting, crashed: win.webContents.isCrashed(), action: getSettings().closeAction })
    if (decision === 'allow') return
    e.preventDefault()
    if (decision === 'quit') app.quit()
    else if (decision === 'hide') hideMainWindow()
    else send('app:closeRequested')
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
  app.whenReady().then(() => start())
}

function notify(title: string, body: string): void {
  if (!getSettings().notify || !Notification.isSupported()) return
  const n = new Notification({ title, body })
  n.on('click', showMainWindow)
  n.show()
}

async function start(): Promise<void> {
  initLogger()
  const settings = getSettings()
  nativeTheme.themeSource = settings.theme
  limiter.setLimit(settings.speedLimit)
  await applyNetwork(settings, true)

  const manager = new DownloadManager(
    join(app.getPath('userData'), 'tmp'),
    join(app.getPath('userData'), 'tasks.json'),
    getSettings
  )
  manager.on('update', (tasks) => send('dl:update', tasks))
  manager.on('done', (t: TaskInfo) =>
    recordDownload({ key: t.item.key, title: t.title, groupTitle: t.groupTitle, path: t.outputPath ?? '', at: Date.now() })
  )
  manager.on('purged', (tasks: TaskInfo[]) => removeDownloads(tasks.map((t) => t.item.key)))
  manager.on('active', (active: boolean) => applyPower(active, getSettings().powerMode))
  manager.on('idle', ({ done, failed }: { done: number; failed: number }) =>
    notify(failed ? '下载结束，有任务失败' : '下载完成', failed ? `完成 ${done} 个，失败 ${failed} 个` : `${done} 个任务已全部完成`)
  )

  const enqueue = makeEnqueue(manager)
  const subs = new SubscriptionManager(enqueue)
  subs.on('update', (list) => send('subs:update', list))
  subs.on('found', ({ title, count }: { title: string; count: number }) => notify('订阅有更新', `“${title}”有 ${count} 个新内容，已加入下载`))
  subs.start()

  const mcpTools = new McpTools({
    parseAll: async (input, maxItems) => loadAllPages(await parseAndRecord(input), { maxItems }),
    expandLazy: (items) => expandLazy(items, undefined, stopsBatch),
    queue: manager,
    batchFile: join(app.getPath('userData'), 'mcp-batches.json'),
    downloadedKeys,
    settings: getSettings,
    updateSettings,
    authState: () => checkAuthThrottled(60_000)
  })
  const mcp = new McpServer(mcpTools)
  void mcp.apply(settings.mcp)

  onSettingsChange((s) => {
    send('settings:changed', s)
    nativeTheme.themeSource = s.theme
    limiter.setLimit(s.speedLimit)
    void applyNetwork(s)
    void mcp.apply(s.mcp)
    applyPower(manager.list().some((t) => ['fetching', 'downloading', 'merging', 'extras'].includes(t.status)), s.powerMode)
    manager.schedule()
  })
  onAuthRequired(() => manager.blockForAuth())
  onLoggedIn(() => manager.unblockAuth())

  const updater = new Updater(join(app.getPath('userData'), 'update'), join(app.getPath('userData'), 'updater.json'))

  // 只注册这一个：退出被取消时其他监听器照样会执行，会把 quitting 置上、把后台服务停掉
  app.on('before-quit', (e) => {
    if (!allowQuit(e, manager.pendingCount())) return
    quitting = true
    manager.flush()
    mcpTools.batches.flush()
    subs.stop()
    void mcp.stop()
    updater.stop()
  })

  registerIpc({ manager, subs, mcp, enqueue, updater })
  buildMenu()
  // 打包后用 app 自带的 icon.icns；开发时程序坞默认是 Electron 图标
  if (isDev) app.dock?.setIcon(join(__dirname, '../../build/icon.png'))
  createWindow()

  // 启动时确认登录状态，未登录就弹出登录；稍后再检查更新，免得和登录弹窗挤在一起
  getMainWindow()?.webContents.once('did-finish-load', () => {
    checkAuth()
      .then((s) => {
        if (!s.loggedIn) requireLogin()
      })
      .catch(() => {})
    setTimeout(() => updater.start(() => getSettings().autoCheckUpdate), 3000)
  })

  app.on('activate', showMainWindow)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
