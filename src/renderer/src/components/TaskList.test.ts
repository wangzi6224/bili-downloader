// @vitest-environment jsdom

import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPTIONS } from '@shared/options'
import type { MediaItem, Settings, TaskInfo, TaskStatus } from '@shared/types'
import { click, findButton, getButton, mount, type Mounted } from './testDom'

const api = {
  platform: 'darwin',
  showInFolder: vi.fn(),
  settings: { set: vi.fn() },
  download: { pauseMany: vi.fn(), resumeMany: vi.fn(), remove: vi.fn(), pauseAll: vi.fn(), resumeAll: vi.fn(), clearFinished: vi.fn() },
  watermark: { aiStatus: vi.fn(), onAiStatus: vi.fn(() => () => {}), speed: vi.fn() }
}
Object.defineProperty(window, 'api', { value: api, configurable: true })
const { useStore } = await import('../store')
const { TaskList } = await import('./TaskList')
const initial = useStore.getState()

const settings = {
  uiSite: 'bili',
  downloadDir: '/Users/me/Downloads/B站',
  defaults: DEFAULT_OPTIONS,
  youtube: { downloadDir: '/Users/me/Downloads/YouTube' }
} as Settings

const task = (id: string, status: TaskStatus, item: Partial<MediaItem>, extra: Partial<TaskInfo> = {}): TaskInfo => ({
  id,
  title: `任务 ${id}`,
  groupTitle: `分组 ${id}`,
  item: { key: id, kind: 'ugc', title: id, index: 1, cid: 1, ...item },
  options: { ...DEFAULT_OPTIONS, qn: 80 },
  relBase: id,
  status,
  downloaded: 0,
  total: 100,
  speed: 0,
  createdAt: 1,
  ...extra
})
const yt = (id: string, status: TaskStatus, extra: Partial<TaskInfo> = {}): TaskInfo =>
  task(id, status, { kind: 'youtube', ytId: `${id}xxxxxxxx`, cid: 0 }, extra)

const b1 = task('b1', 'downloading', { bvid: 'BV1xx411c7mD' })
const b2 = task('b2', 'done', { bvid: 'BV1yy411c7mD' }, { outputPath: '/b2.mp4' })
const b3 = task('b3', 'paused', { bvid: 'BV1zz411c7mD' })
const y1 = yt('y1', 'downloading')
const y2 = yt('y2', 'paused')
const y3 = yt('y3', 'error')
const y4 = yt('y4', 'done', { outputPath: '/y4.mp4' })
const y5 = yt('y5', 'unsupported')

let m: Mounted
const text = (): string => m.container.textContent ?? ''
const titles = (): string[] => [...m.container.querySelectorAll('.truncate.text-\\[13px\\].font-medium')].map((x) => x.textContent ?? '')

async function render(site: Settings['uiSite'], tasks: TaskInfo[] = [b1, b2, b3, y1, y2, y3, y4, y5]): Promise<void> {
  useStore.setState({ settings: { ...settings, uiSite: site }, tasks })
  await m.render(createElement(TaskList))
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.clearAllMocks()
  useStore.setState({ ...initial, accounts: { accounts: [], legacyCount: 0 } }, true)
  api.watermark.aiStatus.mockResolvedValue({ state: 'ready' })
  api.download.pauseMany.mockResolvedValue(undefined)
  api.download.resumeMany.mockResolvedValue(undefined)
  api.download.remove.mockResolvedValue(undefined)
  m = mount()
})

afterEach(() => {
  m.unmount()
  vi.unstubAllGlobals()
})

describe('按平台显示', () => {
  it('B站主题只显示 B站的任务', async () => {
    await render('bili')
    expect(titles().sort()).toEqual(['任务 b1', '任务 b2', '任务 b3'])
  })

  it('YouTube 主题只显示 YouTube 的任务，切回 B站后又只显示 B站的', async () => {
    await render('youtube')
    expect(titles().sort()).toEqual(['任务 y1', '任务 y2', '任务 y3', '任务 y4', '任务 y5'])
    await act(async () => useStore.setState({ settings: { ...settings, uiSite: 'bili' } }))
    expect(titles().sort()).toEqual(['任务 b1', '任务 b2', '任务 b3'])
  })

  it('YouTube 任务的标题链接是 watch 地址，不显示 B站的发起账号', async () => {
    await render('youtube', [y1])
    const link = m.container.querySelector('a')!
    expect(link.getAttribute('href')).toBe('https://www.youtube.com/watch?v=y1xxxxxxxx')
    expect(link.textContent).toBe('任务 y1')
    expect(text()).not.toContain('发起账号')
  })

  it('B站任务的标题链接还是 B站地址，显示发起账号', async () => {
    await render('bili', [b1])
    expect(m.container.querySelector('a')?.getAttribute('href')).toBe('https://www.bilibili.com/video/BV1xx411c7mD')
    expect(text()).toContain('发起账号')
  })

  it('YouTube 合集分组里也不显示发起账号', async () => {
    await render('youtube', [yt('g1', 'downloading', { groupTitle: '播放列表' }), yt('g2', 'queued', { groupTitle: '播放列表' })])
    expect(text()).toContain('播放列表')
    expect(text()).not.toContain('发起账号')
  })

  it('搜索框的提示按平台不同', async () => {
    await render('youtube')
    expect(m.container.querySelector('input')?.placeholder).toBe('搜索标题、播放列表、频道')
    await act(async () => useStore.setState({ settings: { ...settings, uiSite: 'bili' } }))
    expect(m.container.querySelector('input')?.placeholder).toBe('搜索标题、合集、BV 号')
  })

  it('底部显示当前平台的下载目录，点击在访达中显示', async () => {
    await render('youtube')
    const dir = getButton(m.container, /保存到 \/Users\/me\/Downloads\/YouTube/)
    await click(dir)
    expect(api.showInFolder).toHaveBeenCalledExactlyOnceWith('/Users/me/Downloads/YouTube')
    await act(async () => useStore.setState({ settings: { ...settings, uiSite: 'bili' } }))
    await click(getButton(m.container, /保存到 \/Users\/me\/Downloads\/B站/))
    expect(api.showInFolder).toHaveBeenLastCalledWith('/Users/me/Downloads/B站')
  })
})

