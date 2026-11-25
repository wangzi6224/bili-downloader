// @vitest-environment jsdom

import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserProfile, YtAccount } from '@shared/types'
import { click, deferred, findButton, getButton, mount, typeInto, type Mounted } from './testDom'

const yt = {
  listBrowsers: vi.fn(),
  importBrowser: vi.fn(),
  importCookie: vi.fn(),
  selectAccount: vi.fn(),
  removeAccount: vi.fn(),
  checkAccount: vi.fn()
}
Object.defineProperty(window, 'api', { value: { yt }, configurable: true })
const { useStore } = await import('../store')
const { YtAccountSettings, YtLoginDialog } = await import('./YtAccounts')
const initial = useStore.getState()

const profile = (id: string, browser: string, extra: Partial<BrowserProfile> = {}): BrowserProfile => ({
  id, browser, profile: `${browser} 的默认配置`, hasBiliLogin: true, ...extra
})
const a: YtAccount = { id: 'a', name: '主账号', handle: '@main', avatar: 'https://yt3.ggpht.com/a.jpg', addedAt: 1, status: 'ready' }
const b: YtAccount = { id: 'b', name: '小号', addedAt: 2, status: 'ready' }
const c: YtAccount = { id: 'c', name: '旧账号', addedAt: 3, status: 'expired' }

let m: Mounted
const text = (): string => m.container.textContent ?? ''

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.clearAllMocks()
  useStore.setState({ ...initial, ytLoginOpen: true }, true)
  m = mount()
})

afterEach(() => {
  m.unmount()
  vi.unstubAllGlobals()
})

describe('YtLoginDialog', () => {
  it('查找时显示加载中，之后只列出有 YouTube 登录的浏览器', async () => {
    const list = deferred<BrowserProfile[]>()
    yt.listBrowsers.mockReturnValue(list.promise)
    await m.render(createElement(YtLoginDialog))
    expect(text()).toContain('正在查找浏览器…')
    await act(async () => list.resolve([
      profile('chrome', 'Chrome'),
      profile('edge', 'Edge', { hasBiliLogin: false }),
      profile('brave', 'Brave', { blocked: true })
    ]))
    expect(text()).not.toContain('正在查找浏览器…')
    expect(text()).toContain('Chrome 的默认配置')
    expect(text()).not.toContain('Edge')
    expect(text()).not.toContain('Brave')
    expect(text()).not.toContain('没有在浏览器里找到 YouTube 登录')
  })

  it('导入成功后关闭窗口；导入中按钮禁用', async () => {
    yt.listBrowsers.mockResolvedValue([profile('chrome', 'Chrome'), profile('firefox', 'Firefox')])
    const importing = deferred<YtAccount>()
    yt.importBrowser.mockReturnValue(importing.promise)
    await m.render(createElement(YtLoginDialog))
    const imports = () => [...m.container.querySelectorAll('button')].filter((x) => /^导入/.test(x.textContent ?? ''))
    await click(imports()[1])
    expect(yt.importBrowser).toHaveBeenCalledExactlyOnceWith('firefox')
    expect(text()).toContain('导入中')
    expect(imports().every((x) => x.disabled)).toBe(true)
    await act(async () => importing.resolve(a))
    expect(useStore.getState().ytLoginOpen).toBe(false)
  })

  it('导入失败显示错误，窗口不关，错误可以关闭', async () => {
    yt.listBrowsers.mockResolvedValue([profile('chrome', 'Chrome')])
    yt.importBrowser.mockRejectedValue(new Error('这份 YouTube 登录已经失效'))
    await m.render(createElement(YtLoginDialog))
    await click(getButton(m.container, '导入'))
    expect(text()).toContain('这份 YouTube 登录已经失效')
    expect(useStore.getState().ytLoginOpen).toBe(true)
    expect(getButton(m.container, '导入').disabled).toBe(false)
    const closes = [...m.container.querySelectorAll<HTMLButtonElement>('button[aria-label="关闭"]')]
    await click(closes[closes.length - 1])
    expect(text()).not.toContain('已经失效')
  })

  it('手动粘贴 Cookie：展开后输入内容才能导入，成功后关闭', async () => {
    yt.listBrowsers.mockResolvedValue([])
    yt.importCookie.mockResolvedValue(a)
    await m.render(createElement(YtLoginDialog))
    expect(m.container.querySelector('textarea')).toBeNull()
    await click(getButton(m.container, '手动粘贴 Cookie'))
    const area = m.container.querySelector('textarea')!
    expect(text()).toContain('只保存 youtube.com 的 Cookie')
    expect(getButton(m.container, '导入').disabled).toBe(true)
    await typeInto(area, 'SAPISID=x; SID=y')
    await click(getButton(m.container, '导入'))
    expect(yt.importCookie).toHaveBeenCalledExactlyOnceWith('SAPISID=x; SID=y')
    expect(useStore.getState().ytLoginOpen).toBe(false)
  })

  it('粘贴的 Cookie 无效时显示错误', async () => {
    yt.listBrowsers.mockResolvedValue([])
    yt.importCookie.mockRejectedValue(new Error('没有找到 YouTube 的登录信息'))
    await m.render(createElement(YtLoginDialog))
    await click(getButton(m.container, '手动粘贴 Cookie'))
    await typeInto(m.container.querySelector('textarea')!, 'abc')
    await click(getButton(m.container, '导入'))
    expect(text()).toContain('没有找到 YouTube 的登录信息')
    await click(getButton(m.container, '手动粘贴 Cookie'))
    expect(m.container.querySelector('textarea')).toBeNull()
  })

  it('Windows 上登录被浏览器加密、浏览器正在运行时分别提示', async () => {
    yt.listBrowsers.mockResolvedValue([
      profile('chrome', 'Chrome', { appBoundLogin: true }),
      profile('edge', 'Edge', { hasBiliLogin: false, locked: true })
    ])
    await m.render(createElement(YtLoginDialog))
    expect(text()).toContain('新版 Chrome / Edge 在 Windows 上把登录信息加密成只有浏览器自己能读')
    expect(text()).toContain('Edge 正在运行，读不到它的登录信息。请完全退出 Edge 后再试')
    expect(findButton(m.container, '导入')).toBeUndefined()
    // 有被加密的登录时不再说“没找到登录”
    expect(text()).not.toContain('没有在浏览器里找到 YouTube 登录')
  })

  it('没有登录时提示先在浏览器里登录；重新检测会再查一次；查找失败显示错误', async () => {
    yt.listBrowsers.mockResolvedValueOnce([profile('edge', 'Edge', { hasBiliLogin: false })])
    await m.render(createElement(YtLoginDialog))
    expect(text()).toContain('没有在浏览器里找到 YouTube 登录')
    yt.listBrowsers.mockRejectedValueOnce(new Error('读取浏览器数据被拒绝'))
    await click(getButton(m.container, '重新检测'))
    expect(yt.listBrowsers).toHaveBeenCalledTimes(2)
    expect(text()).toContain('读取浏览器数据被拒绝')
  })

  it('取消、右上角关闭和 Esc 都关闭窗口', async () => {
    yt.listBrowsers.mockResolvedValue([])
    await m.render(createElement(YtLoginDialog))
    await click(getButton(m.container, '取消'))
    expect(useStore.getState().ytLoginOpen).toBe(false)
    useStore.setState({ ytLoginOpen: true })
    await click(getButton(m.container, '关闭'))
    expect(useStore.getState().ytLoginOpen).toBe(false)
    useStore.setState({ ytLoginOpen: true })
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(useStore.getState().ytLoginOpen).toBe(false)
  })
})

