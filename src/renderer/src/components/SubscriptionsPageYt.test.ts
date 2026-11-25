// @vitest-environment jsdom
// 订阅页在 YouTube 主题下的表现（B站主题的一键下载等见 SubscriptionsPage.test.ts）

import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPTIONS, DEFAULT_YT_OPTIONS } from '@shared/options'
import type { ParseResult, Settings, Subscription, YtAccount } from '@shared/types'
import { click, findButton, getButton, mount, type Mounted } from './testDom'

const api = {
  sources: { subscribeDownload: vi.fn(), listAccount: vi.fn(), open: vi.fn() },
  subs: { list: vi.fn(), onUpdate: vi.fn(() => () => {}), check: vi.fn(), remove: vi.fn(), update: vi.fn() },
  yt: { parse: vi.fn() }
}
Object.defineProperty(window, 'api', { value: api, configurable: true })
const { useStore } = await import('../store')
const { SubscriptionsPage } = await import('./SubscriptionsPage')
const initial = useStore.getState()

const biliSub: Subscription = {
  id: 'b', input: 'https://www.bilibili.com/bangumi/play/ss1', title: 'B站番剧', kind: 'pgc',
  intervalMin: 360, enabled: true, options: { ...DEFAULT_OPTIONS, qn: 80 }, seen: [], createdAt: 1, accountMid: 1
}
const ytSub: Subscription = {
  id: 'y', input: 'https://www.youtube.com/@channel/videos', title: 'YouTube 频道', kind: 'youtube',
  intervalMin: 720, enabled: true, options: { ...DEFAULT_OPTIONS, qn: 1080, yt: DEFAULT_YT_OPTIONS }, seen: [], createdAt: 2,
  lastNew: 3
}
const account: YtAccount = { id: 'a', name: '主账号', addedAt: 1, status: 'ready' }
const detail: ParseResult = { kind: 'youtube', title: 'YouTube 频道', cover: '', groups: [], defaultSelected: [] }

let m: Mounted
const text = (): string => m.container.textContent ?? ''

async function render(site: Settings['uiSite'], subs: Subscription[] = [biliSub, ytSub]): Promise<void> {
  api.subs.list.mockResolvedValue(subs)
  useStore.setState({ view: 'subs', settings: { uiSite: site } as Settings })
  await m.render(createElement(SubscriptionsPage))
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.clearAllMocks()
  useStore.setState({ ...initial, auth: { loggedIn: false }, accounts: null }, true)
  api.yt.parse.mockResolvedValue(detail)
  m = mount()
})

afterEach(() => {
  m.unmount()
  vi.unstubAllGlobals()
})

describe('应用内订阅', () => {
  it('YouTube 主题只列 YouTube 的订阅，没有一键下载，也不显示 B站发起账号', async () => {
    await render('youtube')
    expect(text()).toContain('YouTube 频道')
    expect(text()).not.toContain('B站番剧')
    expect(text()).toContain('上次发现 3 个新内容')
    expect(findButton(m.container, '下载缺失内容')).toBeUndefined()
    expect(findButton(m.container, '立即检查')).toBeDefined()
    expect(text()).not.toContain('发起账号')
    expect(m.container.querySelector('select')?.value).toBe('720')
  })

  it('点订阅标题用 YouTube 接口解析订阅链接，回到下载页', async () => {
    await render('youtube')
    await click(getButton(m.container, ytSub.input))
    expect(api.yt.parse).toHaveBeenCalledExactlyOnceWith(ytSub.input)
    expect(api.sources.open).not.toHaveBeenCalled()
    expect(useStore.getState()).toMatchObject({ view: 'downloads', ytParse: detail })
  })

  it('B站主题只列 B站的订阅，带一键下载', async () => {
    await render('bili')
    expect(text()).toContain('B站番剧')
    expect(text()).not.toContain('YouTube 频道')
    expect(findButton(m.container, '下载缺失内容')).toBeDefined()
  })

  it('当前平台没有订阅时显示空状态（另一个平台有也一样）', async () => {
    await render('youtube', [biliSub])
    expect(text()).toContain('还没有订阅')
  })

  it('切换平台后列表跟着换', async () => {
    await render('youtube')
    await act(async () => useStore.setState({ settings: { uiSite: 'bili' } as Settings }))
    expect(text()).toContain('B站番剧')
    expect(text()).not.toContain('YouTube 频道')
  })
})

describe('我的 YouTube', () => {
  it('第二个标签在 YouTube 主题下叫“我的 YouTube”，B站主题下是 B 站账号', async () => {
    await render('youtube')
    expect(findButton(m.container, '我的 YouTube')).toBeDefined()
    expect(findButton(m.container, 'B 站账号')).toBeUndefined()
    await act(async () => useStore.setState({ settings: { uiSite: 'bili' } as Settings }))
    expect(findButton(m.container, 'B 站账号')).toBeDefined()
  })

  it('没导入登录时引导导入', async () => {
    await render('youtube')
    await click(getButton(m.container, '我的 YouTube'))
    expect(text()).toContain('导入 YouTube 登录后，这里可以直接打开稍后观看')
    expect(findButton(m.container, '稍后观看')).toBeUndefined()
    await click(getButton(m.container, '导入 YouTube 登录'))
    expect(useStore.getState().ytLoginOpen).toBe(true)
  })

  it.each([
    ['稍后观看', 'https://www.youtube.com/playlist?list=WL'],
    ['喜欢的视频', 'https://www.youtube.com/playlist?list=LL'],
    ['订阅内容', 'https://www.youtube.com/feed/subscriptions'],
    ['观看记录', 'https://www.youtube.com/feed/history']
  ])('登录后点“%s”解析对应链接并回到下载页', async (label, url) => {
    useStore.setState({ ytAccounts: { current: 'a', accounts: [account] } })
    await render('youtube')
    await click(getButton(m.container, '我的 YouTube'))
    // 标题下显示当前 YouTube 账号
    expect(text()).toContain('主账号')
    expect(text()).toContain('打开后可以选择下载，也可以在选择窗口里订阅')
    await click(getButton(m.container, label))
    expect(api.yt.parse).toHaveBeenCalledExactlyOnceWith(url)
    expect(useStore.getState().view).toBe('downloads')
  })
})
