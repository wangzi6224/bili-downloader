// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TEMPLATES } from '@shared/naming'
import { DEFAULT_OPTIONS } from '@shared/options'
import type { MediaItem, ParseResult, Settings } from '@shared/types'

const api = {
  download: { enqueue: vi.fn() },
  history: { downloadedKeys: vi.fn(), onDownloadsChanged: vi.fn(() => () => {}) },
  parseMore: vi.fn(),
  streamInfo: vi.fn()
}

Object.defineProperty(window, 'api', { value: api, configurable: true })
const { useStore } = await import('../store')
const { SelectionDialog } = await import('./SelectionDialog')

const settings = {
  downloadDir: '/downloads',
  defaultQn: 80,
  defaults: DEFAULT_OPTIONS,
  duplicateAction: 'ask',
  naming: DEFAULT_TEMPLATES,
  rememberLast: false
} satisfies Partial<Settings>

const episode = (index: number, title: string, extra?: Partial<MediaItem>): MediaItem => ({
  key: `pgc:${index}`, kind: 'pgc', title, index, cid: index, ...extra
})
const first = episode(1, '第 1 话')
const second = episode(2, '第 2 话')
const invalid = episode(3, '预告', { unavailable: '已失效' })
const extra = episode(4, '幕后')
const last = episode(5, '采访')
const nextPageItem = episode(6, '第 3 话')

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.clearAllMocks()
  useStore.setState({ sourceAccountMid: undefined })
  api.history.downloadedKeys.mockResolvedValue([first.key])
  api.streamInfo.mockResolvedValue({ qualities: [], audios: [], hasAudio: true })
  api.parseMore.mockReset().mockResolvedValue({ items: [nextPageItem], total: 6, hasMore: false })
  api.download.enqueue.mockResolvedValue(undefined)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function open(fromSource: boolean, changes?: Partial<ParseResult>): Promise<void> {
  const result: ParseResult = {
    kind: 'pgc',
    title: '测试番剧',
    cover: '',
    groups: [
      { id: 'main', title: '正片', items: [first, second, invalid] },
      { id: 'extra', title: '花絮', items: [extra, last] }
    ],
    defaultSelected: [],
    ...changes
  }
  useStore.setState({ parse: result, settings: settings as Settings })
  await act(async () => root.render(createElement(SelectionDialog, { result, fromSource })))
}

function checkbox(label: string): HTMLInputElement {
  const input = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    .find((element) => element.labels?.[0]?.textContent?.includes(label))
  if (!input) throw new Error(`未找到复选框 ${label}`)
  return input
}

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((element) =>
    (element.getAttribute('aria-label') ?? element.textContent?.trim()) === label
  )
}

async function clickButton(label: string): Promise<void> {
  const element = button(label)
  if (!element) throw new Error(`未找到按钮 ${label}`)
  await act(async () => element.click())
}

async function click(element: HTMLElement, shiftKey = false): Promise<MouseEvent> {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey })
  await act(async () => { element.dispatchEvent(event) })
  return event
}

function rowTitle(item: MediaItem): HTMLElement {
  return checkbox(item.title).labels![0].querySelector<HTMLElement>('[title]')!
}

async function invert(): Promise<void> {
  await clickButton('批量选择')
  await clickButton('反选当前结果')
}

