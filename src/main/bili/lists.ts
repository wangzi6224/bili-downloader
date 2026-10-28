import type { MediaItem, PagedSource, PageResult, ParseResult } from '@shared/types'
import { api, BiliError } from './http'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** "03:32" / "1:02:03" → 秒 */
const toSeconds = (s: string | number | undefined): number | undefined => {
  if (typeof s === 'number') return s
  if (!s) return undefined
  return s.split(':').reduce((acc, x) => acc * 60 + Number(x), 0)
}

/** 列表里的视频：只有 aid/bvid，cid 和分P要等加入下载时再查 */
function lazyVideo(
  v: { aid?: number; bvid: string; title: string; pic?: string; cover?: string; duration?: number | string; pubdate?: number; desc?: string },
  index: number,
  owner?: { mid?: number; name?: string },
  cid?: number,
  pages?: number
): MediaItem {
  const known = cid && (pages ?? 1) <= 1
  return {
    key: known ? `ugc:${v.bvid}:${cid}` : `ugc:${v.bvid}`,
    kind: 'ugc',
    title: v.title,
    index,
    cid: known ? cid : 0,
    bvid: v.bvid,
    aid: v.aid,
    cover: v.pic ?? v.cover,
    duration: toSeconds(v.duration),
    pubdate: v.pubdate,
    desc: v.desc,
    owner: owner?.name,
    ownerMid: owner?.mid,
    lazy: !known,
    pages,
    badge: pages && pages > 1 ? `${pages}P` : undefined
  }
}

// ---------------- 收藏夹 ----------------

interface FavMedia {
  id: number
  type: number
  title: string
  cover: string
  intro?: string
  page?: number
  duration?: number
  upper?: { mid: number; name: string }
  attr?: number
  pubtime?: number
  bvid: string
  ugc?: { first_cid?: number }
}

interface FavData {
  info: { id: number; title: string; cover: string; intro?: string; media_count: number; upper?: { mid: number; name: string } }
  medias: FavMedia[] | null
  has_more: boolean
}

const FAV_PS = 20

async function favData(mediaId: number, page: number): Promise<FavData> {
  return api<FavData>('https://api.bilibili.com/x/v3/fav/resource/list', {
    media_id: mediaId,
    pn: page,
    ps: FAV_PS,
    platform: 'web'
  })
}

function favItems(d: FavData, page: number): MediaItem[] {
  return (d.medias ?? []).map((m, i) => {
    const index = (page - 1) * FAV_PS + i + 1
    if (m.type === 12) {
      return { key: `audio:${m.id}`, kind: 'audio', title: m.title, index, cid: m.id, cover: m.cover, duration: m.duration, owner: m.upper?.name }
    }
    const item = lazyVideo({ ...m, aid: m.id, desc: m.intro, pubdate: m.pubtime }, index, m.upper, m.ugc?.first_cid, m.page)
    // attr 第 0 位为 1 表示视频已失效
    if ((m.attr ?? 0) & 1 || m.title === '已失效视频') item.unavailable = '已失效'
    return item
  })
}

export async function parseFav(mediaId: number): Promise<ParseResult> {
  const d = await favData(mediaId, 1)
  const items = favItems(d, 1)
  return {
    kind: 'ugc',
    title: d.info.title,
    cover: d.info.cover,
    owner: d.info.upper?.name,
    meta: { desc: d.info.intro, owner: d.info.upper?.name, ownerMid: d.info.upper?.mid },
    groups: [{ id: 'fav', title: '收藏夹', items }],
    defaultSelected: items.filter((i) => !i.unavailable).map((i) => i.key),
    paging: { source: { type: 'fav', mediaId }, page: 1, total: d.info.media_count, hasMore: d.has_more }
  }
}

// ---------------- UP 主投稿 ----------------

const SPACE_PS = 30

interface ArcSearch {
  list: { vlist: { aid: number; bvid: string; title: string; pic: string; length: string; created: number; description?: string }[] }
  page: { pn: number; ps: number; count: number }
}

interface Archives {
  archives: { aid: number; bvid: string; title: string; pic: string; duration: number; pubdate: number }[]
  page: { num?: number; page_num?: number; total: number }
}

async function spacePageRaw(mid: number, page: number, keyword?: string): Promise<{ items: MediaItem[]; total: number }> {
  const owner = { mid }
  try {
    // 网页版空间页实际使用的接口，带标准 WBI 签名
    const d = await api<ArcSearch>(
      'https://api.bilibili.com/x/space/wbi/arc/search',
      { mid, pn: page, ps: SPACE_PS, order: 'pubdate', keyword },
      { wbi: true }
    )
    return {
      total: d.page.count,
      items: d.list.vlist.map((v, i) =>
        lazyVideo({ ...v, duration: v.length, pubdate: v.created, desc: v.description }, (page - 1) * SPACE_PS + i + 1, owner)
      )
    }
  } catch (e) {
    if (!(e instanceof BiliError)) throw e
    // 被风控时换一个接口；仍然失败就如实告诉用户，不做任何绕过
    try {
      const d = await api<Archives>('https://api.bilibili.com/x/series/recArchivesByKeywords', {
        mid,
        keywords: keyword ?? '',
        ps: SPACE_PS,
        pn: page
      })
      return {
        total: d.page.total,
        items: d.archives.map((v, i) => lazyVideo(v, (page - 1) * SPACE_PS + i + 1, owner))
      }
    } catch {
      throw new BiliError(
        `B站暂时拒绝了获取 UP 主投稿列表的请求（${e.message}），请稍后再试；也可以改为粘贴 UP 主的合集或收藏夹链接`,
        e.code
      )
    }
  }
}

