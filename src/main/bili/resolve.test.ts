import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RANK_SLUGS } from '@shared/parseUrl'
import type { MediaItem, ParseResult } from '@shared/types'

const m = vi.hoisted(() => ({
  parseUgc: vi.fn(),
  parsePgc: vi.fn(),
  parseCheese: vi.fn(),
  parseFav: vi.fn(),
  parseSpace: vi.fn(),
  parseSpaceSeason: vi.fn(),
  parseSpaceSeries: vi.fn(),
  parseWatchLater: vi.fn(),
  parseWeekly: vi.fn(),
  parseRank: vi.fn(),
  parseAudio: vi.fn(),
  parseAudioMenu: vi.fn()
}))

vi.mock('./http', () => ({ BASE_HEADERS: { 'User-Agent': 'test-ua' } }))
vi.mock('./ugc', () => ({ parseUgc: m.parseUgc }))
vi.mock('./pgc', () => ({ parsePgc: m.parsePgc }))
vi.mock('./cheese', () => ({ parseCheese: m.parseCheese }))
vi.mock('./audio', () => ({ parseAudio: m.parseAudio, parseAudioMenu: m.parseAudioMenu }))
vi.mock('./lists', () => ({
  parseFav: m.parseFav,
  parseSpace: m.parseSpace,
  parseSpaceSeason: m.parseSpaceSeason,
  parseSpaceSeries: m.parseSpaceSeries,
  parseWatchLater: m.parseWatchLater,
  parseWeekly: m.parseWeekly,
  parseRank: m.parseRank
}))

const { resolveInput, resolveBatch } = await import('./resolve')