describe('YtAccountSettings', () => {
  const render = async (): Promise<void> => {
    useStore.setState({ ytLoginOpen: false })
    await m.render(createElement(YtAccountSettings))
  }

  it('没有账号时提示可以不登录，按钮是“导入 YouTube 登录”', async () => {
    await render()
    expect(text()).toContain('YouTube 账号')
    expect(text()).toContain('还没有导入 YouTube 登录。不登录也能下载公开视频')
    expect(text()).toContain('未登录 YouTube')
    expect(findButton(m.container, '不使用账号')).toBeUndefined()
    await click(getButton(m.container, '导入 YouTube 登录'))
    expect(useStore.getState().ytLoginOpen).toBe(true)
  })

  it('列出账号：当前账号、已失效的标记，头像和 handle', async () => {
    useStore.setState({ ytAccounts: { current: 'a', accounts: [a, b, c] } })
    await render()
    expect(text()).toContain('主账号')
    expect(text()).toContain('@main')
    expect(text()).toContain('当前')
    expect(text()).toContain('登录已失效')
    expect(text()).toContain('下载时使用 主账号')
    expect(m.container.querySelector('img')?.getAttribute('src')).toBe(a.avatar)
    // 当前账号和已失效的账号没有“使用”按钮
    expect([...m.container.querySelectorAll('button')].filter((x) => x.textContent === '使用')).toHaveLength(1)
    await click(getButton(m.container, '添加账号'))
    expect(useStore.getState().ytLoginOpen).toBe(true)
  })

  it('使用别的账号、检查账号、不使用账号', async () => {
    yt.selectAccount.mockResolvedValue(undefined)
    yt.checkAccount.mockResolvedValue(a)
    useStore.setState({ ytAccounts: { current: 'a', accounts: [a, b] } })
    await render()
    await click(getButton(m.container, '使用'))
    expect(yt.selectAccount).toHaveBeenCalledExactlyOnceWith('b')
    await click([...m.container.querySelectorAll('button')].filter((x) => x.textContent === '检查')[0])
    expect(yt.checkAccount).toHaveBeenCalledExactlyOnceWith('a')
    await click(getButton(m.container, '不使用账号'))
    expect(yt.selectAccount).toHaveBeenLastCalledWith()
  })

  it('检查中按钮禁用，失败时在这一行显示错误', async () => {
    const checking = deferred<YtAccount>()
    yt.checkAccount.mockReturnValue(checking.promise)
    useStore.setState({ ytAccounts: { accounts: [b] } })
    await render()
    expect(text()).toContain('未登录 YouTube')
    await click(getButton(m.container, '检查'))
    expect(getButton(m.container, '检查').disabled).toBe(true)
    expect(getButton(m.container, '使用').disabled).toBe(true)
    await act(async () => checking.reject(new Error('这份 YouTube 登录已经失效')))
    expect(m.container.querySelector('[role="alert"]')?.textContent).toBe('这份 YouTube 登录已经失效')
    expect(getButton(m.container, '检查').disabled).toBe(false)
  })

  it('移除要二次确认，可以取消', async () => {
    yt.removeAccount.mockResolvedValue(undefined)
    useStore.setState({ ytAccounts: { current: 'a', accounts: [a] } })
    await render()
    await click(getButton(m.container, '移除账号'))
    expect(yt.removeAccount).not.toHaveBeenCalled()
    await click(getButton(m.container, '取消'))
    expect(findButton(m.container, '确认移除')).toBeUndefined()
    await click(getButton(m.container, '移除账号'))
    await click(getButton(m.container, '确认移除'))
    expect(yt.removeAccount).toHaveBeenCalledExactlyOnceWith('a')
  })
})
