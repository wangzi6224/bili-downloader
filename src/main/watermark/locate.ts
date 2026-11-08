import { clampRegion, padRegion } from '@shared/watermark'
import type { WatermarkRegion } from '@shared/types'
import { analysisSize, detectWatermark, frameCount, SUGGEST_MIN_SCORE, type DetectResult } from './detect'
import { grabFrames, sampleTimes } from './frames'
import type { ProbeVideo } from './probe'

export interface Located {
  result: DetectResult
  /** 外扩并收进画面后的原分辨率区域；分数够得上“建议位置”才给 */
  region?: WatermarkRegion
}

/** 均匀抽几帧灰度图找水印 */
export async function locateWatermark(path: string, v: ProbeVideo, duration: number, signal?: AbortSignal): Promise<Located> {
  const k = frameCount(duration)
  if (!k) return { result: { score: 0, reason: 'few-frames' } }
  const { w, h, scale } = analysisSize(v.width, v.height)
  const frames = await grabFrames(path, v.index, sampleTimes(duration, k), w, h, signal)
  const result = detectWatermark(frames, w, h)
  const b = result.box
  if (!b || result.score < SUGGEST_MIN_SCORE) return { result }
  const full = { x: b.x / scale, y: b.y / scale, w: b.w / scale, h: b.h / scale }
  return { result, region: clampRegion(padRegion(full), v.width, v.height) ?? undefined }
}
