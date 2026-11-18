import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({}))
const { DEFAULT_WEIGHTS, WEIGHT_KEYS, normalizeWeights, parseWeights, rankVideos, weightsSchema } = await import('./ranking')
type SearchVideo = import('../bili/lookup').SearchVideo

const NOW = Date.parse('2026-11-02T00:00:00Z') / 1000
const DAY = 86400

const v = (bvid: string, over: Partial<SearchVideo> = {}): SearchVideo => ({ bvid, title: bvid, tags: [], description: '', ...over })
const only = (key: (typeof WEIGHT_KEYS)[number]) => ({ ...Object.fromEntries(WEIGHT_KEYS.map((k) => [k, 0])), [key]: 1 }) as typeof DEFAULT_WEIGHTS
const ids = (list: ReturnType<typeof rankVideos>): string[] => list.map((r) => r.video.bvid)

describe('parseWeights', () => {
  it('没给就是默认值，默认值加起来是 1，时长默认不计', () => {
    expect(parseWeights(undefined, 'weights')).toEqual(DEFAULT_WEIGHTS)
    expect(parseWeights(null, 'weights')).toEqual(DEFAULT_WEIGHTS)
    expect(WEIGHT_KEYS.reduce((n, k) => n + DEFAULT_WEIGHTS[k], 0)).toBeCloseTo(1)
    expect(DEFAULT_WEIGHTS.duration).toBe(0)
  })

  it('给了的键覆盖默认，其余不变；返回的是副本', () => {
    const w = parseWeights({ recency: 50, duration: 0.5 }, 'weights')
    expect(w).toEqual({ ...DEFAULT_WEIGHTS, recency: 50, duration: 0.5 })
    w.play = 99
    expect(DEFAULT_WEIGHTS.play).toBe(0.2)
  })

  it('不合法的报参数错误', () => {
    const bad = (raw: unknown) => expect(() => parseWeights(raw, 'weights')).toThrowError(expect.objectContaining({ code: 'INVALID_ARGS' }))
    bad('x')
    bad([1])
    bad({ fame: 1 })
    bad({ play: '1' })
    bad({ play: NaN })
    bad({ play: -0.1 })
    bad({ play: 100.1 })
    bad(Object.fromEntries(WEIGHT_KEYS.map((k) => [k, 0])))
  })
})

describe('normalizeWeights / weightsSchema', () => {
  it('总和归一成 1', () => {
    expect(normalizeWeights({ ...only('play'), recency: 3, play: 1 })).toMatchObject({ play: 0.25, recency: 0.75, like: 0 })
  })

  it('schema 只有一层，键固定', () => {
    const s = weightsSchema('说明')
    expect(s).toMatchObject({ type: 'object', description: '说明', additionalProperties: false })
    expect(Object.keys(s.properties)).toEqual([...WEIGHT_KEYS])
    expect(s.properties.play).toEqual({ type: 'number', minimum: 0, maximum: 100 })
  })
})

describe('rankVideos 时长', () => {
  const list = [v('a', { duration: 60 }), v('b', { duration: 600 }), v('c'), v('d', { duration: 60 }), v('e', { duration: 3600 }), v('f')]

  it('从长到短：缺时长的排最后，相同的保持原顺序，没有 score', () => {
    const r = rankVideos(list, 'duration', DEFAULT_WEIGHTS, NOW)
    expect(ids(r)).toEqual(['e', 'b', 'a', 'd', 'c', 'f'])
    expect(r[0].score).toBeUndefined()
  })

  it('从短到长：缺时长的还是排最后', () => {
    expect(ids(rankVideos(list, 'duration_asc', DEFAULT_WEIGHTS, NOW))).toEqual(['a', 'd', 'b', 'e', 'c', 'f'])
  })

  it('不改动传入的数组', () => {
    const copy = [...list]
    rankVideos(list, 'duration', DEFAULT_WEIGHTS, NOW)
    expect(list).toEqual(copy)
  })
})

