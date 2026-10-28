import type { CodecPref, MediaItem, QualityOption } from '@shared/types'
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
  return formats
    .map((f) => ({
      qn: f.quality,
      label: f.new_description || f.display_desc || String(f.quality),
      needVip: f.need_vip ?? VIP_QN.has(f.quality),
      needLogin: f.need_login ?? false
    }))
    .sort((a, b) => b.qn - a.qn)
}

export interface Picked {
  video?: DashStream
  audio?: DashStream
  audioKind: 'aac' | 'eac3' | 'flac'
  qualityLabel: string
}

/** 按“不高于目标清晰度的最高档 + 编码偏好”选流 */
export function pickStreams(info: PlayInfo, qn: number, codec: CodecPref, audioOnly: boolean): Picked {
  const dash = info.dash
  if (!dash) throw new UnsupportedError('该视频只有旧版 FLV 格式，暂不支持')

  const audios = [...(dash.audio ?? [])].sort((a, b) => b.bandwidth - a.bandwidth)
  const flac = dash.flac?.audio ?? undefined
  const dolby = dash.dolby?.audio?.[0]

  if (audioOnly) {
    const audio = flac ?? audios[0]
    if (!audio) throw new UnsupportedError('该视频没有音轨')
    return { audio, audioKind: flac ? 'flac' : 'aac', qualityLabel: flac ? 'Hi-Res 无损' : '音频' }
  }

  const levels = [...new Set(dash.video.map((v) => v.id))].sort((a, b) => b - a)
  if (!levels.length) throw new UnsupportedError('没有可用的视频流')
  const target = levels.find((q) => q <= qn) ?? levels[levels.length - 1]
  const candidates = dash.video.filter((v) => v.id === target)
  const order: CodecPref[] = [codec, 'avc', 'hevc', 'av1']
  const video = order.map((c) => candidates.find((v) => codecOf(v) === c)).find(Boolean) ?? candidates[0]

  // 视频里优先用杜比（E-AC-3，QuickTime 能播），FLAC 放进 mp4 兼容性差，只在仅音频模式下使用
  const audio = dolby ?? audios[0]
  const label = qualitiesFromInfo(info).find((q) => q.qn === target)?.label ?? String(target)
  return {
    video,
    audio,
    audioKind: dolby ? 'eac3' : 'aac',
    qualityLabel: `${label} · ${(codecOf(video) ?? video.codecs).toUpperCase()}`
  }
}

export const isHevc = (s: DashStream): boolean => codecOf(s) === 'hevc'
export const isDolbyVision = (s: DashStream): boolean => /^dvh/.test(s.codecs)
