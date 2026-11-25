// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ParseRecord, ParseResult, Settings } from '@shared/types'
import { click, getButton, mount, typeInto } from './testDom'

const api = {
  history: { parses: vi.fn(), clearParses: vi.fn(), removeParse: vi.fn() },
  parse: vi.fn(),
  yt: { parse: vi.fn() }
}
Object.defineProperty(window, 'api', { value: api, configurable: true })

const { HistoryPage } = await import('./HistoryPage')
const { useStore } = await import('../store')
const initial = useStore.getState()

afterEach(() => {
  useStore.setState(initial, true)
  vi.unstubAllGlobals()
})

it.each(['click', 'Enter'])('用 %s 打开同一链接的历史记录时，解析该行所属账号', async (action) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const record: ParseRecord = { input: 'watchlater', kind: 'ugc', title: '账号 A 的稍后再看', cover: '', count: 1, at: 1, accountMid: 1 }
  const detail: ParseResult = { kind: 'ugc', title: record.title, cover: '', groups: [], defaultSelected: [] }
  api.history.parses.mockResolvedValue([record, { ...record, title: '账号 B 的稍后再看', accountMid: 2 }])
  api.parse.mockReset().mockResolvedValue(detail)
  useStore.setState({ view: 'history', accounts: { activeMid: 2, accounts: [], legacyCount: 0 } })

  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(createElement(HistoryPage)))
    const row = [...container.querySelectorAll<HTMLElement>('[role="button"]')]
      .find((element) => element.textContent?.includes(record.title))!
    await act(async () => {
      if (action === 'click') row.click()
      else row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(api.parse).toHaveBeenCalledExactlyOnceWith(record.input, 1)
    expect(useStore.getState()).toMatchObject({ parse: detail, sourceAccountMid: 1, accounts: { activeMid: 2 } })
  } finally {
    act(() => root.unmount())
    container.remove()
  }
})

describe('按平台分开的解析记录', () => {
  const bili: ParseRecord = { input: 'BV1xx411c7mD', kind: 'ugc', title: 'B站的视频', cover: '', count: 1, at: 1, accountMid: 1 }
  const ytList: ParseRecord = { input: 'https://www.youtube.com/playlist?list=PL1', kind: 'youtube', title: 'YouTube 播放列表', cover: 'https://i.ytimg.com/a.jpg', count: 12, at: 2 }
  const ytVideo: ParseRecord = { input: 'https://youtu.be/dQw4w9WgXcQ', kind: 'youtube', title: '一个 YouTube 视频', cover: '', count: 1, at: 3 }
  const detail: ParseResult = { kind: 'youtube', title: ytList.title, cover: '', groups: [], defaultSelected: [] }

  async function open(site: Settings['uiSite']) {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.clearAllMocks()
    api.history.parses.mockResolvedValue([bili, ytList, ytVideo])
    api.yt.parse.mockResolvedValue(detail)
    useStore.setState({ view: 'history', settings: { uiSite: site } as Settings })
    const m = mount()
    await m.render(createElement(HistoryPage))
    return m
  }

  it('YouTube 主题只列 YouTube 的记录，类型显示 YouTube，不显示 B站发起账号', async () => {
    const m = await open('youtube')
    try {
      const text = m.container.textContent ?? ''
      expect(text).toContain('YouTube 播放列表')
      expect(text).toContain('一个 YouTube 视频')
      expect(text).not.toContain('B站的视频')
      expect(text).toContain('12 项')
      expect(text).not.toContain('发起账号')
      // YouTube 的封面不加 B站的尺寸参数
      expect(m.container.querySelector('img')?.getAttribute('src')).toBe('https://i.ytimg.com/a.jpg')
      expect([...m.container.querySelectorAll('.rounded-md')].map((b) => b.textContent)).toContain('YouTube')
    } finally {
      m.unmount()
    }
  })

  it('点 YouTube 记录用 YouTube 接口重新解析并回到下载页', async () => {
    const m = await open('youtube')
    try {
      const row = [...m.container.querySelectorAll<HTMLElement>('[role="button"]')].find((x) => x.textContent?.includes(ytList.title))!
      await act(async () => row.click())
      expect(api.yt.parse).toHaveBeenCalledExactlyOnceWith(ytList.input)
      expect(api.parse).not.toHaveBeenCalled()
      expect(useStore.getState()).toMatchObject({ view: 'downloads', ytParse: detail, parse: null })
    } finally {
      m.unmount()
    }
  })

  it('B站主题只列 B站的记录，点击走 B站接口', async () => {
    api.parse.mockReset().mockResolvedValue({ ...detail, kind: 'ugc' })
    const m = await open('bili')
    try {
      const text = m.container.textContent ?? ''
      expect(text).toContain('B站的视频')
      expect(text).not.toContain('YouTube 播放列表')
      const row = m.container.querySelector<HTMLElement>('[role="button"]')!
      await act(async () => row.click())
      expect(api.parse).toHaveBeenCalledExactlyOnceWith(bili.input, 1)
      expect(api.yt.parse).not.toHaveBeenCalled()
    } finally {
      m.unmount()
    }
  })

  it('清空只清当前平台的记录；取消确认时不清', async () => {
    const confirm = vi.fn(() => false)
    const m = await open('youtube')
    vi.stubGlobal('confirm', confirm)
    try {
      await click(getButton(m.container, '清空'))
      expect(confirm).toHaveBeenCalledExactlyOnceWith('清空全部解析记录？')
      expect(api.history.clearParses).not.toHaveBeenCalled()
      confirm.mockReturnValue(true)
      api.history.clearParses.mockResolvedValue(undefined)
      await click(getButton(m.container, '清空'))
      expect(api.history.clearParses).toHaveBeenCalledExactlyOnceWith('youtube')
      expect(m.container.textContent).toContain('还没有解析记录')
      // 切回 B站，B站的记录还在
      await act(async () => useStore.setState({ settings: { uiSite: 'bili' } as Settings }))
      expect(m.container.textContent).toContain('B站的视频')
    } finally {
      m.unmount()
    }
  })

  it('搜索只在当前平台的记录里找；删除一条用主进程返回的列表', async () => {
    const m = await open('youtube')
    try {
      await typeInto(m.container.querySelector('input')!, 'youtu.be')
      expect(m.container.textContent).toContain('一个 YouTube 视频')
      expect(m.container.textContent).not.toContain('YouTube 播放列表')
      await typeInto(m.container.querySelector('input')!, 'B站')
      expect(m.container.textContent).toContain('没有匹配的记录')
      await typeInto(m.container.querySelector('input')!, '')
      api.history.removeParse.mockResolvedValue([bili, ytVideo])
      const remove = m.container.querySelectorAll<HTMLButtonElement>('button[aria-label="删除这条记录"]')[0]
      await click(remove)
      expect(api.history.removeParse).toHaveBeenCalledExactlyOnceWith(ytList.input, null)
      expect(api.yt.parse).not.toHaveBeenCalled()
      expect(m.container.textContent).not.toContain('YouTube 播放列表')
    } finally {
      m.unmount()
    }
  })
})
