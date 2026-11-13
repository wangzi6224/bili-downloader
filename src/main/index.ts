import { join } from 'node:path'
import { app, BrowserWindow, Menu, nativeImage, nativeTheme, Notification, screen, shell, Tray } from 'electron'
import type { TaskInfo, UserInfo } from '@shared/types'
import { activeAuthState, checkAuth, checkAuthThrottled, onLoginChanged, requireLogin } from './auth/authGuard'
import { accounts } from './auth/accounts'
import { endAccount as endAccountWith, type Requester } from './auth/handover'
import { activeScope, inAuthScope } from './auth/scope'
import { canCloseBrowser, closeBrowser, confirmCloseBrowser } from './auth/browserClose'
import { importFromBrowser, isProfileLocked, listBrowserProfiles } from './auth/browserImport'
import { isLoginWindowOpen, openLoginWindow } from './auth/loginWindow'
import { expandLazy, loadAllPages } from './bili/lists'
import { biliLookup } from './bili/lookup'
import { downloadableQualities, getPlayInfo } from './bili/playurl'
import { resolveInput } from './bili/resolve'
import { DownloadManager } from './download/manager'
import { makeEnqueue } from './enqueue'
import { downloadedKeys, downloadRecords, onDownloadsChanged, parseRecords, recordDownload, removeDownloads } from './history'
import { limiter } from './download/rateLimiter'
import { parseAndRecord, registerIpc, restoreSimulatedExpiry, simulateExpiry } from './ipc'
import { initLogger, logDir } from './logger'
import { invalid, stopsBatch } from './mcp/format'
import { LoginFlow } from './mcp/loginFlow'
import { McpServer } from './mcp/server'
import { McpTools } from './mcp/tools'
import { applyNetwork } from './net/network'
import { applyPower } from './power'
import { allowQuit } from './quitGuard'
import { getSettings, onSettingsChange, updateSettings } from './settings'
import { readJson, writeJson } from './store'
import { SubscriptionManager } from './subscriptions'
import { trayMenu, updateCheckReply } from './tray'
import { Updater } from './update/updater'
import { aiModel } from './watermark/ai'
import { inspectWatermark, requireVideoTask } from './watermark/manual'
import { initOrphans } from './watermark/orphans'
import { estimateTime, initSpeed, speedRatio } from './watermark/speed'
import { closeDecision, restoreBounds, type Bounds } from './windowState'
import { getMainWindow, hideMainWindow, send, setMainWindow, showDialog } from './windows'
import { applyLanguage } from './i18n'
import { bridgeEntry, installBridge } from './agents/entry'
import { Integrations } from './agents/integrations'
import { agentEnv, AGENTS } from './agents/registry'
import { getLanguage, t } from '@shared/i18n'

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL)
const isMac = process.platform === 'darwin'
/** AI agent 调用工具时应用没开，由桥接进程带着 --background 拉起：只显示托盘，不打开窗口 */
const background = process.argv.includes('--background')
/** ⌘Q、程序坞“退出”等真正退出（确认放行后）时，关窗口不再拦截 */
let quitting = false
const windowStateFile = (): string => join(app.getPath('userData'), 'window.json')

/** Windows 和 Linux 窗口、托盘和通知用的图标；macOS 用 .app 里的 icns */
const appIcon = (): string =>
  app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../../build/icons/256x256.png')

/** 窗口隐藏到后台后从这里找回来。存着引用，免得被回收后图标消失 */
let tray: Tray | undefined

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
    title: t('common.appName'),
    ...platformWindowOptions(),
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
    void inAuthScope(activeScope(), async () => {
      const auth = await checkAuthThrottled(10 * 60_000)
      if (!auth.loggedIn) requireLogin()
    }).catch(() => {})
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

function platformWindowOptions(): Electron.BrowserWindowConstructorOptions {
  if (isMac) {
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 18, y: 18 },
      // 侧边栏透出系统毛玻璃，内容区由页面自己铺底色
      vibrancy: 'sidebar',
      visualEffectState: 'followWindow',
      backgroundColor: '#00000000'
    }
  }
  // 用系统标题栏；没有毛玻璃，底色和页面里非 macOS 的底色（--surface）一致，免得打开时闪一下。菜单栏按 Alt 显示
  return { backgroundColor: nativeTheme.shouldUseDarkColors ? '#252528' : '#f7f7f9', icon: appIcon(), autoHideMenuBar: true }
}

