import type { MediaItem } from '@shared/types'
import { api, BASE_HEADERS } from './http'

export interface SubtitleTrack {
  lan: string
  lan_doc: string
  subtitle_url: string
}

export interface ViewPoint {
  from: number
  to: number
  content: string
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

/** 播放器接口里的字幕列表和进度条分段（章节） */
export async function fetchPlayerMeta(item: MediaItem): Promise<{ tracks: SubtitleTrack[]; viewPoints: ViewPoint[] }> {
  const params =
    item.kind === 'ugc' ? { bvid: item.bvid, cid: item.cid } : { aid: item.aid, cid: item.cid, ep_id: item.epId }
  const d = await api<{ subtitle?: { subtitles?: SubtitleTrack[] }; view_points?: ViewPoint[] }>(
    'https://api.bilibili.com/x/player/wbi/v2',
    params,
    { wbi: true }
  )
  return {
    tracks: (d.subtitle?.subtitles ?? []).filter((t) => t.subtitle_url),
    viewPoints: (d.view_points ?? []).filter((v) => v.to > v.from && v.content)
  }
}

export async function downloadSubtitle(t: SubtitleTrack): Promise<string | undefined> {
  const url = t.subtitle_url.startsWith('//') ? `https:${t.subtitle_url}` : t.subtitle_url
  const res = await fetch(url, { headers: BASE_HEADERS })
  if (!res.ok) return undefined
  const json = (await res.json()) as { body?: Line[] }
  return json.body?.length ? toSrt(json.body) : undefined
}

const ISO639: [RegExp, string][] = [
  [/^(ai-)?zh/i, 'chi'],
  [/^(ai-)?en/i, 'eng'],
  [/^(ai-)?ja/i, 'jpn'],
  [/^(ai-)?ko/i, 'kor'],
  [/^ru/i, 'rus'],
  [/^de/i, 'ger'],
  [/^fr/i, 'fre'],
  [/^es/i, 'spa'],
  [/^pt/i, 'por'],
  [/^it/i, 'ita'],
  [/^th/i, 'tha'],
  [/^vi/i, 'vie'],
  [/^id/i, 'ind'],
  [/^ar/i, 'ara']
]

/** 嵌入视频时的语言代码和轨道名；AI 字幕单独标注，避免播放器里出现两条同名“中文” */
export function subtitleTrackMeta(t: Pick<SubtitleTrack, 'lan' | 'lan_doc'>): { language: string; title: string } {
  const language = ISO639.find(([re]) => re.test(t.lan))?.[1] ?? 'und'
  const ai = t.lan.startsWith('ai-')
  const title = ai && !/AI|自动/.test(t.lan_doc) ? `${t.lan_doc}（AI 生成）` : t.lan_doc
  return { language, title }
}

const escapeMeta = (s: string): string => s.replace(/([=;#\\\n])/g, '\\$1')

/** ffmpeg 的 FFMETADATA 章节文件 */
export function toFfmetadataChapters(points: ViewPoint[]): string {
  return [
    ';FFMETADATA1',
    ...points.flatMap((p) => [
      '[CHAPTER]',
      'TIMEBASE=1/1000',
      `START=${Math.round(p.from * 1000)}`,
      `END=${Math.round(p.to * 1000)}`,
      `title=${escapeMeta(p.content)}`
    ]),
    ''
  ].join('\n')
}
