import { t } from '@shared/i18n'
import type { AudioPref, MediaItem, ParseResult, StreamInfo } from '@shared/types'
import { api, UnsupportedError } from './http'

// 音频区（au 单曲、am 歌单）

const BASE = 'https://www.bilibili.com/audio/music-service-c/web'

interface Song {
  id: number
  title: string
  cover: string
  uname?: string
  uid?: number
  duration?: number
  intro?: string
  passtime?: number
}

const songItem = (s: Song, index: number): MediaItem => ({
  key: `audio:${s.id}`,
  kind: 'audio',
  title: s.title,
  index,
  cid: s.id,
  cover: s.cover,
  duration: s.duration,
  // passtime 有时是毫秒
  pubdate: s.passtime ? (s.passtime > 1e11 ? Math.floor(s.passtime / 1000) : s.passtime) : undefined,
  desc: s.intro,
  owner: s.uname,
  ownerMid: s.uid
})

export async function parseAudio(sid: number): Promise<ParseResult> {
  const s = await api<Song>(`${BASE}/song/info`, { sid })
  const item = songItem(s, 1)
  return {
    kind: 'audio',
    title: s.title,
    cover: s.cover,
    owner: s.uname,
    meta: { owner: s.uname, ownerMid: s.uid, desc: s.intro, pubdate: item.pubdate, url: `https://www.bilibili.com/audio/au${sid}` },
    groups: [{ id: 'audio', title: s.title, items: [item] }],
    defaultSelected: [item.key]
  }
}

export async function parseAudioMenu(amid: number): Promise<ParseResult> {
  const [info, first] = await Promise.all([
    api<{ title: string; cover: string; intro?: string; uname?: string; uid?: number }>(`${BASE}/menu/info`, { sid: amid }),
    api<{ pageCount: number; totalSize: number; data: Song[] }>(`${BASE}/song/of-menu`, { sid: amid, pn: 1, ps: 100 })
  ])
  const songs = [...first.data]
  // 歌单一般不大，直接把剩余页取完
  for (let pn = 2; pn <= first.pageCount; pn++) {
    const d = await api<{ data: Song[] }>(`${BASE}/song/of-menu`, { sid: amid, pn, ps: 100 })
    songs.push(...d.data)
  }
  const items = songs.map((s, i) => songItem(s, i + 1))
  return {
    kind: 'audio',
    title: info.title,
    cover: info.cover,
    owner: info.uname,
    meta: { owner: info.uname, ownerMid: info.uid, desc: info.intro, url: `https://www.bilibili.com/audio/am${amid}` },
    groups: [{ id: 'menu', title: t('bili.groupAudioMenu'), items }],
    defaultSelected: items.map((i) => i.key)
  }
}

/** 接口的音质参数：0 128K，1 192K，2 320K，3 无损（需要大会员） */
const QUALITY_ORDER: Record<AudioPref, number[]> = {
  best: [3, 2, 1, 0],
  flac: [3, 2, 1, 0],
  dolby: [2, 1, 0],
  '192k': [1, 0],
  '132k': [0],
  '64k': [0]
}
/** 按接口的音质参数取：拼进下载分片的指纹和文件名模板的 {quality}，保持中文，不随界面语言变 */
const QUALITY_LABEL = ['128K', '192K', '320K', '无损']
const LOSSLESS = 3

export interface AudioStream {
  urls: string[]
  size: number
  /** 固定的中文标签，用在分片指纹和文件名里 */
  label: string
  /** 界面上显示的音质 */
  text: string
  flac: boolean
}

export async function getAudioStream(sid: number, pref: AudioPref): Promise<AudioStream> {
  let lastMessage = ''
  for (const quality of QUALITY_ORDER[pref]) {
    try {
      const d = await api<{ cdns: string[] | null; size: number; type: number }>(`${BASE}/url`, { sid, privilege: 2, quality })
      if (!d.cdns?.length) continue
      const flac = /\.flac(\?|$)/i.test(d.cdns[0])
      const q = QUALITY_LABEL[d.type] === undefined ? quality : d.type
      return { urls: d.cdns, size: d.size, label: QUALITY_LABEL[q], text: q === LOSSLESS ? t('bili.audioLossless') : QUALITY_LABEL[q], flac }
    } catch (e) {
      lastMessage = e instanceof Error ? e.message : String(e)
    }
  }
  throw new UnsupportedError(lastMessage ? t('bili.audioNoUrlReason', { reason: lastMessage }) : t('bili.audioNoUrl'))
}

/** 音频区可选的音质；标签按当前界面语言生成 */
export const audioStreamInfo = (): StreamInfo => ({
  qualities: [],
  hasAudio: true,
  audios: [
    { id: 'best', label: t('bili.audioBest'), available: true },
    { id: 'flac', label: t('bili.audioFlac'), available: true },
    { id: 'dolby', label: t('bili.audioDolby'), available: false },
    { id: '192k', label: '192K', available: true },
    { id: '132k', label: '132K', available: false },
    { id: '64k', label: '64K', available: true }
  ]
})