const item = (key: string): MediaItem => ({ key, kind: 'ugc', title: key, index: 1, cid: 1 })
const result = (title: string, keys: string[], defaultSelected: string[] = []): ParseResult => ({
  kind: 'ugc',
  title,
  cover: `${title}.jpg`,
  meta: { owner: `${title} 的 UP` },
  groups: [{ id: 'g', title, items: keys.map(item) }],
  defaultSelected
})

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset().mockResolvedValue(result('默认', []))
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('resolveInput', () => {
  it.each<[string, keyof typeof m, unknown[]]>([
    ['https://www.bilibili.com/video/BV1xx411c7mD?p=2', 'parseUgc', [{ type: 'ugc', bvid: 'BV1xx411c7mD', page: 2 }]],
    ['https://www.bilibili.com/bangumi/play/ep123', 'parsePgc', [{ type: 'pgc', epId: 123 }]],
    ['https://www.bilibili.com/cheese/play/ss45', 'parseCheese', [{ type: 'cheese', seasonId: 45 }]],
    ['https://www.bilibili.com/medialist/detail/ml100', 'parseFav', [100]],
    ['https://space.bilibili.com/123?keyword=abc', 'parseSpace', [123, 'abc']],
    ['https://space.bilibili.com/123/channel/collectiondetail?sid=456', 'parseSpaceSeason', [123, 456]],
    ['https://space.bilibili.com/123/channel/seriesdetail?sid=789', 'parseSpaceSeries', [123, 789]],
    ['https://www.bilibili.com/watchlater', 'parseWatchLater', []],
    ['https://www.bilibili.com/audio/au111', 'parseAudio', [111]],
    ['https://www.bilibili.com/audio/am222', 'parseAudioMenu', [222]],
    ['https://www.bilibili.com/v/popular/weekly?num=300', 'parseWeekly', [300]],
    ['https://www.bilibili.com/v/popular/rank/game', 'parseRank', ['game', RANK_SLUGS.game]]
  ])('%s 交给 %s', async (input, fn, args) => {
    const r = result('结果', [])
    m[fn].mockResolvedValue(r)
    expect(await resolveInput(input)).toBe(r)
    expect(m[fn]).toHaveBeenCalledWith(...args)
    const others = Object.entries(m).filter(([name]) => name !== fn)
    for (const [, other] of others) expect(other).not.toHaveBeenCalled()
  })

  it('识别纯文本的排行榜、稍后再看、每周必看', async () => {
    await resolveInput('排行榜')
    expect(m.parseRank).toHaveBeenCalledWith('all', RANK_SLUGS.all)
    await resolveInput('稍后再看')
    expect(m.parseWatchLater).toHaveBeenCalledTimes(1)
    await resolveInput('每周必看')
    expect(m.parseWeekly).toHaveBeenCalledWith(undefined)
  })

  it('短链按跳转后的地址重新识别', async () => {
    fetchMock.mockResolvedValue({ url: 'https://www.bilibili.com/bangumi/play/ss9' } as Response)
    await resolveInput('【分享】https://b23.tv/abcdef')
    expect(fetchMock).toHaveBeenCalledWith('https://b23.tv/abcdef', { headers: { 'User-Agent': 'test-ua' }, redirect: 'follow' })
    expect(m.parsePgc).toHaveBeenCalledWith({ type: 'pgc', seasonId: 9 })
  })

  it('短链跳到无法识别的地址或另一个短链时报错', async () => {
    fetchMock.mockResolvedValue({ url: 'https://www.example.com/' } as Response)
    await expect(resolveInput('https://b23.tv/abc')).rejects.toThrow('没有识别出 B站视频')
    fetchMock.mockResolvedValue({ url: 'https://b23.tv/again' } as Response)
    await expect(resolveInput('https://b23.tv/abc')).rejects.toThrow('没有识别出 B站视频')
  })

  it('无法识别的输入报错', async () => {
    await expect(resolveInput('随便一段文字')).rejects.toThrow('没有识别出 B站视频、番剧、课程、收藏夹或 UP 主链接')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('resolveBatch', () => {
  // 三个 BV 号分别对应三个解析结果
  const A = 'BV1aaaaaaaaa'
  const B = 'BV1bbbbbbbbb'
  const C = 'BV1ccccccccc'
  const byBvid = (map: Record<string, ParseResult | Error | string>) =>
    m.parseUgc.mockImplementation(async (t: { bvid: string }) => {
      const r = map[t.bvid]
      if (r instanceof Error || typeof r === 'string') throw r
      return r
    })

  it('每个来源一组，去掉重复条目，并沿用或补全默认选择', async () => {
    vi.useFakeTimers()
    const a = result('视频 A', ['k1', 'k2'], ['k2'])
    const b = { ...result('收藏夹 B', ['k2', 'k3', 'k4']), kind: 'audio' as const }
    byBvid({ [A]: a, [B]: b })
    const progress = vi.fn()
    const p = resolveBatch([A, B], progress)
    await vi.runAllTimersAsync()
    const r = await p

    expect(r.groups.map((g) => g.id)).toEqual(['batch-0', 'batch-1'])
    expect(r.groups[0].items.map((i) => i.key)).toEqual(['k1', 'k2'])
    expect(r.groups[1].items.map((i) => i.key)).toEqual(['k3', 'k4'])
    expect(r.groups[1].source).toEqual({ title: '收藏夹 B', kind: 'audio', cover: '收藏夹 B.jpg', meta: { owner: '收藏夹 B 的 UP' } })
    // A 用自己的默认选择；B 没有默认选择时全选去重后的条目
    expect(r.defaultSelected).toEqual(['k2', 'k3', 'k4'])
    expect(r).toMatchObject({ kind: 'ugc', title: '批量解析（2 个来源）', cover: '视频 A.jpg', batch: true })
    expect(r.failures).toBeUndefined()
    expect(progress.mock.calls).toEqual([
      [1, 2, '视频 A'],
      [2, 2, '收藏夹 B']
    ])
  })

  it('两个链接之间间隔 0.5 秒，最后一个之后不再等待', async () => {
    vi.useFakeTimers()
    byBvid({ [A]: result('A', ['a']), [B]: result('B', ['b']) })
    const p = resolveBatch([A, B])
    await vi.advanceTimersByTimeAsync(0)
    expect(m.parseUgc).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(499)
    expect(m.parseUgc).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(m.parseUgc).toHaveBeenCalledTimes(2)
    await p
    expect(vi.getTimerCount()).toBe(0)
  })

  it('部分失败时返回 failures，进度回调不带标题', async () => {
    vi.useFakeTimers()
    byBvid({ [A]: new Error('视频不存在'), [B]: result('B', ['b']), [C]: '字符串错误' })
    const progress = vi.fn()
    const p = resolveBatch([A, B, C], progress)
    await vi.runAllTimersAsync()
    const r = await p
    expect(r.groups.map((g) => g.id)).toEqual(['batch-1'])
    expect(r.kind).toBe('ugc')
    expect(r.title).toBe('批量解析（1 个来源）')
    expect(r.failures).toEqual([
      { input: A, error: '视频不存在' },
      { input: C, error: '字符串错误' }
    ])
    expect(progress.mock.calls).toEqual([[1, 3], [2, 3, 'B'], [3, 3]])
  })

  it('全部失败时报第一个错误', async () => {
    vi.useFakeTimers()
    byBvid({ [A]: new Error('第一个错'), [B]: new Error('第二个错') })
    const p = resolveBatch([A, B])
    const done = expect(p).rejects.toThrow('全部 2 个链接都解析失败：第一个错')
    await vi.runAllTimersAsync()
    await done
  })

  it('没有输入时也报错', async () => {
    await expect(resolveBatch([])).rejects.toThrow('全部 0 个链接都解析失败：')
  })
})
