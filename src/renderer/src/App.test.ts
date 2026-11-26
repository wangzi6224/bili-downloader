// @vitest-environment jsdom
// App 只做组装：子组件换成标记，只测平台主题、组件准备、快捷键和弹窗的显示条件

import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParseResult, Settings, YtAccountsSnapshot, YtEngineStatus } from '@shared/types'
import { mount, pressKey, type Mounted } from './components/testDom'

const marker = (name: string) => () => createElement('div', { 'data-mock': name })
const dialog = (name: string) => ({ result }: { result: ParseResult }) => createElement('div', { 'data-mock': name }, result.title)
vi.mock('./components/Sidebar', () => ({ Sidebar: marker('Sidebar') }))
vi.mock('./components/UrlInput', () => ({ UrlInput: marker('UrlInput') }))
vi.mock('./components/YtUrlInput', () => ({ YtUrlInput: marker('YtUrlInput') }))
vi.mock('./components/TaskList', () => ({ TaskList: marker('TaskList') }))
vi.mock('./components/SubscriptionsPage', () => ({ SubscriptionsPage: marker('SubscriptionsPage') }))
vi.mock('./components/HistoryPage', () => ({ HistoryPage: marker('HistoryPage') }))
vi.mock('./components/SettingsPage', () => ({ SettingsPage: marker('SettingsPage') }))
vi.mock('./components/SelectionDialog', () => ({ SelectionDialog: dialog('SelectionDialog') }))
vi.mock('./components/YtSelectionDialog', () => ({ YtSelectionDialog: dialog('YtSelectionDialog') }))
vi.mock('./components/LoginDialog', () => ({ LoginDialog: marker('LoginDialog') }))
vi.mock('./components/YtAccounts', () => ({ YtLoginDialog: marker('YtLoginDialog') }))
vi.mock('./components/DyUrlInput', () => ({ DyUrlInput: marker('DyUrlInput') }))
vi.mock('./components/DySelectionDialog', () => ({ DySelectionDialog: dialog('DySelectionDialog') }))
vi.mock('./components/DyAccounts', () => ({ DyLoginDialog: marker('DyLoginDialog') }))
vi.mock('./components/CloseDialog', () => ({ CloseDialog: marker('CloseDialog') }))
vi.mock('./components/UpdateDialog', () => ({ UpdateDialog: marker('UpdateDialog') }))

/** 推送类接口：记下回调，测试里手动触发 */
const listeners = new Map<string, (v: unknown) => void>()
const on = (name: string) => vi.fn((cb: (v: unknown) => void) => {
  listeners.set(name, cb)
  return () => listeners.delete(name)
})
const api = {
  platform: 'darwin',
  settings: { get: vi.fn(), set: vi.fn(), onChanged: on('settings') },
  i18n: { get: vi.fn(), onChanged: on('i18n') },
  download: { list: vi.fn(), onUpdate: on('tasks') },
  auth: { check: vi.fn(), accounts: vi.fn(), onRequired: on('required'), onChanged: on('auth'), onAccountsChanged: on('accounts') },
  update: { state: vi.fn(), onState: on('update'), onPrompt: on('prompt') },
  app: { onCloseRequested: on('close'), onOpenSettings: on('openSettings') },
  yt: {
    accounts: vi.fn(),
    onAccountsChanged: on('ytAccounts'),
    engine: { status: vi.fn(), onStatus: on('ytEngine'), prepare: vi.fn() }
  },
  dy: { accounts: vi.fn(), status: vi.fn(), onAccountsChanged: on('dyAccounts'), onStatus: on('dyStatus') }
}
Object.defineProperty(window, 'api', { value: api, configurable: true })
const { useStore } = await import('./store')
const { default: App } = await import('./App')
const initial = useStore.getState()

const settings = (site: Settings['uiSite']): Settings => ({ uiSite: site } as Settings)
const result = (title: string): ParseResult => ({ kind: 'youtube', title, cover: '', groups: [], defaultSelected: [] })
const ytAccounts: YtAccountsSnapshot = { current: 'a', accounts: [{ id: 'a', name: '主账号', addedAt: 1, status: 'ready' }] }

let m: Mounted
const mocked = (name: string): HTMLElement | null => m.container.querySelector(`[data-mock="${name}"]`)
const brand = (): string | undefined => document.documentElement.dataset.brand

