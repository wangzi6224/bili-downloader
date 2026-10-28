import { clipboard, dialog, ipcMain, shell } from 'electron'
import type { EnqueueRequest, MediaItem, Settings } from '@shared/types'
import { checkAuth, ensureLoggedIn, getAuthState, requireLogin } from './auth/authGuard'
import { importFromBrowser, listBrowserProfiles } from './auth/browserImport'
import { openLoginWindow } from './auth/loginWindow'
import { biliSession, clearBiliCookies } from './auth/session'
import { getPlayInfo, qualitiesFromInfo } from './bili/playurl'
import { resolveInput } from './bili/resolve'
import type { DownloadManager } from './download/manager'
import { getSettings, updateSettings } from './settings'
import { getMainWindow } from './windows'

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
  handle('auth:logout', async () => {
    // 只清本地 cookie，不调用 B站退出接口——导入的 cookie 和浏览器共用同一个会话
    await clearBiliCookies()
    return checkAuth()
  })
  handle('auth:simulateExpiry', simulateExpiry)

  handle('parse', async (input: string) => {
    await ensureLoggedIn()
    return resolveInput(input)
  })
  handle('qualities', async (item: MediaItem) => qualitiesFromInfo(await getPlayInfo(item, 127)))

  handle('dl:enqueue', (req: EnqueueRequest) => manager.enqueue(req))
  handle('dl:list', () => manager.list())
  handle('dl:pause', (id: string) => manager.pause(id))
  handle('dl:resume', (id: string) => manager.resume(id))
  handle('dl:resumeAll', () => manager.resumeAll())
  handle('dl:cancel', (id: string) => manager.cancel(id))
  handle('dl:retry', (id: string) => manager.resume(id))
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
