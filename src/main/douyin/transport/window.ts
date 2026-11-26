// DyWindow 的 Electron 实现：独立会话分区里的隐藏窗口
import { BrowserWindow, session, type ProxyConfig, type Session } from 'electron'
import { isDyHost } from '@shared/douyinUrl'
import type { DyWindow } from './page'

/** 脚本齐全又比首页轻的页面 */
export const ENTRY_URL = 'https://www.douyin.com/user/self'
const LOAD_TIMEOUT = 30_000
const HEAVY = new Set(['image', 'font', 'stylesheet'])
/** 页面和验证框会跳到的字节系域名 */
const TRUSTED = /(^|\.)(bytedance\.com|zijieapi\.com|snssdk\.com)$/

/** 会话分区里正在拦大资源的 */
const blocking = new WeakSet<Session>()
const configured = new WeakSet<Session>()

export const isTrustedUrl = (url: string): boolean => {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && (isDyHost(u.hostname) || TRUSTED.test(u.hostname))
  } catch {
    return false
  }
}

/** 抖音分区的通用设置：UA、拒绝权限和下载、不加载媒体 */
export function dySession(partition: string, userAgent: string): Session {
  const ses = session.fromPartition(partition)
  if (configured.has(ses)) return ses
  configured.add(ses)
  ses.setUserAgent(userAgent, 'zh-CN,zh;q=0.9')
  ses.setPermissionRequestHandler((_contents, _permission, done) => done(false))
  ses.on('will-download', (e) => e.preventDefault())
  ses.webRequest.onBeforeRequest((details, done) =>
    done({ cancel: details.resourceType === 'media' || (blocking.has(ses) && HEAVY.has(details.resourceType)) })
  )
  return ses
}

export interface WindowOptions {
  partition: string
  userAgent: string
  proxy: ProxyConfig
}

export async function createDyWindow(o: WindowOptions): Promise<DyWindow> {
  const ses = dySession(o.partition, o.userAgent)
  await ses.setProxy(o.proxy)
  const win = new BrowserWindow({
    show: false,
    width: 1100,
    height: 760,
    autoHideMenuBar: true,
    webPreferences: { partition: o.partition, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  })
  const contents = win.webContents
  contents.setAudioMuted(true)
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (e, url) => {
    if (!isTrustedUrl(url)) e.preventDefault()
  })
  let onUserClose: (() => void) | undefined
  // 亮出来给用户验证的窗口被关掉时只通知上层，由上层销毁
  win.on('close', (e) => {
    if (!onUserClose || !win.isVisible()) return
    e.preventDefault()
    win.hide()
    onUserClose()
  })
  return {
    load: () =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, LOAD_TIMEOUT)
        const done = (): void => {
          clearTimeout(timer)
          resolve()
        }
        contents.once('dom-ready', done)
        contents.loadURL(ENTRY_URL).catch((e: Error & { code?: string }) => {
          // 页面自己又跳转时首次加载会报中止，不算失败
          if (e.code === 'ERR_ABORTED') return
          clearTimeout(timer)
          reject(e)
        })
      }),
    evaluate: <T>(code: string) => contents.executeJavaScript(code) as Promise<T>,
    setBlocking: (on) => {
      if (on) blocking.add(ses)
      else blocking.delete(ses)
    },
    show: (title) => {
      win.setTitle(title)
      win.on('page-title-updated', (e) => e.preventDefault())
      win.show()
      win.focus()
    },
    onUserClose: (fn) => (onUserClose = fn),
    isAlive: () => !win.isDestroyed(),
    destroy: () => {
      if (!win.isDestroyed()) win.destroy()
    }
  }
}
