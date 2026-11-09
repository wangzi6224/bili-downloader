// 处理一个视频前的分析：在用户框附近按原分辨率抽帧算出笔画掩码，定下交给模型的长条，
// 再估一下有多少帧可以沿用上一帧的结果（静止的画面不用重算）
import type { WatermarkRegion } from '@shared/types'
import { AbortError } from '../../download/errors'
import { ffmpegCapture } from '../ffmpegJob'
import type { ProbeVideo } from '../probe'
import { colorSpec, fpsRational } from './args'
import { estimateStrokeMask, maskBounds, type Rect } from './mask'
import { sameScene, StripCodec, type ColorSpec } from './pixels'
import { planStrip, type Strip } from './strip'

/** 算掩码抽的帧数 */
const MASK_FRAMES = 48
/** 估沿用比例抽的位置数（每处取相邻两帧） */
const REUSE_PAIRS = 16
/** 抽帧时同时跑的 ffmpeg 数 */
const PARALLEL = 4

export interface Analysis {
  width: number
  height: number
  strip: Strip
  /** 长条里要重画的像素（strip.w × strip.h） */
  mask: Uint8Array
  /** 没认出笔画，整个框都重画 */
  fallback: boolean
  color: ColorSpec
  /** 恒定帧率，分数形式 */
  rate: string
  videoIndex: number
}

const even = (v: number): number => Math.floor(v / 2) * 2

/** 按原分辨率抽一块区域的灰度；frames 帧连续抽（相邻帧对比用） */
export async function grabGrayCrop(
  path: string,
  videoIndex: number,
  time: number,
  c: Rect,
  frames = 1,
  signal?: AbortSignal
): Promise<Uint8Array[]> {
  const size = c.w * c.h
  const r = await ffmpegCapture(
    ['-ss', time.toFixed(3), '-i', path, '-map', `0:${videoIndex}`, '-frames:v', String(frames), '-vf', `crop=${c.w}:${c.h}:${c.x}:${c.y},format=gray`, '-f', 'rawvideo', 'pipe:1'],
    { signal, maxBytes: size * frames * 2 }
  )
  const out: Uint8Array[] = []
  for (let i = 0; i + size <= r.stdout.length && out.length < frames; i += size) out.push(new Uint8Array(r.stdout.subarray(i, i + size)))
  return out
}

/** 依次处理，最多 PARALLEL 个同时进行，结果保持顺序 */
async function mapLimit<T, R>(items: T[], fn: (t: T) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      if (signal?.aborted) throw new AbortError()
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker))
  return out
}

const times = (duration: number, n: number): number[] => Array.from({ length: n }, (_, i) => duration * (0.05 + (0.9 * (i + 0.5)) / n))

export async function analyze(o: {
  path: string
  v: ProbeVideo
  duration: number
  region: WatermarkRegion
  signal?: AbortSignal
}): Promise<Analysis> {
  const { v, region } = o
  const W = even(v.width)
  const H = even(v.height)
  // 在框外留半行字的余量，笔画的抗锯齿边不会被截掉
  const pad = Math.round(region.h / 2)
  const x0 = even(Math.max(0, region.x - pad))
  const y0 = even(Math.max(0, region.y - pad))
  const c = { x: x0, y: y0, w: even(Math.min(W, region.x + region.w + pad) - x0), h: even(Math.min(H, region.y + region.h + pad) - y0) }
  const grabbed = await mapLimit(times(o.duration, MASK_FRAMES), (t) => grabGrayCrop(o.path, v.index, t, c, 1, o.signal), o.signal)
  const frames = grabbed.flat()
  const box = { x: region.x - c.x, y: region.y - c.y, w: region.w, h: region.h }
  const est = estimateStrokeMask(frames, c.w, c.h, box, Math.min(W, H))
  const b = maskBounds(est.mask, c.w, c.h) ?? box
  const strip = planStrip({ x: c.x + b.x, y: c.y + b.y, w: b.w, h: b.h }, W, H)
  // 掩码从抽帧区域的坐标换到长条的坐标
  const mask = new Uint8Array(strip.w * strip.h)
  for (let y = 0; y < strip.h; y++) {
    const cy = strip.y + y - c.y
    if (cy < 0 || cy >= c.h) continue
    for (let x = 0; x < strip.w; x++) {
      const cx = strip.x + x - c.x
      if (cx >= 0 && cx < c.w) mask[y * strip.w + x] = est.mask[cy * c.w + cx]
    }
  }
  return { width: W, height: H, strip, mask, fallback: est.fallback, color: colorSpec(v.color, H), rate: fpsRational(v.fps), videoIndex: v.index }
}

export const makeCodec = (a: Analysis): StripCodec => new StripCodec(a.width, a.height, a.strip, a.mask, a.color)

/**
 * 估计有多大比例的帧能沿用上一次的结果：抽几处相邻两帧，看长条有没有变化。
 * 实际是和上一次推理的那帧比，会比相邻帧略少，打个折
 */
export async function estimateReuse(o: { path: string; a: Analysis; duration: number; signal?: AbortSignal }): Promise<number> {
  const { strip } = o.a
  const pairs = await mapLimit(times(o.duration, REUSE_PAIRS), (t) => grabGrayCrop(o.path, o.a.videoIndex, t, strip, 2, o.signal), o.signal)
  const valid = pairs.filter((p) => p.length === 2)
  if (!valid.length) return 0
  const same = valid.filter(([a, b]) => sameScene(a, b, strip.w, strip.h)).length
  return (same / valid.length) * 0.85
}
