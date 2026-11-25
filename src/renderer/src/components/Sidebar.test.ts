// @vitest-environment jsdom

import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaKind, Settings, TaskInfo, TaskStatus, YtAccount } from '@shared/types'
import { click, findButton, getButton, mount, type Mounted } from './testDom'

const api = {
  settings: { set: vi.fn() },
  auth: { switchAccount: vi.fn(), removeAccount: vi.fn() },
  yt: { selectAccount: vi.fn() }
}
Object.defineProperty(window, 'api', { value: api, configurable: true })
const { useStore } = await import('../store')
const { Sidebar } = await import('./Sidebar')
const initial = useStore.getState()

const task = (id: string, kind: MediaKind, status: TaskStatus = 'downloading'): TaskInfo =>
  ({ id, status, title: id, item: { key: id, kind, title: id, index: 1, cid: 0 } }) as TaskInfo
const a: YtAccount = { id: 'a', name: '主账号', handle: '@main', addedAt: 1, status: 'ready' }
const b: YtAccount = { id: 'b', name: '小号', addedAt: 2, status: 'ready' }

let m: Mounted
const text = (): string => m.container.textContent ?? ''
const radio = (label: string): HTMLButtonElement =>
  [...m.container.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((r) => r.textContent?.startsWith(label))!
const navCount = (): string | undefined =>
  getButton(m.container, /^下载\d*$/).querySelector('span.rounded-full')?.textContent ?? undefined

async function render(site: Settings['uiSite'] = 'bili'): Promise<void> {
  useStore.setState({ settings: { uiSite: site } as Settings })
  await m.render(createElement(Sidebar))
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.clearAllMocks()
  useStore.setState({ ...initial, auth: { loggedIn: false }, accounts: { accounts: [], legacyCount: 0 } }, true)
  api.settings.set.mockImplementation(async (patch: Partial<Settings>) => ({ ...useStore.getState().settings, ...patch }))
  api.yt.selectAccount.mockResolvedValue(undefined)
  m = mount()
})

afterEach(() => {
  m.unmount()
  vi.unstubAllGlobals()
})