async function render(site: Settings['uiSite'] = 'bili', engine: YtEngineStatus = { state: 'ready', version: '1' }): Promise<void> {
  api.settings.get.mockResolvedValue(settings(site))
  api.yt.engine.status.mockResolvedValue(engine)
  await m.render(createElement(App))
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.clearAllMocks()
  listeners.clear()
  useStore.setState(initial, true)
  delete document.documentElement.dataset.brand
  api.i18n.get.mockResolvedValue('zh-CN')
  api.download.list.mockResolvedValue([])
  api.auth.check.mockResolvedValue({ loggedIn: false })
  api.auth.accounts.mockResolvedValue({ accounts: [], legacyCount: 0 })
  api.update.state.mockResolvedValue({ current: '0.20.0' })
  api.yt.accounts.mockResolvedValue(ytAccounts)
  api.yt.engine.prepare.mockResolvedValue({ state: 'ready' })
  api.dy.accounts.mockResolvedValue({ accounts: [] })
  api.dy.status.mockResolvedValue([])
  api.settings.set.mockImplementation(async (patch: Partial<Settings>) => ({ ...useStore.getState().settings, ...patch }))
  m = mount()
})

afterEach(() => {
  m.unmount()
  vi.unstubAllGlobals()
})

describe('启动', () => {
  it('拿到设置和语言之前不渲染；之后读入 YouTube 账号和组件状态', async () => {
    const pending = new Promise<Settings>(() => {})
    api.settings.get.mockReturnValue(pending)
    api.yt.engine.status.mockResolvedValue({ state: 'ready', version: '2026.11.01' })
    await m.render(createElement(App))
    expect(m.container.innerHTML).toBe('')
    expect(useStore.getState()).toMatchObject({ ytAccounts, ytEngine: { version: '2026.11.01' }, lang: 'zh-CN' })
    await act(async () => useStore.setState({ settings: settings('bili') }))
    expect(mocked('Sidebar')).not.toBeNull()
  })

  it('主进程推送的 YouTube 账号和组件状态写进 store；卸载时取消订阅', async () => {
    await render()
    const accounts = { accounts: [] }
    await act(async () => listeners.get('ytAccounts')!(accounts))
    expect(useStore.getState().ytAccounts).toBe(accounts)
    await act(async () => listeners.get('ytEngine')!({ state: 'downloading', stage: 'download' }))
    expect(useStore.getState().ytEngine).toEqual({ state: 'downloading', stage: 'download' })
    m.unmount()
    expect(listeners.size).toBe(0)
    m = mount()
  })

  it('读入抖音账号和状态，主进程推送时写进 store', async () => {
    api.dy.accounts.mockResolvedValue({ current: 'd', accounts: [] })
    api.dy.status.mockResolvedValue([{ account: null, state: 'verify' }])
    await render()
    expect(useStore.getState()).toMatchObject({ dyAccounts: { current: 'd' }, dyStatus: [{ state: 'verify' }] })
    await act(async () => listeners.get('dyAccounts')!({ accounts: [] }))
    await act(async () => listeners.get('dyStatus')!([]))
    expect(useStore.getState()).toMatchObject({ dyAccounts: { accounts: [] }, dyStatus: [] })
  })
})

describe('平台主题', () => {
  it('<html data-brand> 跟随 uiSite', async () => {
    await render('bili')
    expect(brand()).toBe('bili')
    await act(async () => useStore.setState({ settings: settings('youtube') }))
    expect(brand()).toBe('youtube')
    await act(async () => listeners.get('settings')!(settings('bili')))
    expect(brand()).toBe('bili')
  })

  it('各平台的输入框都挂着，只显示当前平台的', async () => {
    await render('bili')
    expect(mocked('UrlInput')?.parentElement?.className).toBe('contents')
    expect(mocked('YtUrlInput')?.parentElement?.className).toBe('hidden')
    await act(async () => useStore.setState({ settings: settings('youtube') }))
    expect(mocked('UrlInput')?.parentElement?.className).toBe('hidden')
    expect(mocked('YtUrlInput')?.parentElement?.className).toBe('contents')
    expect(mocked('DyUrlInput')?.parentElement?.className).toBe('hidden')
    await act(async () => useStore.setState({ settings: settings('douyin') }))
    expect(mocked('DyUrlInput')?.parentElement?.className).toBe('contents')
    expect(brand()).toBe('douyin')
  })
})

describe('YouTube 组件', () => {
  it('切到 YouTube 且组件没装时自动准备', async () => {
    await render('bili', { state: 'missing' })
    expect(api.yt.engine.prepare).not.toHaveBeenCalled()
    await act(async () => useStore.setState({ settings: settings('youtube') }))
    expect(api.yt.engine.prepare).toHaveBeenCalledOnce()
  })

  it('启动时就在 YouTube 主题、组件没装时也会准备；准备失败不抛错', async () => {
    api.yt.engine.prepare.mockRejectedValue(new Error('网络错误'))
    await render('youtube', { state: 'missing' })
    expect(api.yt.engine.prepare).toHaveBeenCalledOnce()
  })

  it('组件已装、下载中或出错时不自动准备', async () => {
    await render('youtube', { state: 'ready', version: '1' })
    await act(async () => listeners.get('ytEngine')!({ state: 'downloading' }))
    await act(async () => listeners.get('ytEngine')!({ state: 'error', message: '失败' }))
    expect(api.yt.engine.prepare).not.toHaveBeenCalled()
  })
})

