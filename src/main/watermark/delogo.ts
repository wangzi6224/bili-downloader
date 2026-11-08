import { basename, extname } from 'node:path'
import type { WatermarkRegion } from '@shared/types'
import { delogoFilter } from '@shared/watermark'
import { encoderArgs, type Encoder } from './encoder'
import type { MediaProbe, ProbeCover } from './probe'

/** MP4 里的 HEVC 要标成 hvc1，QuickTime 和苹果设备才认 */
const hvc1 = (enc: Encoder): string[] => (enc.codec === 'hevc' ? ['-tag:v:0', 'hvc1'] : [])

/**
 * 下载流程里用：只转码下载下来的视频流（video.m4s），之后照常交给 mux() 合并音频、封面、字幕。
 * 输出文件扩展名不是 .mp4（.part），必须写明 -f mp4
 */
export function buildVideoOnlyArgs(o: {
  input: string
  output: string
  region: WatermarkRegion
  enc: Encoder
  kbps: number
}): string[] {
  return [
    '-i',
    o.input,
    '-map',
    '0:v:0',
    '-filter:v:0',
    delogoFilter(o.region),
    ...encoderArgs(o.enc, o.kbps),
    ...hvc1(o.enc),
    '-map_metadata',
    '-1',
    '-f',
    'mp4',
    o.output
  ]
}

const MIME = new Map([
  ['png', 'image/png'],
  ['webp', 'image/webp']
])

/**
 * 替换已完成文件里的视频流：只转码主视频，音频、字幕、封面原样复制，章节和全局元数据保留。
 * 不能用 -map 0：MP4 会多出章节的数据轨，MKV 的封面会变成一条真正的视频轨。
 * MKV 的封面要事先导出（buildCoverExtractArgs），再作为附件挂回去
 */
export function buildReplaceArgs(o: {
  probe: MediaProbe
  input: string
  output: string
  region: WatermarkRegion
  enc: Encoder
  kbps: number
  format: 'mp4' | 'mkv'
  coverFile?: string
}): string[] {
  const { probe, format } = o
  if (!probe.video) throw new Error('文件里没有视频画面')
  const mp4 = format === 'mp4'
  const args = ['-i', o.input, '-map', `0:${probe.video.index}`, '-map', '0:a?', '-map', '0:s?']
  if (mp4 && probe.cover) args.push('-map', `0:${probe.cover.index}`)
  if (!mp4) args.push('-map', '0:t?')
  args.push('-c', 'copy', ...encoderArgs(o.enc, o.kbps), '-filter:v:0', delogoFilter(o.region))
  if (mp4 && probe.cover) args.push('-disposition:v:1', 'attached_pic')
  if (mp4) args.push(...hvc1(o.enc))
  if (!mp4 && o.coverFile) {
    // 新附件排在原有附件（字体等）后面
    const n = probe.streams.filter((s) => s.type === 'attachment').length
    const name = probe.cover?.filename ?? basename(o.coverFile)
    const mime = probe.cover?.mimetype ?? MIME.get(extname(o.coverFile).slice(1).toLowerCase()) ?? 'image/jpeg'
    args.push('-attach', o.coverFile, `-metadata:s:t:${n}`, `mimetype=${mime}`, `-metadata:s:t:${n}`, `filename=${name}`)
  }
  // 封面只有一个包，音频、字幕包很稀疏，复制时容易撑满默认的混流队列
  args.push('-map_chapters', '0', '-max_muxing_queue_size', '4096')
  args.push(...(mp4 ? ['-movflags', '+faststart', '-f', 'mp4'] : ['-f', 'matroska']), o.output)
  return args
}

/** 把 MKV 里的封面原样导出成图片（和写进去时的字节完全一致），交给 ffmpegCapture 跑 */
export function buildCoverExtractArgs(input: string, coverIndex: number, dest: string): string[] {
  return ['-y', '-i', input, '-map', `0:${coverIndex}`, '-c', 'copy', '-frames:v', '1', '-f', 'image2', dest]
}

const EXT = new Map([
  ['mjpeg', 'jpg'],
  ['jpeg', 'jpg'],
  ['png', 'png'],
  ['webp', 'webp']
])

/** 导出封面用的文件名，扩展名按封面的编码或 MIME 类型 */
export function coverFileName(cover: ProbeCover): string {
  const fromMime = cover.mimetype?.split('/')[1]?.toLowerCase() ?? ''
  return `cover.${EXT.get(cover.codec) ?? EXT.get(fromMime) ?? 'jpg'}`
}