describe('平台切换器', () => {
  it('显示两个平台，当前平台选中；点另一个调用 switchSite 保存 uiSite', async () => {
    await render()
    expect(m.container.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('切换平台')
    expect(radio('B站').getAttribute('aria-checked')).toBe('true')
    expect(radio('YouTube').getAttribute('aria-checked')).toBe('false')
    await click(radio('YouTube'))
    expect(api.settings.set).toHaveBeenCalledExactlyOnceWith({ uiSite: 'youtube' })
    expect(useStore.getState().settings?.uiSite).toBe('youtube')
    expect(radio('YouTube').getAttribute('aria-checked')).toBe('true')
    expect(text()).toContain('YouTube · ')
  })

  it('点当前平台不保存', async () => {
    await render('youtube')
    await click(radio('YouTube'))
    expect(api.settings.set).not.toHaveBeenCalled()
  })

  it('另一个平台有任务在下载或排队时显示小圆点，数量在提示里；当前平台不显示', async () => {
    useStore.setState({ tasks: [task('y1', 'youtube'), task('y2', 'youtube', 'queued'), task('y3', 'youtube', 'done'), task('b1', 'ugc')] })
    await render()
    expect(radio('YouTube').textContent).toBe('YouTube')
    expect(radio('YouTube').title).toBe('这边有 2 个任务在下载')
    expect(radio('YouTube').querySelector('[aria-label]')?.getAttribute('aria-label')).toBe('这边有 2 个任务在下载')
    expect(radio('B站').title).toBe('')
    expect(radio('B站').querySelector('[aria-label]')).toBeNull()
  })
})

describe('导航', () => {
  it('下载角标只数当前平台的活动任务', async () => {
    useStore.setState({ tasks: [task('b1', 'ugc'), task('y1', 'youtube'), task('y2', 'youtube', 'fetching'), task('y3', 'youtube', 'paused')] })
    await render()
    expect(navCount()).toBe('1')
    await act(async () => useStore.setState({ settings: { uiSite: 'youtube' } as Settings }))
    expect(navCount()).toBe('2')
    await act(async () => useStore.setState({ tasks: [task('b1', 'ugc')] }))
    expect(navCount()).toBeUndefined()
  })

  it('点导航切换页面', async () => {
    await render()
    await click(getButton(m.container, '解析记录'))
    expect(useStore.getState().view).toBe('history')
    await click(getButton(m.container, '设置'))
    expect(useStore.getState().view).toBe('settings')
  })

  it('B站主题下标题不带 YouTube，显示版本号', async () => {
    useStore.setState({ update: { current: '0.20.0' } as never })
    await render()
    expect(text()).toContain('v0.20.0')
    expect(text()).not.toContain('YouTube · ')
  })
})

describe('YouTube 主题的账号卡片', () => {
  it('没有导入登录时显示导入入口，点击打开导入窗口；不显示 B站账号', async () => {
    await render('youtube')
    expect(text()).toContain('导入 YouTube 登录')
    expect(text()).toContain('可选，下载会员视频时需要')
    expect(text()).not.toContain('登录 B站账号')
    await click(getButton(m.container, /导入 YouTube 登录/))
    expect(useStore.getState().ytLoginOpen).toBe(true)
  })

  it('B站主题下显示 B站账号卡片', async () => {
    useStore.setState({ ytAccounts: { current: 'a', accounts: [a] } })
    await render('bili')
    expect(text()).toContain('登录 B站账号')
    expect(text()).not.toContain('主账号')
  })

  it('已登录时显示当前账号，菜单里可以切换、不使用账号、添加账号、管理账号', async () => {
    useStore.setState({ ytAccounts: { current: 'a', accounts: [a, b] } })
    await render('youtube')
    const card = getButton(m.container, /主账号/)
    expect(card.textContent).toContain('@main')
    expect(card.getAttribute('aria-expanded')).toBe('false')

    await click(card)
    expect(card.getAttribute('aria-expanded')).toBe('true')
    await click(getButton(m.container, '小号'))
    expect(api.yt.selectAccount).toHaveBeenCalledExactlyOnceWith('b')
    expect(findButton(m.container, '小号')).toBeUndefined()

    await click(card)
    await click(getButton(m.container, '不使用账号'))
    expect(api.yt.selectAccount).toHaveBeenLastCalledWith()

    await click(card)
    await click(getButton(m.container, '添加账号'))
    expect(useStore.getState().ytLoginOpen).toBe(true)

    await click(card)
    await click(getButton(m.container, '管理账号'))
    expect(useStore.getState()).toMatchObject({ view: 'settings', showAccountSettings: true })
  })

  it('当前账号失效时标出来；有账号但选了不使用账号时显示导入入口和菜单', async () => {
    useStore.setState({ ytAccounts: { current: 'a', accounts: [{ ...a, status: 'expired' }] } })
    await render('youtube')
    expect(getButton(m.container, /主账号/).textContent).toContain('登录已失效')
    await act(async () => useStore.setState({ ytAccounts: { accounts: [a] } }))
    const card = getButton(m.container, /导入 YouTube 登录/)
    expect(card.getAttribute('aria-expanded')).toBe('false')
    await click(card)
    expect(findButton(m.container, '主账号')).toBeDefined()
    expect(useStore.getState().ytLoginOpen).toBe(false)
  })

  it('账号有头像时显示头像，没有 handle 时显示 YouTube', async () => {
    useStore.setState({ ytAccounts: { current: 'b', accounts: [{ ...b, avatar: 'https://yt3.ggpht.com/b.jpg' }] } })
    await render('youtube')
    expect(m.container.querySelector('aside img')?.getAttribute('src')).toBe('https://yt3.ggpht.com/b.jpg')
    expect(getButton(m.container, /小号/).textContent).toContain('小号YouTube')
  })
})