async function filter(value: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>('input[placeholder="筛选标题 / UP 主"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function expectSelection(checked: string[], unchecked: string[], count = checked.length): void {
  for (const label of checked) expect(checkbox(label).checked, label).toBe(true)
  for (const label of unchecked) expect(checkbox(label).checked, label).toBe(false)
  expect(container.querySelector('[role="status"]')?.textContent).toContain(`已选 ${count} 项`)
}

describe('选择窗口', () => {
  it('打开另一账号的订阅时，下载记录不分账号，提交时仍用该账号下载', async () => {
    useStore.setState({ sourceAccountMid: 8 })
    api.history.downloadedKeys.mockResolvedValue([])
    await open(true)
    expect(api.history.downloadedKeys).toHaveBeenCalledExactlyOnceWith()
    await click(checkbox(first.title))
    api.history.downloadedKeys.mockClear()
    await clickButton('下载 1 项')
    expect(api.history.downloadedKeys).toHaveBeenNthCalledWith(1)
    expect(api.download.enqueue).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ items: [first] }), 8)
  })
  it('点复选框和行文字都只切换一次，且勾选、分组和下载按钮同步', async () => {
    await open(true)
    expect((await click(checkbox(first.title))).defaultPrevented).toBe(false)
    expectSelection([first.title], [second.title])
    expect(checkbox('正片').indeterminate).toBe(true)
    expect(button('下载 1 项')?.disabled).toBe(false)

    await click(rowTitle(first))
    expectSelection([], [first.title, second.title])
    expect(checkbox('正片').indeterminate).toBe(false)
    expect(button('下载 0 项')?.disabled).toBe(true)
  })

  it('单集来源初始不勾选，点击后可以再次取消', async () => {
    await open(true, { groups: [{ id: 'main', title: '正片', items: [second] }] })
    expect(button('下载 0 项')?.disabled).toBe(true)
    await click(checkbox(second.title))
    expect(checkbox(second.title).checked).toBe(true)
    expect(button('下载 1 项')?.disabled).toBe(false)
    await click(rowTitle(second))
    expect(checkbox(second.title).checked).toBe(false)
    expect(button('下载 0 项')?.disabled).toBe(true)
  })

  it('全选、分组取消和连续反选保持表头三态，失效条目始终未选', async () => {
    await open(true)
    await click(checkbox(first.title))
    expect(checkbox('全选').indeterminate).toBe(true)
    await click(checkbox('全选'))
    expectSelection([first.title, second.title, extra.title, last.title], [invalid.title])
    expect(checkbox('全选').indeterminate).toBe(false)
    expect(checkbox('全选').checked).toBe(true)
    expect(checkbox(invalid.title).disabled).toBe(true)

    await click(checkbox('正片'))
    expectSelection([extra.title, last.title], [first.title, second.title, invalid.title])
    expect(checkbox('全选').indeterminate).toBe(true)
    await invert()
    expectSelection([first.title, second.title], [extra.title, last.title, invalid.title])
    await invert()
    expectSelection([extra.title, last.title], [first.title, second.title, invalid.title])
    expect(api.download.enqueue).not.toHaveBeenCalled()
  })

  it('筛选后的全选和反选仅处理可见条目，保留隐藏的选择', async () => {
    await open(true, { defaultSelected: [extra.key] })
    await filter('第')
    expect(checkbox('全选筛选结果').checked).toBe(false)
    await click(checkbox('全选筛选结果').labels![0])
    expectSelection([first.title, second.title], [], 3)
    expect(container.querySelector('[role="status"]')?.textContent).toContain('1 项已选但被筛选隐藏')
    await invert()
    expectSelection([], [first.title, second.title], 1)

    await filter('不存在')
    expect(checkbox('全选筛选结果').disabled).toBe(true)
    await filter('')
    expectSelection([extra.title], [first.title, second.title, invalid.title, last.title])
  })

  it('序号输入框：空输入不清空选择，只替换可见条目，保留隐藏的勾选', async () => {
    await open(true, { defaultSelected: [last.key] })
    const input = container.querySelector<HTMLInputElement>('input[placeholder="序号 如 1-5,7"]')!
    const type = async (value: string): Promise<void> => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
    const enter = async (): Promise<void> => {
      await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    }
    await type('')
    await enter()
    await type('abc')
    await enter()
    expectSelection([last.title], [first.title, second.title, extra.title])

    await filter('第')
    await type('2')
    await enter()
    await filter('')
    expectSelection([second.title, last.title], [first.title, extra.title])
  })

  it('普通模式：只下载了部分分P的多P视频不算已下载，取消已下载时保持勾选', async () => {
    const multi: MediaItem = { key: 'ugc:BV1', kind: 'ugc', title: '多P视频', index: 1, cid: 0, bvid: 'BV1', lazy: true, pages: 3 }
    const whole: MediaItem = { key: 'ugc:BV2:9', kind: 'ugc', title: '单P视频', index: 2, cid: 9, bvid: 'BV2' }
    api.history.downloadedKeys.mockResolvedValue(['ugc:BV1:11', 'ugc:BV2:9'])
    await open(false, { kind: 'ugc', groups: [{ id: 'a', title: '收藏夹', items: [multi, whole] }], defaultSelected: [multi.key, whole.key] })
    await clickButton('批量选择')
    await clickButton('去掉已下载')
    expectSelection([multi.title], [whole.title])
  })

  it('加载下一页后保留旧选择，新条目参与下一次全选和反选', async () => {
    const paging = { source: { type: 'fav' as const, mediaId: 1 }, page: 1, total: 6, hasMore: true }
    await open(true, { paging })
    await click(checkbox('全选已加载条目'))
    await clickButton('加载下一页')
    expect(api.parseMore).toHaveBeenCalledWith(paging.source, 2)
    expectSelection([first.title, second.title, extra.title, last.title], [nextPageItem.title, invalid.title])
    expect(checkbox('全选').indeterminate).toBe(true)
    await invert()
    expectSelection([nextPageItem.title], [first.title, second.title, extra.title, last.title, invalid.title])
  })

  it('搜索遇到空页时仍能继续加载，显示后续页面里的匹配条目', async () => {
    const paging = { source: { type: 'fav' as const, mediaId: 1 }, page: 1, total: 41, hasMore: true }
    const items = Array.from({ length: 20 }, (_, index) => episode(index + 1, '当前结果'))
    const match = episode(41, '后续结果')
    api.parseMore
      .mockResolvedValueOnce({ items: [], total: 41, hasMore: true })
      .mockResolvedValueOnce({ items: [match], total: 41, hasMore: false })
    await open(true, { paging, groups: [{ id: 'main', title: '收藏夹', items }] })
    await filter('后续结果')
    await clickButton('加载下一页')
    expect(container.textContent).not.toContain('没有匹配的结果')
    await clickButton('加载下一页')
    expect(api.parseMore).toHaveBeenLastCalledWith(paging.source, 3)
    expect(checkbox(match.title).checked).toBe(false)
  })

  it('最后一页去重后只剩一条时仍可清除筛选', async () => {
    const paging = { source: { type: 'fav' as const, mediaId: 1 }, page: 1, total: 2, hasMore: true }
    api.parseMore.mockResolvedValueOnce({ items: [first], total: 1, hasMore: false })
    await open(true, { paging, groups: [{ id: 'main', title: '收藏夹', items: [first] }] })
    await filter('不存在')
    await clickButton('加载下一页')
    expect(container.textContent).toContain('没有匹配的结果')
    await filter('')
    expect(checkbox(first.title).checked).toBe(false)
  })

  it('分页插入后 Shift 仍从上次点击的条目开始，批量选择会清除起点', async () => {
    await open(true, { paging: { source: { type: 'fav', mediaId: 1 }, page: 1, total: 6, hasMore: true } })
    await click(checkbox(extra.title))
    await clickButton('加载下一页')
    await click(rowTitle(last), true)
    expectSelection([extra.title, last.title], [nextPageItem.title])
    await invert()
    await click(checkbox(last.title), true)
    expectSelection([first.title, second.title, nextPageItem.title, last.title], [extra.title, invalid.title])
  })

  it.each([false, true])('反选后关闭旧的重复下载确认（来源明细：%s）', async (fromSource) => {
    await open(fromSource)
    await click(checkbox('全选'))
    await clickButton('下载 4 项')
    expect(button('跳过它们')).toBeDefined()
    await invert()
    expect(button('跳过它们')).toBeUndefined()
    expect(button('下载 0 项')?.disabled).toBe(true)
    await click(rowTitle(second))
    await clickButton('下载 1 项')
    expect(api.download.enqueue).toHaveBeenCalledOnce()
    expect(api.download.enqueue).toHaveBeenCalledWith(expect.objectContaining({ items: [second] }), undefined)
  })
})
