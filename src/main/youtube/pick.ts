// 从 yt-dlp 给出的格式里挑要下载的视频流和音频流：取不高于目标的最高画质，同一画质按编码偏好挑，音频优先原声
import { t } from '@shared/i18n'
import { DEFAULT_YT_OPTIONS } from '@shared/options'
import type { AudioOption, DownloadOptions, QualityOption, StreamInfo, YtAudioPref, YtCodec, YtOptions } from '@shared/types'
import { UnsupportedError } from '../bili/http'
import type { OutFormat } from '../download/mux'
import type { YtFormat, YtVideoInfo } from './types'

export const codecOf = (vcodec: string | null | undefined): YtCodec | undefined => {
  if (!vcodec || vcodec === 'none') return undefined
  if (/^(avc|h264)/i.test(vcodec)) return 'avc'
  if (/^vp0?9/i.test(vcodec)) return 'vp9'
  if (/^av01/i.test(vcodec)) return 'av1'
  return undefined
}

const audioCodecOf = (acodec: string | null | undefined): 'aac' | 'opus' | undefined => {
  if (!acodec || acodec === 'none') return undefined
  if (/^mp4a/i.test(acodec)) return 'aac'
  if (/^opus/i.test(acodec)) return 'opus'
  return undefined
}

const CODEC_TEXT: Record<YtCodec, string> = { avc: 'AVC', vp9: 'VP9', av1: 'AV1' }

const isHdr = (f: YtFormat): boolean => Boolean(f.dynamic_range && f.dynamic_range !== 'SDR')
const size = (f: YtFormat): number => f.filesize ?? f.filesize_approx ?? 0
const bitrate = (f: YtFormat): number => f.tbr ?? f.vbr ?? f.abr ?? 0
/** HLS 也能下，但比直接的 https 慢，只在没有别的时用 */
const protoRank = (f: YtFormat): number => (f.protocol === 'https' || !f.protocol ? 1 : 0)

/** 只有画面的流（不带声音）；没有时退回带声音的整合流 */
export function videoFormats(info: Pick<YtVideoInfo, 'formats'>): YtFormat[] {
  const all = (info.formats ?? []).filter((f) => !f.has_drm && f.protocol !== 'mhtml' && codecOf(f.vcodec) && (f.height ?? 0) > 0)
  const only = all.filter((f) => !f.acodec || f.acodec === 'none')
  return only.length ? only : all
}

export function audioFormats(info: Pick<YtVideoInfo, 'formats'>): YtFormat[] {
  return (info.formats ?? []).filter((f) => !f.has_drm && f.protocol !== 'mhtml' && audioCodecOf(f.acodec) && (!f.vcodec || f.vcodec === 'none'))
}

/** 画质标签：1080p60 HDR · VP9 */
export function qualityText(f: YtFormat, withCodec = true): string {
  const fps = (f.fps ?? 0) > 30 ? Math.round(f.fps!) : ''
  const hdr = isHdr(f) ? ' HDR' : ''
  const codec = codecOf(f.vcodec)
  return `${f.height}p${fps}${hdr}${withCodec && codec ? ` · ${CODEC_TEXT[codec]}` : ''}`
}

/** 原声音轨排前面（多语言配音的视频里，yt-dlp 给原声的 language_preference 最高，format_note 里带 original） */
const originalRank = (f: YtFormat): number =>
  (f.language_preference ?? 0) + (/original/i.test(f.format_note ?? '') ? 100 : 0) - (/-drc$/.test(f.format_id) ? 1000 : 0)

export function pickAudio(info: Pick<YtVideoInfo, 'formats'>, pref: YtAudioPref): YtFormat | undefined {
  const list = audioFormats(info)
  if (!list.length) return undefined
  const best = (xs: YtFormat[]): YtFormat =>
    [...xs].sort((a, b) => originalRank(b) - originalRank(a) || protoRank(b) - protoRank(a) || bitrate(b) - bitrate(a))[0]
  const wanted = pref === 'best' ? [] : list.filter((f) => audioCodecOf(f.acodec) === pref)
  return best(wanted.length ? wanted : list)
}

export interface YtPick {
  video?: YtFormat
  audio?: YtFormat
  /** 声音在视频流里（整合流），合并时要一起带走 */
  muxed?: boolean
  format: OutFormat
  qualityLabel: string
  /** 命名模板的 {quality} */
  quality: string
  codec: string
  height?: number
  notes: string[]
  /** 交给 yt-dlp -f 的格式：视频和音频分开下 */
  spec: string
}

/**
 * qn 是最大高度，0 表示最高。output 为 audio 时只要音频，video 时只要画面。
 * locked 是上次选定的 format_id（续传）；都还在就沿用
 */
