// 在应用里打开抖音网页让用户扫码登录。二次验证（短信、原设备扫码）也在同一个窗口里完成
import { BrowserWindow, type ProxyConfig } from 'electron'
import { t } from '@shared/i18n'
import { getMainWindow } from '../windows'
import { DY_LOGIN_COOKIE, isDyCookieHost } from './cookies'
import { dySession, ENTRY_URL, isTrustedUrl } from './transport/window'

/** 登录 cookie 出现后等页面把其余 cookie 写完 */
const SETTLE_MS = 1500

let opening: Promise<boolean> | undefined
let loginWindow: BrowserWindow | undefined

/** 拿到登录 cookie 返回 true；用户关掉窗口返回 false。同时只开一个 */
export function openDyLoginWindow(o: { partition: string; userAgent: string; proxy: ProxyConfig }): Promise<boolean> {
  if (opening) {
    loginWindow?.focus()
    return opening
  }
  const promise = (async () => {
    const ses = dySession(o.partition, o.userAgent)
    await ses.setProxy(o.proxy)
    return new Promise<boolean>((resolve) => {
      const main = getMainWindow()
      const win = new BrowserWindow({
        width: 1100,
        height: 760,
        parent: main?.isVisible() && !main.isMinimized() ? main : undefined,
        title: t('dy.loginWindowTitle'),
        autoHideMenuBar: true,
        webPreferences: { partition: o.partition, sandbox: true, contextIsolation: true }
      })
      loginWindow = win
      win.on('page-title-updated', (e) => e.preventDefault())
      win.webContents.setAudioMuted(true)
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      win.webContents.on('will-navigate', (e, url) => {
        if (!isTrustedUrl(url)) e.preventDefault()
      })
      let timer: ReturnType<typeof setTimeout> | undefined
      let done = false
      const finish = (ok: boolean): void => {
        if (done) return
        done = true
        clearTimeout(timer)
        ses.cookies.removeListener('changed', onChanged)
        loginWindow = undefined
        if (!win.isDestroyed()) win.destroy()
        resolve(ok)
      }
      const onChanged = (_e: unknown, c: Electron.Cookie, _cause: string, removed: boolean): void => {
        if (removed || c.name !== DY_LOGIN_COOKIE || !c.value || !isDyCookieHost(c.domain ?? '')) return
        clearTimeout(timer)
        timer = setTimeout(() => finish(true), SETTLE_MS)
      }
      ses.cookies.on('changed', onChanged)
      // 刚拿到登录 cookie 就关了窗口，也算登录成功
      win.on('closed', () => finish(timer !== undefined))
      win.loadURL(ENTRY_URL).catch(() => undefined)
    })
  })()
  opening = promise.finally(() => (opening = undefined))
  return opening
}
