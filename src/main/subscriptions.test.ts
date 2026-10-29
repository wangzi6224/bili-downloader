import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeOptions } from '@shared/options'
import type { MediaItem, NewSubscription, ParseResult, Subscription } from '@shared/types'

const h = vi.hoisted(() => ({
  userData: '',
  resolveInput: vi.fn(),
  downloadedKeys: vi.fn((): string[] => []),
  loadTailPages: vi.fn(async (..._args: unknown[]): Promise<unknown[]> => [])
}))
vi.mock('electron', () => ({ app: { getPath: () => h.userData } }))
vi.mock('./bili/resolve', () => ({ resolveInput: h.resolveInput }))
vi.mock('./bili/lists', async (orig) => ({ isAscending: (await orig<typeof import('./bili/lists')>()).isAscending, loadTailPages: h.loadTailPages }))
vi.mock('./history', () => ({ downloadedKeys: h.downloadedKeys }))
const { SubscriptionManager } = await import('./subscriptions')
const { AuthExpiredError } = await import('./bili/http')

const OPTIONS = normalizeOptions({}, 80)
const item = (key: string, extra: Partial<MediaItem> = {}): MediaItem => ({ key, kind: 'ugc', title: key, index: 1, cid: 1, ...extra })
const result = (items: MediaItem[]): ParseResult => ({
  kind: 'ugc',
  title: '收藏夹标题',
  cover: 'c.jpg',
  meta: { owner: 'UP' },
  groups: [{ id: 'g', title: 'g', items }],
  defaultSelected: []
})
const newSub = (o: Partial<NewSubscription> = {}): NewSubscription => ({
  input: 'https://space.bilibili.com/1/favlist?fid=2',
  title: '我的收藏',
  kind: 'ugc',
  options: OPTIONS,
  intervalMin: 60,
  includeExisting: false,
  currentKeys: ['ugc:BV0:1'],
  ...o
})
const sub = (o: Partial<Subscription>): Subscription => ({
  id: o.input ?? 'id',
  input: 'in',
  title: 't',
  kind: 'ugc',
  intervalMin: 60,
  enabled: true,
  options: OPTIONS,
  seen: [],
  createdAt: 0,
  ...o
})

let enqueue: ReturnType<typeof vi.fn<(req: unknown) => Promise<string | undefined>>>
let m: InstanceType<typeof SubscriptionManager>
const saved = (): Subscription[] => JSON.parse(readFileSync(join(h.userData, 'subscriptions.json'), 'utf8'))

beforeEach(() => {
  vi.clearAllMocks()
  h.userData = mkdtempSync(join(tmpdir(), 'subs-'))
  h.downloadedKeys.mockReturnValue([])
  h.loadTailPages.mockResolvedValue([])
  enqueue = vi.fn(async () => undefined)
  m = new SubscriptionManager(enqueue)
})
afterEach(() => {
  m.stop()
  vi.useRealTimers()
  rmSync(h.userData, { recursive: true, force: true })
})

describe('add', () => {
  it('默认只下载以后新增的：现有条目记为已见，保存并通知界面', async () => {
    const onUpdate = vi.fn()
    m.on('update', onUpdate)
    const list = await m.add(newSub())
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ title: '我的收藏', enabled: true, seen: ['ugc:BV0:1'] })
    expect(list[0].lastCheck).toBeTypeOf('number')
    expect(h.resolveInput).not.toHaveBeenCalled()
    expect(saved()).toEqual(list)
    expect(onUpdate).toHaveBeenCalledWith(list)
  })

  it('同一个来源不能订阅两次', async () => {
    await m.add(newSub())
    await expect(m.add(newSub())).rejects.toThrow('已经订阅过这个来源')
  })

  it('正序的合集、系列添加时马上检查一次，把最后一页记为已见', async () => {
    const paging = { source: { type: 'spaceSeason', mid: 1, seasonId: 2 }, page: 1, total: 65, hasMore: true }
    h.resolveInput.mockResolvedValue({ ...result([item('ugc:BV1')]), paging })
    h.loadTailPages.mockResolvedValue([item('ugc:BV61'), item('ugc:BV65')])
    const input = 'https://space.bilibili.com/1/lists/2?type=season'
    const [s] = await m.add(newSub({ input, currentKeys: ['ugc:BV1'] }))
    expect(h.resolveInput).toHaveBeenCalledWith(input)
    const [arg, isKnown] = h.loadTailPages.mock.calls[0] as [unknown, () => boolean]
    expect(arg).toBe(paging)
    expect(isKnown()).toBe(true)
    expect(enqueue).not.toHaveBeenCalled()
    expect(s).toMatchObject({ tailBaseline: true, lastNew: 0 })
    expect(s.seen).toEqual(['ugc:BV1', 'ugc:BV61', 'ugc:BV65'])
    expect(saved()[0].seen).toEqual(s.seen)
  })

  it('选了“现有内容也下载”就马上检查一次', async () => {
    h.resolveInput.mockResolvedValue(result([item('ugc:BV0:1'), item('ugc:BV9:1')]))
    const [s] = await m.add(newSub({ includeExisting: true }))
    expect(enqueue.mock.calls[0][0]).toMatchObject({ items: [item('ugc:BV0:1'), item('ugc:BV9:1')] })
    expect(s.lastNew).toBe(2)
    // 现有内容都要下载，之后是正序合集时也从最后一页一直往前翻；这里不是分页来源，不用翻页
    expect(s.tailBaseline).toBe(true)
    expect(h.loadTailPages).not.toHaveBeenCalled()
  })
})

