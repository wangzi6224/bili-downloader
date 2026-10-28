import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaItem } from '@shared/types'

type Params = Record<string, unknown>
const api = vi.hoisted(() => vi.fn<(url: string, params?: Params, opts?: { wbi?: boolean }) => Promise<unknown>>())

vi.mock('electron', () => ({}))
vi.mock('./http', async (orig) => ({ ...(await orig<typeof import('./http')>()), api }))

const { BiliError } = await import('./http')
const lists = await import('./lists')

const X = 'https://api.bilibili.com/x'
const EP = {
  fav: `${X}/v3/fav/resource/list`,
  arcSearch: `${X}/space/wbi/arc/search`,
  recArchives: `${X}/series/recArchivesByKeywords`,
  card: `${X}/web-interface/card`,
  season: `${X}/polymer/web-space/seasons_archives_list`,
  seriesMeta: `${X}/series/series`,
  series: `${X}/series/archives`,
  toview: `${X}/v2/history/toview`,
  folders: `${X}/v3/fav/folder/created/list-all`,
  view: `${X}/web-interface/wbi/view`,
  weeklyList: `${X}/web-interface/popular/series/list`,
  weeklyOne: `${X}/web-interface/popular/series/one`,
  rank: `${X}/web-interface/ranking/v2`
}

type Route = (params: Params, opts?: { wbi?: boolean }) => unknown
const route = (routes: Partial<Record<keyof typeof EP, Route>>) =>
  api.mockImplementation(async (url, params = {}, opts) => {
    const name = (Object.keys(EP) as (keyof typeof EP)[]).find((k) => EP[k] === url)
    const r = name && routes[name]
    if (!r) throw new Error(`未预期的请求 ${url}`)
    return r(params, opts)
  })

const archive = (n: number, extra: Record<string, unknown> = {}) => ({
  aid: n,
  bvid: `BV${n}`,
  title: `视频 ${n}`,
  pic: `${n}.jpg`,
  duration: 100 + n,
  pubdate: 1700000000 + n,
  ...extra
})

