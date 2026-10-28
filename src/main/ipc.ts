import { clipboard, dialog, ipcMain, shell } from 'electron'
import type { EnqueueRequest, MediaItem, PagedSource, Settings } from '@shared/types'
import { checkAuth, ensureLoggedIn, getAuthState, requireLogin } from './auth/authGuard'
import { importFromBrowser, listBrowserProfiles } from './auth/browserImport'
import { importCookieText } from './auth/cookieImport'
import { openLoginWindow } from './auth/loginWindow'
import { biliSession, clearBiliCookies } from './auth/session'
import { AUDIO_STREAM_INFO } from './bili/audio'
import { expandLazy, loadPage, myFavFolders } from './bili/lists'
import { getPlayInfo, streamInfoFromPlay } from './bili/playurl'
import { resolveBatch, resolveInput } from './bili/resolve'
import type { DownloadManager } from './download/manager'
import {
  clearDownloads,
  clearParses,
  downloadedKeys,
  parseRecords,
  recordParse,
  removeParse
} from './history'
import { getSettings, updateSettings } from './settings'
import { getMainWindow, send } from './windows'

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

export function registerIpc(manager: DownloadManager): void {
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
    const result = await resolveInput(input)
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

  handle('dl:enqueue', async (req: EnqueueRequest) => {
    // 收藏夹、UP 主投稿里的视频要先查出分P才能下载
    const items = await expandLazy(req.items, (done, total) => progress(done, total, '正在获取视频分P'))
    const failed = items.filter((i) => i.unavailable)
    manager.enqueue({ ...req, items: items.filter((i) => !i.unavailable) })
    return failed.length ? `${failed.length} 个视频无法获取（${failed[0].unavailable}）` : undefined
  })
  handle('dl:list', () => manager.list())
  handle('dl:pause', (id: string) => manager.pause(id))
  handle('dl:resume', (id: string) => manager.resume(id))
  handle('dl:resumeAll', () => manager.resumeAll())
  handle('dl:cancel', (id: string) => manager.cancel(id))
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

  handle('clipboard:read', () => clipboard.readText())
  handle('shell:showInFolder', (path: string) => shell.showItemInFolder(path))
  handle('shell:openFullDiskAccess', () =>
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles')
  )
}