export function pickYtFormats(info: YtVideoInfo, o: Pick<DownloadOptions, 'qn' | 'output' | 'yt'>, locked?: string): YtPick {
  const yt: YtOptions = { ...DEFAULT_YT_OPTIONS, ...o.yt }
  const notes: string[] = []
  const byId = new Map((info.formats ?? []).map((f) => [f.format_id, f]))
  const lockedParts = locked?.split(',').map((id) => byId.get(id))
  const relocked = lockedParts?.length && lockedParts.every(Boolean) ? (lockedParts as YtFormat[]) : undefined

  let video: YtFormat | undefined
  let audio: YtFormat | undefined
  if (relocked) {
    video = relocked.find((f) => codecOf(f.vcodec))
    audio = relocked.find((f) => audioCodecOf(f.acodec) && f !== video)
  } else {
    if (o.output !== 'audio') video = pickVideo(info, o.qn, yt, notes)
    // 带声音的整合流不用再配音频
    if (o.output !== 'video' && !(video && audioCodecOf(video.acodec))) audio = pickAudio(info, yt.audio)
  }
  // 只要音频时不会选视频，只有整合流的视频要先报“没有单独的音轨”，否则会被当成“没有可下载的格式”
  if (o.output === 'audio' && !audio && (video || videoFormats(info).length)) throw new UnsupportedError(t('yt.noAudio'))
  if (!video && !audio) throw new UnsupportedError(t('yt.noFormats'))

  let format: OutFormat
  if (!video) {
    format = audioCodecOf(audio!.acodec) === 'opus' ? 'opus' : 'm4a'
  } else {
    format = yt.container
    // WebM 只能装 VP9 / AV1 和 Opus
    const vc = codecOf(video.vcodec)
    const ac = audio ? audioCodecOf(audio.acodec) : audioCodecOf(video.acodec)
    if (format === 'webm' && (vc === 'avc' || ac === 'aac')) {
      format = 'mkv'
      notes.push(t('yt.noteWebmToMkv'))
    }
  }
  const codec = video ? CODEC_TEXT[codecOf(video.vcodec)!] : ''
  const audioText = audio ? `${audioCodecOf(audio.acodec)!.toUpperCase()} ${Math.round(audio.abr ?? 0) || ''}`.trim() : ''
  return {
    video,
    audio,
    // 编码认不出（甚至没写）的整合流也算：合并时声音是可选映射，没有也不报错
    muxed: o.output !== 'video' && video && !audio && video.acodec !== 'none' ? true : undefined,
    format,
    qualityLabel: video ? qualityText(video) : t('yt.audioOnlyLabel', { label: audioText }),
    quality: video ? `${video.height}p` : audioText,
    codec,
    height: video?.height ?? undefined,
    notes,
    spec: [video, audio].filter(Boolean).map((f) => f!.format_id).join(',')
  }
}

function pickVideo(info: YtVideoInfo, qn: number, yt: YtOptions, notes: string[]): YtFormat | undefined {
  const list = videoFormats(info)
  if (!list.length) return undefined
  const heights = [...new Set(list.map((f) => f.height!))].sort((a, b) => b - a)
  const height = qn > 0 ? (heights.find((h) => h <= qn) ?? heights.at(-1)!) : heights[0]
  if (qn > 0 && height < qn && height === heights[0]) notes.push(t('yt.noteLowerQuality', { want: `${qn}p`, got: `${height}p` }))
  const same = list.filter((f) => f.height === height)
  const hdrOk = same.some(isHdr) && yt.hdr
  const pool = same.filter((f) => isHdr(f) === hdrOk)
  const maxFps = Math.max(...pool.map((f) => f.fps ?? 0))
  const fast = pool.filter((f) => (f.fps ?? 0) === maxFps)
  const codecRank = (f: YtFormat): number => {
    const i = yt.codecOrder.indexOf(codecOf(f.vcodec)!)
    return i < 0 ? 99 : i
  }
  const picked = [...fast].sort((a, b) => codecRank(a) - codecRank(b) || protoRank(b) - protoRank(a) || bitrate(b) - bitrate(a))[0]
  if (codecOf(picked.vcodec) !== yt.codecOrder[0]) {
    notes.push(t('yt.noteCodecFallback', { want: CODEC_TEXT[yt.codecOrder[0]], got: CODEC_TEXT[codecOf(picked.vcodec)!], quality: `${height}p` }))
  }
  return picked
}

/** 选集弹窗里的画质、音频、字幕选项 */
export function ytStreamInfo(info: YtVideoInfo): StreamInfo {
  const vids = videoFormats(info)
  const heights = [...new Set(vids.map((f) => f.height!))].sort((a, b) => b - a)
  const qualities: QualityOption[] = heights.map((h) => {
    const same = vids.filter((f) => f.height === h)
    const top = [...same].sort((a, b) => (b.fps ?? 0) - (a.fps ?? 0) || Number(isHdr(b)) - Number(isHdr(a)))[0]
    return {
      qn: h,
      label: qualityText(top, false),
      needVip: false,
      needLogin: false,
      codecs: [...new Set(same.map((f) => codecOf(f.vcodec)!))]
    }
  })
  const auds = audioFormats(info)
  const has = (c: 'aac' | 'opus'): boolean => auds.some((f) => audioCodecOf(f.acodec) === c)
  const audios: AudioOption[] = []
  const subs = Object.entries(info.subtitles ?? {}).filter(([lang]) => lang !== 'live_chat')
  const original = Object.keys(info.automatic_captions ?? {}).find((l) => l.endsWith('-orig'))
  return {
    qualities,
    audios,
    hasAudio: auds.length > 0,
    yt: {
      audios: [
        { id: 'best', label: t('yt.audioBest'), available: auds.length > 0 },
        { id: 'opus', label: 'Opus', available: has('opus') },
        { id: 'aac', label: 'AAC', available: has('aac') }
      ],
      hdr: vids.some(isHdr),
      subtitles: subs.map(([lang, list]) => ({ lang, name: list[0]?.name ?? lang, auto: false })),
      autoLang: original?.replace(/-orig$/, '') ?? (info.language || undefined),
      chapters: info.chapters?.length ?? 0,
      size: Object.fromEntries(heights.map((h) => [h, Math.max(...vids.filter((f) => f.height === h).map(size))]))
    }
  }
}
