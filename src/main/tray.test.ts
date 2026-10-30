import { describe, expect, it, vi } from 'vitest'
import type { AuthState, UpdateInfo, UpdateState } from '@shared/types'
import { trayMenu, updateCheckReply, type TrayActions } from './tray'

const actions = (): TrayActions => ({
  show: vi.fn(),
  settings: vi.fn(),
  checkUpdate: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  quit: vi.fn()
})

const LOGGED_IN: AuthState = { loggedIn: true, user: { mid: 1, uname: '测试', face: '', vipActive: false, vipLabel: '' } }
const LOGGED_OUT: AuthState = { loggedIn: false }

const click = (items: Electron.MenuItemConstructorOptions[], label: string): void => {
  const item = items.find((i) => i.label === label)
  ;(item?.click as () => void)()
}

describe('trayMenu', () => {
  it('已登录时有设置、检查更新、退出登录和退出', () => {
    expect(trayMenu(LOGGED_IN, actions()).map((i) => i.label ?? i.type)).toEqual([
      '显示窗口',
      '设置',
      '检查更新',
      'separator',
      '退出登录',
      'separator',
      '退出'
    ])
  })

  it('没登录时“退出登录”换成“登录”', () => {
    const labels = trayMenu(LOGGED_OUT, actions()).map((i) => i.label)
    expect(labels).toContain('登录')
    expect(labels).not.toContain('退出登录')
  })

  it.each<[string, keyof TrayActions, AuthState]>([
    ['显示窗口', 'show', LOGGED_IN],
    ['设置', 'settings', LOGGED_IN],
    ['检查更新', 'checkUpdate', LOGGED_IN],
    ['退出登录', 'logout', LOGGED_IN],
    ['登录', 'login', LOGGED_OUT],
    ['退出', 'quit', LOGGED_IN]
  ])('点“%s”调用 %s', (label, action, auth) => {
    const a = actions()
    click(trayMenu(auth, a), label)
    expect(a[action]).toHaveBeenCalledOnce()
    const others = (Object.keys(a) as (keyof TrayActions)[]).filter((k) => k !== action)
    for (const k of others) expect(a[k]).not.toHaveBeenCalled()
  })
})

describe('updateCheckReply', () => {
  const info: UpdateInfo = { version: '9.9.9', date: '', notes: [], page: '', size: 1, skipped: false }
  const current = '0.7.0'

  it.each<[string, UpdateState]>([
    ['发现新版本', { current, status: 'available', info }],
    ['正在下载', { current, status: 'downloading', info, done: 1, total: 2 }],
    ['已下载好', { current, status: 'ready', info }],
    ['下载失败', { current, status: 'error', error: '下载更新失败', info }]
  ])('%s时打开更新弹窗', (_, state) => {
    expect(updateCheckReply(state)).toBe('prompt')
  })

  it('已是最新版本时显示当前版本', () => {
    expect(updateCheckReply({ current, status: 'latest' })).toMatchObject({
      type: 'info',
      message: '已是最新版本',
      detail: '当前版本 0.7.0'
    })
  })

  it('检查失败时显示原因', () => {
    expect(updateCheckReply({ current, status: 'error', error: '检查更新失败：HTTP 500' })).toMatchObject({
      type: 'error',
      message: '检查更新失败：HTTP 500'
    })
  })

  it.each<[string, UpdateState]>([
    ['还在检查', { current, status: 'checking' }],
    ['还没检查过', { current, status: 'idle' }]
  ])('%s时不提示', (_, state) => {
    expect(updateCheckReply(state)).toBeNull()
  })
})
