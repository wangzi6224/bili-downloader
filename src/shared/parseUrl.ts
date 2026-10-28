import type { MediaItem } from './types'

export type Target =
  | { type: 'short'; url: string }
  | { type: 'ugc'; bvid?: string; aid?: number; page?: number }
  | { type: 'pgc'; epId?: number; seasonId?: number; mediaId?: number }
  | { type: 'cheese'; epId?: number; seasonId?: number }
  | { type: 'fav'; mediaId: number }
  | { type: 'space'; mid: number; keyword?: string }
  | { type: 'spaceSeason'; mid: number; seasonId: number }
  | { type: 'spaceSeries'; mid: number; seriesId: number }
  | { type: 'watchlater' }
  | { type: 'audio'; sid: number }
  | { type: 'audioMenu'; amid: number }
  | { type: 'weekly'; number?: number }
  | { type: 'rank'; slug: string }

/** 排行榜分区：网页地址里的英文名 → 接口参数 */
export const RANK_SLUGS: Record<string, { rid: number; type: string; label: string }> = {
  all: { rid: 0, type: 'all', label: '全站' },
  douga: { rid: 1, type: 'all', label: '动画' },
  music: { rid: 3, type: 'all', label: '音乐' },
  dance: { rid: 129, type: 'all', label: '舞蹈' },
  game: { rid: 4, type: 'all', label: '游戏' },
  knowledge: { rid: 36, type: 'all', label: '知识' },
  tech: { rid: 188, type: 'all', label: '科技' },
  sports: { rid: 234, type: 'all', label: '运动' },
  car: { rid: 223, type: 'all', label: '汽车' },
  life: { rid: 160, type: 'all', label: '生活' },
  food: { rid: 211, type: 'all', label: '美食' },
  animal: { rid: 217, type: 'all', label: '动物圈' },
  kichiku: { rid: 119, type: 'all', label: '鬼畜' },
  fashion: { rid: 155, type: 'all', label: '时尚' },
  ent: { rid: 5, type: 'all', label: '娱乐' },
  cinephile: { rid: 181, type: 'all', label: '影视' },
  origin: { rid: 0, type: 'origin', label: '原创' },
  rookie: { rid: 0, type: 'rookie', label: '新人' }
}