function showMainWindow(): void {
  // 后台启动时隐藏了程序坞图标，打开窗口时再显示
  if (isMac && app.dock && !app.dock.isVisible()) void app.dock.show()
  const win = getMainWindow() ?? createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  // 从托盘打开时应用不在前台，旧版 macOS 上只调 focus 切不过来
  app.focus({ steal: true })
  win.focus()
}

/** Windows 和 Linux 菜单标签不会按系统语言翻译，按界面语言自己写；macOS 用系统原生菜单 */
const desktopMenu = (): Electron.MenuItemConstructorOptions[] => [
  // Electron 在 Windows 上不给 quit 绑快捷键，设置页里写着 Ctrl+Q
  { label: t('menu.file'), submenu: [{ label: t('menu.quit'), role: 'quit', accelerator: 'CmdOrCtrl+Q' }] },
  {
    label: t('menu.edit'),
    submenu: [
      { label: t('menu.undo'), role: 'undo' },
      { label: t('menu.redo'), role: 'redo' },
      { type: 'separator' },
      { label: t('menu.cut'), role: 'cut' },
      { label: t('menu.copy'), role: 'copy' },
      { label: t('menu.paste'), role: 'paste' },
      { label: t('menu.selectAll'), role: 'selectAll' }
    ]
  },
  {
    label: t('menu.view'),
    submenu: [
      { label: t('menu.reload'), role: 'reload' },
      { label: t('menu.forceReload'), role: 'forceReload' },
      { label: t('menu.devTools'), role: 'toggleDevTools' },
      { type: 'separator' },
      { label: t('menu.actualSize'), role: 'resetZoom' },
      { label: t('menu.zoomIn'), role: 'zoomIn' },
      { label: t('menu.zoomOut'), role: 'zoomOut' },
      { type: 'separator' },
      { label: t('menu.fullscreen'), role: 'togglefullscreen' }
    ]
  }
]

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? ([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }] as const) : desktopMenu()),
    {
      role: 'help',
      // macOS 按系统语言自动翻译
      label: isMac ? undefined : t('menu.help'),
      submenu: [
        { label: t('menu.openLogDir'), click: () => void shell.openPath(logDir()) },
        { label: t('menu.openDataDir'), click: () => void shell.openPath(app.getPath('userData')) }
      ]
    }
  ]
  if (isDev) {
    template.push({
      label: t('menu.debug'),
      submenu: [
        { label: t('menu.simulateExpiry'), click: () => void simulateExpiry() },
        { label: t('menu.restoreLogin'), click: () => void restoreSimulatedExpiry() }
      ]
    })
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** macOS 菜单栏用单色的 template 图片，系统按菜单栏深浅着色（同名的 @2x 会一并读入）；其他系统用彩色的应用图标 */
function trayImage(): Electron.NativeImage {
  if (!isMac) return nativeImage.createFromPath(appIcon()).resize({ width: 32, height: 32 })
  return nativeImage.createFromPath(join(app.isPackaged ? process.resourcesPath : join(__dirname, '../../build'), 'trayTemplate.png'))
}

/** 打开窗口并让页面处理这个事件 */
function showAndSend(channel: string): void {
  showMainWindow()
  send(channel)
}

/** 退出账号：问过用户后按选择处理它名下的任务和订阅。启动后才接上下载队列和订阅 */
let endAccount: (mid: number, requester: Requester) => Promise<boolean> = async () => false

async function confirmLogout(user: UserInfo): Promise<void> {
  if (accounts.status(user.mid) !== 'ready') return
  await endAccount(user.mid, 'user')
}

async function checkUpdateFromTray(updater: Updater): Promise<void> {
  const reply = updateCheckReply(await updater.check(true))
  if (reply === 'prompt') showAndSend('update:prompt')
  else if (reply) await showDialog(reply)
}

/** 托盘菜单和提示按当前登录状态和界面语言重建；托盘建好后才有 */
let refreshTray: (() => void) | undefined

/** 窗口隐藏到后台后靠托盘（macOS 上是菜单栏）图标找回，常用操作也放在它的菜单里 */
function createTray(updater: Updater): void {
  tray = new Tray(trayImage())
  const refreshMenu = (): void => {
    const auth = activeAuthState()
    const trayAuth = auth.loggedIn && accounts.status(auth.user.mid) === 'ready' ? auth : { loggedIn: false } as const
    tray?.setToolTip(t('common.appName'))
    tray?.setContextMenu(
      Menu.buildFromTemplate(
        trayMenu(trayAuth, {
          show: showMainWindow,
          settings: () => showAndSend('app:openSettings'),
          checkUpdate: () => void checkUpdateFromTray(updater),
          // 这里只打开登录框；窗口获得焦点时的登录检查还是可能暂停下载队列，和平时切回窗口一样
          login: () => showAndSend('auth:required'),
          logout: (user) => void confirmLogout(user).catch((e) => console.error('退出登录失败', e)),
          quit: () => app.quit()
        })
      )
    )
  }
  refreshTray = refreshMenu
  refreshMenu()
  onLoginChanged(refreshMenu)
  // macOS 上单击图标就弹出菜单，菜单栏图标的惯例也是这样，不再同时弹出窗口
  if (!isMac) tray.on('click', showMainWindow)
}

app.setName('B站下载器')
// 和安装器建的快捷方式一致（electron-builder.yml 的 appId），通知才显示应用名，任务栏才不会分成两个图标
if (process.platform === 'win32') app.setAppUserModelId(app.isPackaged ? 'com.wangzi6224.bili-downloader' : process.execPath)

// 只允许运行一个实例：再次打开时激活已有窗口
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // 桥接进程在应用已经开着时也可能再拉一次（例如刚好在启动中），这时不弹窗口
  app.on('second-instance', (_e, argv) => {
    if (!argv.includes('--background')) showMainWindow()
  })
  app.whenReady().then(() => start())
}

