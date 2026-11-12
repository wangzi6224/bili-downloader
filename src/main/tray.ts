import { t } from '@shared/i18n'
import type { AuthState, UpdateState, UserInfo } from '@shared/types'

export interface TrayActions {
  show: () => void
  settings: () => void
  checkUpdate: () => void
  login: () => void
  logout: (user: UserInfo) => void
  quit: () => void
}

/** 托盘（macOS 上是菜单栏）图标的菜单；没登录时“退出登录”换成“登录” */
export function trayMenu(auth: AuthState, a: TrayActions): Electron.MenuItemConstructorOptions[] {
  return [
    { label: t('menu.trayShow'), click: () => a.show() },
    { label: t('menu.traySettings'), click: () => a.settings() },
    { label: t('menu.trayCheckUpdate'), click: () => a.checkUpdate() },
    { type: 'separator' },
    auth.loggedIn ? { label: t('menu.trayLogout'), click: () => a.logout(auth.user) } : { label: t('menu.trayLogin'), click: () => a.login() },
    { type: 'separator' },
    { label: t('menu.trayQuit'), click: () => a.quit() }
  ]
}

/**
 * 从托盘检查更新后怎么告诉用户：有新版本打开更新弹窗（prompt），
 * 其他结果窗口可能在后台看不到，用系统对话框
 */
export function updateCheckReply(s: UpdateState): 'prompt' | Electron.MessageBoxOptions | null {
  if ('info' in s && s.info) return 'prompt'
  if (s.status === 'latest') {
    return {
      type: 'info',
      message: t('dialogs.upToDate'),
      detail: t('dialogs.currentVersion', { version: s.current }),
      buttons: [t('dialogs.ok')]
    }
  }
  if (s.status === 'error') return { type: 'error', message: s.error, buttons: [t('dialogs.ok')] }
  return null
}
