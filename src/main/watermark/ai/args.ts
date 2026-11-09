// AI 精修的 ffmpeg 参数：一个 ffmpeg 解码出原始帧交给我们改，另一个从管道读回改好的帧编码，
// 音频、字幕、封面、章节从原文件复制（和 delogo.ts 的 buildReplaceArgs 一样的规矩）
import { basename, extname } from 'node:path'
import { encoderArgs, type Encoder } from '../encoder'
import type { MediaProbe, ProbeColor } from '../probe'
import type { ColorSpec } from './pixels'

/** NTSC 系列的帧率 ffmpeg 只打印两位小数，换回精确的分数，否则 fps 滤镜会隔几分钟多出或丢掉一帧 */
const NTSC: [number, string][] = [
  [23.976, '24000/1001'],
  [29.97, '30000/1001'],
  [47.952, '48000/1001'],
  [59.94, '60000/1001'],
  [119.88, '120000/1001']
]

/** 帧率写成 ffmpeg 认的分数；不知道时按 30 */
export function fpsRational(fps: number | undefined): string {
  if (!fps || !Number.isFinite(fps) || fps <= 0) return '30'
  for (const [v, r] of NTSC) if (Math.abs(fps - v) < 0.011) return r
  if (Math.abs(fps - Math.round(fps)) < 0.01) return String(Math.round(fps))
  return `${Math.round(fps * 1000)}/1000`
}

/** 分数形式的帧率换成数值 */
export function rateValue(rate: string): number {
  const [a, b = '1'] = rate.split('/')
  return Number(a) / Number(b)
}

/**
 * 解码：只要主视频，统一成恒定帧率（可变帧率的源也能和音频对齐），宽高取偶数，8 bit 4:2:0 的原始帧写到 stdout。
 * 旋转过的视频 ffmpeg 解码时会自动转正，和界面、水印坐标一致
 */
export function buildDecodeArgs(input: string, videoIndex: number, rate: string): string[] {
  return [
    '-i',
    input,
    '-map',
    `0:${videoIndex}`,
    '-vf',
    `fps=${rate},crop=trunc(iw/2)*2:trunc(ih/2)*2:0:0,format=yuv420p`,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'yuv420p',
    'pipe:1'
  ]
}

/** setparams 认得的常见取值；不认识的值会让滤镜初始化失败、整个编码报错，宁可不写 */
const KNOWN = {
  colorspace: new Set(['bt709', 'smpte170m', 'bt470bg', 'bt2020nc', 'bt2020c', 'smpte240m', 'fcc', 'ycgco', 'gbr']),
  color_primaries: new Set(['bt709', 'smpte170m', 'bt470bg', 'bt470m', 'bt2020', 'smpte240m', 'film', 'smpte428', 'smpte431', 'smpte432']),
  color_trc: new Set(['bt709', 'smpte170m', 'bt470bg', 'bt470m', 'gamma22', 'gamma28', 'linear', 'iec61966-2-1', 'iec61966-2-4', 'bt2020-10', 'bt2020-12', 'smpte240m'])
}

/**
 * 原始帧没有色彩标记，编码前用 setparams 写回原视频的（写在帧上，各种编码器都会照着写进码流；
 * 只用编码器参数的话 VideoToolbox 会丢掉原色和传递函数）
 */
export function colorArgs(c: ProbeColor | undefined): string[] {
  if (!c) return []
  const p: string[] = []
  if (c.range) p.push(`range=${c.range}`)
  if (c.space && KNOWN.colorspace.has(c.space)) p.push(`colorspace=${c.space}`)
  if (c.primaries && KNOWN.color_primaries.has(c.primaries)) p.push(`color_primaries=${c.primaries}`)
  if (c.transfer && KNOWN.color_trc.has(c.transfer)) p.push(`color_trc=${c.transfer}`)
  return p.length ? ['-filter:v:0', `setparams=${p.join(':')}`] : []
}

/** 和原视频一致的 YUV↔RGB 换算方式；没有标记时按 ffmpeg 的惯例：高清用 BT.709，标清用 BT.601 */
export function colorSpec(c: ProbeColor | undefined, height: number): ColorSpec {
  const space = c?.space ?? ''
  const matrix = /^bt709$/.test(space) ? 'bt709' : /^(?:smpte170m|bt470bg|bt601)/.test(space) ? 'bt601' : height >= 720 ? 'bt709' : 'bt601'
  return { matrix, full: c?.range === 'pc' }
}

const MIME = new Map([
  ['png', 'image/png'],
  ['webp', 'image/webp']
])

/**
 * 编码：输入 0 是管道里的原始帧，输入 1 是原文件。只编码视频，音频、字幕、封面原样复制，章节和全局元数据保留。
 * MKV 的封面要事先导出（buildCoverExtractArgs），再作为附件挂回去
 */
export function buildEncodeArgs(o: {
  probe: MediaProbe
  input: string
  output: string
  width: number
  height: number
  rate: string
  enc: Encoder
  kbps: number
  format: 'mp4' | 'mkv'
  coverFile?: string
}): string[] {
  const { probe, format } = o
  const mp4 = format === 'mp4'
  const args = ['-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', `${o.width}x${o.height}`, '-r', o.rate, '-i', 'pipe:0', '-i', o.input]
  args.push('-map', '0:v:0', '-map', '1:a?', '-map', '1:s?')
  if (mp4 && probe.cover) args.push('-map', `1:${probe.cover.index}`)
  if (!mp4) args.push('-map', '1:t?')
  args.push('-c', 'copy', ...encoderArgs(o.enc, o.kbps), ...colorArgs(probe.video?.color))
  if (mp4 && probe.cover) args.push('-disposition:v:1', 'attached_pic')
  if (mp4 && o.enc.codec === 'hevc') args.push('-tag:v:0', 'hvc1')
  if (!mp4 && o.coverFile) {
    const n = probe.streams.filter((s) => s.type === 'attachment').length
    const name = probe.cover?.filename ?? basename(o.coverFile)
    const mime = probe.cover?.mimetype ?? MIME.get(extname(o.coverFile).slice(1).toLowerCase()) ?? 'image/jpeg'
    args.push('-attach', o.coverFile, `-metadata:s:t:${n}`, `mimetype=${mime}`, `-metadata:s:t:${n}`, `filename=${name}`)
  }
  args.push('-map_metadata', '1', '-map_chapters', '1', '-max_muxing_queue_size', '4096')
  args.push(...(mp4 ? ['-movflags', '+faststart', '-f', 'mp4'] : ['-f', 'matroska']), o.output)
  return args
}
