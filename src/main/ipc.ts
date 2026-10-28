import { app, clipboard, dialog, ipcMain, shell } from 'electron'
import { randomBytes } from 'node:crypto'
import type {
  CloseAction,
  EnqueueRequest,
  MediaItem,
  NewSubscription,
  PagedSource,
  Settings,
  Subscription
} from '@shared/types'
import { checkAuth, ensureLoggedIn, getAuthState, requireLogin } from './auth/authGuard'
import { importFromBrowser, listBrowserProfiles } from './auth/browserImport'
import { importCookieText } from './auth/cookieImport'
import { openLoginWindow } from './auth/loginWindow'
import { biliSession, clearBiliCookies } from './auth/session'
import { AUDIO_STREAM_INFO } from './bili/audio'
import { expandLazy, loadPage, myFavFolders } from './bili/lists'
import { getPlayInfo, streamInfoFromPlay } from './bili/playurl'
import { resolveBatch, resolveInput } from './bili/resolve'
import { exportConfig, importConfig } from './config'
import type { DownloadManager } from './download/manager'
import type { McpServer } from './mcp'
import { CDN_HOSTS, pingHost } from './net/cdn'
import { networkStatus } from './net/network'
import type { SubscriptionManager } from './subscriptions'
import type { Updater } from './update/updater'
import {
  clearDownloads,
  clearParses,
  downloadedKeys,
  parseRecords,
  recordParse,
  removeParse
} from './history'
import { getSettings, updateSettings } from './settings'
import { getMainWindow, hideMainWindow, send } from './windows'

const progress = (done: number, total: number, title?: string): void => send('parse:progress', { done, total, title })

const FAKE_SESSDATA = 'expired-for-testing'
let stashedSessdata: Electron.Cookie | undefined

async function setSessdata(value: string, expirationDate?: number): Promise<void> {
  await biliSession().cookies.set({
    url: 'https://www.bilibili.com',
    domain: '.bilibili.com',
    path: '/',
    name: 'SESSDATA',
    value,
    secure: true,
    httpOnly: true,
    expirationDate
  })
}

/** 开发调试：把 SESSDATA 换成无效值，模拟服务端判定登录过期；真实值先暂存起来 */
export async function simulateExpiry(): Promise<void> {
  const [real] = await biliSession().cookies.get({ domain: 'bilibili.com', name: 'SESSDATA' })
  if (real && real.value !== FAKE_SESSDATA) stashedSessdata = real
  await setSessdata(FAKE_SESSDATA, real?.expirationDate)
  await checkAuth()
  requireLogin()
}

/** 开发调试：恢复模拟过期前的真实 SESSDATA */
export async function restoreSimulatedExpiry(): Promise<void> {
  if (!stashedSessdata) return
  await setSessdata(stashedSessdata.value, stashedSessdata.expirationDate)
  stashedSessdata = undefined
  await checkAuth()
}

type Result = { ok: true; data: unknown } | { ok: false; error: string }