describe('check', () => {
  it('只下载没见过、没下载过、还能下载的条目', async () => {
    m.replaceAll([sub({ id: 's', input: 'fav', title: '我的收藏', seen: ['seen'] })])
    // 列表里的多P视频还没展开，只要这个视频的任何一P下载过就不算新的
    h.downloadedKeys.mockReturnValue(['done', 'ugc:BV1:5'])
    h.resolveInput.mockResolvedValue(
      result([
        item('seen'),
        item('done'),
        item('ugc:BV1', { lazy: true, bvid: 'BV1' }),
        item('gone', { unavailable: '已失效' }),
        item('new'),
        item('ugc:BV2', { lazy: true, bvid: 'BV2' })
      ])
    )
    enqueue.mockResolvedValue('1 个视频无法获取')
    const found = vi.fn()
    m.on('found', found)
    const [s] = await m.check('s')
    expect(h.resolveInput).toHaveBeenCalledWith('fav')
    expect(enqueue).toHaveBeenCalledWith({
      title: '收藏夹标题',
      cover: 'c.jpg',
      kind: 'ugc',
      meta: { owner: 'UP' },
      items: [item('new'), item('ugc:BV2', { lazy: true, bvid: 'BV2' })],
      options: OPTIONS
    })
    expect(found).toHaveBeenCalledWith({ title: '我的收藏', count: 2, note: '1 个视频无法获取' })
    expect(s.seen).toEqual(['seen', 'done', 'ugc:BV1', 'gone', 'new', 'ugc:BV2'])
    expect(s).toMatchObject({ lastNew: 2, lastError: undefined })
    expect(saved()[0].seen).toEqual(s.seen)
  })

  it('正序的合集、系列从最后一页往前找新内容，见过或下载过的不算', async () => {
    m.replaceAll([sub({ id: 's', seen: ['ugc:BV1', 'ugc:BV60'], tailBaseline: true })])
    h.downloadedKeys.mockReturnValue(['ugc:BV61:9'])
    const paging = { source: { type: 'spaceSeason', mid: 1, seasonId: 2 }, page: 1, total: 63, hasMore: true }
    h.resolveInput.mockResolvedValue({ ...result([item('ugc:BV1')]), paging })
    const tail = ['ugc:BV60', 'ugc:BV61', 'ugc:BV62'].map((k, i) => item(k, { lazy: true, bvid: `BV${60 + i}` }))
    h.loadTailPages.mockResolvedValue(tail)
    const [s] = await m.check('s')
    const isKnown = h.loadTailPages.mock.calls[0][1] as (i: MediaItem) => boolean
    expect(tail.map(isKnown)).toEqual([true, true, false])
    expect(enqueue.mock.calls[0][0]).toMatchObject({ items: [tail[2]] })
    expect(s.seen.slice(0, 4)).toEqual(['ugc:BV1', 'ugc:BV60', 'ugc:BV61', 'ugc:BV62'])
  })

  it('早先只记了第一页的订阅（包括短链接）：第一次检查只补记最后一页，不把中间的旧视频当成新的', async () => {
    m.replaceAll([sub({ id: 's', input: 'https://b23.tv/abc', seen: ['ugc:BV1'] })])
    const paging = { source: { type: 'spaceSeries', mid: 1, seriesId: 3 }, page: 1, total: 200, hasMore: true }
    h.resolveInput.mockResolvedValue({ ...result([item('ugc:BV1'), item('ugc:BV2')]), paging })
    h.loadTailPages.mockResolvedValue([item('ugc:BV181'), item('ugc:BV200')])
    let [s] = await m.check('s')
    expect((h.loadTailPages.mock.calls[0][1] as () => boolean)()).toBe(true)
    // 第一页上没见过的照常下载
    expect(enqueue.mock.calls[0][0]).toMatchObject({ items: [item('ugc:BV2')] })
    expect(s).toMatchObject({ tailBaseline: true, lastNew: 1 })
    expect(s.seen).toEqual(expect.arrayContaining(['ugc:BV181', 'ugc:BV200']))

    // 之后照常从最后一页往前找
    h.loadTailPages.mockResolvedValue([item('ugc:BV200'), item('ugc:BV201')])
    ;[s] = await m.check('s')
    expect((h.loadTailPages.mock.calls[1][1] as (i: MediaItem) => boolean)(item('ugc:BV200'))).toBe(true)
    expect(enqueue.mock.calls[1][0]).toMatchObject({ items: [item('ugc:BV201')] })
  })

  it('补记最后一页或加入下载失败时不留标记，下次再补记', async () => {
    m.replaceAll([sub({ id: 's', seen: ['ugc:BV1'] })])
    const paging = { source: { type: 'spaceSeason', mid: 1, seasonId: 2 }, page: 1, total: 99, hasMore: true }
    h.resolveInput.mockResolvedValue({ ...result([item('ugc:BV1'), item('ugc:BV2')]), paging })
    h.loadTailPages.mockRejectedValueOnce(new Error('请求过于频繁'))
    let [s] = await m.check('s')
    expect(s).toMatchObject({ lastError: '请求过于频繁', seen: ['ugc:BV1'] })
    expect(s.tailBaseline).toBeUndefined()
    h.loadTailPages.mockResolvedValueOnce([item('ugc:BV99')])
    enqueue.mockRejectedValueOnce(new Error('磁盘满了'))
    ;[s] = await m.check('s')
    expect(s.tailBaseline).toBeUndefined()
    expect(s.seen).toEqual(['ugc:BV1'])
  })

  it('不是正序的分页来源（收藏夹等）只看第一页', async () => {
    m.replaceAll([sub({ id: 's' })])
    h.resolveInput.mockResolvedValue({ ...result([item('a')]), paging: { source: { type: 'fav', mediaId: 1 }, page: 1, total: 99, hasMore: true } })
    const [s] = await m.check('s')
    expect(h.loadTailPages).not.toHaveBeenCalled()
    expect(s.tailBaseline).toBeUndefined()
  })

  it('同一个订阅正在检查时，再检查直接返回', async () => {
    m.replaceAll([sub({ id: 's' })])
    let release!: (v: ParseResult) => void
    h.resolveInput.mockReturnValueOnce(new Promise((r) => (release = r)))
    const first = m.check('s')
    await m.check('s')
    expect(h.resolveInput).toHaveBeenCalledTimes(1)
    release(result([]))
    await first
    await m.check('s')
    expect(h.resolveInput).toHaveBeenCalledTimes(2)
  })

  it('没有新内容时不加入下载、不通知', async () => {
    m.replaceAll([sub({ id: 's', seen: ['a'] })])
    h.resolveInput.mockResolvedValue(result([item('a')]))
    const found = vi.fn()
    m.on('found', found)
    const [s] = await m.check('s')
    expect(enqueue).not.toHaveBeenCalled()
    expect(found).not.toHaveBeenCalled()
    expect(s.lastNew).toBe(0)
  })

  it('已见记录新的在前，最多 5000 条', async () => {
    const old = Array.from({ length: 5000 }, (_, i) => `old${i}`)
    m.replaceAll([sub({ id: 's', seen: old })])
    h.resolveInput.mockResolvedValue(result([item('x')]))
    const [s] = await m.check('s')
    expect(s.seen).toHaveLength(5000)
    expect(s.seen[0]).toBe('x')
    expect(s.seen.at(-1)).toBe('old4998')
  })

  it('登录失效时记下原因，已见记录不变，下次还会再检查', async () => {
    m.replaceAll([sub({ id: 's', seen: ['a'], lastCheck: 1 })])
    h.resolveInput.mockRejectedValue(new AuthExpiredError())
    const [s] = await m.check('s')
    expect(s.lastError).toBe('登录已失效，重新登录后会继续检查')
    expect(s.seen).toEqual(['a'])
    expect(s.lastCheck).toBeGreaterThan(1)
  })

  it('加入下载失败时不记为已见，下次重试', async () => {
    m.replaceAll([sub({ id: 's' })])
    h.resolveInput.mockResolvedValue(result([item('x')]))
    enqueue.mockRejectedValue(new Error('磁盘满了'))
    let [s] = await m.check('s')
    expect(s.lastError).toBe('磁盘满了')
    expect(s.seen).toEqual([])
    h.resolveInput.mockRejectedValue('奇怪的错误')
    ;[s] = await m.check('s')
    expect(s.lastError).toBe('奇怪的错误')
  })

  it('检查成功后清掉上次的错误', async () => {
    m.replaceAll([sub({ id: 's', lastError: '旧错误' })])
    h.resolveInput.mockResolvedValue(result([]))
    expect((await m.check('s'))[0].lastError).toBeUndefined()
  })

  it('不存在的订阅什么都不做', async () => {
    expect(await m.check('nope')).toEqual([])
    expect(h.resolveInput).not.toHaveBeenCalled()
  })
})

