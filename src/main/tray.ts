import type { AuthState, UpdateState } from '@shared/types'

export interface TrayActions {
  show: () => void
  settings: () => void
  checkUpdate: () => void
  login: () => void
  logout: () => void
  quit: () => void
}

/** 托盘（macOS 上是菜单栏）图标的菜单；没登录时“退出登录”换成“登录” */
export function trayMenu(auth: AuthState, a: TrayActions): Electron.MenuItemConstructorOptions[] {
  return [
    { label: '显示窗口', click: () => a.show() },
    { label: '设置', click: () => a.settings() },
    { label: '检查更新', click: () => a.checkUpdate() },
    { type: 'separator' },
    auth.loggedIn ? { label: '退出登录', click: () => a.logout() } : { label: '登录', click: () => a.login() },
    { type: 'separator' },
    { label: '退出', click: () => a.quit() }
  ]
}

/**
 * 从托盘检查更新后怎么告诉用户：有新版本打开更新弹窗（prompt），
 * 其他结果窗口可能在后台看不到，用系统对话框
 */
export function updateCheckReply(s: UpdateState): 'prompt' | Electron.MessageBoxOptions | null {
  if ('info' in s && s.info) return 'prompt'
  if (s.status === 'latest') return { type: 'info', message: '已是最新版本', detail: `当前版本 ${s.current}`, buttons: ['好'] }
  if (s.status === 'error') return { type: 'error', message: s.error, buttons: ['好'] }
  return null
}