describe('去水印总开关', () => {
  const button = () => findButton(m.container, /下载后去水印/)

  it('只在 B站主题显示：它改的是 B站的默认下载选项，也只有 B站能自动识别水印', async () => {
    await render('bili')
    expect(button()).toBeTruthy()
    for (const site of ['youtube', 'douyin'] as const) {
      await act(async () => useStore.setState({ settings: { ...settings, uiSite: site, douyin: { downloadDir: '/d' } as Settings['douyin'] } }))
      await act(async () => useStore.setState({ tasks: [b1, y1, task('d1', 'paused', { kind: 'douyin', dyId: '1', cid: 0 })] }))
      expect(button()).toBeFalsy()
    }
  })
})

describe('批量操作只作用于当前平台', () => {
  it('全部暂停、全部继续只带当前平台的任务 id', async () => {
    await render('youtube')
    await click(getButton(m.container, '全部暂停'))
    expect(api.download.pauseMany).toHaveBeenCalledExactlyOnceWith(['y1'])
    await click(getButton(m.container, '全部继续'))
    expect(api.download.resumeMany).toHaveBeenCalledExactlyOnceWith(['y2', 'y3'])
    expect(api.download.pauseAll).not.toHaveBeenCalled()
    expect(api.download.resumeAll).not.toHaveBeenCalled()
  })

  it('B站主题下也一样', async () => {
    await render('bili')
    await click(getButton(m.container, '全部暂停'))
    expect(api.download.pauseMany).toHaveBeenCalledExactlyOnceWith(['b1'])
    await click(getButton(m.container, '全部继续'))
    expect(api.download.resumeMany).toHaveBeenCalledExactlyOnceWith(['b3'])
  })

  it('当前平台没有可暂停 / 可继续 / 已完成的任务时按钮禁用，不受另一个平台影响', async () => {
    await render('youtube', [b1, b2, b3, y4])
    expect(getButton(m.container, '全部暂停').disabled).toBe(true)
    expect(getButton(m.container, '全部继续').disabled).toBe(true)
    expect(getButton(m.container, '清除已完成').disabled).toBe(false)
    await act(async () => useStore.setState({ tasks: [b2, y1] }))
    expect(getButton(m.container, '清除已完成').disabled).toBe(true)
  })

  it('清除已完成只移除当前平台已完成和无法下载的任务', async () => {
    await render('youtube')
    await click(getButton(m.container, '清除已完成'))
    expect(text()).toContain('从下载列表移除 2 个已完成的任务。')
    await click(getButton(m.container, '仅清空列表'))
    expect(api.download.remove).toHaveBeenCalledExactlyOnceWith(['y4', 'y5'], false)
    expect(api.download.clearFinished).not.toHaveBeenCalled()
    expect(findButton(m.container, '仅清空列表')).toBeUndefined()
  })

  it('勾选同时删除原文件时提示并删除文件', async () => {
    await render('youtube')
    await click(getButton(m.container, '清除已完成'))
    const box = [...m.container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((i) =>
      i.closest('label')?.textContent?.includes('同时删除原文件'))!
    await click(box)
    expect(text()).toContain('1 个视频文件及封面、字幕、弹幕等附加文件会被永久删除')
    await click(getButton(m.container, '清空并删除文件'))
    expect(api.download.remove).toHaveBeenCalledExactlyOnceWith(['y4', 'y5'], true)
  })

  it('移除失败时写入错误', async () => {
    api.download.remove.mockRejectedValue(new Error('文件被占用'))
    await render('bili')
    await click(getButton(m.container, '清除已完成'))
    await click(getButton(m.container, '仅清空列表'))
    expect(api.download.remove).toHaveBeenCalledExactlyOnceWith(['b2'], false)
    expect(useStore.getState().error).toBe('文件被占用')
  })
})

describe('空状态', () => {
  it('YouTube 主题下没有 YouTube 任务时显示 YouTube 的说明和链接类型', async () => {
    await render('youtube', [b1, b2])
    expect(text()).toContain('粘贴 YouTube 链接开始下载')
    expect(text()).toContain('复制 YouTube 视频或播放列表的链接，按 ⌘V 粘贴即可解析')
    for (const kind of ['Shorts', '播放列表', '频道', 'YouTube Music', '直播回放']) expect(text()).toContain(kind)
    expect(text()).not.toContain('b23.tv')
  })

  it('B站主题下没有 B站任务时显示 B站的说明', async () => {
    await render('bili', [y1])
    expect(text()).toContain('复制 B站链接，回到这里粘贴')
    expect(text()).toContain('b23.tv 短链')
    expect(text()).not.toContain('YouTube Music')
  })
})
