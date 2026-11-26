// 从作品数据里挑要下载的文件（纯函数）。画质按画面短边算：竖屏的 1080×1920 也是 1080P
import { t } from '@shared/i18n'
import { DEFAULT_DY_OPTIONS, DY_ORIGINAL_QN } from '@shared/options'
import type { CodecPref, DownloadOptions, QualityOption, StreamInfo } from '@shared/types'
import type { DirectPart } from '../download/drivers/direct'
import type { OutFormat } from '../download/mux'
import { DyUnavailableError } from './errors'
import { imageUrl } from './resolve'
import type { DyAweme, DyBitRate, DyUrlList, DyVideo } from './types'

export interface DyAvPick {
  type: 'av'
  parts: DirectPart[]
  /** 各部分在成品里的角色：parts 里的下标 */
  video?: number
  audio?: number
  /** 声音在视频文件里 */
  muxed?: boolean
  format: OutFormat
  qualityLabel: string
  /** 命名模板的 {quality} */
  quality: string
  codec: string
  height?: number
  hevc: boolean
  notes: string[]
  /** 锁定的画质档，继续下载时沿用 */
  spec: string
}

export interface DyFilesPick {
  type: 'files'
  /** name 同时是成品目录里的文件名 */
  parts: DirectPart[]
  qualityLabel: string
  quality: string
  notes: string[]
  spec: string
}

export type DyPick = DyAvPick | DyFilesPick

type Options = Pick<DownloadOptions, 'qn' | 'output' | 'codecOrder' | 'container' | 'dy'>

const shortSide = (a?: DyUrlList): number => Math.min(a?.width ?? 0, a?.height ?? 0)
const urlsOf = (a?: DyUrlList): string[] => (a?.url_list ?? []).filter(Boolean)
const codecOf = (b: DyBitRate): CodecPref => (b.is_h265 ? 'hevc' : 'avc')
const isHdr = (b: DyBitRate): boolean => Boolean(b.HDR_type && b.HDR_type !== '0')
const CODEC_TEXT: Record<CodecPref, string> = { avc: 'AVC', hevc: 'HEVC', av1: 'AV1' }
/** 估不出大小的文件先按这个算进度 */
const IMAGE_ESTIMATE = 300 * 1024

const formatOf = (b: DyBitRate): 'mp4' | 'dash' => (b.format === 'dash' ? 'dash' : 'mp4')

/** 有地址的画质档；mp4 是带声音的整合文件，dash 是纯画面 */
function rates(video: DyVideo | undefined, format: 'mp4' | 'dash'): DyBitRate[] {
  return (video?.bit_rate ?? []).filter((b) => formatOf(b) === format && urlsOf(b.play_addr).length)
}

/** 码率最高的单独音轨 */
function audioTrack(video: DyVideo | undefined): { part: DirectPart } | undefined {
  const list = (video?.bit_rate_audio ?? [])
    .map((a) => a.audio_meta)
    .map((m) => ({ meta: m, urls: [m?.url_list?.main_url, m?.url_list?.backup_url, m?.url_list?.fallback_url].filter((u): u is string => Boolean(u)) }))
    .filter((x) => x.urls.length)
    .sort((a, b) => (b.meta!.bitrate ?? 0) - (a.meta!.bitrate ?? 0))
  const best = list[0]
  if (!best) return undefined
  const size = best.meta!.size ?? 0
  return { part: { name: 'audio.m4a', urls: best.urls, fingerprint: `dy-a-${best.meta!.file_hash ?? best.meta!.bitrate}-${size}`, estimate: size } }
}

const videoPart = (b: DyBitRate): DirectPart => ({
  name: 'video.mp4',
  urls: urlsOf(b.play_addr),
  fingerprint: `dy-v-${b.play_addr?.uri}-${b.gear_name}-${b.format}-${b.play_addr?.data_size}`,
  estimate: b.play_addr?.data_size ?? 0
})

/** 分享页兜底和没有画质列表的旧作品：只有一个播放地址 */
function plainPart(video: DyVideo): DirectPart | undefined {
  const urls = urlsOf(video.play_addr)
  if (!urls.length) return undefined
  return { name: 'video.mp4', urls, fingerprint: `dy-p-${video.play_addr?.uri}-${video.play_addr?.data_size ?? 0}`, estimate: video.play_addr?.data_size ?? 0 }
}

/** 原画：按上传源文件的播放接口取 */
function originalPart(uri: string): DirectPart {
  const url = `https://www.douyin.com/aweme/v1/play/?video_id=${encodeURIComponent(uri)}&ratio=default&line=0`
  return { name: 'video.mp4', urls: [url], fingerprint: `dy-o-${uri}`, estimate: 0 }
}

