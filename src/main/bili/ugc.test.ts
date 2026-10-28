import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Params = Record<string, unknown>
const api = vi.hoisted(() => vi.fn<(url: string, params?: Params, opts?: { wbi?: boolean }) => Promise<unknown>>())

vi.mock('electron', () => ({}))
vi.mock('./http', async (orig) => ({ ...(await orig<typeof import('./http')>()), api }))

const { parseUgc } = await import('./ugc')

const VIEW = 'https://api.bilibili.com/x/web-interface/wbi/view'
const PLAYER = 'https://api.bilibili.com/x/player/wbi/v2'
const EDGE = 'https://api.bilibili.com/x/stein/edgeinfo_v2'

const page = (cid: number, n: number, part = `P${n} 标题`, duration = 60 * n) => ({ cid, page: n, part, duration })

const view = (over: Record<string, unknown> = {}) => ({
  bvid: 'BV1main00000',
  aid: 1,
  cid: 100,
  title: '主视频',
  pic: 'main.jpg',
  desc: '主视频简介',
  pubdate: 1700000000,
  tname: '科技',
  owner: { mid: 9, name: 'UP 主' },
  pages: [page(100, 1)],
  ...over
})

type Route = (params: Params) => unknown
const route = (routes: Record<string, Route>) =>
  api.mockImplementation(async (url, params = {}) => {
    const r = routes[url]
    if (!r) throw new Error(`未预期的请求 ${url}`)
    return r(params)
  })

beforeEach(() => {
  api.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('parseUgc 普通分P', () => {
  it('单 P 用视频标题，按 bvid 签名请求', async () => {
    route({ [VIEW]: () => view({ ugc_season: undefined }) })
    const r = await parseUgc({ bvid: 'BV1main00000' })
    expect(api).toHaveBeenCalledWith(VIEW, { bvid: 'BV1main00000' }, { wbi: true })
    expect(r).toMatchObject({
      kind: 'ugc',
      title: '主视频',
      cover: 'main.jpg',
      owner: 'UP 主',
      meta: { desc: '主视频简介', owner: 'UP 主', ownerMid: 9, pubdate: 1700000000, genres: ['科技'], url: 'https://www.bilibili.com/video/BV1main00000' },
      defaultSelected: ['ugc:BV1main00000:100']
    })
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0]).toMatchObject({ id: 'pages', title: '主视频' })
    expect(r.groups[0].items[0]).toEqual({
      key: 'ugc:BV1main00000:100',
      kind: 'ugc',
      title: '主视频',
      index: 1,
      page: 1,
      cid: 100,
      bvid: 'BV1main00000',
      aid: 1,
      cover: 'main.jpg',
      duration: 60,
      pubdate: 1700000000,
      desc: '主视频简介'
    })
  })

  it('只有 aid 时按 aid 请求，没有分区时 genres 为空', async () => {
    route({ [VIEW]: () => view({ tname: undefined, owner: undefined }) })
    const r = await parseUgc({ aid: 1 })
    expect(api).toHaveBeenCalledWith(VIEW, { aid: 1 }, { wbi: true })
    expect(r.meta?.genres).toBeUndefined()
    expect(r.owner).toBeUndefined()
  })

  it('多 P 用分P标题，命中 t.page 时只选中那一P', async () => {
    route({ [VIEW]: () => view({ pages: [page(100, 1), page(101, 2), page(102, 3)] }) })
    const r = await parseUgc({ bvid: 'BV1main00000', page: 2 })
    expect(r.groups[0].title).toBe('分P')
    expect(r.groups[0].items.map((i) => [i.title, i.index])).toEqual([
      ['P1 标题', 1],
      ['P2 标题', 2],
      ['P3 标题', 3]
    ])
    expect(r.defaultSelected).toEqual(['ugc:BV1main00000:101'])
  })

  it('t.page 不存在时全选', async () => {
    route({ [VIEW]: () => view({ pages: [page(100, 1), page(101, 2)] }) })
    const r = await parseUgc({ bvid: 'BV1main00000', page: 9 })
    expect(r.defaultSelected).toEqual(['ugc:BV1main00000:100', 'ugc:BV1main00000:101'])
  })
})

