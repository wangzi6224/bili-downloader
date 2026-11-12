// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { BrowserProfile } from '@shared/types'

const auth = { listBrowsers: vi.fn(), chooseBrowserFolder: vi.fn(), importFromBrowser: vi.fn() }
Object.defineProperty(window, 'api', { configurable: true, value: { platform: 'darwin', auth } })
const { useStore } = await import('../store')
const { LoginDialog } = await import('./LoginDialog')
const initial = useStore.getState()
const blocked: BrowserProfile = { id: 'chrome::', browser: 'Chrome', profile: '无权限读取', hasBiliLogin: false, blocked: true }
const readable: BrowserProfile = { id: 'chrome::Default', browser: 'Chrome', profile: 'Default', hasBiliLogin: true }
const blockedSafari: BrowserProfile = { ...blocked, id: 'safari::', browser: 'Safari' }
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.resetAllMocks()
  auth.listBrowsers.mockResolvedValue([blocked])
  useStore.setState(initial, true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

const button = (name: string): HTMLButtonElement | undefined =>
  [...container.querySelectorAll('button')].find((element) => (element.getAttribute('aria-label') ?? element.textContent) === name)

it('授权后更新列表，并用原来的账号目标提交导入', async () => {
  const target = { mode: 'reauth', mid: 17, activate: false } as const
  useStore.setState({ loginOpen: true, loginTarget: target })
  let finishSelection!: (profiles: BrowserProfile[]) => void
  auth.chooseBrowserFolder.mockReturnValue(new Promise<BrowserProfile[]>((resolve) => {
    finishSelection = resolve
  }))
  auth.importFromBrowser.mockResolvedValue({ loggedIn: true })
  await act(async () => root.render(createElement(LoginDialog)))
  expect(container.textContent).toContain('macOS 拒绝读取 Chrome 的数据')
  expect(button('导入')).toBeUndefined()
  await act(async () => button('选择浏览器文件夹')!.click())
  expect(auth.chooseBrowserFolder).toHaveBeenCalledExactlyOnceWith('chrome::')
  expect(button('选择浏览器文件夹')?.disabled).toBe(true)
  expect(button('重新检测')?.disabled).toBe(true)
  await act(async () => finishSelection([readable]))
  expect(button('选择浏览器文件夹')).toBeUndefined()
  expect(auth.importFromBrowser).not.toHaveBeenCalled()
  await act(async () => button('导入')!.click())
  expect(auth.importFromBrowser).toHaveBeenCalledExactlyOnceWith('chrome::Default', target)
  expect(useStore.getState().loginOpen).toBe(false)
})

it('取消或选错文件夹时保留登录入口，可继续重试', async () => {
  auth.chooseBrowserFolder
    .mockResolvedValueOnce(null)
    .mockRejectedValueOnce(new Error('请选择受支持的浏览器数据文件夹'))
    .mockResolvedValueOnce([readable])
  await act(async () => root.render(createElement(LoginDialog)))
  await act(async () => button('选择浏览器文件夹')!.click())
  expect(button('选择浏览器文件夹')?.disabled).toBe(false)
  expect(button('导入')).toBeUndefined()
  await act(async () => button('选择浏览器文件夹')!.click())
  expect(container.textContent).toContain('请选择受支持的浏览器数据文件夹')
  await act(async () => button('选择浏览器文件夹')!.click())
  expect(container.textContent).not.toContain('请选择受支持的浏览器数据文件夹')
  expect(button('导入')).toBeDefined()
})

it('Chrome 已可导入时仍能授权 Safari', async () => {
  auth.listBrowsers.mockResolvedValue([readable, blockedSafari])
  auth.chooseBrowserFolder.mockResolvedValue(null)
  await act(async () => root.render(createElement(LoginDialog)))
  expect(button('导入')).toBeDefined()
  expect(container.textContent).toContain('macOS 拒绝读取 Safari 的数据')
  await act(async () => button('选择浏览器文件夹')!.click())
  expect(auth.chooseBrowserFolder).toHaveBeenCalledExactlyOnceWith('safari::')
})

it('多个浏览器受限时可以直接授权指定浏览器，同一浏览器只显示一个入口', async () => {
  auth.listBrowsers.mockResolvedValue([blocked, { ...blocked, id: 'chrome::Profile 1' }, blockedSafari])
  auth.chooseBrowserFolder.mockResolvedValue([blocked, { ...readable, id: 'safari::Default', browser: 'Safari' }])
  await act(async () => root.render(createElement(LoginDialog)))
  expect(container.querySelectorAll('[aria-label="选择浏览器文件夹 · Chrome"]')).toHaveLength(1)
  await act(async () => button('选择浏览器文件夹 · Safari')!.click())
  expect(auth.chooseBrowserFolder).toHaveBeenCalledExactlyOnceWith('safari::')
  expect(button('导入')).toBeDefined()
  expect(container.textContent).toContain('macOS 拒绝读取 Chrome 的数据')
})

it('重新检测成功后清除之前的权限错误', async () => {
  auth.chooseBrowserFolder.mockRejectedValue(new Error('没有权限读取 Chrome 的数据'))
  await act(async () => root.render(createElement(LoginDialog)))
  await act(async () => button('选择浏览器文件夹')!.click())
  expect(container.textContent).toContain('没有权限读取 Chrome 的数据')
  auth.listBrowsers.mockResolvedValue([readable])
  await act(async () => button('重新检测')!.click())
  expect(button('导入')).toBeDefined()
  expect(container.textContent).not.toContain('没有权限读取 Chrome 的数据')
})