describe('修改和持久化', () => {
  it('订阅文件内容不是数组时当作没有订阅，定时检查也不会出错（回归）', async () => {
    writeFileSync(join(h.userData, 'subscriptions.json'), '{}')
    const m2 = new SubscriptionManager(enqueue)
    expect(m2.list()).toEqual([])
    expect(await m2.add(newSub())).toHaveLength(1)
  })

  it('修改、删除都会保存，重新打开后还在', async () => {
    const [s] = await m.add(newSub())
    m.update(s.id, { enabled: false, intervalMin: 30 })
    expect(saved()[0]).toMatchObject({ enabled: false, intervalMin: 30 })
    await m.add(newSub({ input: 'other' }))
    expect(new SubscriptionManager(enqueue).list().map((x) => x.input)).toEqual([s.input, 'other'])
    expect(m.remove(s.id).map((x) => x.input)).toEqual(['other'])
    expect(saved().map((x) => x.input)).toEqual(['other'])
  })
})

describe('定时检查', () => {
  it('启动 10 秒后检查一次，只查到期的、启用的，相邻两个间隔 2 秒', async () => {
    vi.useFakeTimers()
    const now = Date.now()
    m.replaceAll([
      sub({ id: 'never', input: 'never' }),
      sub({ id: 'recent', input: 'recent', lastCheck: now }),
      sub({ id: 'off', input: 'off', enabled: false }),
      sub({ id: 'due', input: 'due', lastCheck: now - 61 * 60_000 })
    ])
    h.resolveInput.mockResolvedValue(result([]))
    m.start()
    await vi.advanceTimersByTimeAsync(9_999)
    expect(h.resolveInput).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(h.resolveInput.mock.calls.map((c) => c[0])).toEqual(['never'])
    await vi.advanceTimersByTimeAsync(2000)
    expect(h.resolveInput.mock.calls.map((c) => c[0])).toEqual(['never', 'due'])
    await vi.advanceTimersByTimeAsync(2000)
    expect(h.resolveInput).toHaveBeenCalledTimes(2)
  })

  it('上一轮还没查完时，下一轮跳过', async () => {
    vi.useFakeTimers()
    m.replaceAll([sub({ id: 'slow', input: 'slow' })])
    let finish!: (r: ParseResult) => void
    h.resolveInput.mockReturnValue(new Promise<ParseResult>((r) => (finish = r)))
    m.start()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(h.resolveInput).toHaveBeenCalledOnce()
    finish(result([]))
    await vi.advanceTimersByTimeAsync(2000)
    // 刚查过，没到间隔不会再查
    await vi.advanceTimersByTimeAsync(60_000)
    expect(h.resolveInput).toHaveBeenCalledOnce()
  })

  it('停止后不再定时检查', async () => {
    vi.useFakeTimers()
    m.replaceAll([sub({ id: 'a', input: 'a', intervalMin: 1 })])
    h.resolveInput.mockResolvedValue(result([]))
    m.start()
    await vi.advanceTimersByTimeAsync(12_000)
    expect(h.resolveInput).toHaveBeenCalledOnce()
    m.stop()
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(h.resolveInput).toHaveBeenCalledOnce()
  })
})
