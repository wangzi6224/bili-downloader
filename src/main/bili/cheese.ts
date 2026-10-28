import type { MediaItem, ParseResult } from '@shared/types'
import { api } from './http'

interface CheeseEpisode {
  id: number
  aid: number
  cid: number
  title: string
  duration?: number
  status?: number
  release_date?: number
  cover?: string
}

interface CheeseSeason {
  season_id: number
  title: string
  subtitle?: string
  cover: string
  up_info?: { mid?: number; uname?: string }
  episodes: CheeseEpisode[]
}

/** 课程：只支持没有 DRM 加密的部分，取流时会再检查 */
export async function parseCheese(t: { epId?: number; seasonId?: number }): Promise<ParseResult> {
  const s = await api<CheeseSeason>(
    'https://api.bilibili.com/pugv/view/web/season',
    t.epId ? { ep_id: t.epId } : { season_id: t.seasonId }
  )
  const items: MediaItem[] = s.episodes.map((ep, i) => ({
    key: `cheese:${ep.id}`,
    kind: 'cheese',
    title: ep.title,
    index: i + 1,
    cid: ep.cid,
    aid: ep.aid,
    epId: ep.id,
    cover: ep.cover,
    duration: ep.duration,
    pubdate: ep.release_date
  }))
  const current = t.epId ? items.find((i) => i.epId === t.epId) : undefined
  return {
    kind: 'cheese',
    title: s.title,
    cover: s.cover,
    owner: s.up_info?.uname,
    meta: {
      desc: s.subtitle,
      owner: s.up_info?.uname,
      ownerMid: s.up_info?.mid,
      url: `https://www.bilibili.com/cheese/play/ss${s.season_id}`
    },
    groups: [{ id: 'cheese', title: '课程', items }],
    defaultSelected: current ? [current.key] : items.map((i) => i.key)
  }
}
