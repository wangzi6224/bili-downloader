import { app, BrowserWindow, shell } from 'electron'
import { t } from '@shared/i18n'
import type { AuthState } from '@shared/types'
import { getMainWindow } from '../windows'
import { checkAuth, getAuthState } from './authGuard'
import { biliSession, isBiliHost, UA } from './session'
import { authScope, inAuthScope } from './scope'

const LOGIN_URL = 'https://passport.bilibili.com/login'

let pending: Promise<AuthState> | null = null
let loginWin: BrowserWindow | null = null

/** 登录窗开着时用户可能正在扫码，这时替换分区里的 Cookie 会打断登录 */
export const isLoginWindowOpen = (): boolean => pending !== null

/** 打开 B站官方登录页；检测到 SESSDATA 并通过 nav 确认后自动关闭 */
export function openLoginWindow(): Promise<AuthState> {
  // 由 MCP 触发时应用多半在后台，不抢到前面用户看不到窗口
  app.focus({ steal: true })
  if (pending) {
    loginWin?.show()
    loginWin?.focus()
    return pending
  }
  const scope = authScope()
  const opening = new Promise<AuthState>((resolve) => {
    const main = getMainWindow()
    const win = new BrowserWindow({
      width: 980,
      height: 720,
      // 主窗口藏在后台或最小化时不挂上去，否则登录窗会跟着看不见
      parent: main?.isVisible() && !main.isMinimized() ? main : undefined,
      title: t('dialogs.loginWindowTitle'),
      webPreferences: { partition: scope.partition, sandbox: true, contextIsolation: true }
    })
    loginWin = win
    win.webContents.setUserAgent(UA)

    const ses = biliSession()
    let timer: NodeJS.Timeout | undefined
    const onChanged = (_e: unknown, cookie: Electron.Cookie, _cause: string, removed: boolean): void => {
      if (removed || cookie.name !== 'SESSDATA' || !cookie.value) return
      clearTimeout(timer)
      timer = setTimeout(async () => {
        const s = await inAuthScope(scope, checkAuth).catch(() => null)
        if (s?.loggedIn && !win.isDestroyed()) win.close()
      }, 800)
    }
    ses.cookies.on('changed', onChanged)

    win.webContents.setWindowOpenHandler(({ url }) => {
      const { protocol, hostname } = new URL(url)
      // javascript:、file: 之类的一律不打开
      const web = protocol === 'https:' || protocol === 'http:'
      if (web && isBiliHost(hostname)) win.loadURL(url)
      else if (web) shell.openExternal(url)
      return { action: 'deny' }
    })

    win.on('closed', async () => {
      ses.cookies.off('changed', onChanged)
      clearTimeout(timer)
      loginWin = null
      pending = null
      resolve(await inAuthScope(scope, () => checkAuth().catch(() => getAuthState())))
    })

    win.loadURL(LOGIN_URL)
  })
  pending = opening
  // 窗口没建出来时不能留着这个 promise，否则之后再也打不开
  opening.catch(() => {
    pending = null
  })
  return opening
}
