import { FfmpegError } from '../download/errors'
import { ffmpegCapture } from './ffmpegJob'

export interface ProbeVideo {
  /** 输入里的全局流序号（Stream #0:4 → 4），给 -map 0:N 用 */
  index: number
  codec: string
  pixFmt?: string
  /** 显示方向的尺寸：旋转 ±90° 时已对调，和抽出来的帧、delogo 的坐标一致 */
  width: number
  height: number
  rotation: number
  /** kb/s */
  bitrate?: number
  fps?: number
  hdr: boolean
  dolbyVision: boolean
  /** 像素格式后面括号里的色彩信息，例如 (tv, bt709, progressive)；不知道的项为 undefined */
  color?: ProbeColor
}

export interface ProbeColor {
  range?: 'tv' | 'pc'
  space?: string
  primaries?: string
  transfer?: string
}

export interface ProbeCover {
  index: number
  codec: string
  mimetype?: string
  filename?: string
}

export interface ProbeStream {
  index: number
  type: 'video' | 'audio' | 'subtitle' | 'data' | 'attachment' | 'other'
  codec?: string
  attachedPic: boolean
}

export interface MediaProbe {
  /** 秒 */
  duration?: number
  /** 整个文件的码率，kb/s */
  bitrate?: number
  /** 第一条不是封面的视频流 */
  video?: ProbeVideo
  cover?: ProbeCover
  streams: ProbeStream[]
}

const TYPES: Record<string, ProbeStream['type']> = {
  Video: 'video',
  Audio: 'audio',
  Subtitle: 'subtitle',
  Data: 'data',
  Attachment: 'attachment'
}

/** 按顶层逗号切开流描述：括号、方括号里的逗号（色彩信息、SAR）不算 */
function splitTop(s: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  parts.push(cur.trim())
  return parts
}