describe('快捷键', () => {
  it('⌘⇧Y 按 B站、YouTube、抖音依次切换', async () => {
    await render('bili')
    await pressKey(document.body, 'Y', { metaKey: true, shiftKey: true })
    expect(api.settings.set).toHaveBeenLastCalledWith({ uiSite: 'youtube' })
    expect(brand()).toBe('youtube')
    await pressKey(document.body, 'y', { metaKey: true, shiftKey: true })
    expect(api.settings.set).toHaveBeenLastCalledWith({ uiSite: 'douyin' })
    await pressKey(document.body, 'y', { metaKey: true, shiftKey: true })
    expect(api.settings.set).toHaveBeenLastCalledWith({ uiSite: 'bili' })
    expect(brand()).toBe('bili')
  })

  it('快捷键会阻止默认行为；macOS 上 Ctrl+Shift+Y 不算', async () => {
    await render('bili')
    const event = new KeyboardEvent('keydown', { key: 'Y', metaKey: true, shiftKey: true, bubbles: true, cancelable: true })
    await act(async () => void window.dispatchEvent(event))
    expect(event.defaultPrevented).toBe(true)
    api.settings.set.mockClear()
    await pressKey(document.body, 'Y', { ctrlKey: true, shiftKey: true })
    expect(api.settings.set).not.toHaveBeenCalled()
  })

  it('⌘, 仍然打开设置', async () => {
    await render('youtube')
    await pressKey(document.body, ',', { metaKey: true })
    expect(useStore.getState().view).toBe('settings')
    expect(mocked('SettingsPage')).not.toBeNull()
  })
})

describe('选择窗口按平台显示', () => {
  it('B站的选择窗口只在 B站主题显示，YouTube 的只在 YouTube 主题显示，切换后都还在', async () => {
    await render('bili')
    await act(async () => useStore.setState({ parse: result('B站合集'), ytParse: result('YouTube 播放列表') }))
    expect(mocked('SelectionDialog')?.textContent).toBe('B站合集')
    expect(mocked('YtSelectionDialog')).toBeNull()
    await act(async () => useStore.setState({ settings: settings('youtube') }))
    expect(mocked('SelectionDialog')).toBeNull()
    expect(mocked('YtSelectionDialog')?.textContent).toBe('YouTube 播放列表')
    await act(async () => useStore.setState({ settings: settings('bili') }))
    expect(mocked('SelectionDialog')?.textContent).toBe('B站合集')
    expect(useStore.getState().ytParse).toMatchObject({ title: 'YouTube 播放列表' })
  })

  it('YouTube 登录窗口按 ytLoginOpen 显示，和 B站登录窗口分开', async () => {
    await render('youtube')
    expect(mocked('YtLoginDialog')).toBeNull()
    await act(async () => useStore.setState({ ytLoginOpen: true }))
    expect(mocked('YtLoginDialog')).not.toBeNull()
    expect(mocked('LoginDialog')).toBeNull()
  })

  it('抖音的选择窗口和登录窗口：只在抖音主题显示选择窗口，更新弹窗不打断它们', async () => {
    await render('bili')
    await act(async () => useStore.setState({ dyParse: result('抖音合集'), updateOpen: true }))
    expect(mocked('DySelectionDialog')).toBeNull()
    expect(mocked('UpdateDialog')).toBeNull()
    await act(async () => useStore.setState({ settings: settings('douyin') }))
    expect(mocked('DySelectionDialog')?.textContent).toBe('抖音合集')
    await act(async () => useStore.setState({ dyParse: null, dyLoginOpen: true }))
    expect(mocked('DyLoginDialog')).not.toBeNull()
    expect(mocked('UpdateDialog')).toBeNull()
    await act(async () => useStore.setState({ dyLoginOpen: false }))
    expect(mocked('UpdateDialog')).not.toBeNull()
  })

  it('更新弹窗不打断 YouTube 的选择窗口和登录窗口', async () => {
    await render('youtube')
    await act(async () => useStore.setState({ updateOpen: true, ytParse: result('播放列表') }))
    expect(mocked('UpdateDialog')).toBeNull()
    await act(async () => useStore.setState({ ytParse: null, ytLoginOpen: true }))
    expect(mocked('UpdateDialog')).toBeNull()
    await act(async () => useStore.setState({ ytLoginOpen: false }))
    expect(mocked('UpdateDialog')).not.toBeNull()
  })
})