describe('rankVideos quality', () => {
  it('空列表和单个视频', () => {
    expect(rankVideos([], 'quality', DEFAULT_WEIGHTS, NOW)).toEqual([])
    const [one] = rankVideos([v('a', { play: 1 })], 'quality', only('play'), NOW)
    expect(one.score).toBe(50)
  })

  it('relevance：B站综合排序里越靠前越高', () => {
    expect(ids(rankVideos([v('a'), v('b'), v('c')], 'quality', only('relevance'), NOW))).toEqual(['a', 'b', 'c'])
    const r = rankVideos([v('a'), v('b'), v('c')], 'quality', only('relevance'), NOW)
    expect(r.map((x) => x.score)).toEqual([100, 50, 0])
  })

  it('play：播放量的百分位，并列取平均，缺失当 0', () => {
    const r = rankVideos([v('a', { play: 10 }), v('b', { play: 10 }), v('c', { play: 5 }), v('d')], 'quality', only('play'), NOW)
    expect(r.map((x) => [x.video.bvid, x.score])).toEqual([
      ['a', 83.3],
      ['b', 83.3],
      ['c', 33.3],
      ['d', 0]
    ])
  })

  it('全部相同时都是 50 分，保持原顺序', () => {
    const r = rankVideos([v('a', { play: 1 }), v('b', { play: 1 })], 'quality', only('play'), NOW)
    expect(r.map((x) => x.score)).toEqual([50, 50])
    expect(ids(r)).toEqual(['a', 'b'])
  })

  it.each([
    ['like', 'like'],
    ['favorite', 'favorites'],
    ['comment', 'comments'],
    ['danmaku', 'danmaku']
  ] as const)('%s：看每次播放的互动率，不是绝对数', (weight, field) => {
    const list = [
      v('big', { play: 1_000_000, [field]: 1000 }),
      v('good', { play: 100_000, [field]: 20_000 }),
      v('none', { play: 100_000, [field]: 0 })
    ]
    expect(ids(rankVideos(list, 'quality', only(weight), NOW))).toEqual(['good', 'big', 'none'])
  })

  it('平滑：几十次播放的视频不能靠一个点赞冲到前面', () => {
    const list = [v('tiny', { play: 10, like: 5 }), v('solid', { play: 100_000, like: 20_000 }), v('avg', { play: 100_000, like: 3000 })]
    expect(ids(rankVideos(list, 'quality', only('like'), NOW))[0]).toBe('solid')
  })

  it('播放量都是 0 时互动率不出 NaN', () => {
    const r = rankVideos([v('a', { like: 5 }), v('b')], 'quality', only('like'), NOW)
    expect(r.every((x) => Number.isFinite(x.score))).toBe(true)
  })

  it('recency：越新越高，一年前减半，缺发布时间是 0，未来的时间不超过 1', () => {
    const list = [v('old', { pubdate: NOW - 2 * 365 * DAY }), v('year', { pubdate: NOW - 365 * DAY }), v('new', { pubdate: NOW }), v('none'), v('future', { pubdate: NOW + DAY })]
    const r = rankVideos(list, 'quality', only('recency'), NOW)
    expect(r.map((x) => [x.video.bvid, x.score])).toEqual([
      ['new', 100],
      ['future', 100],
      ['year', 50],
      ['old', 25],
      ['none', 0]
    ])
  })

  it('duration：权重给了才算，长的高', () => {
    const list = [v('short', { duration: 60 }), v('long', { duration: 3600 }), v('mid', { duration: 600 })]
    expect(ids(rankVideos(list, 'quality', only('duration'), NOW))).toEqual(['long', 'mid', 'short'])
    // 默认权重里时长为 0：时长不影响得分；打开后才影响
    const a = [v('a', { duration: 60 }), v('b', { duration: 3600 })]
    const scores = (w: typeof DEFAULT_WEIGHTS) => rankVideos(a, 'quality', w, NOW).map((r) => r.score)
    expect(scores(DEFAULT_WEIGHTS)).toEqual(scores({ ...DEFAULT_WEIGHTS, duration: 0 }))
    expect(scores(DEFAULT_WEIGHTS)).not.toEqual(scores({ ...DEFAULT_WEIGHTS, duration: 1 }))
  })

  it('综合：口碑好又新的排在前面，跑题的爆款和冷门都靠后', () => {
    const list = [
      v('relevant-old', { play: 200_000, like: 4000, favorites: 2000, comments: 300, danmaku: 500, pubdate: NOW - 4 * 365 * DAY }),
      v('best', { play: 150_000, like: 15_000, favorites: 9000, comments: 1200, danmaku: 2000, pubdate: NOW - 60 * DAY }),
      v('viral-offtopic', { play: 5_000_000, like: 50_000, favorites: 5000, comments: 3000, danmaku: 8000, pubdate: NOW - 30 * DAY }),
      v('tiny', { play: 20, like: 10, favorites: 5, comments: 2, danmaku: 1, pubdate: NOW - DAY })
    ]
    const r = rankVideos(list, 'quality', DEFAULT_WEIGHTS, NOW)
    expect(ids(r)[0]).toBe('best')
    expect(ids(r).at(-1)).toBe('tiny')
    expect(r.every((x) => x.score! >= 0 && x.score! <= 100)).toBe(true)
  })
})