/** 统一包装：错误以 { ok:false } 返回，preload 再还原成 Error，避免 Electron 给消息加前缀 */
function handle(channel: string, fn: (...args: never[]) => unknown): void {
  ipcMain.handle(channel, async (_e, ...args): Promise<Result> => {
    try {
      return { ok: true, data: await fn(...(args as never[])) }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}

export interface IpcDeps {
  manager: DownloadManager
  subs: SubscriptionManager
  mcp: McpServer
  enqueue: (req: EnqueueRequest) => Promise<string | undefined>
  updater: Updater
}

export function registerIpc({ manager, subs, mcp, enqueue, updater }: IpcDeps): void {
  handle('auth:check', async () => checkAuth().catch(() => getAuthState()))
  handle('auth:login', () => openLoginWindow())
  handle('auth:listBrowsers', () => listBrowserProfiles())
  handle('auth:import', (id: string) => importFromBrowser(id))
  handle('auth:importCookie', (text: string) => importCookieText(text))
  handle('auth:logout', async () => {
    // 只清本地 cookie，不调用 B站退出接口——导入的 cookie 和浏览器共用同一个会话
    await clearBiliCookies()
    return checkAuth()
  })
  handle('auth:simulateExpiry', simulateExpiry)

  handle('parse', async (input: string) => {
    await ensureLoggedIn()
    const result = { ...(await resolveInput(input)), input: input.trim() }
    recordParse({
      input: input.trim(),
      title: result.title,
      kind: result.kind,
      cover: result.cover,
      count: result.groups.reduce((n, g) => n + g.items.length, 0),
      at: Date.now()
    })
    return result
  })
  handle('parseMore', async (source: PagedSource, page: number) => {
    await ensureLoggedIn()
    return loadPage(source, page)
  })
  handle('parseBatch', async (inputs: string[]) => {
    await ensureLoggedIn()
    return resolveBatch(inputs, progress)
  })
  handle('streamInfo', async (item: MediaItem) => {
    if (item.kind === 'audio') return AUDIO_STREAM_INFO
    // 列表里的视频还没有 cid，先查一次详情（只取第一个分P）
    const probe = item.lazy ? (await expandLazy([item]))[0] : item
    if (probe.unavailable) throw new Error(probe.unavailable)
    return streamInfoFromPlay(await getPlayInfo(probe, 127))
  })
  handle('myFavFolders', async () => {
    const s = await checkAuth().catch(() => getAuthState())
    if (!s.loggedIn) throw new Error('请先登录')
    return myFavFolders(s.user.mid)
  })

  handle('history:downloadedKeys', () => downloadedKeys())
  handle('history:clearDownloads', () => clearDownloads())
  handle('history:parses', () => parseRecords())
  handle('history:removeParse', (input: string) => removeParse(input))
  handle('history:clearParses', () => clearParses())

  handle('dl:enqueue', (req: EnqueueRequest) => enqueue(req))
  handle('dl:list', () => manager.list())
  handle('dl:pause', (id: string) => manager.pause(id))
  handle('dl:pauseMany', (ids: string[]) => manager.pauseMany(ids))
  handle('dl:pauseAll', () => manager.pauseAll())
  handle('dl:resume', (id: string) => manager.resume(id))
  handle('dl:resumeMany', (ids: string[]) => manager.resumeMany(ids))
  handle('dl:resumeAll', () => manager.resumeAll())
  handle('dl:remove', (ids: string[], deleteFiles: boolean) => manager.remove(ids, deleteFiles))
  handle('dl:retry', (id: string) => manager.resume(id))
  handle('dl:redownload', (id: string) => manager.redownload(id))
  handle('dl:clearFinished', () => manager.clearFinished())

  handle('settings:get', () => getSettings())
  handle('settings:set', (patch: Partial<Settings>) => updateSettings(patch))
  handle('settings:chooseDir', async () => {
    const win = getMainWindow()
    const opts = {
      title: '选择下载目录',
      defaultPath: getSettings().downloadDir,
      properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>
    }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return r.canceled || !r.filePaths[0] ? getSettings() : updateSettings({ downloadDir: r.filePaths[0] })
  })

  handle('subs:list', () => subs.list())
  handle('subs:add', (req: NewSubscription) => subs.add(req))
  handle('subs:update', (id: string, patch: Partial<Pick<Subscription, 'enabled' | 'intervalMin' | 'options'>>) =>
    subs.update(id, patch)
  )
  handle('subs:remove', (id: string) => subs.remove(id))
  handle('subs:check', (id: string) => subs.check(id))

  handle('net:status', () => networkStatus())
  handle('net:test', async () => {
    const t = Date.now()
    const res = await fetch('https://api.bilibili.com/x/web-interface/nav', { signal: AbortSignal.timeout(10_000) })
    await res.body?.cancel()
    return Date.now() - t
  })
  handle('net:cdnHosts', () => CDN_HOSTS)
  handle('net:pingCdn', () => Promise.all(CDN_HOSTS.map(async (h) => ({ host: h.host, ms: await pingHost(h.host) }))))

  handle('config:export', () => exportConfig(getMainWindow(), subs))
  handle('config:import', () => importConfig(getMainWindow(), subs))

  handle('mcp:status', () => mcp.status())
  handle('mcp:regenerateToken', () =>
    updateSettings({ mcp: { ...getSettings().mcp, token: randomBytes(24).toString('hex') } })
  )

  handle('app:close', (action: Exclude<CloseAction, 'ask'>, remember: boolean) => {
    if (remember) updateSettings({ closeAction: action })
    if (action === 'quit') app.quit()
    else hideMainWindow()
  })

  handle('update:state', () => updater.getState())
  handle('update:check', () => updater.check(true))
  handle('update:download', () => updater.download())
  handle('update:cancel', () => updater.cancel())
  handle('update:install', () => updater.install())
  handle('update:skip', () => updater.skip())
  handle('update:openPage', () => updater.openPage())

  handle('clipboard:read', () => clipboard.readText())
  handle('clipboard:write', (text: string) => clipboard.writeText(text))
  handle('shell:showInFolder', (path: string) => shell.showItemInFolder(path))
  handle('shell:openFullDiskAccess', () =>
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles')
  )
}
