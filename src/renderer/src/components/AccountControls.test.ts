// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { BiliAccount } from '@shared/types'

const auth = { switchAccount: vi.fn(), removeAccount: vi.fn() }
Object.defineProperty(window, 'api', { configurable: true, value: { auth } })
const { useStore } = await import('../store')
const { Sidebar } = await import('./Sidebar')
const { AccountSettings } = await import('./AccountControls')
const { AccountOrigin } = await import('./AccountOrigin')

const a: BiliAccount = { mid: 1, uname: '日常号', face: '', vipActive: false, vipLabel: '', status: 'ready' }
const b: BiliAccount = { ...a, mid: 2, uname: '追番号' }
const c: BiliAccount = { ...a, mid: 3, uname: '收藏号', status: 'expired' }
const initial = useStore.getState()
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  useStore.setState(initial, true)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

function button(name: string): HTMLButtonElement {
  const element = Array.from(container.querySelectorAll('button')).find((b) =>
    (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name)
  if (!element) throw new Error(`未找到按钮 ${name}`)
  return element
}

it('首次登录继续使用原侧栏卡片', async () => {
  useStore.setState({ auth: { loggedIn: false }, accounts: { accounts: [], legacyCount: 0 } })
  await act(async () => root.render(createElement(Sidebar)))
  const card = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('登录 B站账号'))
  expect(card?.textContent).toContain('解锁 1080P 以上清晰度')
  expect(card?.classList.contains('border-line-strong')).toBe(true)
  expect(container.querySelector('[aria-label="退出登录"]')).toBeNull()
  await act(async () => card!.click())
  expect(useStore.getState().loginTarget).toEqual({ mode: 'add' })
})

it('侧栏可以切换或单独退出后台账号，过期账号没有退出按钮', async () => {
  useStore.setState({ auth: { loggedIn: true, user: a }, accounts: { activeMid: 1, accounts: [a, b, c], legacyCount: 0 } })
  await act(async () => root.render(createElement(Sidebar)))
  const trigger = button('管理账号 · 日常号')
  await act(async () => trigger.click())
  expect(container.querySelector('[aria-label="退出「收藏号」的登录"]')).toBeNull()
  await act(async () => button('追番号').click())
  expect(auth.switchAccount).toHaveBeenCalledExactlyOnceWith(2)
  await act(async () => trigger.click())
  await act(async () => button('退出「追番号」的登录').click())
  expect(auth.removeAccount).toHaveBeenCalledExactlyOnceWith(2)
})

it('设置里的后台账号重新登录时保留当前账号', async () => {
  useStore.setState({ auth: { loggedIn: true, user: a }, accounts: { activeMid: 1, accounts: [a, c], legacyCount: 0 } })
  await act(async () => root.render(createElement(AccountSettings)))
  expect(container.textContent).toContain('管理账号')
  expect(container.textContent).toContain('UID 3')
  await act(async () => button('重新登录').click())
  expect(useStore.getState().loginTarget).toEqual({ mode: 'reauth', mid: 3, activate: false })
})

it('从侧栏选择过期账号会为该账号重登，成功后才切换', async () => {
  useStore.setState({ auth: { loggedIn: true, user: a }, accounts: { activeMid: 1, accounts: [a, c], legacyCount: 0 } })
  await act(async () => root.render(createElement(Sidebar)))
  await act(async () => button('管理账号 · 日常号').click())
  const expired = [...container.querySelectorAll('button')].find((element) => element.textContent?.includes(c.uname))!
  await act(async () => expired.click())
  expect(auth.switchAccount).not.toHaveBeenCalled()
  expect(useStore.getState()).toMatchObject({ accounts: { activeMid: 1 }, loginTarget: { mode: 'reauth', mid: 3, activate: true } })
})

it('从侧栏管理入口打开设置；退出由主进程确认，取消时保留会话', async () => {
  const confirm = vi.fn(() => true)
  vi.stubGlobal('confirm', confirm)
  auth.removeAccount.mockResolvedValueOnce(false)
  useStore.setState({ auth: { loggedIn: true, user: a }, accounts: { activeMid: 1, accounts: [a, b], legacyCount: 0 } })
  await act(async () => root.render(createElement(Sidebar)))
  const trigger = button('管理账号 · 日常号')
  await act(async () => trigger.click())
  await act(async () => button('退出「追番号」的登录').click())
  expect(confirm).not.toHaveBeenCalled()
  expect(auth.removeAccount).toHaveBeenCalledExactlyOnceWith(2)
  expect(useStore.getState().accounts?.accounts.map((account) => account.mid)).toEqual([1, 2])
  await act(async () => button('管理账号').click())
  expect(useStore.getState()).toMatchObject({ view: 'settings', showAccountSettings: true })
})

it('已退出的账号仍可显示为记录的发起账号，缺少归属的旧记录显示未知', async () => {
  useStore.setState({ accounts: { accounts: [{ ...b, status: 'removed' }], legacyCount: 0 } })
  await act(async () => root.render(createElement('div', null,
    createElement(AccountOrigin, { mid: 2 }), createElement(AccountOrigin, { mid: 99 }), createElement(AccountOrigin))))
  expect(container.textContent).toContain('发起账号：追番号')
  expect(container.textContent).toContain('发起账号：UID 99')
  expect(container.textContent).toContain('发起账号未知')
})