export async function parseSpace(mid: number, keyword?: string): Promise<ParseResult> {
  const [card, first] = await Promise.all([
    api<{ card: { name: string; face: string; sign?: string } }>('https://api.bilibili.com/x/web-interface/card', { mid }),
    spacePageRaw(mid, 1, keyword)
  ])
  const name = card.card.name
  first.items.forEach((i) => (i.owner = name))
  return {
    kind: 'ugc',
    title: keyword ? `${name} 的投稿（${keyword}）` : `${name} 的投稿`,
    cover: card.card.face,
    owner: name,
    meta: { owner: name, ownerMid: mid, desc: card.card.sign },
    groups: [{ id: 'space', title: '投稿', items: first.items }],
    defaultSelected: [],
    paging: { source: { type: 'space', mid, keyword }, page: 1, total: first.total, hasMore: first.total > SPACE_PS }
  }
}

// ---------------- UP 主空间里的合集、系列 ----------------

async function seasonPage(mid: number, seasonId: number, page: number) {
  return api<Archives & { meta: { title: string; cover: string; description?: string; total: number } }>(
    'https://api.bilibili.com/x/polymer/web-space/seasons_archives_list',
    { mid, season_id: seasonId, page_num: page, page_size: SPACE_PS, sort_reverse: false }
  )
}

async function seriesPage(mid: number, seriesId: number, page: number) {
  return api<Archives>('https://api.bilibili.com/x/series/archives', {
    mid,
    series_id: seriesId,
    only_normal: true,
    sort: 'asc',
    pn: page,
    ps: SPACE_PS
  })
}

export async function parseSpaceSeason(mid: number, seasonId: number): Promise<ParseResult> {
  const d = await seasonPage(mid, seasonId, 1)
  const items = d.archives.map((v, i) => lazyVideo(v, i + 1, { mid }))
  return {
    kind: 'ugc',
    title: d.meta.title,
    cover: d.meta.cover,
    meta: { desc: d.meta.description, ownerMid: mid },
    groups: [{ id: 'season', title: '合集', items }],
    defaultSelected: items.map((i) => i.key),
    paging: { source: { type: 'spaceSeason', mid, seasonId }, page: 1, total: d.meta.total, hasMore: d.meta.total > SPACE_PS }
  }
}

export async function parseSpaceSeries(mid: number, seriesId: number): Promise<ParseResult> {
  const [meta, d] = await Promise.all([
    api<{ meta: { name: string; description?: string; total: number; cover?: string } }>('https://api.bilibili.com/x/series/series', {
      series_id: seriesId
    }),
    seriesPage(mid, seriesId, 1)
  ])
  const items = d.archives.map((v, i) => lazyVideo(v, i + 1, { mid }))
  return {
    kind: 'ugc',
    title: meta.meta.name,
    cover: meta.meta.cover ?? items[0]?.cover ?? '',
    meta: { desc: meta.meta.description, ownerMid: mid },
    groups: [{ id: 'series', title: '系列', items }],
    defaultSelected: items.map((i) => i.key),
    paging: { source: { type: 'spaceSeries', mid, seriesId }, page: 1, total: d.page.total, hasMore: d.page.total > SPACE_PS }
  }
}

/** 分页来源的第 page 页 */
export async function loadPage(source: PagedSource, page: number): Promise<PageResult> {
  switch (source.type) {
    case 'fav': {
      const d = await favData(source.mediaId, page)
      return { items: favItems(d, page), page, total: d.info.media_count, hasMore: d.has_more }
    }
    case 'space': {
      const r = await spacePageRaw(source.mid, page, source.keyword)
      return { items: r.items, page, total: r.total, hasMore: page * SPACE_PS < r.total }
    }
    case 'spaceSeason': {
      const d = await seasonPage(source.mid, source.seasonId, page)
      return {
        items: d.archives.map((v, i) => lazyVideo(v, (page - 1) * SPACE_PS + i + 1, { mid: source.mid })),
        page,
        total: d.meta.total,
        hasMore: page * SPACE_PS < d.meta.total
      }
    }
    case 'spaceSeries': {
      const d = await seriesPage(source.mid, source.seriesId, page)
      return {
        items: d.archives.map((v, i) => lazyVideo(v, (page - 1) * SPACE_PS + i + 1, { mid: source.mid })),
        page,
        total: d.page.total,
        hasMore: page * SPACE_PS < d.page.total
      }
    }
  }
}

// ---------------- 稍后再看、我的收藏夹 ----------------