describe('parseUgc 合集', () => {
  const season = (sections: unknown[], cover = 'season.jpg') => ({ id: 5, title: '合集标题', cover, sections })
  const ep = (bvid: string, cid: number, title: string, extra: Record<string, unknown> = {}) => ({
    aid: cid,
    bvid,
    cid,
    title,
    arc: { pic: `${bvid}.jpg`, duration: 90, pubdate: 1600000000, desc: `${title} 简介` },
    ...extra
  })

  it('多个 section 分组，序号跨组递增，多 P 条目带分P标题', async () => {
    route({
      [VIEW]: () =>
        view({
          ugc_season: season([
            {
              id: 1,
              title: '第一季',
              episodes: [
                ep('BV1other0000', 200, '其他视频'),
                ep('BV1main00000', 100, '主视频', { pages: [page(100, 1, '上'), page(101, 2, '下')] })
              ]
            },
            { id: 2, title: '第二季', episodes: [ep('BV1third0000', 300, '第三个', { arc: undefined })] }
          ])
        })
    })
    const r = await parseUgc({ bvid: 'BV1main00000' })
    expect(r).toMatchObject({ title: '合集标题', cover: 'season.jpg', owner: 'UP 主' })
    expect(r.meta).toMatchObject({ desc: undefined, owner: 'UP 主', url: 'https://www.bilibili.com/video/BV1main00000' })
    expect(r.groups.map((g) => [g.id, g.title])).toEqual([
      ['sec-1', '第一季'],
      ['sec-2', '第二季']
    ])
    const items = r.groups.flatMap((g) => g.items)
    expect(items.map((i) => [i.key, i.title, i.index, i.page])).toEqual([
      ['ugc:BV1other0000:200', '其他视频', 1, 1],
      ['ugc:BV1main00000:100', '主视频 - P1 上', 2, 1],
      ['ugc:BV1main00000:101', '主视频 - P2 下', 3, 2],
      ['ugc:BV1third0000:300', '第三个', 4, 1]
    ])
    // 没有 pages 的条目用 arc.duration，arc 也没有时为 0
    expect(items[0]).toMatchObject({ duration: 90, cover: 'BV1other0000.jpg', desc: '其他视频 简介', pubdate: 1600000000 })
    expect(items[3]).toMatchObject({ duration: 0, cover: undefined, desc: undefined })
    // 当前视频的简介用 view 里的
    expect(items[1].desc).toBe('主视频简介')
    // 没指定分P时选中当前视频的所有分P
    expect(r.defaultSelected).toEqual(['ugc:BV1main00000:100', 'ugc:BV1main00000:101'])
  })

  it('只有一个 section 时用合集标题，合集没封面时用视频封面', async () => {
    route({
      [VIEW]: () => view({ ugc_season: season([{ id: 1, title: '正片', episodes: [ep('BV1main00000', 100, '主视频')] }], '') })
    })
    const r = await parseUgc({ bvid: 'BV1main00000' })
    expect(r.groups[0].title).toBe('合集标题')
    expect(r.cover).toBe('main.jpg')
  })

  it('指定分P时只选中当前视频的那一P', async () => {
    route({
      [VIEW]: () =>
        view({
          pages: [page(100, 1), page(101, 2)],
          ugc_season: season([
            {
              id: 1,
              title: 's',
              episodes: [ep('BV1other0000', 101, '同 cid 的其他视频'), ep('BV1main00000', 100, '主视频', { pages: [page(100, 1), page(101, 2)] })]
            }
          ])
        })
    })
    const r = await parseUgc({ bvid: 'BV1main00000', page: 2 })
    expect(r.defaultSelected).toEqual(['ugc:BV1main00000:101'])
  })

  it('sections 为空时按普通分P处理', async () => {
    route({ [VIEW]: () => view({ ugc_season: season([]) }) })
    const r = await parseUgc({ bvid: 'BV1main00000' })
    expect(r.groups[0].id).toBe('pages')
  })
})

