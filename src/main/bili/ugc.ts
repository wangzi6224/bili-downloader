import type { MediaGroup, MediaItem, MediaMeta, ParseResult } from '@shared/types'
import { api } from './http'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** 互动视频最多收集多少个剧情片段，防止异常的剧情图无限展开 */
const MAX_STEIN_NODES = 300

interface EdgeInfo {
  title?: string
  edges?: { questions?: { choices: { id: number; cid: number; option: string }[] }[] }
}

/**
 * 互动视频：从开头片段出发，沿着每个选项广度优先收集所有剧情片段（按 cid 去重），
 * 每次请求间隔 0.15 秒。
 */
async function steinNodes(v: ViewData): Promise<MediaItem[]> {
  const player = await api<{ interaction?: { graph_version?: number } }>(
    'https://api.bilibili.com/x/player/wbi/v2',
    { bvid: v.bvid, cid: v.cid },
    { wbi: true }
  )
  const gv = player.interaction?.graph_version
  if (!gv) return []
  const items: MediaItem[] = []
  const queued = new Set<number>([v.cid])
  const queue: { edgeId?: number; cid: number; option?: string }[] = [{ cid: v.cid }]
  while (queue.length && items.length < MAX_STEIN_NODES) {
    const node = queue.shift()!
    const e = await api<EdgeInfo>('https://api.bilibili.com/x/stein/edgeinfo_v2', {
      bvid: v.bvid,
      graph_version: gv,
      edge_id: node.edgeId
    })
    items.push({
      key: `ugc:${v.bvid}:${node.cid}`,
      kind: 'ugc',
      title: e.title || node.option || `片段 ${items.length + 1}`,
      index: items.length + 1,
      cid: node.cid,
      bvid: v.bvid,
      aid: v.aid,
      cover: v.pic,
      pubdate: v.pubdate,
      desc: node.option ? `选项：${node.option}` : undefined
    })
    for (const c of e.edges?.questions?.flatMap((q) => q.choices) ?? []) {
      if (!queued.has(c.cid)) {
        queued.add(c.cid)
        queue.push({ edgeId: c.id, cid: c.cid, option: c.option })
      }
    }
    if (queue.length) await sleep(150)
  }
  return items
}

interface Page {
  cid: number
  page: number
  part: string
  duration: number
}

interface SeasonEpisode {
  aid: number
  bvid: string
  cid: number
  title: string
  arc?: { pic?: string; duration?: number; pubdate?: number; desc?: string }
  pages?: Page[]
}

interface ViewData {
  bvid: string
  aid: number
  cid: number
  title: string
  pic: string
  desc?: string
  pubdate?: number
  tname?: string
  owner?: { mid: number; name: string }
  rights?: { is_stein_gate?: number }
  pages: Page[]
  ugc_season?: {
    id: number
    title: string
    cover: string
    sections: { id: number; title: string; episodes: SeasonEpisode[] }[]
  }
}

const key = (bvid: string, cid: number): string => `ugc:${bvid}:${cid}`

export async function parseUgc(t: { bvid?: string; aid?: number; page?: number }): Promise<ParseResult> {
  const v = await api<ViewData>(
    'https://api.bilibili.com/x/web-interface/wbi/view',
    t.bvid ? { bvid: t.bvid } : { aid: t.aid },
    { wbi: true }
  )
  const currentPage = v.pages.find((p) => p.page === t.page)
  const meta: MediaMeta = {
    desc: v.desc,
    owner: v.owner?.name,
    ownerMid: v.owner?.mid,
    pubdate: v.pubdate,
    genres: v.tname ? [v.tname] : undefined,
    url: `https://www.bilibili.com/video/${v.bvid}`
  }
  const isCurrent = (bvid: string, cid: number): boolean =>
    bvid === v.bvid && (!currentPage || currentPage.cid === cid)

  if (v.rights?.is_stein_gate) {
    const nodes = await steinNodes(v)
    if (nodes.length) {
      return {
        kind: 'ugc',
        title: v.title,
        cover: v.pic,
        owner: v.owner?.name,
        meta,
        groups: [{ id: 'stein', title: `互动视频剧情片段（共 ${nodes.length} 个）`, items: nodes }],
        defaultSelected: nodes.map((i) => i.key)
      }
    }
  }

  const season = v.ugc_season
  if (season?.sections.length) {
    let index = 0
    const groups: MediaGroup[] = season.sections.map((sec) => ({
      id: `sec-${sec.id}`,
      title: season.sections.length > 1 ? sec.title : season.title,
      items: sec.episodes.flatMap((ep): MediaItem[] => {
        const pages = ep.pages?.length ? ep.pages : [{ cid: ep.cid, page: 1, part: ep.title, duration: ep.arc?.duration ?? 0 }]
        return pages.map((p) => ({
          key: key(ep.bvid, p.cid),
          kind: 'ugc',
          title: pages.length > 1 ? `${ep.title} - P${p.page} ${p.part}` : ep.title,
          index: ++index,
          cid: p.cid,
          bvid: ep.bvid,
          aid: ep.aid,
          cover: ep.arc?.pic,
          duration: p.duration,
          pubdate: ep.arc?.pubdate,
          desc: ep.bvid === v.bvid ? v.desc : ep.arc?.desc
        }))
      })
    }))
    const all = groups.flatMap((g) => g.items)
    return {
      kind: 'ugc',
      title: season.title,
      cover: season.cover || v.pic,
      owner: v.owner?.name,
      meta: { ...meta, desc: undefined, url: `https://www.bilibili.com/video/${v.bvid}` },
      groups,
      defaultSelected: all.filter((i) => isCurrent(i.bvid!, i.cid)).map((i) => i.key)
    }
  }

  const multi = v.pages.length > 1
  const items: MediaItem[] = v.pages.map((p) => ({
    key: key(v.bvid, p.cid),
    kind: 'ugc',
    title: multi ? p.part : v.title,
    index: p.page,
    cid: p.cid,
    bvid: v.bvid,
    aid: v.aid,
    cover: v.pic,
    duration: p.duration,
    pubdate: v.pubdate,
    desc: v.desc
  }))
  return {
    kind: 'ugc',
    title: v.title,
    cover: v.pic,
    owner: v.owner?.name,
    meta,
    groups: [{ id: 'pages', title: multi ? `分P（共 ${items.length} P）` : v.title, items }],
    defaultSelected: (currentPage ? items.filter((i) => i.cid === currentPage.cid) : items).map((i) => i.key)
  }
}