beforeEach(() => {
  api.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('收藏夹', () => {
  const favData = (medias: unknown[] | null, has_more = false) => ({
    info: { id: 1, title: '我的收藏', cover: 'fav.jpg', intro: '收藏简介', media_count: 45, upper: { mid: 2, name: '收藏者' } },
    medias,
    has_more
  })
  const media = (id: number, extra: Record<string, unknown> = {}) => ({
    id,
    type: 2,
    title: `收藏 ${id}`,
    cover: `${id}.jpg`,
    intro: `简介 ${id}`,
    page: 1,
    duration: 300,
    upper: { mid: 3, name: '作者' },
    pubtime: 1600000000,
    bvid: `BV${id}`,
    ugc: { first_cid: id * 10 },
    ...extra
  })

  it('解析收藏夹第一页：已知 cid 的单 P、多 P 懒加载、音频和失效条目', async () => {
    route({
      fav: () =>
        favData(
          [
            media(1),
            media(2, { page: 3 }),
            media(3, { type: 12, title: '一首歌', duration: 200 }),
            media(4, { attr: 1 }),
            media(5, { title: '已失效视频', attr: 0 }),
            media(6, { ugc: undefined, upper: undefined })
          ],
          true
        )
    })
    const r = await lists.parseFav(1)
    expect(api).toHaveBeenCalledWith(EP.fav, { media_id: 1, pn: 1, ps: 20, platform: 'web' })
    const [known, multi, audio, invalid, invalid2, noCid] = r.groups[0].items
    expect(known).toEqual({
      key: 'ugc:BV1:10',
      kind: 'ugc',
      title: '收藏 1',
      index: 1,
      cid: 10,
      bvid: 'BV1',
      aid: 1,
      cover: '1.jpg',
      duration: 300,
      pubdate: 1600000000,
      desc: '简介 1',
      owner: '作者',
      ownerMid: 3,
      lazy: false,
      pages: 1,
      badge: undefined
    })
    expect(multi).toMatchObject({ key: 'ugc:BV2', cid: 0, lazy: true, pages: 3, badge: '3P' })
    expect(audio).toEqual({ key: 'audio:3', kind: 'audio', title: '一首歌', index: 3, cid: 3, cover: '3.jpg', duration: 200, owner: '作者' })
    expect(invalid.unavailable).toBe('已失效')
    expect(invalid2.unavailable).toBe('已失效')
    expect(noCid).toMatchObject({ key: 'ugc:BV6', lazy: true, owner: undefined, ownerMid: undefined })
    expect(r).toMatchObject({
      kind: 'ugc',
      title: '我的收藏',
      cover: 'fav.jpg',
      owner: '收藏者',
      meta: { desc: '收藏简介', owner: '收藏者', ownerMid: 2 },
      paging: { source: { type: 'fav', mediaId: 1 }, page: 1, total: 45, hasMore: true }
    })
    expect(r.groups[0]).toMatchObject({ id: 'fav', title: '收藏夹' })
    expect(r.defaultSelected).toEqual(['ugc:BV1:10', 'ugc:BV2', 'audio:3', 'ugc:BV6'])
  })

  it('medias 为 null 时没有条目', async () => {
    route({ fav: () => favData(null) })
    const r = await lists.parseFav(1)
    expect(r.groups[0].items).toEqual([])
    expect(r.paging?.hasMore).toBe(false)
  })

  it('loadPage 翻页时序号接着上一页', async () => {
    route({ fav: () => favData([media(7)], false) })
    const r = await lists.loadPage({ type: 'fav', mediaId: 1 }, 3)
    expect(api).toHaveBeenCalledWith(EP.fav, { media_id: 1, pn: 3, ps: 20, platform: 'web' })
    expect(r).toMatchObject({ page: 3, total: 45, hasMore: false })
    expect(r.items[0].index).toBe(41)
  })
})

describe('UP 主投稿', () => {
  const vlist = (n: number, length: string) => ({ aid: n, bvid: `BV${n}`, title: `投稿 ${n}`, pic: `${n}.jpg`, length, created: 1500000000 + n, description: `说明 ${n}` })
  const card = () => ({ card: { name: 'UP 名', face: 'face.jpg', sign: '签名' } })

  it('时长字符串换算成秒，补上 UP 名，按投稿数判断 hasMore', async () => {
    route({
      card: () => card(),
      arcSearch: () => ({ list: { vlist: [vlist(1, '03:32'), vlist(2, '1:02:03'), vlist(3, '')] }, page: { pn: 1, ps: 30, count: 31 } })
    })
    const r = await lists.parseSpace(9)
    expect(api).toHaveBeenCalledWith(EP.card, { mid: 9 })
    expect(api).toHaveBeenCalledWith(EP.arcSearch, { mid: 9, pn: 1, ps: 30, order: 'pubdate', keyword: undefined }, { wbi: true })
    const items = r.groups[0].items
    expect(items.map((i) => i.duration)).toEqual([212, 3723, undefined])
    expect(items[0]).toMatchObject({ key: 'ugc:BV1', lazy: true, owner: 'UP 名', ownerMid: 9, pubdate: 1500000001, desc: '说明 1', cover: '1.jpg' })
    expect(r).toMatchObject({
      title: 'UP 名 的投稿',
      cover: 'face.jpg',
      owner: 'UP 名',
      meta: { owner: 'UP 名', ownerMid: 9, desc: '签名' },
      defaultSelected: [],
      paging: { source: { type: 'space', mid: 9, keyword: undefined }, page: 1, total: 31, hasMore: true }
    })
  })

  it('带关键词时标题里写上关键词，投稿不足一页时没有更多', async () => {
    route({ card: () => card(), arcSearch: () => ({ list: { vlist: [] }, page: { pn: 1, ps: 30, count: 30 } }) })
    const r = await lists.parseSpace(9, '教程')
    expect(api).toHaveBeenCalledWith(EP.arcSearch, expect.objectContaining({ keyword: '教程' }), { wbi: true })
    expect(r.title).toBe('UP 名 的投稿（教程）')
    expect(r.paging?.hasMore).toBe(false)
  })

  it('WBI 接口失败时回退到 recArchivesByKeywords', async () => {
    route({
      card: () => card(),
      arcSearch: () => {
        throw new BiliError('风控校验失败', -352)
      },
      recArchives: () => ({ archives: [archive(1), archive(2)], page: { total: 62 } })
    })
    const r = await lists.parseSpace(9)
    expect(api).toHaveBeenCalledWith(EP.recArchives, { mid: 9, keywords: '', ps: 30, pn: 1 })
    expect(r.groups[0].items.map((i) => [i.key, i.duration, i.owner])).toEqual([
      ['ugc:BV1', 101, 'UP 名'],
      ['ugc:BV2', 102, 'UP 名']
    ])
    expect(r.paging?.total).toBe(62)
  })

  it('两个接口都失败时报错并保留原始错误码', async () => {
    route({
      card: () => card(),
      arcSearch: () => {
        throw new BiliError('风控校验失败', -352)
      },
      recArchives: () => {
        throw new Error('也失败了')
      }
    })
    const err = await lists.parseSpace(9, 'kw').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(BiliError)
    expect(err).toMatchObject({ code: -352 })
    expect((err as Error).message).toBe(
      'B站暂时拒绝了获取 UP 主投稿列表的请求（风控校验失败），请稍后再试；也可以改为粘贴 UP 主的合集或收藏夹链接'
    )
    expect(api).toHaveBeenCalledWith(EP.recArchives, { mid: 9, keywords: 'kw', ps: 30, pn: 1 })
  })

  it('不是 BiliError 的错误直接抛出，不回退', async () => {
    route({
      card: () => card(),
      arcSearch: () => {
        throw new TypeError('坏数据')
      }
    })
    await expect(lists.parseSpace(9)).rejects.toThrow(TypeError)
    expect(api.mock.calls.some(([u]) => u === EP.recArchives)).toBe(false)
  })

  it('loadPage 翻页时序号偏移 30，按 page * 30 判断 hasMore', async () => {
    route({ arcSearch: () => ({ list: { vlist: [vlist(1, '00:10')] }, page: { pn: 2, ps: 30, count: 61 } }) })
    const r = await lists.loadPage({ type: 'space', mid: 9, keyword: 'kw' }, 2)
    expect(api).toHaveBeenCalledWith(EP.arcSearch, { mid: 9, pn: 2, ps: 30, order: 'pubdate', keyword: 'kw' }, { wbi: true })
    expect(r).toMatchObject({ page: 2, total: 61, hasMore: true })
    expect(r.items[0]).toMatchObject({ index: 31, duration: 10 })
    route({ arcSearch: () => ({ list: { vlist: [] }, page: { pn: 3, ps: 30, count: 61 } }) })
    expect((await lists.loadPage({ type: 'space', mid: 9 }, 3)).hasMore).toBe(false)
  })
})

describe('UP 主的合集和系列', () => {
  const seasonData = (total: number, n = 2) => ({
    archives: Array.from({ length: n }, (_, i) => archive(i + 1)),
    page: { page_num: 1, total },
    meta: { title: '合集名', cover: 'season.jpg', description: '合集简介', total }
  })

  it('parseSpaceSeason 全选第一页，按 meta.total 判断 hasMore', async () => {
    route({ season: () => seasonData(31) })
    const r = await lists.parseSpaceSeason(9, 5)
    expect(api).toHaveBeenCalledWith(EP.season, { mid: 9, season_id: 5, page_num: 1, page_size: 30, sort_reverse: false })
    expect(r).toMatchObject({
      title: '合集名',
      cover: 'season.jpg',
      meta: { desc: '合集简介', ownerMid: 9 },
      defaultSelected: ['ugc:BV1', 'ugc:BV2'],
      paging: { source: { type: 'spaceSeason', mid: 9, seasonId: 5 }, page: 1, total: 31, hasMore: true }
    })
    expect(r.groups[0]).toMatchObject({ id: 'season', title: '合集' })
    expect(r.groups[0].items[1]).toMatchObject({ index: 2, ownerMid: 9, duration: 102 })

    route({ season: () => seasonData(30) })
    expect((await lists.parseSpaceSeason(9, 5)).paging?.hasMore).toBe(false)
  })

  it('parseSpaceSeries 用 series 元数据，没封面时用第一个视频的封面', async () => {
    route({
      seriesMeta: () => ({ meta: { name: '系列名', description: '系列简介', total: 2 } }),
      series: () => ({ archives: [archive(1), archive(2)], page: { num: 1, total: 31 } })
    })
    const r = await lists.parseSpaceSeries(9, 7)
    expect(api).toHaveBeenCalledWith(EP.seriesMeta, { series_id: 7 })
    expect(api).toHaveBeenCalledWith(EP.series, { mid: 9, series_id: 7, only_normal: true, sort: 'asc', pn: 1, ps: 30 })
    expect(r).toMatchObject({
      title: '系列名',
      cover: '1.jpg',
      meta: { desc: '系列简介', ownerMid: 9 },
      defaultSelected: ['ugc:BV1', 'ugc:BV2'],
      paging: { source: { type: 'spaceSeries', mid: 9, seriesId: 7 }, page: 1, total: 31, hasMore: true }
    })
    expect(r.groups[0]).toMatchObject({ id: 'series', title: '系列' })
  })

  it('parseSpaceSeries 有封面时用元数据封面，没有视频也没有封面时为空', async () => {
    route({
      seriesMeta: () => ({ meta: { name: '系列名', total: 0, cover: 'series.jpg' } }),
      series: () => ({ archives: [archive(1)], page: { total: 1 } })
    })
    expect((await lists.parseSpaceSeries(9, 7)).cover).toBe('series.jpg')
    route({
      seriesMeta: () => ({ meta: { name: '系列名', total: 0 } }),
      series: () => ({ archives: [], page: { total: 0 } })
    })
    const r = await lists.parseSpaceSeries(9, 7)
    expect(r.cover).toBe('')
    expect(r.paging?.hasMore).toBe(false)
  })

  it('loadPage 合集和系列翻页', async () => {
    route({ season: () => seasonData(61, 1) })
    const s = await lists.loadPage({ type: 'spaceSeason', mid: 9, seasonId: 5 }, 2)
    expect(api).toHaveBeenCalledWith(EP.season, expect.objectContaining({ page_num: 2 }))
    expect(s).toMatchObject({ page: 2, total: 61, hasMore: true })
    expect(s.items[0]).toMatchObject({ index: 31, ownerMid: 9 })

    route({ series: () => ({ archives: [archive(1)], page: { total: 60 } }) })
    const r = await lists.loadPage({ type: 'spaceSeries', mid: 9, seriesId: 7 }, 2)
    expect(api).toHaveBeenCalledWith(EP.series, expect.objectContaining({ pn: 2 }))
    expect(r).toMatchObject({ page: 2, total: 60, hasMore: false })
    expect(r.items[0]).toMatchObject({ index: 31, ownerMid: 9 })
  })
})

describe('稍后再看和我的收藏夹', () => {
  it('稍后再看：单 P 已知 cid，多 P 懒加载', async () => {
    route({
      toview: () => ({
        count: 2,
        list: [
          { ...archive(1), cid: 11, videos: 1, owner: { mid: 5, name: '甲' } },
          { ...archive(2), cid: 22, videos: 4 }
        ]
      })
    })
    const r = await lists.parseWatchLater()
    expect(api).toHaveBeenCalledWith(EP.toview)
    const [a, b] = r.groups[0].items
    expect(a).toMatchObject({ key: 'ugc:BV1:11', cid: 11, lazy: false, owner: '甲', ownerMid: 5, badge: undefined })
    expect(b).toMatchObject({ key: 'ugc:BV2', cid: 0, lazy: true, pages: 4, badge: '4P' })
    expect(r).toMatchObject({ kind: 'ugc', title: '稍后再看', cover: '1.jpg', defaultSelected: ['ugc:BV1:11', 'ugc:BV2'] })
  })

  it('稍后再看为空时封面为空', async () => {
    route({ toview: () => ({ count: 0 }) })
    const r = await lists.parseWatchLater()
    expect(r.groups[0].items).toEqual([])
    expect(r.cover).toBe('')
  })

  it('myFavFolders 转换字段，返回 null 时为空数组', async () => {
    route({ folders: () => ({ list: [{ id: 1, title: '默认收藏夹', media_count: 3 }] }) })
    expect(await lists.myFavFolders(9)).toEqual([{ id: 1, title: '默认收藏夹', count: 3 }])
    expect(api).toHaveBeenCalledWith(EP.folders, { up_mid: 9 })
    route({ folders: () => null })
    expect(await lists.myFavFolders(9)).toEqual([])
    route({ folders: () => ({ list: null }) })
    expect(await lists.myFavFolders(9)).toEqual([])
  })
})

describe('expandLazy', () => {
  const lazyItem = (bvid: string, extra: Partial<MediaItem> = {}): MediaItem => ({
    key: `ugc:${bvid}`,
    kind: 'ugc',
    title: bvid,
    index: 1,
    cid: 0,
    bvid,
    lazy: true,
    badge: '2P',
    pubdate: 1,
    desc: '列表简介',
    ...extra
  })

  it('没有懒加载条目时原样返回同一个数组', async () => {
    const items: MediaItem[] = [{ key: 'ugc:BV1:1', kind: 'ugc', title: 't', index: 1, cid: 1 }]
    expect(await lists.expandLazy(items)).toBe(items)
    expect(api).not.toHaveBeenCalled()
  })

  it('逐个展开成分P，失败的写入 unavailable，并报告进度', async () => {
    vi.useFakeTimers()
    const done: MediaItem = { key: 'ugc:BV0:9', kind: 'ugc', title: '已展开', index: 1, cid: 9 }
    route({
      view: (p) => {
        if (p.bvid === 'BVmulti') {
          return {
            bvid: 'BVmulti',
            aid: 7,
            title: '多P视频',
            pubdate: 99,
            owner: { mid: 3, name: '接口里的 UP' },
            pages: [
              { cid: 71, page: 1, part: '上', duration: 10 },
              { cid: 72, page: 2, part: '下', duration: 20 }
            ]
          }
        }
        if (p.bvid === 'BVsingle') return { bvid: 'BVsingle', aid: 8, title: '单P视频', desc: '接口简介', pages: [{ cid: 81, page: 1, part: 'p', duration: 30 }] }
        if (p.bvid === 'BVstring') throw '字符串错误'
        throw new BiliError('视频不见了', 62002)
      }
    })
    const progress = vi.fn()
    const p = lists.expandLazy(
      [
        done,
        lazyItem('BVmulti', { owner: '列表里的 UP' }),
        lazyItem('BVsingle'),
        lazyItem('BVgone'),
        lazyItem('BVstring')
      ],
      progress
    )
    await vi.runAllTimersAsync()
    const out = await p

    expect(api).toHaveBeenCalledWith(EP.view, { bvid: 'BVmulti' }, { wbi: true })
    expect(out[0]).toBe(done)
    expect(out[1]).toMatchObject({
      key: 'ugc:BVmulti:71',
      title: '多P视频 - P1 上',
      page: 1,
      cid: 71,
      aid: 7,
      duration: 10,
      pubdate: 99,
      desc: '列表简介',
      owner: '列表里的 UP',
      ownerMid: 3,
      lazy: false,
      badge: undefined
    })
    expect(out[2]).toMatchObject({ key: 'ugc:BVmulti:72', title: '多P视频 - P2 下', page: 2 })
    expect(out[3]).toMatchObject({ key: 'ugc:BVsingle:81', title: '单P视频', pubdate: 1, desc: '接口简介', owner: undefined, ownerMid: undefined })
    expect(out[4]).toMatchObject({ key: 'ugc:BVgone', lazy: true, unavailable: '视频不见了' })
    expect(out[5]).toMatchObject({ key: 'ugc:BVstring', unavailable: '字符串错误' })
    expect(out).toHaveLength(6)
    expect(progress.mock.calls).toEqual([
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4]
    ])
  })

  it('两次请求之间间隔 0.3 秒', async () => {
    vi.useFakeTimers()
    // 只测传了进度回调的情况：不传时 ++done 不会执行，最后一项之后也会多等 0.3 秒
    route({ view: (p) => ({ bvid: p.bvid, aid: 1, title: 't', pages: [{ cid: 1, page: 1, part: 'p', duration: 1 }] }) })
    const p = lists.expandLazy([lazyItem('BVa'), lazyItem('BVb')], () => {})
    await vi.advanceTimersByTimeAsync(299)
    expect(api).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(api).toHaveBeenCalledTimes(2)
    expect(await p).toHaveLength(2)
  })
})

describe('每周必看和排行榜', () => {
  const popular = (n: number, videos?: number) => ({ ...archive(n), cid: n * 10, videos, owner: { mid: n, name: `UP${n}` } })

  it('指定期号时直接取那一期', async () => {
    route({ weeklyOne: () => ({ config: { label: '第 300 期', subject: '主题' }, list: [popular(1), popular(2, 3)] }) })
    const r = await lists.parseWeekly(300)
    expect(api).toHaveBeenCalledTimes(1)
    expect(api).toHaveBeenCalledWith(EP.weeklyOne, { number: 300 })
    expect(r).toMatchObject({
      title: '每周必看 第 300 期：主题',
      cover: '1.jpg',
      meta: { url: 'https://www.bilibili.com/v/popular/weekly?num=300' },
      defaultSelected: []
    })
    expect(r.groups[0]).toMatchObject({ id: 'weekly', title: '第 300 期' })
    expect(r.groups[0].items.map((i) => [i.key, i.lazy, i.owner])).toEqual([
      ['ugc:BV1:10', false, 'UP1'],
      ['ugc:BV2', true, 'UP2']
    ])
  })

  it('没有期号时先取最新一期，没有 label 时用标题', async () => {
    route({
      weeklyList: () => ({ list: [{ number: 301 }, { number: 300 }] }),
      weeklyOne: () => ({ config: {}, list: [] })
    })
    const r = await lists.parseWeekly()
    expect(api).toHaveBeenCalledWith(EP.weeklyOne, { number: 301 })
    expect(r.title).toBe('每周必看 第 301 期')
    expect(r.groups[0].title).toBe('每周必看 第 301 期')
    expect(r.cover).toBe('')
  })

  it('期数列表为空时报错', async () => {
    route({ weeklyList: () => ({ list: [] }) })
    const err = await lists.parseWeekly().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(BiliError)
    expect((err as Error).message).toBe('没有拿到每周必看的期数')
  })

  it('排行榜按分区参数请求', async () => {
    route({ rank: () => ({ list: [popular(1)] }) })
    const r = await lists.parseRank('game', { rid: 4, type: 'all', label: '游戏' })
    expect(api).toHaveBeenCalledWith(EP.rank, { rid: 4, type: 'all' })
    expect(r).toMatchObject({
      kind: 'ugc',
      title: '排行榜 · 游戏',
      cover: '1.jpg',
      meta: { url: 'https://www.bilibili.com/v/popular/rank/game' },
      defaultSelected: []
    })
    expect(r.groups[0]).toMatchObject({ id: 'rank', title: '游戏排行' })
    expect(r.groups[0].items[0]).toMatchObject({ key: 'ugc:BV1:10', duration: 101 })

    route({ rank: () => ({ list: [] }) })
    expect((await lists.parseRank('all', { rid: 0, type: 'all', label: '全站' })).cover).toBe('')
  })
})