const lockOf = (b: DyBitRate): string => `${b.gear_name}|${formatOf(b)}`

function label(b: DyBitRate): string {
  const fps = (b.FPS ?? 0) > 30 ? Math.round(b.FPS!) : ''
  return `${shortSide(b.play_addr)}p${fps}${isHdr(b) ? ' HDR' : ''}`
}

function choose(pool: DyBitRate[], o: Options, notes: string[]): DyBitRate {
  const sides = [...new Set(pool.map((b) => shortSide(b.play_addr)))].sort((a, b) => b - a)
  const side = o.qn > 0 && o.qn < DY_ORIGINAL_QN ? (sides.find((s) => s <= o.qn) ?? sides.at(-1)!) : sides[0]
  if (o.qn > 0 && o.qn < DY_ORIGINAL_QN && side < o.qn && side === sides[0]) {
    notes.push(t('dy.noteLowerQuality', { want: `${o.qn}p`, got: `${side}p` }))
  }
  const level = pool.filter((b) => shortSide(b.play_addr) === side)
  // 这一档有纯画面就用它（配单独音轨），没有才用整合文件
  const dash = level.filter((b) => formatOf(b) === 'dash')
  const same = dash.length ? dash : level
  const hdr = Boolean(o.dy?.hdr) && same.some(isHdr)
  const ranged = same.filter((b) => isHdr(b) === hdr)
  const candidates = ranged.length ? ranged : same
  const rank = (b: DyBitRate): number => {
    const i = o.codecOrder.indexOf(codecOf(b))
    return i < 0 ? 99 : i
  }
  const picked = [...candidates].sort((a, b) => rank(a) - rank(b) || (b.FPS ?? 0) - (a.FPS ?? 0) || (b.bit_rate ?? 0) - (a.bit_rate ?? 0))[0]
  const wanted = o.codecOrder.find((c) => c !== 'av1')
  if (wanted && codecOf(picked) !== wanted) {
    notes.push(t('dy.noteCodecFallback', { quality: `${side}p`, want: CODEC_TEXT[wanted], got: CODEC_TEXT[codecOf(picked)] }))
  }
  return picked
}

function pickAudioOnly(video: DyVideo): DyAvPick {
  const track = audioTrack(video)
  // 没有单独音轨时下最小的整合文件，合并时只取声音
  const smallest = [...rates(video, 'mp4')].sort((a, b) => (a.play_addr?.data_size ?? 0) - (b.play_addr?.data_size ?? 0))[0]
  const part = track?.part ?? (smallest ? videoPart(smallest) : plainPart(video))
  if (!part) throw new DyUnavailableError(t('dy.noStream'))
  return {
    type: 'av',
    parts: [part],
    audio: 0,
    format: 'm4a',
    qualityLabel: t('dy.audioOnly'),
    quality: 'M4A',
    codec: '',
    hevc: false,
    notes: [],
    spec: 'audio'
  }
}

function pickVideo(a: DyAweme, o: Options, locked?: string): DyAvPick {
  const video = a.video
  if (!video) throw new DyUnavailableError(t('dy.noStream'))
  if (o.output === 'audio') return pickAudioOnly(video)
  const wantAudio = o.output !== 'video'
  const notes: string[] = a.fromShare ? [t('dy.noteShare')] : []
  const format: OutFormat = o.container
  const uri = video.play_addr?.uri

  if (o.qn >= DY_ORIGINAL_QN && uri && !a.fromShare) {
    return {
      type: 'av',
      parts: [originalPart(uri)],
      video: 0,
      muxed: wantAudio || undefined,
      format,
      qualityLabel: t('dy.original'),
      quality: t('dy.original'),
      codec: '',
      hevc: false,
      notes,
      spec: 'original'
    }
  }

  const track = audioTrack(video)
  // 有单独音轨（长视频）时优先“纯画面 + 音轨”：整合文件里的声音码率低很多
  const pool = [...rates(video, 'mp4'), ...(track ? rates(video, 'dash') : [])]
  if (!pool.length) {
    const part = plainPart(video)
    if (!part) throw new DyUnavailableError(t('dy.noStream'))
    const side = shortSide(video.play_addr) || Math.min(video.width ?? 0, video.height ?? 0)
    return {
      type: 'av',
      parts: [part],
      video: 0,
      muxed: wantAudio || undefined,
      format,
      qualityLabel: side ? `${side}p` : 'MP4',
      quality: side ? `${side}p` : '',
      codec: '',
      height: side || undefined,
      hevc: false,
      notes,
      spec: 'plain'
    }
  }
  const again = locked ? pool.find((b) => lockOf(b) === locked) : undefined
  const picked = again ?? choose(pool, o, notes)
  const split = formatOf(picked) === 'dash'
  const side = shortSide(picked.play_addr)
  const codec = CODEC_TEXT[codecOf(picked)]
  return {
    type: 'av',
    parts: [videoPart(picked), ...(split && wantAudio ? [track!.part] : [])],
    video: 0,
    audio: split && wantAudio ? 1 : undefined,
    muxed: !split && wantAudio ? true : undefined,
    format,
    qualityLabel: `${label(picked)} · ${codec}`,
    quality: `${side}p`,
    codec,
    height: side,
    hevc: codecOf(picked) === 'hevc',
    notes,
    spec: lockOf(picked)
  }
}

