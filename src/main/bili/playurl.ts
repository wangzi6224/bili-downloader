import type { AudioPref, CodecPref, Container, MediaItem, OutputKind, QualityOption, StreamInfo } from '@shared/types'
import { api, BiliError, UnsupportedError } from './http'

export interface DashStream {
  id: number
  baseUrl?: string
  base_url?: string
  backupUrl?: string[] | null
  backup_url?: string[] | null
  bandwidth: number
  codecid?: number
  codecs: string
  width?: number
  height?: number
}

interface SupportFormat {
  quality: number
  new_description?: string
  display_desc?: string
  need_vip?: boolean
  need_login?: boolean
}

export interface PlayInfo {
  quality: number
  accept_quality?: number[]
  accept_description?: string[]
  support_formats?: SupportFormat[]
  dash?: {
    video: DashStream[]
    audio: DashStream[] | null
    dolby?: { audio?: DashStream[] | null } | null
    flac?: { audio?: DashStream | null } | null
  }
  durl?: unknown[]
  is_preview?: number
  is_drm?: boolean
  drm_type?: number
}

/** 需要大会员的清晰度（接口没给 need_vip 时兜底） */
const VIP_QN = new Set([112, 116, 120, 125, 126, 127])

const CODEC_BY_ID: Record<number, CodecPref> = { 7: 'avc', 12: 'hevc', 13: 'av1' }

function codecOf(s: DashStream): CodecPref | undefined {
  if (s.codecid && CODEC_BY_ID[s.codecid]) return CODEC_BY_ID[s.codecid]
  if (/^avc/.test(s.codecs)) return 'avc'
  if (/^(hev|hvc|dvh)/.test(s.codecs)) return 'hevc'
  if (/^av01/.test(s.codecs)) return 'av1'
  return undefined
}

export const streamUrls = (s: DashStream): string[] =>
  [s.baseUrl ?? s.base_url, ...(s.backupUrl ?? s.backup_url ?? [])].filter((u): u is string => Boolean(u))

const PARAMS = { fnval: 4048, fnver: 0, fourk: 1 }

export async function getPlayInfo(item: MediaItem, qn: number): Promise<PlayInfo> {
  if (item.kind === 'ugc') {
    return api<PlayInfo>(
      'https://api.bilibili.com/x/player/wbi/playurl',
      { bvid: item.bvid, cid: item.cid, qn, ...PARAMS },
      { wbi: true }
    )
  }
  if (item.kind === 'cheese') {
    let c: PlayInfo
    try {
      c = await api<PlayInfo>('https://api.bilibili.com/pugv/player/web/playurl', {
        avid: item.aid,
        cid: item.cid,
        ep_id: item.epId,
        qn,
        ...PARAMS
      })
    } catch (e) {
      if (e instanceof BiliError && e.code !== -1 && e.code !== 412 && e.code < 500) {
        throw new UnsupportedError(`没有这节课的观看权限（可能需要购买）：${e.message}`, e.code)
      }
      throw e
    }
    if (c.is_drm || c.drm_type) throw new UnsupportedError('这节课使用了 DRM 加密，不支持下载')
    if (c.is_preview === 1) throw new UnsupportedError('当前账号只能试看这节课（需要购买）')
    return c
  }
  if (item.kind === 'audio') throw new UnsupportedError('音频不走视频取流接口')
  let r: PlayInfo & { video_info?: PlayInfo; play_check?: { play_detail?: string } }
  try {
    r = await api('https://api.bilibili.com/pgc/player/web/v2/playurl', {
      ep_id: item.epId,
      cid: item.cid,
      qn,
      ...PARAMS
    })
  } catch (e) {
    if (e instanceof BiliError && (e.code === -10403 || e.code === 6002003)) {
      throw new UnsupportedError(e.message.includes('地区') ? `地区限制：${e.message}` : `需要大会员：${e.message}`, e.code)
    }
    throw e
  }
  const info: PlayInfo = r.video_info ?? r
  if (info.is_drm || info.drm_type || r.drm_type) throw new UnsupportedError('该内容使用了 DRM 加密，不支持下载')
  if (info.is_preview === 1 || r.play_check?.play_detail === 'PLAY_PREVIEW') {
    throw new UnsupportedError('当前账号只能试看该内容（需要大会员或购买）')
  }
  return info
}

export function qualitiesFromInfo(info: PlayInfo): QualityOption[] {
  const formats: SupportFormat[] =
    info.support_formats ??
    (info.accept_quality ?? []).map((q, i) => ({ quality: q, new_description: info.accept_description?.[i] }))
  const videos = info.dash?.video ?? []
  return formats
    .map((f) => ({
      qn: f.quality,
      label: f.new_description || f.display_desc || String(f.quality),
      needVip: f.need_vip ?? VIP_QN.has(f.quality),
      needLogin: f.need_login ?? false,
      codecs: [...new Set(videos.filter((v) => v.id === f.quality).map(codecOf))].filter(
        (c): c is CodecPref => Boolean(c)
      )
    }))
    .sort((a, b) => b.qn - a.qn)
}

/** dash 音轨的 id */
const AAC_ID: Record<string, number> = { '192k': 30280, '132k': 30232, '64k': 30216 }

