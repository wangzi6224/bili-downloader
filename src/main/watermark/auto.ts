import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { WM_NOTE } from '@shared/watermark'
import type { ProcessingInfo, WatermarkState } from '@shared/types'
import { isDolbyVision, type DashStream } from '../bili/playurl'
import { removeQuietly } from '../download/cleanup'
import { AbortError } from '../download/errors'
import { AUTO_MIN_SCORE } from './detect'
import { buildVideoOnlyArgs } from './delogo'
import { targetKbps, type Encoder } from './encoder'
import { locateWatermark } from './locate'
import { probeMedia } from './probe'
import { encodeWithFallback } from './transcode'

/** 处理好的视频、记录和转码中的半成品都放在任务的临时目录里，取消、重新下载时随目录一起清理 */
const OUT = 'video.wm.mp4'
const META = 'watermark.json'
const PART = 'video.wm.part'

/** HDR、杜比视界：delogo 只能处理 8 bit，处理后会丢掉 HDR */
const HDR_QN = new Set([125, 126])

export interface AutoDelogoInput {
  /** 任务的临时目录 */
  tmp: string
  /** 下载好的视频流 */
  source: string
  stream: DashStream
  /** 接口给的时长（秒），读不出视频时长时用 */
  durationHint?: number
  signal: AbortSignal
  onStage: (p: ProcessingInfo) => void
}

export interface AutoDelogoResult {
  /** 去掉水印后的视频；没处理时不给 */
  video?: string
  codec?: Encoder['codec']
  state?: WatermarkState
  /** 没处理的原因，写进任务提示 */
  note?: string
}

interface Meta {
  size: number
  codec: Encoder['codec']
  state: WatermarkState
}

/** 上次已经处理完、但合并前被暂停或退出了：源文件没变就直接用 */
function cached(tmp: string, source: string): AutoDelogoResult | undefined {
  const out = join(tmp, OUT)
  try {
    if (!existsSync(out)) return undefined
    const m = JSON.parse(readFileSync(join(tmp, META), 'utf8')) as Meta
    if (m.size !== statSync(source).size || !m.state?.applied) return undefined
    return { video: out, codec: m.codec, state: m.state }
  } catch {
    return undefined
  }
}

/**
 * 下载流水线里的自动去水印：识别画面角落的水印，识别到了就重新编码视频流去掉它。
 * 只会抛 AbortError，其他问题都变成 note，由调用方保留原视频继续合并。
 */
export async function autoDelogo(i: AutoDelogoInput): Promise<AutoDelogoResult> {
  const hit = cached(i.tmp, i.source)
  if (hit) return hit
  if (HDR_QN.has(i.stream.id) || isDolbyVision(i.stream)) return { note: WM_NOTE.hdr }
  const part = join(i.tmp, PART)
  let state: WatermarkState | undefined
  try {
    i.onStage({ stage: 'detect' })
    const probe = await probeMedia(i.source, i.signal)
    const v = probe.video
    if (!v) return { note: WM_NOTE.failed('没找到视频画面') }
    if (v.hdr || v.dolbyVision) return { note: WM_NOTE.hdr }
    const duration = probe.duration ?? i.durationHint ?? 0
    const { result, region } = await locateWatermark(i.source, v, duration, i.signal)
    state = { width: v.width, height: v.height, detected: region }
    if (result.reason === 'few-frames') return { state, note: WM_NOTE.fewFrames }
    if (result.reason === 'static') return { state, note: WM_NOTE.static }
    if (!region || result.score < AUTO_MIN_SCORE) return { state, note: WM_NOTE.none }

    // 先删掉上次崩溃留下的半成品：没退出的旧 ffmpeg 可能还在写它，不能和这次写进同一个文件
    removeQuietly(part)
    // 分片 MP4 里读出来的码率不准（6.1 会报得很低），用接口给的码率
    const kbps = targetKbps(i.stream.bandwidth ? i.stream.bandwidth / 1000 : undefined, v.width, v.height, v.fps)
    const enc = await encodeWithFallback({
      srcCodec: v.codec,
      width: v.width,
      height: v.height,
      build: (e) => buildVideoOnlyArgs({ input: i.source, output: part, region, enc: e, kbps }),
      durationSec: duration || undefined,
      signal: i.signal,
      onStage: i.onStage
    })
    state = { ...state, applied: region }
    renameSync(part, join(i.tmp, OUT))
    const meta: Meta = { size: statSync(i.source).size, codec: enc.codec, state }
    writeFileSync(join(i.tmp, META), JSON.stringify(meta))
    return { video: join(i.tmp, OUT), codec: enc.codec, state }
  } catch (e) {
    if (e instanceof AbortError || i.signal.aborted) throw new AbortError()
    return { state, note: WM_NOTE.failed(e instanceof Error ? e.message : String(e)) }
  } finally {
    removeQuietly(part)
  }
}