describe('parseUgc 互动视频', () => {
  const choice = (id: number, cid: number, option: string) => ({ id, cid, option })
  const edges = (...choices: ReturnType<typeof choice>[]) => ({ questions: [{ choices }] })

  it('从开头广度优先收集剧情片段，按 cid 去重，标题按 e.title → 选项 → 序号回退', async () => {
    vi.useFakeTimers()
    const edgeInfo: Record<string, unknown> = {
      root: { title: '', edges: edges(choice(11, 101, '选 A'), choice(12, 102, '选 B')) },
      11: { title: '分支 A', edges: edges(choice(13, 102, '重复的 B'), choice(14, 100, '回到开头'), choice(15, 103, '选 C')) },
      12: {},
      15: { title: '结局' }
    }
    route({
      [VIEW]: () => view({ rights: { is_stein_gate: 1 } }),
      [PLAYER]: () => ({ interaction: { graph_version: 77 } }),
      [EDGE]: (p) => edgeInfo[p.edge_id === undefined ? 'root' : String(p.edge_id)]
    })
    const p = parseUgc({ bvid: 'BV1main00000' })
    await vi.runAllTimersAsync()
    const r = await p

    expect(api).toHaveBeenCalledWith(PLAYER, { bvid: 'BV1main00000', cid: 100 }, { wbi: true })
    expect(api).toHaveBeenCalledWith(EDGE, { bvid: 'BV1main00000', graph_version: 77, edge_id: undefined })
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0]).toMatchObject({ id: 'stein', title: '互动视频剧情片段' })
    const items = r.groups[0].items
    expect(items.map((i) => [i.cid, i.title, i.index, i.desc])).toEqual([
      [100, '片段 1', 1, undefined],
      [101, '分支 A', 2, '选项：选 A'],
      [102, '选 B', 3, '选项：选 B'],
      [103, '结局', 4, '选项：选 C']
    ])
    expect(items[1]).toMatchObject({ key: 'ugc:BV1main00000:101', bvid: 'BV1main00000', aid: 1, cover: 'main.jpg', pubdate: 1700000000 })
    expect(r.defaultSelected).toEqual(items.map((i) => i.key))
    expect(r.title).toBe('主视频')
  })

  it('每次请求之间间隔 0.15 秒', async () => {
    vi.useFakeTimers()
    route({
      [VIEW]: () => view({ rights: { is_stein_gate: 1 } }),
      [PLAYER]: () => ({ interaction: { graph_version: 1 } }),
      [EDGE]: (p) => (p.edge_id === undefined ? { title: '开头', edges: edges(choice(1, 101, 'A')) } : { title: 'A' })
    })
    const p = parseUgc({ bvid: 'BV1main00000' })
    const edgeCalls = () => api.mock.calls.filter(([u]) => u === EDGE).length
    await vi.advanceTimersByTimeAsync(149)
    expect(edgeCalls()).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(edgeCalls()).toBe(2)
    expect((await p).groups[0].items).toHaveLength(2)
  })

  it('最多收集 300 个片段', async () => {
    vi.useFakeTimers()
    let next = 1000
    route({
      [VIEW]: () => view({ rights: { is_stein_gate: 1 } }),
      [PLAYER]: () => ({ interaction: { graph_version: 1 } }),
      // 每个片段都有两个新分支，剧情图无限展开
      [EDGE]: () => ({ title: 't', edges: edges(choice(next, next++, 'x'), choice(next, next++, 'y')) })
    })
    const p = parseUgc({ bvid: 'BV1main00000' })
    await vi.runAllTimersAsync()
    const r = await p
    expect(r.groups[0].items).toHaveLength(300)
    expect(api.mock.calls.filter(([u]) => u === EDGE)).toHaveLength(300)
  })

  it('没有 graph_version 时回退到普通流程', async () => {
    route({
      [VIEW]: () => view({ rights: { is_stein_gate: 1 } }),
      [PLAYER]: () => ({})
    })
    const r = await parseUgc({ bvid: 'BV1main00000' })
    expect(r.groups[0].id).toBe('pages')
    expect(api.mock.calls.map(([u]) => u)).toEqual([VIEW, PLAYER])
  })
})
