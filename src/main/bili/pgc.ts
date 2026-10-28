import type { MediaGroup, MediaItem, ParseResult } from '@shared/types'
import { api } from './http'

interface Episode {
  id: number
  aid: number
  bvid: string
  cid: number
  title: string
  long_title?: string
  show_title?: string
  badge?: string
  cover?: string
  duration?: number
  status?: number
}

interface SeasonData {
  season_id: number
  title: string
  season_title?: string
  cover: string
  episodes: Episode[]
  section?: { id: number; title: string; episodes: Episode[] }[]
  up_info?: { uname?: string }
}

function episodeTitle(ep: Episode, seasonTitle: string, single: boolean): string {
  if (single) return seasonTitle
  if (ep.show_title) return ep.show_title
  const head = /^\d+(\.\d+)?$/.test(ep.title) ? `第${ep.title}话` : ep.title
  return [head, ep.long_title].filter(Boolean).join(' ')
}

export async function parsePgc(t: { epId?: number; seasonId?: number; mediaId?: number }): Promise<ParseResult> {
  let seasonId = t.seasonId
  if (t.mediaId) {
    const r = await api<{ media: { season_id: number } }>('https://api.bilibili.com/pgc/review/user', {
      media_id: t.mediaId
    })
    seasonId = r.media.season_id
  }
  const s = await api<SeasonData>(
    'https://api.bilibili.com/pgc/view/web/season',
    t.epId ? { ep_id: t.epId } : { season_id: seasonId }
  )

  const single = s.episodes.length === 1
  const toItem =
    (singleMain: boolean) =>
    (ep: Episode, i: number): MediaItem => ({
      key: `pgc:${ep.id}`,
      kind: 'pgc',
      title: episodeTitle(ep, s.title, singleMain),
      index: i + 1,
      cid: ep.cid,
      bvid: ep.bvid,
      aid: ep.aid,
      epId: ep.id,
      cover: ep.cover,
      duration: ep.duration ? Math.round(ep.duration / 1000) : undefined,
      badge: ep.badge || undefined,
      needVip: ep.badge === '会员' || ep.status === 13
    })

  const groups: MediaGroup[] = []
  if (s.episodes.length) groups.push({ id: 'main', title: '正片', items: s.episodes.map(toItem(single)) })
  for (const sec of s.section ?? []) {
    if (sec.episodes.length) {
      groups.push({ id: `sec-${sec.id}`, title: sec.title, items: sec.episodes.map(toItem(false)) })
    }
  }

  const all = groups.flatMap((g) => g.items)
  const current = t.epId ? all.find((i) => i.epId === t.epId) : undefined
  return {
    kind: 'pgc',
    title: s.title,
    cover: s.cover,
    owner: s.up_info?.uname,
    groups,
    defaultSelected: current ? [current.key] : all.length ? [all[0].key] : []
  }
}