export function streamInfoFromPlay(info: PlayInfo): StreamInfo {
  const dash = info.dash
  const aacIds = new Set((dash?.audio ?? []).map((a) => a.id))
  const flac = Boolean(dash?.flac?.audio)
  const dolby = Boolean(dash?.dolby?.audio?.length)
  return {
    qualities: qualitiesFromInfo(info),
    hasAudio: aacIds.size > 0 || flac || dolby,
    audios: [
      { id: 'best', label: '最佳', available: true },
      { id: 'flac', label: 'Hi-Res 无损', available: flac },
      { id: 'dolby', label: '杜比全景声', available: dolby },
      { id: '192k', label: '192K', available: aacIds.has(AAC_ID['192k']) },
      { id: '132k', label: '132K', available: aacIds.has(AAC_ID['132k']) },
      { id: '64k', label: '64K', available: aacIds.has(AAC_ID['64k']) }
    ]
  }
}

export interface Picked {
  video?: DashStream
  audio?: DashStream
  audioKind: 'aac' | 'eac3' | 'flac'
  qualityLabel: string
  /** 画质、编码文字，用于命名 */
  quality: string
  codec: string
  container: Container
  notes: string[]
}

export interface PickOptions {
  qn: number
  codecOrder: CodecPref[]
  audio: AudioPref
  output: OutputKind
  container: Container
}

/** 按音质偏好选音轨；拿不到指定档位时取不高于它的最高档 */
function pickAudio(dash: NonNullable<PlayInfo['dash']>, pref: AudioPref, output: OutputKind, container: Container) {
  const aac = [...(dash.audio ?? [])].sort((a, b) => b.bandwidth - a.bandwidth)
  const flac = dash.flac?.audio ?? undefined
  const dolby = dash.dolby?.audio?.[0]
  const asAac = (s?: DashStream) => (s ? { audio: s, kind: 'aac' as const } : undefined)
  if (pref === 'flac' && flac) return { audio: flac, kind: 'flac' as const }
  if (pref === 'dolby' && dolby) return { audio: dolby, kind: 'eac3' as const }
  if (pref in AAC_ID) {
    // 指定档位没有时依次降档：192K → 132K → 64K
    const ladder = [AAC_ID['192k'], AAC_ID['132k'], AAC_ID['64k']]
    const want = ladder
      .slice(ladder.indexOf(AAC_ID[pref]))
      .map((id) => dash.audio?.find((s) => s.id === id))
      .find(Boolean)
    return asAac(want ?? aac[0])
  }
  // best：仅音频优先无损；视频里 MKV 优先无损，MP4 优先杜比（QuickTime 能播）
  if (pref === 'best') {
    if (output === 'audio') return flac ? { audio: flac, kind: 'flac' as const } : asAac(aac[0])
    if (container === 'mkv' && flac) return { audio: flac, kind: 'flac' as const }
    if (dolby) return { audio: dolby, kind: 'eac3' as const }
  }
  return asAac(aac[0])
}

const CODEC_LABEL: Record<CodecPref, string> = { avc: 'AVC', hevc: 'HEVC', av1: 'AV1' }

/** 按“不高于目标清晰度的最高档 + 编码优先级 + 音质偏好”选流 */
export function pickStreams(info: PlayInfo, o: PickOptions): Picked {
  const dash = info.dash
  if (!dash) throw new UnsupportedError('该视频只有旧版 FLV 格式，暂不支持')
  const notes: string[] = []
  let container = o.container

  const a = o.output === 'video' ? undefined : pickAudio(dash, o.audio, o.output, container)
  if (o.output === 'audio') {
    if (!a) throw new UnsupportedError('该视频没有独立音轨')
    const label = a.kind === 'flac' ? 'Hi-Res 无损' : a.kind === 'eac3' ? '杜比全景声' : `音频 ${Math.round(a.audio.bandwidth / 1000)}K`
    return { audio: a.audio, audioKind: a.kind, qualityLabel: label, quality: label, codec: '', container, notes }
  }

  const levels = [...new Set(dash.video.map((v) => v.id))].sort((x, y) => y - x)
  if (!levels.length) throw new UnsupportedError('没有可用的视频流')
  const target = levels.find((q) => q <= o.qn) ?? levels[levels.length - 1]
  const candidates = dash.video.filter((v) => v.id === target)
  const video = o.codecOrder.map((c) => candidates.find((v) => codecOf(v) === c)).find(Boolean) ?? candidates[0]
  const codec = codecOf(video)
  if (codec && codec !== o.codecOrder[0]) {
    notes.push(`该清晰度没有 ${CODEC_LABEL[o.codecOrder[0]]}，已改用 ${CODEC_LABEL[codec]}`)
  }

  if (o.output === 'full' && !a) notes.push('该视频没有独立音轨')
  if (a?.kind === 'flac' && container === 'mp4') {
    container = 'mkv'
    notes.push('Hi-Res 无损音轨放进 MP4 兼容性差，已改用 MKV')
  }

  const quality = qualitiesFromInfo(info).find((q) => q.qn === target)?.label ?? String(target)
  const codecText = codec ? CODEC_LABEL[codec] : video.codecs
  return {
    video,
    audio: a?.audio,
    audioKind: a?.kind ?? 'aac',
    qualityLabel: `${quality} · ${codecText}${o.output === 'video' ? ' · 无声' : ''}`,
    quality,
    codec: codecText,
    container,
    notes
  }
}

export const isHevc = (s: DashStream): boolean => codecOf(s) === 'hevc'
export const isDolbyVision = (s: DashStream): boolean => /^dvh/.test(s.codecs)
