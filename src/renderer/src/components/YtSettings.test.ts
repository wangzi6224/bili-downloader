// @vitest-environment jsdom

import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPTIONS, DEFAULT_YT_OPTIONS } from '@shared/options'
import type { Settings, YoutubeSettings, YtEngineStatus } from '@shared/types'
import { changeSelect, click, deferred, getButton, mount, type Mounted } from './testDom'

const api = {
  settings: { set: vi.fn(), chooseDir: vi.fn() },
  yt: { engine: { check: vi.fn(), prepare: vi.fn() } }
}
Object.defineProperty(window, 'api', { value: api, configurable: true })
const { useStore } = await import('../store')
const { YtConcurrencyRow, YtDirRow, YtFormatSettings } = await import('./YtSettings')
const initial = useStore.getState()

const youtube: YoutubeSettings = {
  downloadDir: '/Users/me/Movies/YouTube',
  defaultQn: 1080,
  concurrency: 2,
  autoUpdate: true,
  // 旧版本存的 yt 段可能缺字段，界面按默认值补齐
  defaults: { ...DEFAULT_OPTIONS, yt: { container: 'mkv' } as typeof DEFAULT_YT_OPTIONS }
}
const settings = { youtube, rememberLast: false, uiSite: 'youtube' } as Settings

let m: Mounted
const text = (): string => m.container.textContent ?? ''

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.clearAllMocks()
  useStore.setState({ ...initial, settings }, true)
  // 主进程按收到的补丁合并后返回
  api.settings.set.mockImplementation(async (patch: Partial<Settings>) => ({ ...useStore.getState().settings, ...patch }))
  m = mount()
})

afterEach(() => {
  m.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('YtDirRow', () => {
  it('显示 YouTube 下载目录，更改时选的是 YouTube 的目录', async () => {
    const next = { ...settings, youtube: { ...youtube, downloadDir: '/新目录' } }
    api.settings.chooseDir.mockResolvedValue(next)
    await m.render(createElement(YtDirRow))
    expect(text()).toContain('YouTube 下载目录')
    expect(text()).toContain('/Users/me/Movies/YouTube')
    await click(getButton(m.container, '更改'))
    expect(api.settings.chooseDir).toHaveBeenCalledExactlyOnceWith('youtube')
    expect(useStore.getState().settings).toBe(next)
    expect(text()).toContain('/新目录')
  })
})

describe('YtConcurrencyRow', () => {
  it('选择 YouTube 同时下载数，只改 youtube.concurrency', async () => {
    await m.render(createElement(YtConcurrencyRow))
    const select = m.container.querySelector('select')!
    expect(select.value).toBe('2')
    expect([...select.options].map((o) => o.textContent)).toEqual(['1 个', '2 个', '3 个', '4 个', '5 个'])
    await changeSelect(select, '4')
    expect(api.settings.set).toHaveBeenCalledExactlyOnceWith({ youtube: { ...youtube, concurrency: 4 } })
    expect(useStore.getState().settings?.youtube.concurrency).toBe(4)
  })
})

describe('YtFormatSettings', () => {
  const render = async (engine: YtEngineStatus | null = null): Promise<void> => {
    useStore.setState({ ytEngine: engine })
    await m.render(createElement(YtFormatSettings))
  }
  const selects = (): HTMLSelectElement[] => [...m.container.querySelectorAll('select')]
  const switches = (): HTMLButtonElement[] => [...m.container.querySelectorAll<HTMLButtonElement>('button[role="switch"]')]

  it('默认画质：0 是最高画质，4K、8K 带标注；修改写回 youtube.defaultQn', async () => {
    await render()
    const qn = selects()[0]
    expect(qn.value).toBe('1080')
    expect([...qn.options].map((o) => o.textContent)).toEqual(['最高画质', '4320p (8K)', '2160p (4K)', '1440p', '1080p', '720p', '480p', '360p'])
    await changeSelect(qn, '0')
    expect(api.settings.set).toHaveBeenCalledExactlyOnceWith({ youtube: { ...youtube, defaultQn: 0 } })
  })

  it('记住上次选择开关改的是全局设置', async () => {
    await render()
    await click(switches()[0])
    expect(api.settings.set).toHaveBeenCalledExactlyOnceWith({ rememberLast: true })
  })

  it('下载选项用默认值补齐缺的字段，改动写回 youtube.defaults', async () => {
    await render()
    expect(getButton(m.container, 'MKV').getAttribute('aria-pressed')).toBe('true')
    await click(getButton(m.container, '仅音频'))
    expect(api.settings.set).toHaveBeenCalledExactlyOnceWith({
      youtube: { ...youtube, defaults: { ...DEFAULT_OPTIONS, output: 'audio', yt: { ...DEFAULT_YT_OPTIONS, container: 'mkv' } } }
    })
    expect(useStore.getState().settings?.youtube.defaults.output).toBe('audio')
    // 设置更新后界面跟着变成仅音频，容器不能再选
    expect(getButton(m.container, 'WebM').disabled).toBe(true)
  })

  it('组件已安装：显示版本和检查时间，点“检查更新”调用 check', async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 25, 12, 0, 0) })
    const checking = deferred<YtEngineStatus>()
    api.yt.engine.check.mockReturnValue(checking.promise)
    await render({ state: 'ready', version: '2026.11.01', checkedAt: Date.now() - 2 * 3600 * 1000, message: '已是最新' })
    expect(text()).toContain('YouTube 组件')
    expect(text()).toContain('版本 2026.11.01 · 2 小时前检查过更新 · 已是最新')
    await click(getButton(m.container, '检查更新'))
    expect(api.yt.engine.check).toHaveBeenCalledOnce()
    expect(api.yt.engine.prepare).not.toHaveBeenCalled()
    expect(getButton(m.container, '检查更新').disabled).toBe(true)
    await act(async () => checking.resolve({ state: 'ready', version: '2026.11.01' }))
    expect(getButton(m.container, '检查更新').disabled).toBe(false)
  })

  it('组件没装：说明要下载，点“下载组件”调用 prepare，失败也恢复按钮', async () => {
    api.yt.engine.prepare.mockRejectedValue(new Error('网络错误'))
    await render({ state: 'missing' })
    expect(text()).toContain('第一次使用 YouTube 需要下载 YouTube 组件')
    await click(getButton(m.container, '下载组件'))
    expect(api.yt.engine.prepare).toHaveBeenCalledOnce()
    expect(getButton(m.container, '下载组件').disabled).toBe(false)
  })

  it('还不知道状态时按没装处理；下载中按钮禁用并显示进度', async () => {
    await render(null)
    expect(text()).toContain('第一次使用 YouTube 需要下载 YouTube 组件')
    await act(async () => useStore.setState({ ytEngine: { state: 'downloading', stage: 'download', done: 1, size: 4 } }))
    expect(text()).toContain('正在准备 YouTube 组件：下载中 25%')
    expect(getButton(m.container, '下载组件').disabled).toBe(true)
    await act(async () => useStore.setState({ ytEngine: { state: 'ready', version: '1', updating: true, stage: 'extract' } }))
    expect(getButton(m.container, '检查更新').disabled).toBe(true)
  })

  it('自动更新开关写回 youtube.autoUpdate', async () => {
    await render({ state: 'ready', version: '1' })
    const auto = switches()[1]
    expect(auto.getAttribute('aria-checked')).toBe('true')
    await click(auto)
    expect(api.settings.set).toHaveBeenCalledExactlyOnceWith({ youtube: { ...youtube, autoUpdate: false } })
  })
})
