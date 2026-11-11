import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { t as tr } from '@shared/i18n'
import { clampRegion, defaultRegion, isVideoTask } from '@shared/watermark'
import type { ProcessingInfo, TaskInfo, WatermarkPrep, WatermarkRegion } from '@shared/types'
import { buildCoverExtractArgs, buildReplaceArgs, coverFileName } from './delogo'
import { targetKbps, type Encoder } from './encoder'
import { ffmpegCapture } from './ffmpegJob'
import { grabJpeg } from './frames'
import { isConfident, locateWatermark } from './locate'
import { probeMedia, type MediaProbe, type ProbeVideo } from './probe'
import { encodeWithFallback } from './transcode'

const hdrBlocker = (): string => tr('wm.hdrUnsupported')

/** 对话框默认展示的那一帧 */
const PREVIEW_AT = 0.3

export type DoneVideoTask = TaskInfo & { outputPath: string }

/** 只有下载完成、文件还在的视频任务才能手动去水印 */
export function requireVideoTask(t: TaskInfo | undefined): DoneVideoTask {
  if (!t) throw new Error(tr('wm.taskMissing'))
  if (t.status !== 'done' || !t.outputPath) throw new Error(tr('wm.notDone'))
  if (!isVideoTask(t)) throw new Error(tr('wm.audioOnly'))
  if (!existsSync(t.outputPath)) throw new Error(tr('wm.fileMissing'))
  return t as DoneVideoTask
}

async function probeVideo(path: string, signal?: AbortSignal): Promise<{ probe: MediaProbe; v: ProbeVideo }> {
  const probe = await probeMedia(path, signal)
  if (!probe.video) throw new Error(tr('wm.noVideoInFile'))
  return { probe, v: probe.video }
}

/** 打开对话框时：识别水印位置（下载时识别过就直接用），抽一帧画面 */
export async function prepareManual(t: DoneVideoTask, signal?: AbortSignal): Promise<WatermarkPrep> {
  const { probe, v } = await probeVideo(t.outputPath, signal)
  const duration = probe.duration ?? t.item.duration ?? 0
  const blocker = v.hdr || v.dolbyVision ? hdrBlocker() : undefined
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

export interface WatermarkInspection {
  width: number
  height: number
  duration: number
  fps?: number
  /** 水印位置：下载时识别过就用那次的，否则现场识别；认不出时没有 */
  region?: WatermarkRegion
  /** 认出了 B站水印（不只是“可能在这里”） */
  found: boolean
  /** 识别结果是不是下载时记下的 */
  known: boolean
  /** 已经去过水印：region 是当时处理的位置 */
  applied?: boolean
  /** 不能处理的原因（例如 HDR） */
  blocker?: string
}

/** AI 助手发起去水印前：找水印位置（不抽预览图），拿到尺寸、时长、帧率用来估算耗时 */
export async function inspectWatermark(t: DoneVideoTask, signal?: AbortSignal): Promise<WatermarkInspection> {
  const { probe, v } = await probeVideo(t.outputPath, signal)
  const duration = probe.duration ?? t.item.duration ?? 0
  const base = { width: v.width, height: v.height, duration, fps: v.fps }
  if (v.hdr || v.dolbyVision) return { ...base, found: false, known: false, blocker: hdrBlocker() }
  const wm = t.watermark
  const same = wm?.width === v.width && wm.height === v.height
  // 已经去过一次的文件，原来的水印位置已经糊掉了，再识别也认不出来；还要处理（例如换成 AI 精修）就用当时的位置
  if (wm?.applied) return { ...base, region: same ? wm.applied : undefined, found: false, known: true, applied: true }
  // 旧版本记下的识别结果没有 found：只知道“可能在这里”
  if (same && wm?.detected) return { ...base, region: wm.detected, found: wm.found ?? false, known: true }
  const l = await locateWatermark(t.outputPath, v, duration, signal)
  return { ...base, region: l.region, found: isConfident(l), known: false }
}

/** 换一帧；带 region 时给出去掉水印后的样子。坐标在这里重新收进画面，不信任界面传来的值 */
export async function previewFrame(t: DoneVideoTask, time: number, region?: WatermarkRegion): Promise<string> {
  const { probe, v } = await probeVideo(t.outputPath)
  const at = Math.min(Math.max(0, Number.isFinite(time) ? time : 0), Math.max(0, (probe.duration ?? 0) - 0.1))
  const r = region && clampRegion(region, v.width, v.height)
  if (region && !r) throw new Error(tr('wm.regionTooSmall'))
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
  if (v.hdr || v.dolbyVision) throw new Error(hdrBlocker())
  const region = clampRegion(o.region, v.width, v.height)
  if (!region) throw new Error(tr('wm.regionTooSmall'))

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
