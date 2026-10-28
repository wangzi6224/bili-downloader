import { BrowserWindow, shell } from 'electron'
import type { AuthState } from '@shared/types'
import { getMainWindow } from '../windows'
import { checkAuth, getAuthState } from './authGuard'
import { biliSession, PARTITION, UA } from './session'

const LOGIN_URL = 'https://passport.bilibili.com/login'

let pending: Promise<AuthState> | null = null
let loginWin: BrowserWindow | null = null

/** 打开 B站官方登录页；检测到 SESSDATA 并通过 nav 确认后自动关闭 */
export function openLoginWindow(): Promise<AuthState> {
  if (pending) {
    loginWin?.focus()
    return pending
  }
  pending = new Promise<AuthState>((resolve) => {
    const win = new BrowserWindow({
      width: 980,
      height: 720,
      parent: getMainWindow() ?? undefined,
      title: '登录 B站',
      webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true }
    })
    loginWin = win
    win.webContents.setUserAgent(UA)

    const ses = biliSession()
    let timer: NodeJS.Timeout | undefined
    const onChanged = (_e: unknown, cookie: Electron.Cookie, _cause: string, removed: boolean): void => {
      if (removed || cookie.name !== 'SESSDATA' || !cookie.value) return
      clearTimeout(timer)
      timer = setTimeout(async () => {
        const s = await checkAuth().catch(() => null)
        if (s?.loggedIn && !win.isDestroyed()) win.close()
      }, 800)
    }
    ses.cookies.on('changed', onChanged)

    win.webContents.setWindowOpenHandler(({ url }) => {
      const { protocol, hostname } = new URL(url)
      if (hostname.endsWith('bilibili.com')) win.loadURL(url)
      else if (protocol === 'https:' || protocol === 'http:') shell.openExternal(url)
      return { action: 'deny' }
    })

    win.on('closed', async () => {
      ses.cookies.off('changed', onChanged)
      clearTimeout(timer)
      loginWin = null
      pending = null
      resolve(await checkAuth().catch(() => getAuthState()))
    })

    win.loadURL(LOGIN_URL)
  })
  return pending
}