const SHORT_HOSTS = /^(?:https?:\/\/)?(?:b23\.tv|bili2233\.cn|bili22\.cn|bili23\.cn|bili33\.cn)\/\S+/i
const URL_RE =
  /(?:https?:\/\/)?[\w.-]*(?:bilibili\.com|b23\.tv|bili2233\.cn|bili2[23]\.cn|bili33\.cn)\/[^\s"'<>，。】）]*/gi

function urlOf(raw: string): URL | undefined {
  try {
    return new URL(raw.startsWith('http') ? raw : `https://${raw}`)
  } catch {
    return undefined
  }
}

/** 从粘贴内容（可能是带标题的分享文案）中识别出要下载的对象 */
export function parseInput(input: string): Target | null {
  const text = input.trim()
  if (!text) return null
  if (/^(稍后再看|watchlater)$/i.test(text)) return { type: 'watchlater' }
  if (/^每周必看$/.test(text)) return { type: 'weekly' }
  if (/^排行榜$/.test(text)) return { type: 'rank', slug: 'all' }
  const raw = text.match(URL_RE)?.[0] ?? text
  const u = urlOf(raw)
  const q = (k: string): string | null => u?.searchParams.get(k) ?? null

  if (SHORT_HOSTS.test(raw)) {
    return { type: 'short', url: raw.startsWith('http') ? raw : `https://${raw}` }
  }

  // 番剧、影视
  const pgc = raw.match(/bangumi\/play\/(ep|ss)(\d+)/i) ?? text.match(/^(ep|ss)(\d+)$/i)
  if (pgc) {
    const id = Number(pgc[2])
    return pgc[1].toLowerCase() === 'ep' ? { type: 'pgc', epId: id } : { type: 'pgc', seasonId: id }
  }
  const md = raw.match(/bangumi\/media\/md(\d+)/i) ?? text.match(/^md(\d+)$/i)
  if (md) return { type: 'pgc', mediaId: Number(md[1]) }

  // 课程
  const cheese = raw.match(/cheese\/play\/(ep|ss)(\d+)/i)
  if (cheese) {
    const id = Number(cheese[2])
    return cheese[1].toLowerCase() === 'ep' ? { type: 'cheese', epId: id } : { type: 'cheese', seasonId: id }
  }

  // 音频区
  const au = raw.match(/audio\/au(\d+)/i) ?? text.match(/^au(\d+)$/i)
  if (au) return { type: 'audio', sid: Number(au[1]) }
  const am = raw.match(/audio\/am(\d+)/i) ?? text.match(/^am(\d+)$/i)
  if (am) return { type: 'audioMenu', amid: Number(am[1]) }

  if (/bilibili\.com\/(list\/)?watchlater/i.test(raw)) return { type: 'watchlater' }
  if (/\/v\/popular\/weekly/i.test(raw)) {
    const num = Number(q('num'))
    return num > 0 ? { type: 'weekly', number: num } : { type: 'weekly' }
  }
  const rank = raw.match(/\/v\/popular\/rank\/(\w+)/i)
  if (rank && RANK_SLUGS[rank[1].toLowerCase()]) return { type: 'rank', slug: rank[1].toLowerCase() }

  // 播放列表页带着 bvid 时，用户要的是正在看的那个视频
  let page: number | undefined
  const p = Number(q('p'))
  if (p > 0) page = p
  const bv = raw.match(/BV[0-9A-Za-z]{10}/i)

  // 收藏夹
  const ml = raw.match(/(?:medialist\/detail|list)\/ml(\d+)/i)
  if (ml && !bv) return { type: 'fav', mediaId: Number(ml[1]) }
  const space = raw.match(/space\.bilibili\.com\/(\d+)/i)
  if (space && /\/favlist/i.test(raw) && q('fid')) return { type: 'fav', mediaId: Number(q('fid')) }

  // UP 主空间里的合集、系列，以及投稿列表
  if (space) {
    const mid = Number(space[1])
    const sid = Number(q('sid'))
    const lists = raw.match(/\/lists\/(\d+)/i)
    if (/collectiondetail/i.test(raw) && sid) return { type: 'spaceSeason', mid, seasonId: sid }
    if (/seriesdetail/i.test(raw) && sid) return { type: 'spaceSeries', mid, seriesId: sid }
    if (lists) {
      const id = Number(lists[1])
      return q('type') === 'series' ? { type: 'spaceSeries', mid, seriesId: id } : { type: 'spaceSeason', mid, seasonId: id }
    }
    return { type: 'space', mid, keyword: q('keyword') || undefined }
  }

  if (bv) return { type: 'ugc', bvid: `BV${bv[0].slice(2)}`, page }
  const av = raw.match(/(?:^|\/|\b)av(\d+)/i)
  if (av) return { type: 'ugc', aid: Number(av[1]), page }

  return null
}

/** 一段文本里的全部链接（批量解析用），按出现顺序去重 */
export function extractInputs(text: string): string[] {
  const found: string[] = []
  for (const line of text.split(/[\r\n]+/)) {
    const urls = line.match(URL_RE)
    const candidates = urls?.length ? urls : line.split(/[\s,，;；]+/)
    for (const c of candidates) {
      const s = c.trim()
      if (s && parseInput(s) && !found.includes(s)) found.push(s)
    }
  }
  return found
}

/** 条目在 B站网页上的地址（任务列表里点标题打开） */
export function itemUrl(item: MediaItem): string {
  switch (item.kind) {
    case 'pgc':
      return `https://www.bilibili.com/bangumi/play/ep${item.epId}`
    case 'cheese':
      return `https://www.bilibili.com/cheese/play/ep${item.epId}`
    case 'audio':
      // 音频的 cid 就是歌曲 id
      return `https://www.bilibili.com/audio/au${item.cid}`
    default: {
      const video = `https://www.bilibili.com/video/${item.bvid ?? `av${item.aid}`}`
      return item.page && item.page > 1 ? `${video}?p=${item.page}` : video
    }
  }
}