const meta = (block: string, key: string): string | undefined =>
  new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`, 'im').exec(block)?.[1]

/** 不是色彩信息的括号项：扫描方式、场序 */
const NOT_COLOR = /^(?:progressive|interlaced|top first|bottom first|top coded first \(swapped\)|bottom coded first \(swapped\))$/

/**
 * 解析像素格式括号里的色彩信息：(tv, bt709, progressive) 三项相同时只写一次，
 * 不同时写成 色彩空间/原色/传递函数，例如 bt2020nc/bt2020/smpte2084
 */
export function parseColor(pixPart: string | undefined): ProbeColor | undefined {
  const inner = pixPart && /\((.*)\)/.exec(pixPart)?.[1]
  if (!inner) return undefined
  const c: ProbeColor = {}
  for (const tok of inner.split(',').map((s) => s.trim())) {
    if (tok === 'tv' || tok === 'pc') c.range = tok
    else if (tok && !NOT_COLOR.test(tok) && !c.space) {
      const [space, primaries = space, transfer = primaries] = tok.split('/')
      const known = (v: string): string | undefined => (v && v !== 'unknown' && v !== 'reserved' ? v : undefined)
      c.space = known(space)
      c.primaries = known(primaries)
      c.transfer = known(transfer)
    }
  }
  return c.range || c.space || c.primaries || c.transfer ? c : undefined
}

/** 宽高要从切好的段里找，直接在整行里匹配会把 0x31637661 这样的 fourcc 当成尺寸 */
const DIMS = /^(\d{2,5})x(\d{2,5})(?:\s|$)/

function parseVideo(index: number, desc: string, block: string): ProbeVideo | undefined {
  const parts = splitTop(desc)
  const dims = parts.map((p) => DIMS.exec(p)).find(Boolean)
  if (!dims) return undefined
  const codec = /^([\w-]+)/.exec(parts[0])?.[1] ?? 'unknown'
  // 第二段一般是像素格式，例如 yuv420p10le(tv, bt2020nc/bt2020/smpte2084, progressive)
  const pixPart = parts[1] && !DIMS.test(parts[1]) ? parts[1] : undefined
  const pixFmt = pixPart ? /^([a-z0-9_]+)/.exec(pixPart)?.[1] : undefined
  const rotation = Number(/rotation of (-?[\d.]+) degrees/i.exec(block)?.[1] ?? 0)
  const swap = Math.abs(Math.round(rotation)) % 180 === 90
  const w = Number(dims[1])
  const h = Number(dims[2])
  const bitrate = parts.map((p) => /^(\d+) kb\/s$/.exec(p)?.[1]).find(Boolean)
  const fps = parts.map((p) => /^([\d.]+) fps$/.exec(p)?.[1]).find(Boolean)
  return {
    index,
    codec,
    pixFmt,
    width: swap ? h : w,
    height: swap ? w : h,
    rotation,
    bitrate: bitrate ? Number(bitrate) : undefined,
    fps: fps ? Number(fps) : undefined,
    // 10/12 bit 或 PQ、HLG 传递函数：delogo 只能处理 8 bit，处理后 HDR 就没了
    hdr: /(?:10|12)(?:le|be)$|^p010/.test(pixFmt ?? '') || /smpte2084|arib-std-b67/.test(pixPart ?? ''),
    dolbyVision: /DOVI configuration|Dolby Vision/i.test(block) || /\b(?:dvh1|dvhe|dav1|dva1|dvav)\b/.test(desc),
    color: parseColor(pixPart)
  }
}

/** 解析 `ffmpeg -i 文件` 打在 stderr 里的信息；不是媒体文件（没有 Input #0）返回 null */
export function parseProbe(stderr: string): MediaProbe | null {
  const lines = stderr.split(/\r?\n/)
  const start = lines.findIndex((l) => /^Input #0\b/.test(l))
  if (start < 0) return null
  const end = lines.findIndex((l, i) => i > start && /^(?:Input #\d|Output #\d)/.test(l))
  const body = lines.slice(start, end < 0 ? undefined : end)

  const probe: MediaProbe = { streams: [] }
  const head = body.find((l) => /^\s*Duration: /.test(l)) ?? ''
  const dur = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(head)
  if (dur) probe.duration = Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3])
  const br = /bitrate: (\d+) kb\/s/.exec(head)
  if (br) probe.bitrate = Number(br[1])

  const STREAM = /^(\s*)Stream #0:(\d+)(?:\[[^\]]*\])?(?:\([^)]*\))?: (\w+)(?:: (.*))?$/
  for (let i = 0; i < body.length; i++) {
    const m = STREAM.exec(body[i])
    if (!m) continue
    // 流下面缩进更深的几行是它的元数据和附加信息（文件名、旋转、杜比视界）
    const indent = m[1].length
    const sub: string[] = []
    for (let j = i + 1; j < body.length; j++) {
      const l = body[j]
      if (!l.trim() || l.length - l.trimStart().length <= indent) break
      sub.push(l)
    }
    const block = sub.join('\n')
    const index = Number(m[2])
    const desc = m[4] ?? ''
    const type = TYPES[m[3]] ?? 'other'
    const attachedPic = desc.includes('(attached pic)')
    const codec = /^([\w-]+)/.exec(desc)?.[1]
    probe.streams.push({ index, type, codec, attachedPic })
    if (type !== 'video') continue
    if (attachedPic) {
      probe.cover ??= { index, codec: codec ?? '', mimetype: meta(block, 'mimetype'), filename: meta(block, 'filename') }
    } else if (!probe.video) {
      probe.video = parseVideo(index, desc, block)
    }
  }
  return probe
}

/** 读媒体信息：ffmpeg 没有输出文件时退出码是 1，属正常，能解析出 Input #0 就行 */
export async function probeMedia(path: string, signal?: AbortSignal): Promise<MediaProbe> {
  const r = await ffmpegCapture(['-i', path], { signal, loglevel: 'info' })
  const p = parseProbe(r.stderr)
  if (p) return p
  const reason = /no such file or directory/i.test(r.stderr) ? '：文件不存在' : ''
  throw new FfmpegError(`无法读取视频信息${reason}`, r.stderr)
}
