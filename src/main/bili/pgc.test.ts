import { beforeEach, describe, expect, it, vi } from 'vitest'

type Params = Record<string, unknown>
const api = vi.hoisted(() => vi.fn<(url: string, params?: Params, opts?: { wbi?: boolean }) => Promise<unknown>>())

vi.mock('electron', () => ({}))
vi.mock('./http', async (orig) => ({ ...(await orig<typeof import('./http')>()), api }))

const { parsePgc } = await import('./pgc')

const REVIEW = 'https://api.bilibili.com/pgc/review/user'
const SEASON = 'https://api.bilibili.com/pgc/view/web/season'

const ep = (id: number, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  aid: id * 10,
  bvid: `BV${id}`,
  cid: id * 100,
  title,
  cover: `ep${id}.jpg`,
  ...extra
})

const season = (over: Record<string, unknown> = {}) => ({
  season_id: 33,
  title: '番剧名',
  cover: 'season.jpg',
  episodes: [ep(1, '1'), ep(2, '2')],
  ...over
})

const mockSeason = (s: unknown) =>
  api.mockImplementation(async (url) => {
    if (url === REVIEW) return { media: { season_id: 44 } }
    if (url === SEASON) return s
    throw new Error(`未预期的请求 ${url}`)
  })

beforeEach(() => {
  api.mockReset()
  mockSeason(season())
})

describe('parsePgc 请求参数', () => {
  it('mediaId 先查 review/user 拿到 season_id', async () => {
    await parsePgc({ mediaId: 55 })
    expect(api.mock.calls).toEqual([
      [REVIEW, { media_id: 55 }],
      [SEASON, { season_id: 44 }]
    ])
  })

  it('epId 优先于 seasonId', async () => {
    await parsePgc({ epId: 2, seasonId: 33 })
    expect(api).toHaveBeenCalledWith(SEASON, { ep_id: 2 })
    await parsePgc({ seasonId: 33 })
    expect(api).toHaveBeenLastCalledWith(SEASON, { season_id: 33 })
  })
})

describe('parsePgc 剧集', () => {
  it('剧集标题：数字、小数补成第 N 话，拼上 long_title，show_title 优先', async () => {
    mockSeason(
      season({
        episodes: [
          ep(1, '1'),
          ep(2, '12.5', { long_title: '总集篇' }),
          ep(3, 'PV', { long_title: '预告' }),
          ep(4, '13', { show_title: '第13话 完结' }),
          ep(5, '1.5.2')
        ]
      })
    )
    const r = await parsePgc({ seasonId: 33 })
    expect(r.groups[0].items.map((i) => i.title)).toEqual(['第1话', '第12.5话 总集篇', 'PV 预告', '第13话 完结', '1.5.2'])
  })

  it('只有一集正片（电影）时用番剧名，花絮仍用剧集标题', async () => {
    mockSeason(
      season({
        episodes: [ep(1, '正片', { long_title: '电影' })],
        section: [
          { id: 7, title: '花絮', episodes: [ep(8, '1', { long_title: '幕后' })] },
          { id: 9, title: '空的', episodes: [] }
        ]
      })
    )
    const r = await parsePgc({ seasonId: 33 })
    expect(r.groups.map((g) => [g.id, g.title])).toEqual([
      ['main', '正片'],
      ['sec-7', '花絮']
    ])
    expect(r.groups[0].items[0].title).toBe('番剧名')
    expect(r.groups[1].items[0]).toMatchObject({ title: '第1话 幕后', index: 1, key: 'pgc:8' })
  })

  it('时长毫秒换算成秒，判断大会员，空字段转成 undefined', async () => {
    mockSeason(
      season({
        episodes: [
          ep(1, '1', { duration: 1_234_567, badge: '会员', pub_time: 1700000000 }),
          ep(2, '2', { status: 13, badge: '' }),
          ep(3, '3', { badge: '限免', duration: 0, pub_time: 0 })
        ]
      })
    )
    const r = await parsePgc({ seasonId: 33 })
    const [a, b, c] = r.groups[0].items
    expect(a).toEqual({
      key: 'pgc:1',
      kind: 'pgc',
      title: '第1话',
      index: 1,
      cid: 100,
      bvid: 'BV1',
      aid: 10,
      epId: 1,
      cover: 'ep1.jpg',
      duration: 1235,
      pubdate: 1700000000,
      badge: '会员',
      needVip: true
    })
    expect(b).toMatchObject({ needVip: true, badge: undefined, duration: undefined })
    expect(c).toMatchObject({ needVip: false, badge: '限免', duration: undefined, pubdate: undefined })
  })

  it('没有正片时不生成正片分组', async () => {
    mockSeason(season({ episodes: [], section: [{ id: 1, title: 'PV', episodes: [ep(9, 'PV1')] }] }))
    const r = await parsePgc({ seasonId: 33 })
    expect(r.groups.map((g) => g.id)).toEqual(['sec-1'])
    expect(r.defaultSelected).toEqual(['pgc:9'])
  })
})

describe('parsePgc 元数据和默认选择', () => {
  it('发布日期按东八区解析，带上 UP 信息和风格', async () => {
    mockSeason(
      season({
        evaluate: '简介',
        styles: ['热血'],
        up_info: { uname: '官方', mid: 1 },
        link: 'https://www.bilibili.com/bangumi/media/md1',
        publish: { pub_time: '2024-01-02 20:00:00' }
      })
    )
    const r = await parsePgc({ seasonId: 33 })
    expect(r).toMatchObject({ kind: 'pgc', title: '番剧名', cover: 'season.jpg', owner: '官方' })
    expect(r.meta).toEqual({
      desc: '简介',
      owner: '官方',
      ownerMid: 1,
      pubdate: Date.UTC(2024, 0, 2, 12) / 1000,
      genres: ['热血'],
      url: 'https://www.bilibili.com/bangumi/media/md1'
    })
  })

  it('没有 link 时拼出 ss 地址，日期无法解析或缺失时为 undefined', async () => {
    mockSeason(season({ publish: { pub_time: '不是日期' } }))
    const r = await parsePgc({ seasonId: 33 })
    expect(r.meta?.url).toBe('https://www.bilibili.com/bangumi/play/ss33')
    expect(r.meta?.pubdate).toBeUndefined()

    mockSeason(season({ publish: {} }))
    expect((await parsePgc({ seasonId: 33 })).meta?.pubdate).toBeUndefined()
  })

  it('默认选中 epId 对应的那一集，找不到或没给时选第一集', async () => {
    expect((await parsePgc({ epId: 2 })).defaultSelected).toEqual(['pgc:2'])
    expect((await parsePgc({ epId: 999 })).defaultSelected).toEqual(['pgc:1'])
    expect((await parsePgc({ seasonId: 33 })).defaultSelected).toEqual(['pgc:1'])
  })

  it('一集都没有时默认选择为空', async () => {
    mockSeason(season({ episodes: [] }))
    const r = await parsePgc({ seasonId: 33 })
    expect(r.groups).toEqual([])
    expect(r.defaultSelected).toEqual([])
  })
})