function notify(title: string, body: string): void {
  if (!getSettings().notify || !Notification.isSupported()) return
  const n = new Notification({ title, body, icon: isMac ? undefined : appIcon() })
  n.on('click', showMainWindow)
  n.show()
}

async function start(): Promise<void> {
  initLogger()
  const settings = getSettings()
  // 菜单、托盘、对话框和报错都要用到，最先确定
  applyLanguage(settings.language)
  nativeTheme.themeSource = settings.theme
  limiter.setLimit(settings.speedLimit)
  accounts.init(join(app.getPath('userData'), 'accounts.json'))
  await applyNetwork(settings, true)

  // 先结束上次崩溃时没退出的转码进程，下面清理残留文件时它们就不会再占着文件
  initOrphans(join(app.getPath('userData'), 'ffmpeg-jobs.json'))
  initSpeed(join(app.getPath('userData'), 'watermark-speed.json'))
  const manager = new DownloadManager(
    join(app.getPath('userData'), 'tmp'),
    join(app.getPath('userData'), 'tasks.json'),
    getSettings,
    accounts
  )
  manager.on('update', (tasks) => send('dl:update', tasks))
  onDownloadsChanged(() => send('history:downloadsChanged'))
  manager.on('done', (t: TaskInfo) =>
    recordDownload({ key: t.item.key, title: t.title, groupTitle: t.groupTitle, path: t.outputPath ?? '', at: Date.now(), accountMid: t.accountMid })
  )
  manager.on('purged', (tasks: TaskInfo[]) => removeDownloads(tasks.map((t) => ({ key: t.item.key, path: t.outputPath ?? '' }))))
  manager.on('active', (active: boolean) => applyPower(active, getSettings().powerMode))
  manager.on('idle', ({ done, failed }: { done: number; failed: number }) =>
    failed
      ? notify(t('misc.notifyFailedTitle'), t('misc.notifyFailedBody', { done, failed }))
      : notify(t('misc.notifyDoneTitle'), t('misc.notifyDoneBody', { count: done }))
  )

  const enqueue = makeEnqueue(manager)
  const subs = new SubscriptionManager((request) => manager.enqueue(request).created.length, accounts)
  subs.on('update', (list) => send('subs:update', list))
  subs.on('found', ({ title, count }: { title: string; count: number }) =>
    notify(t('misc.notifySubsTitle'), t('misc.notifySubsBody', { title, count }))
  )
  const loginTarget = () => {
    const mid = activeScope().mid
    return mid === undefined ? undefined : { mode: 'reauth' as const, mid, activate: false }
  }
  const login = new LoginFlow({
    checkAuth: () => inAuthScope(activeScope(), checkAuth),
    authState: activeAuthState,
    accountAuth: (mid) => accounts.auth(mid),
    currentTarget: loginTarget,
    loginGuard: () => accounts.loginGuard(),
    onLoginChanged,
    listBrowsers: listBrowserProfiles,
    importBrowser: (id, opts, target, guard) => accounts.login(() => importFromBrowser(id, opts), target, guard, opts.signal),
    openQr: (target, guard) => accounts.login(openLoginWindow, target, guard),
    isQrOpen: isLoginWindowOpen,
    isLocked: isProfileLocked,
    canClose: canCloseBrowser,
    confirmClose: confirmCloseBrowser,
    closeBrowser
  })
  const mcpTools = new McpTools({
    parseAll: async (input, maxItems) => loadAllPages(await parseAndRecord(input), { maxItems }),
    expandLazy: (items) => expandLazy(items, undefined, stopsBatch),
    queue: manager,
    batchFile: join(app.getPath('userData'), 'mcp-batches.json'),
    downloadedKeys,
    downloadRecords,
    parseRecords,
    probeQuality: async (url, itemId) => {
      const source = await resolveInput(url)
      const items = source.groups.flatMap((group) => group.items)
      const matchesItem = (item: (typeof items)[number]): boolean =>
        item.key === itemId || !!(item.lazy && itemId?.startsWith(`${item.key}:`))
      let selected = itemId ? items.find(matchesItem)
        : items.length === 1 ? items[0] : items.find((item) => source.defaultSelected.length === 1 && source.defaultSelected[0] === item.key)
      if (!selected && itemId && source.paging?.hasMore) {
        const { result, error } = await loadAllPages(source, { maxItems: 1000 })
        selected = result.groups.flatMap((group) => group.items).find(matchesItem)
        if (!selected && error) throw new Error(error)
      }
      if (!selected) throw invalid(t('mcpAccounts.qualityItemRequired'))
      if (selected.unavailable) throw new Error(selected.unavailable)
      const parts = selected.lazy ? await expandLazy([selected], undefined, stopsBatch) : [selected]
      const item = itemId && itemId !== selected.key ? parts.find((part) => part.key === itemId) : parts[0]
      if (!item) throw invalid(t('mcpAccounts.qualityItemRequired'))
      if (item.unavailable) throw new Error(item.unavailable)
      return { item_id: item.key, title: item.title, qualities: downloadableQualities(await getPlayInfo(item, 127)) }
    },
    settings: getSettings,
    updateSettings,
    authState: () => checkAuthThrottled(60_000),
    accounts,
    logoutAccount: (mid) => endAccount(mid, 'mcp'),
    lookup: biliLookup,
    login,
    watermark: {
      estimate: estimateTime,
      speed: () => ({ fast: speedRatio('fast'), ai: speedRatio('ai') }),
      model: () => aiModel().status(),
      inspect: (t) => inspectWatermark(requireVideoTask(t))
    }
  })
  const mcp = new McpServer(mcpTools)
  void mcp.apply(settings.mcp)
  // 应用没开时 stdio 桥接进程用它代答握手和工具列表；语言变了重写
  const writeManifest = (): void => writeJson(join(app.getPath('userData'), 'mcp-manifest.json'), mcp.manifest())
  writeManifest()

  // 装进各个 AI agent 的 MCP 配置和 skill：应用升级或挪了位置后自动更新
  let bridgeScript: string | undefined
  const agents = new Integrations({
    file: join(app.getPath('userData'), 'agent-integrations.json'),
    agents: AGENTS,
    env: agentEnv(),
    version: app.getVersion(),
    entry: () =>
      bridgeEntry({
        platform: process.platform,
        execPath: process.execPath,
        appImage: process.env.APPIMAGE,
        bridge: (bridgeScript ??= installBridge(join(__dirname, 'bridge.js'), app.getPath('userData'))),
        userData: app.getPath('userData'),
        // 开发版要告诉 Electron 项目在哪；用 --user-data-dir 启动的实例，拉起时也要用同一个数据目录
        appArgs: [
          ...(app.isPackaged ? [] : [app.getAppPath()]),
          ...(app.commandLine.hasSwitch('user-data-dir') ? [`--user-data-dir=${app.getPath('userData')}`] : [])
        ]
      }),
    enableMcp: () => {
      const { mcp } = getSettings()
      if (!mcp.enabled) updateSettings({ mcp: { ...mcp, enabled: true } })
    }
  })
  // 开发版和正式版共用数据目录，agent 的配置却是全局的：开发版不自动同步，免得把配置改成指向开发目录
  if (app.isPackaged || process.env.BILI_AGENT_HOME) setImmediate(() => {
    try {
      const updated = agents.sync()
      if (updated.length) console.info(`已更新 AI 助手的配置：${updated.join('、')}`)
    } catch (e) {
      console.warn('更新 AI 助手的配置失败', e)
    }
  })

  accounts.connect((mid, status) => {
    manager.accountChanged(mid, status)
    if (status === 'ready') {
      mcpTools.batches.accountReady(mid)
      void subs.accountReady(mid).catch((e) => console.warn('恢复订阅检查失败', e))
    }
  }, {
    count: () => manager.list().filter((task) => task.accountMid === undefined && task.status !== 'done').length
      + subs.list().filter((sub) => sub.accountMid === undefined).length
      + mcpTools.batches.list().filter((batch) => batch.accountMid === undefined && (batch.pending.length || batch.failed.length)).length,
    assign: (mid) => {
      manager.assignLegacy(mid)
      manager.flush()
      subs.assignLegacy(mid)
      mcpTools.batches.assignLegacy(mid)
      mcpTools.batches.flush()
    }
  })
  subs.start()

  onSettingsChange((s) => {
    send('settings:changed', s)
    if (applyLanguage(s.language)) {
      send('i18n:changed', getLanguage())
      writeManifest()
      buildMenu()
      refreshTray?.()
    }
    nativeTheme.themeSource = s.theme
    limiter.setLimit(s.speedLimit)
    void applyNetwork(s)
    void mcp.apply(s.mcp)
    applyPower(manager.isActive(), s.powerMode)
    manager.schedule()
  })
  const updater = new Updater(join(app.getPath('userData'), 'update'), join(app.getPath('userData'), 'updater.json'))

  // 只注册这一个：退出被取消时其他监听器照样会执行，会把 quitting 置上、把后台服务停掉
  app.on('before-quit', (e) => {
    if (!allowQuit(e, manager.pendingCount())) return
    quitting = true
    // 先记下当前状态再中断：下次启动时据此把任务恢复成暂停，手动去水印的写上提示
    manager.flush()
    manager.stopAll()
    mcpTools.batches.flush()
    login.dispose()
    subs.stop()
    void mcp.stop()
    updater.stop()
  })

  endAccount = (mid, requester) => endAccountWith({
    accounts,
    tasks: {
      accountTasks: (id) => manager.accountTasks(id),
      transferAccount: (from, to) => manager.transferAccount(from, to),
      remove: (ids) => manager.remove(ids, false)
    },
    subs,
    batches: mcpTools.batches,
    dialog: showDialog
  }, mid, requester)
  registerIpc({ manager, subs, mcp, agents, enqueue, updater, accounts, endAccount: (mid) => endAccount(mid, 'user') })
  buildMenu()
  // 打包后用 app 自带的 icon.icns；开发时程序坞默认是 Electron 图标
  if (isDev) app.dock?.setIcon(join(__dirname, '../../build/icon.png'))
  createTray(updater)
  if (background) {
    // 只在托盘里待命；程序坞图标等用户打开窗口时再显示
    if (isMac) app.dock?.hide()
    setTimeout(() => updater.start(() => getSettings().autoCheckUpdate), 3000)
    app.on('activate', showMainWindow)
    return
  }
  createWindow()

  // 启动时确认登录状态，未登录就弹出登录；稍后再检查更新，免得和登录弹窗挤在一起
  getMainWindow()?.webContents.once('did-finish-load', () => {
    void inAuthScope(activeScope(), async () => {
      const auth = await checkAuth()
      if (!auth.loggedIn) requireLogin()
    }).catch(() => {})
    setTimeout(() => updater.start(() => getSettings().autoCheckUpdate), 3000)
  })

  app.on('activate', showMainWindow)
}

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})
