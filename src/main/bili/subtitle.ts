import type { MediaItem } from '@shared/types'
import { api, BASE_HEADERS } from './http'

interface Track {
  lan: string
  lan_doc: string
  subtitle_url: string
}

interface Line {
  from: number
  to: number
  content: string
}

function srtTime(sec: number): string {
  const ms = Math.round(sec * 1000)
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`
}

export function toSrt(lines: Line[]): string {
  return lines
    .map((l, i) => `${i + 1}\n${srtTime(l.from)} --> ${srtTime(l.to)}\n${l.content.trim()}\n`)
    .join('\n')
}

/** 返回该分P/剧集的全部 CC 字幕（含 AI 字幕），已转成 SRT */
export async function fetchSubtitles(item: MediaItem): Promise<{ lan: string; srt: string }[]> {
  const params =
    item.kind === 'ugc' ? { bvid: item.bvid, cid: item.cid } : { aid: item.aid, cid: item.cid, ep_id: item.epId }
  const d = await api<{ subtitle?: { subtitles?: Track[] } }>('https://api.bilibili.com/x/player/wbi/v2', params, {
    wbi: true
  })
  const out: { lan: string; srt: string }[] = []
  for (const t of d.subtitle?.subtitles ?? []) {
    if (!t.subtitle_url) continue
    const url = t.subtitle_url.startsWith('//') ? `https:${t.subtitle_url}` : t.subtitle_url
    const res = await fetch(url, { headers: BASE_HEADERS })
    if (!res.ok) continue
    const json = (await res.json()) as { body?: Line[] }
    if (json.body?.length) out.push({ lan: t.lan, srt: toSrt(json.body) })
  }
  return out
}