const imageExt = (url: string): string => {
  const ext = url.split('?')[0].match(/\.(jpe?g|png|webp|heic)$/i)?.[1]?.toLowerCase()
  return ext === 'jpeg' || ext === 'jpg' ? '.jpg' : ext ? `.${ext}` : '.webp'
}

/** 实况图的短视频：最清晰的整合文件 */
function livePart(video: DyVideo, name: string): DirectPart | undefined {
  const best = [...rates(video, 'mp4')].sort((a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0))[0]
  const part = best ? videoPart(best) : plainPart(video)
  return part && { ...part, name }
}

function pickImages(a: DyAweme, o: Options): DyFilesPick {
  const dy = { ...DEFAULT_DY_OPTIONS, ...o.dy }
  const images = a.images!
  const width = Math.max(2, String(images.length).length)
  const parts: DirectPart[] = []
  const notes: string[] = []
  let live = 0
  if (o.output !== 'audio') {
    images.forEach((image, i) => {
      const number = String(i + 1).padStart(width, '0')
      const url = imageUrl(image)
      if (url) {
        // 备用地址只用同一种格式的，免得扩展名和内容对不上
        const urls = [url, ...urlsOf(image).filter((u) => u !== url && imageExt(u) === imageExt(url))]
        parts.push({ name: `${number}${imageExt(url)}`, urls, fingerprint: `dy-i-${a.aweme_id}-${i}`, estimate: IMAGE_ESTIMATE })
      }
      const clip = dy.live && image.video ? livePart(image.video, `${number}.mp4`) : undefined
      if (clip) {
        parts.push(clip)
        live++
      }
    })
  }
  const wantMusic = o.output === 'audio' || (o.output !== 'video' && dy.music)
  if (wantMusic) {
    const urls = urlsOf(a.music?.play_url)
    if (urls.length) {
      const ext = /\.m4a(\?|$)/i.test(urls[0]) ? '.m4a' : '.mp3'
      parts.push({ name: `music${ext}`, urls, fingerprint: `dy-m-${a.music?.play_url?.uri ?? a.aweme_id}`, estimate: IMAGE_ESTIMATE * 4 })
    } else if (o.output !== 'audio') notes.push(t('dy.noteNoMusic'))
  }
  if (!parts.length) throw new DyUnavailableError(t('dy.noStream'))
  return {
    type: 'files',
    parts,
    qualityLabel: t(live ? 'dy.liveLabel' : 'dy.imagesLabel', { count: images.length }),
    quality: '',
    notes,
    spec: 'images'
  }
}

/** locked 是上次选定的画质档（续传）；还在就沿用 */
export function pickDouyin(a: DyAweme, o: Options, locked?: string): DyPick {
  return a.images?.length ? pickImages(a, o) : pickVideo(a, o, locked)
}

/** 选集弹窗里的画质选项：各清晰度，外加原画 */
export function dyStreamInfo(a: DyAweme): StreamInfo {
  const video = a.images?.length ? undefined : a.video
  const list = [...rates(video, 'mp4'), ...(audioTrack(video) ? rates(video, 'dash') : [])]
  const sides = [...new Set(list.map((b) => shortSide(b.play_addr)).filter(Boolean))].sort((x, y) => y - x)
  const qualities: QualityOption[] = sides.map((side) => {
    const same = list.filter((b) => shortSide(b.play_addr) === side)
    return { qn: side, label: `${side}p${same.some(isHdr) ? ' HDR' : ''}`, needVip: false, needLogin: false, codecs: [...new Set(same.map(codecOf))] }
  })
  if (video?.play_addr?.uri && !a.fromShare) {
    qualities.push({ qn: DY_ORIGINAL_QN, label: t('dy.original'), needVip: false, needLogin: false, codecs: [] })
  }
  return { qualities, audios: [], hasAudio: Boolean(video) }
}
