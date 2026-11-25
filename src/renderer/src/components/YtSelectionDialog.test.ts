// @vitest-environment jsdom

import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TEMPLATES } from '@shared/naming'
import { DEFAULT_OPTIONS, DEFAULT_YT_OPTIONS } from '@shared/options'
import type { MediaItem, ParseResult, Settings, StreamInfo, YoutubeSettings } from '@shared/types'
import { changeSelect, click, deferred, findButton, getButton, mount, pressKey, typeInto, type Mounted } from './testDom'

const api = {
  history: { downloadedKeys: vi.fn(), onDownloadsChanged: vi.fn(() => () => {}) },
  settings: { set: vi.fn() },
  subs: { add: vi.fn() },
  yt: { streamInfo: vi.fn(), parseMore: vi.fn(), enqueue: vi.fn() }
}
Object.defineProperty(window, 'api', { value: api, configurable: true })
const { useStore } = await import('../store')
const { YtSelectionDialog } = await import('./YtSelectionDialog')
const initial = useStore.getState()

const youtube: YoutubeSettings = {
  downloadDir: '/yt',
  defaultQn: 1080,
  concurrency: 2,
  autoUpdate: true,
  defaults: { ...DEFAULT_OPTIONS, yt: { ...DEFAULT_YT_OPTIONS } }
}
const settings = (extra: Partial<Settings> = {}): Settings =>
  ({ youtube, naming: DEFAULT_TEMPLATES, duplicateAction: 'ask', rememberLast: false, ...extra }) as Settings

const video = (id: string, title: string, extra: Partial<MediaItem> = {}): MediaItem => ({
  key: `yt:${id}`, kind: 'youtube', title, index: Number(id.replace(/\D/g, '')) || 1, cid: 0, ytId: id, ...extra
})
const v1 = video('v1', '第一集', { duration: 65 })
const v2 = video('v2', '第二集', { owner: '客串频道' })
const v3 = video('v3', '已删除', { unavailable: '私享或已删除的视频' })
const v4 = video('v4', '第四集')

const playlist = (extra: Partial<ParseResult> = {}): ParseResult => ({
  kind: 'youtube',
  title: '测试播放列表',
  cover: 'https://i.ytimg.com/a.jpg',
  owner: '测试频道',
  input: 'https://www.youtube.com/playlist?list=PL1',
  groups: [{ id: 'main', title: '播放列表', items: [v1, v2, v3] }],
  defaultSelected: [],
  ...extra
})

const info = (extra: Partial<StreamInfo> = {}): StreamInfo => ({
  qualities: [
    { qn: 2160, label: '2160p', needVip: false, needLogin: false, codecs: ['vp9', 'av1'] },
    { qn: 1080, label: '1080p', needVip: false, needLogin: false, codecs: ['avc', 'vp9'] },
    { qn: 720, label: '720p', needVip: false, needLogin: false, codecs: ['avc'] }
  ],
  audios: [],
  hasAudio: true,
  yt: { audios: [], hdr: false, subtitles: [], chapters: 0, size: { 2160: 40 * 1024 ** 2, 1080: 10 * 1024 ** 2 } },
  ...extra
})

