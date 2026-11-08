import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { clampRegion, defaultRegion, isVideoTask } from '@shared/watermark'
import type { ProcessingInfo, TaskInfo, WatermarkPrep, WatermarkRegion } from '@shared/types'
import { buildCoverExtractArgs, buildReplaceArgs, coverFileName } from './delogo'
import { targetKbps, type Encoder } from './encoder'
import { ffmpegCapture } from './ffmpegJob'
import { grabJpeg } from './frames'
import { locateWatermark } from './locate'
import { probeMedia, type MediaProbe, type ProbeVideo } from './probe'
import { encodeWithFallback } from './transcode'

const HDR_BLOCKER = '暂不支持 HDR 和杜比视界视频'

/** 对话框默认展示的那一帧 */
const PREVIEW_AT = 0.3

export type DoneVideoTask = TaskInfo & { outputPath: string }

/** 只有下载完成、文件还在的视频任务才能手动去水印 */
export function requireVideoTask(t: TaskInfo | undefined): DoneVideoTask {
  if (!t) throw new Error('任务不存在')
  if (t.status !== 'done' || !t.outputPath) throw new Error('只能处理已经下载完成的视频')
  if (!isVideoTask(t)) throw new Error('这个任务只有音频，没有画面')
  if (!existsSync(t.outputPath)) throw new Error('找不到视频文件，可能已被移动或删除')
  return t as DoneVideoTask
}

async function probeVideo(path: string, signal?: AbortSignal): Promise<{ probe: MediaProbe; v: ProbeVideo }> {
  const probe = await probeMedia(path, signal)
  if (!probe.video) throw new Error('文件里没有视频画面')
  return { probe, v: probe.video }
}

/** 打开对话框时：识别水印位置（下载时识别过就直接用），抽一帧画面 */
export async function prepareManual(t: DoneVideoTask, signal?: AbortSignal): Promise<WatermarkPrep> {
  const { probe, v } = await probeVideo(t.outputPath, signal)
  const duration = probe.duration ?? t.item.duration ?? 0
  const blocker = v.hdr || v.dolbyVision ? HDR_BLOCKER : undefined
  const known = t.watermark?.width === v.width && t.watermark.height === v.height ? t.watermark.detected : undefined
  // 已经去过一次的文件，原来的水印位置已经糊掉了，再识别也认不出来
  const region = known ?? (t.watermark?.applied ? undefined : (await locateWatermark(t.outputPath, v, duration, signal)).region)
  const time = Math.round(duration * PREVIEW_AT * 1000) / 1000
  return {
    width: v.width,
    height: v.height,
    duration,
    time,
    image: await grabJpeg(t.outputPath, v.index, time, { signal }),
    region: region ?? defaultRegion(v.width, v.height),
    detected: Boolean(region),
    applied: t.watermark?.applied,
    blocker
  }
}

/** 换一帧；带 region 时给出去掉水印后的样子。坐标在这里重新收进画面，不信任界面传来的值 */
export async function previewFrame(t: DoneVideoTask, time: number, region?: WatermarkRegion): Promise<string> {
  const { probe, v } = await probeVideo(t.outputPath)
  const at = Math.min(Math.max(0, Number.isFinite(time) ? time : 0), Math.max(0, (probe.duration ?? 0) - 0.1))
  const r = region && clampRegion(region, v.width, v.height)
  if (region && !r) throw new Error('水印区域太小')
  return grabJpeg(t.outputPath, v.index, at, { region: r ?? undefined })
}

export interface ReplaceInput {
  input: string
  output: string
  /** 放导出的封面，调用方负责删除 */
  workDir: string
  region: WatermarkRegion
  format: 'mp4' | 'mkv'
  durationHint?: number
  signal: AbortSignal
  onStage: (p: ProcessingInfo) => void
}

/** 把成品里的视频流换成去掉水印的版本，音频、字幕、封面、章节原样保留，写到 output */
export async function replaceVideo(o: ReplaceInput): Promise<{ codec: Encoder['codec']; width: number; height: number; region: WatermarkRegion }> {
  o.onStage({ manual: true, stage: 'queue' })
  const { probe, v } = await probeVideo(o.input, o.signal)
  if (v.hdr || v.dolbyVision) throw new Error(HDR_BLOCKER)
  const region = clampRegion(o.region, v.width, v.height)
  if (!region) throw new Error('水印区域太小')

  // MKV 的封面附件复制过去会变成一条视频轨，先导出成图片再挂回去
  let coverFile: string | undefined
  if (o.format === 'mkv' && probe.cover) {
    mkdirSync(o.workDir, { recursive: true })
    const dest = join(o.workDir, coverFileName(probe.cover))
    const r = await ffmpegCapture(buildCoverExtractArgs(o.input, probe.cover.index, dest), { signal: o.signal })
    if (r.code === 0 && existsSync(dest)) coverFile = dest
  }

  const kbps = targetKbps(v.bitrate, v.width, v.height, v.fps)
  const enc = await encodeWithFallback({
    srcCodec: v.codec,
    width: v.width,
    height: v.height,
    build: (e) => buildReplaceArgs({ probe, input: o.input, output: o.output, region, enc: e, kbps, format: o.format, coverFile }),
    durationSec: probe.duration ?? o.durationHint,
    signal: o.signal,
    manual: true,
    onStage: o.onStage
  })
  return { codec: enc.codec, width: v.width, height: v.height, region }
}