interface ToView {
  count: number
  list: {
    aid: number
    bvid: string
    cid: number
    title: string
    pic: string
    duration: number
    pubdate: number
    videos: number
    desc?: string
    owner?: { mid: number; name: string }
  }[]
}

export async function parseWatchLater(): Promise<ParseResult> {
  const d = await api<ToView>('https://api.bilibili.com/x/v2/history/toview')
  const items = (d.list ?? []).map((v, i) => lazyVideo(v, i + 1, v.owner, v.cid, v.videos))
  return {
    kind: 'ugc',
    title: '稍后再看',
    cover: items[0]?.cover ?? '',
    groups: [{ id: 'toview', title: '稍后再看', items }],
    defaultSelected: items.map((i) => i.key)
  }
}

export async function myFavFolders(mid: number): Promise<{ id: number; title: string; count: number }[]> {
  // 一个收藏夹都没有时 data 是 null
  const d = await api<{ list: { id: number; title: string; media_count: number }[] | null } | null>(
    'https://api.bilibili.com/x/v3/fav/folder/created/list-all',
    { up_mid: mid }
  )
  return (d?.list ?? []).map((f) => ({ id: f.id, title: f.title, count: f.media_count }))
}

// ---------------- 展开列表里的视频 ----------------

interface ViewPages {
  bvid: string
  aid: number
  title: string
  pubdate?: number
  desc?: string
  owner?: { mid: number; name: string }
  pages: { cid: number; page: number; part: string; duration: number }[]
}

/**
 * 把 lazy 条目查成真正可下载的分P。逐个请求、间隔 0.3 秒，避免触发风控；
 * 单个失败不影响其他条目，失败的以 unavailable 返回。
 */
export async function expandLazy(items: MediaItem[], onProgress?: (done: number, total: number) => void): Promise<MediaItem[]> {
  const lazy = items.filter((i) => i.lazy)
  if (!lazy.length) return items
  const out: MediaItem[] = []
  let done = 0
  for (const item of items) {
    if (!item.lazy) {
      out.push(item)
      continue
    }
    try {
      const v = await api<ViewPages>('https://api.bilibili.com/x/web-interface/wbi/view', { bvid: item.bvid }, { wbi: true })
      const multi = v.pages.length > 1
      for (const p of v.pages) {
        out.push({
          ...item,
          key: `ugc:${v.bvid}:${p.cid}`,
          title: multi ? `${v.title} - P${p.page} ${p.part}` : v.title,
          cid: p.cid,
          aid: v.aid,
          duration: p.duration,
          pubdate: v.pubdate ?? item.pubdate,
          desc: v.desc ?? item.desc,
          owner: item.owner ?? v.owner?.name,
          ownerMid: item.ownerMid ?? v.owner?.mid,
          lazy: false,
          badge: undefined
        })
      }
    } catch (e) {
      out.push({ ...item, unavailable: e instanceof Error ? e.message : String(e) })
    }
    onProgress?.(++done, lazy.length)
    if (done < lazy.length) await sleep(300)
  }
  return out
}

// ---------------- 每周必看、排行榜 ----------------

interface PopularVideo {
  aid: number
  bvid: string
  cid: number
  title: string
  pic: string
  duration: number
  pubdate: number
  videos?: number
  desc?: string
  owner?: { mid: number; name: string }
}

export async function parseWeekly(number?: number): Promise<ParseResult> {
  let n = number
  if (!n) {
    const list = await api<{ list: { number: number }[] }>('https://api.bilibili.com/x/web-interface/popular/series/list')
    n = list.list[0]?.number
    if (!n) throw new BiliError('没有拿到每周必看的期数')
  }
  const d = await api<{ config: { label?: string; name?: string; subject?: string }; list: PopularVideo[] }>(
    'https://api.bilibili.com/x/web-interface/popular/series/one',
    { number: n }
  )
  const items = d.list.map((v, i) => lazyVideo(v, i + 1, v.owner, v.cid, v.videos))
  const title = `每周必看 第 ${n} 期${d.config.subject ? `：${d.config.subject}` : ''}`
  return {
    kind: 'ugc',
    title,
    cover: items[0]?.cover ?? '',
    meta: { url: `https://www.bilibili.com/v/popular/weekly?num=${n}` },
    groups: [{ id: 'weekly', title: d.config.label ?? title, items }],
    defaultSelected: []
  }
}

export async function parseRank(slug: string, rank: { rid: number; type: string; label: string }): Promise<ParseResult> {
  const d = await api<{ list: PopularVideo[] }>('https://api.bilibili.com/x/web-interface/ranking/v2', {
    rid: rank.rid,
    type: rank.type
  })
  const items = d.list.map((v, i) => lazyVideo(v, i + 1, v.owner, v.cid, v.videos))
  return {
    kind: 'ugc',
    title: `排行榜 · ${rank.label}`,
    cover: items[0]?.cover ?? '',
    meta: { url: `https://www.bilibili.com/v/popular/rank/${slug}` },
    groups: [{ id: 'rank', title: `${rank.label}排行`, items }],
    defaultSelected: []
  }
}