let m: Mounted
const text = (): string => m.container.textContent ?? ''
const checkbox = (label: string): HTMLInputElement => {
  const input = [...m.container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((i) =>
    i.closest('label')?.textContent?.includes(label))
  if (!input) throw new Error(`未找到复选框 ${label}`)
  return input
}
const radio = (label: string): HTMLInputElement => {
  const input = [...m.container.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((i) =>
    i.closest('label')?.querySelector('span')?.textContent === label)
  if (!input) throw new Error(`未找到画质 ${label}`)
  return input
}
const checkedQuality = (): string | undefined =>
  [...m.container.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((i) => i.checked)?.closest('label')?.querySelector('span')?.textContent ?? undefined

async function open(result: ParseResult = playlist(), extra: Partial<Settings> = {}): Promise<void> {
  useStore.setState({ ytParse: result, settings: settings(extra) })
  await m.render(createElement(YtSelectionDialog, { result }))
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.clearAllMocks()
  useStore.setState(initial, true)
  api.history.downloadedKeys.mockResolvedValue([v2.key])
  api.yt.streamInfo.mockResolvedValue(info())
  api.yt.enqueue.mockResolvedValue(undefined)
  api.yt.parseMore.mockReset()
  m = mount()
})

afterEach(() => {
  m.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('显示', () => {
  it('显示标题、作者、条目数、已下载过的数量和条目', async () => {
    await open()
    expect(text()).toContain('测试播放列表')
    expect(text()).toContain('测试频道')
    expect(text()).toContain('共 3 项')
    expect(text()).toContain('已下载过 1 项')
    expect(text()).toContain('播放列表')
    for (const title of ['第一集', '第二集', '已删除']) expect(text()).toContain(title)
    // 和列表作者不同的才显示作者；时长；不可用的原因
    expect(text()).toContain('客串频道')
    expect(text()).toContain('1:05')
    expect(text()).toContain('私享或已删除的视频')
    expect(checkbox('已删除').disabled).toBe(true)
    expect(m.container.querySelector('img')?.getAttribute('src')).toBe('https://i.ytimg.com/a.jpg')
  })

  it('没登录时提示未登录，登录后显示用哪个账号下载', async () => {
    await open()
    expect(text()).toContain('未登录 YouTube（会员、年龄限制的视频需要登录）')
    await act(async () => useStore.setState({ ytAccounts: { current: 'a', accounts: [{ id: 'a', name: '甲', addedAt: 1, status: 'ready' }] } }))
    expect(text()).toContain('使用 YouTube 账号：甲')
  })

  it('单个视频不显示列表工具栏，类型显示 YouTube，显示视频大小', async () => {
    await open(playlist({ title: '第一集', groups: [{ id: 'v', title: '视频', items: [v1] }], defaultSelected: [v1.key], input: undefined }))
    expect(text()).not.toContain('全选')
    expect(text()).toContain('YouTube')
    expect(text()).toContain('视频部分约 10.0 MB')
    expect(findButton(m.container, /订阅更新/)).toBeUndefined()
  })

  it('批量解析的结果显示来源数量', async () => {
    await open(playlist({
      batch: true,
      groups: [
        { id: 'a', title: '列表 A', items: [v1], source: { title: '列表 A', kind: 'youtube', cover: '' } },
        { id: 'b', title: '列表 B', items: [v4], source: { title: '列表 B', kind: 'youtube', cover: '' } }
      ]
    }))
    expect(text()).toContain('2 个来源')
    expect(text()).toContain('列表 A')
    expect(findButton(m.container, /订阅更新/)).toBeUndefined()
  })
})

describe('选择', () => {
  it('单个勾选、全选（跳过不可用的）、清空', async () => {
    await open()
    expect(text()).toContain('已选 0 项')
    expect(getButton(m.container, '下载 0 项').disabled).toBe(true)
    await click(checkbox('第一集'))
    expect(text()).toContain('已选 1 项')
    expect(checkbox('全选').indeterminate).toBe(true)
    await click(checkbox('全选'))
    expect(text()).toContain('已选 2 项')
    expect(checkbox('全选').checked).toBe(true)
    expect(checkbox('已删除').checked).toBe(false)
    await click(checkbox('全选'))
    expect(text()).toContain('已选 0 项')
  })

  it('批量选择菜单：反选、清空、去掉已下载', async () => {
    await open()
    await click(checkbox('第一集'))
    await click(getButton(m.container, '批量选择'))
    await click(getButton(m.container, '反选当前结果'))
    expect(checkbox('第一集').checked).toBe(false)
    expect(checkbox('第二集').checked).toBe(true)
    await click(getButton(m.container, '批量选择'))
    await click(getButton(m.container, '去掉已下载'))
    expect(checkbox('第二集').checked).toBe(false)
    await click(checkbox('第一集'))
    await click(getButton(m.container, '批量选择'))
    await click(getButton(m.container, '清空选择'))
    expect(text()).toContain('已选 0 项')
  })

  it('按序号选择、按标题筛选', async () => {
    await open()
    const range = m.container.querySelector<HTMLInputElement>('input[placeholder="序号 如 1-5,7"]')!
    await typeInto(range, '1-3')
    await pressKey(range, 'Enter')
    expect(checkbox('第一集').checked).toBe(true)
    expect(checkbox('第二集').checked).toBe(true)
    expect(text()).toContain('已选 2 项')
    const filter = m.container.querySelector<HTMLInputElement>('input[placeholder^="筛选标题"]')!
    await typeInto(filter, '第二')
    const rows = [...m.container.querySelectorAll('span.block[title]')].map((x) => x.getAttribute('title'))
    expect(rows).toEqual(['第二集'])
    expect(text()).toContain('全选筛选结果')
  })

  it('按住 Shift 点击连续选择', async () => {
    await open(playlist({ groups: [{ id: 'main', title: '播放列表', items: [v1, v2, v4] }] }))
    await click(checkbox('第一集'))
    const row = checkbox('第四集').closest('label')!
    await act(async () => row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true })))
    expect(text()).toContain('已选 3 项')
  })

  it('选中播放列表时提示会展开', async () => {
    const list = video('p1', '子播放列表', { lazy: true, pages: 12 })
    await open(playlist({ groups: [{ id: 'main', title: '播放列表', items: [list, v1] }], defaultSelected: [list.key] }))
    expect(text()).toContain('12 个视频')
    expect(text()).toContain('选中了 1 个播放列表，加入下载时会展开成里面的全部视频')
  })
})

describe('画质', () => {
  it('取画质时显示加载中，取到后默认选不超过设置的最高一档', async () => {
    const pending = deferred<StreamInfo>()
    api.yt.streamInfo.mockReturnValue(pending.promise)
    await open()
    expect(text()).toContain('正在获取可用清晰度…')
    expect(api.yt.streamInfo).toHaveBeenCalledWith(v1)
    await act(async () => pending.resolve(info()))
    expect(text()).not.toContain('正在获取可用清晰度…')
    expect(checkedQuality()).toBe('1080p')
    expect([...m.container.querySelectorAll('input[type="radio"]')]).toHaveLength(4)
  })

  it('设置的默认画质是最高时选“最高画质”', async () => {
    await open(playlist(), { youtube: { ...youtube, defaultQn: 0 } })
    expect(checkedQuality()).toBe('最高画质')
  })

  it('手动选的画质在换了查询的视频后仍保留', async () => {
    await open()
    await click(radio('720p'))
    expect(checkedQuality()).toBe('720p')
    await click(checkbox('第二集'))
    expect(api.yt.streamInfo).toHaveBeenLastCalledWith(v2)
    expect(checkedQuality()).toBe('720p')
  })

  it('取不到画质时显示原因和通用画质列表', async () => {
    api.yt.streamInfo.mockRejectedValue(new Error('需要登录'))
    await open()
    expect(text()).toContain('需要登录')
    expect(text()).toContain('暂时拿不到这个视频的画质列表')
    expect([...m.container.querySelectorAll('input[type="radio"]')]).toHaveLength(7)
    expect(checkedQuality()).toBe('1080p')
  })

  it('仅音频时画质不可选', async () => {
    await open()
    await click(getButton(m.container, '仅音频'))
    expect(radio('1080p').disabled).toBe(true)
  })
})

describe('下载', () => {
  it('用 YouTube 接口加入队列，选项带 yt 段，然后关闭', async () => {
    await open()
    await click(checkbox('第一集'))
    await click(getButton(m.container, '下载 1 项'))
    expect(api.yt.enqueue).toHaveBeenCalledExactlyOnceWith({
      title: '测试播放列表',
      cover: 'https://i.ytimg.com/a.jpg',
      kind: 'youtube',
      meta: undefined,
      items: [v1],
      options: { ...DEFAULT_OPTIONS, qn: 1080, yt: DEFAULT_YT_OPTIONS }
    })
    expect(useStore.getState().ytParse).toBeNull()
    expect(api.settings.set).not.toHaveBeenCalled()
  })

  it('改过的选项和画质一起提交；返回的提示写进 ytNotice', async () => {
    api.yt.enqueue.mockResolvedValue('有 1 个播放列表展开失败')
    await open()
    await click(checkbox('第一集'))
    await click(radio('2160p'))
    await click(getButton(m.container, 'MKV'))
    await click(getButton(m.container, '下载 1 项'))
    const req = api.yt.enqueue.mock.calls[0][0]
    expect(req.options).toMatchObject({ qn: 2160, yt: { container: 'mkv' } })
    expect(useStore.getState().ytNotice).toBe('有 1 个播放列表展开失败')
  })

  it('加入失败时写入 ytError，窗口不关', async () => {
    api.yt.enqueue.mockRejectedValue(new Error('磁盘满了'))
    await open()
    await click(checkbox('第一集'))
    await click(getButton(m.container, '下载 1 项'))
    expect(useStore.getState()).toMatchObject({ ytError: '磁盘满了', ytParse: { title: '测试播放列表' } })
    expect(getButton(m.container, '下载 1 项').disabled).toBe(false)
  })

  it('批量解析的结果按来源分别加入', async () => {
    const srcA = { title: '列表 A', kind: 'youtube' as const, cover: 'a' }
    const srcB = { title: '列表 B', kind: 'youtube' as const, cover: 'b' }
    await open(playlist({
      batch: true,
      groups: [{ id: 'a', title: '列表 A', items: [v1], source: srcA }, { id: 'b', title: '列表 B', items: [v4], source: srcB }],
      defaultSelected: [v1.key, v4.key]
    }))
    await click(getButton(m.container, '下载 2 项'))
    expect(api.yt.enqueue).toHaveBeenCalledTimes(2)
    expect(api.yt.enqueue.mock.calls.map((c) => [c[0].title, c[0].items])).toEqual([['列表 A', [v1]], ['列表 B', [v4]]])
  })

  it('记住上次选择时把选项和画质存回 YouTube 设置', async () => {
    const saved = settings({ rememberLast: true })
    api.settings.set.mockResolvedValue(saved)
    await open(playlist(), { rememberLast: true })
    await click(checkbox('第一集'))
    await click(radio('720p'))
    await click(getButton(m.container, '仅音频'))
    await click(getButton(m.container, '下载 1 项'))
    expect(api.settings.set).toHaveBeenCalledExactlyOnceWith({
      youtube: { ...youtube, defaultQn: 720, defaults: { ...DEFAULT_OPTIONS, output: 'audio', yt: DEFAULT_YT_OPTIONS } }
    })
    expect(useStore.getState()).toMatchObject({ settings: saved, ytParse: null })
  })

  it('下载历史还没读到时不能下载', async () => {
    api.history.downloadedKeys.mockReturnValue(new Promise(() => {}))
    await open(playlist({ defaultSelected: [v1.key] }))
    expect(getButton(m.container, '下载 1 项').disabled).toBe(true)
  })

  it('读下载历史失败时当作没下载过', async () => {
    api.history.downloadedKeys.mockRejectedValue(new Error('读不到'))
    await open(playlist({ defaultSelected: [v2.key] }))
    expect(text()).not.toContain('已下载过')
    await click(getButton(m.container, '下载 1 项'))
    expect(api.yt.enqueue).toHaveBeenCalledOnce()
  })
})

describe('重复下载', () => {
  it('选中的有下载过的：询问后可以跳过它们', async () => {
    await open(playlist({ defaultSelected: [v1.key, v2.key] }))
    await click(getButton(m.container, '下载 2 项'))
    expect(text()).toContain('选中的项目里有 1 项已经下载过')
    expect(api.yt.enqueue).not.toHaveBeenCalled()
    await click(getButton(m.container, '跳过它们'))
    expect(api.yt.enqueue.mock.calls[0][0].items).toEqual([v1])
  })

  it('询问后也可以仍然下载', async () => {
    await open(playlist({ defaultSelected: [v1.key, v2.key] }))
    await click(getButton(m.container, '下载 2 项'))
    await click(getButton(m.container, '仍然下载'))
    expect(api.yt.enqueue.mock.calls[0][0].items).toEqual([v1, v2])
  })

  it('改了选择后询问消失', async () => {
    await open(playlist({ defaultSelected: [v1.key, v2.key] }))
    await click(getButton(m.container, '下载 2 项'))
    await click(checkbox('第一集'))
    expect(text()).not.toContain('已经下载过')
  })

  it('设置为跳过时直接跳过；全是下载过的就只关闭', async () => {
    await open(playlist({ defaultSelected: [v2.key] }), { duplicateAction: 'skip' })
    await click(getButton(m.container, '下载 1 项'))
    expect(api.yt.enqueue).not.toHaveBeenCalled()
    expect(useStore.getState().ytParse).toBeNull()
  })

  it('设置为下载时不询问', async () => {
    await open(playlist({ defaultSelected: [v1.key, v2.key] }), { duplicateAction: 'download' })
    await click(getButton(m.container, '下载 2 项'))
    expect(api.yt.enqueue.mock.calls[0][0].items).toEqual([v1, v2])
  })
})

describe('分页', () => {
  const paged = (total = 5): ParseResult =>
    playlist({ groups: [{ id: 'main', title: '播放列表', items: [v1, v2] }], paging: { source: { type: 'yt', url: 'https://www.youtube.com/playlist?list=PL1' }, page: 1, total, hasMore: true } })

  it('加载下一页：用 parseMore 取第 2 页并追加', async () => {
    api.yt.parseMore.mockResolvedValue({ items: [v4], total: 5, hasMore: true })
    await open(paged())
    expect(text()).toContain('已加载 2 / 5 项')
    expect(text()).toContain('全选已加载条目')
    await click(getButton(m.container, '加载下一页'))
    expect(api.yt.parseMore).toHaveBeenCalledExactlyOnceWith('https://www.youtube.com/playlist?list=PL1', 2)
    expect(text()).toContain('第四集')
    expect(text()).toContain('已加载 3 / 5 项')
    expect(getButton(m.container, '加载全部（剩 2 项）')).toBeDefined()
  })

  it('加载全部：每页之间等一会儿，直到没有更多', async () => {
    vi.useFakeTimers()
    const v5 = video('v5', '第五集')
    api.yt.parseMore
      .mockResolvedValueOnce({ items: [v4], total: 0, hasMore: true })
      .mockResolvedValueOnce({ items: [v5], total: 0, hasMore: false })
    await open(paged(0))
    await click(getButton(m.container, '全部加载'))
    // 第 2 页已经取回，等间隔后取第 3 页
    expect(api.yt.parseMore).toHaveBeenCalledTimes(1)
    expect(text()).toContain('第四集')
    expect(text()).toContain('正在加载第 3 页…')
    await act(async () => vi.advanceTimersByTime(800))
    expect(api.yt.parseMore).toHaveBeenLastCalledWith('https://www.youtube.com/playlist?list=PL1', 3)
    expect(text()).toContain('第五集')
    expect(findButton(m.container, '加载下一页')).toBeUndefined()
  })

  it('加载全部时可以停止', async () => {
    vi.useFakeTimers()
    api.yt.parseMore.mockResolvedValue({ items: [], total: 0, hasMore: true })
    await open(paged(0))
    await click(getButton(m.container, '全部加载'))
    await click(getButton(m.container, '停止'))
    await act(async () => vi.advanceTimersByTime(800))
    expect(api.yt.parseMore).toHaveBeenCalledTimes(1)
    expect(getButton(m.container, '加载下一页')).toBeDefined()
  })

  it('加载失败写入 ytError', async () => {
    api.yt.parseMore.mockRejectedValue(new Error('YouTube 要求验证'))
    await open(paged())
    await click(getButton(m.container, '加载下一页'))
    expect(useStore.getState().ytError).toBe('YouTube 要求验证')
    expect(getButton(m.container, '加载下一页')).toBeDefined()
  })

  it('筛选时不显示加载按钮', async () => {
    await open(paged())
    await typeInto(m.container.querySelector<HTMLInputElement>('input[placeholder^="筛选标题"]')!, '第一')
    expect(findButton(m.container, '加载下一页')).toBeUndefined()
  })
})

describe('订阅', () => {
  it('填写订阅表单后用 kind youtube 订阅，提示并关闭', async () => {
    api.subs.add.mockResolvedValue(undefined)
    await open()
    await click(getButton(m.container, '订阅更新：以后有新内容自动下载'))
    // 最后一个下拉框是订阅表单里的检查间隔（前面是音质）
    const selects = m.container.querySelectorAll('select')
    await changeSelect(selects[selects.length - 1], '1440')
    await click(checkbox('现在已有的也一起下载'))
    await click(getButton(m.container, '订阅'))
    expect(api.subs.add).toHaveBeenCalledExactlyOnceWith({
      input: 'https://www.youtube.com/playlist?list=PL1',
      title: '测试播放列表',
      kind: 'youtube',
      options: { ...DEFAULT_OPTIONS, qn: 1080, yt: DEFAULT_YT_OPTIONS },
      intervalMin: 1440,
      includeExisting: true,
      currentKeys: [v1.key, v2.key, v3.key]
    })
    expect(useStore.getState()).toMatchObject({ ytParse: null, ytNotice: '已订阅“测试播放列表”，应用运行期间每 1 天 检查一次，有新内容会自动下载' })
  })

  it('订阅失败写入 ytError；取消收起表单', async () => {
    api.subs.add.mockRejectedValue(new Error('已经订阅过了'))
    await open()
    await click(getButton(m.container, '订阅更新：以后有新内容自动下载'))
    await click(getButton(m.container, '订阅'))
    expect(useStore.getState()).toMatchObject({ ytError: '已经订阅过了', ytParse: { title: '测试播放列表' } })
    await click(getButton(m.container, '取消'))
    expect(findButton(m.container, '订阅')).toBeUndefined()
    expect(getButton(m.container, '订阅更新：以后有新内容自动下载')).toBeDefined()
  })
})

describe('关闭', () => {
  it('点关闭或按 Esc 清空 ytParse，不动 B站的解析', async () => {
    const bili = { kind: 'ugc', title: 'B站', cover: '', groups: [], defaultSelected: [] } as ParseResult
    await open()
    useStore.setState({ parse: bili })
    await click(getButton(m.container, '关闭'))
    expect(useStore.getState()).toMatchObject({ ytParse: null, parse: bili })
    useStore.setState({ ytParse: playlist() })
    await pressKey(window as unknown as Element, 'Escape')
    expect(useStore.getState().ytParse).toBeNull()
  })
})
