// 这台机器去水印的实际速度：每次处理完记一笔，用来估算以后要花多久（界面的总开关、MCP 给 AI 助手看）。
// 速度用“处理耗时 ÷ 工作量”表示：快速去除的工作量按 1080p 折算（编码量和像素数成正比），
// AI 精修按 30fps 折算（每帧推理一次，和分辨率关系不大）。都是“视频时长的多少倍”
import type { WatermarkMethod } from '@shared/types'
import { readJson, writeJson } from '../store'

interface Entry {
  /** 处理耗时 ÷ 折算后的视频秒数 */
  ratio: number
  samples: number
  backend?: string
  at: number
}

interface Profile {
  fast?: Entry
  ai?: Entry
  /** AI 精修试跑测得的单帧耗时：还没有完整跑过一次时用它估 */
  calib?: { backend: string; msPerFrame: number; hosts: number; at: number }
}

export interface SpeedEstimate {
  /** [乐观, 保守]，秒 */
  seconds: [number, number]
  /** measured：按这台机器实际跑过的；calibrated：按试跑；default：还没跑过，保守的默认值 */
  basis: 'measured' | 'calibrated' | 'default'
  /** AI 精修用的推理方式，例如 GPU、CPU × 6 */
  backend?: string
}

/** 新记录的权重：既跟得上换了显卡、开了省电模式，又不会被一次异常带偏 */
const ALPHA = 0.4
/** 太短的视频准备时间占比大，不记 */
const MIN_DURATION = 5
const PX_1080P = 1920 * 1080
/** 开始前的准备：快速去除试编码，AI 精修抽帧找笔画、加载模型、试跑 */
const PREPARE: Record<WatermarkMethod, number> = { fast: 5, ai: 15 }
/** 没跑过时的保守倍数 */
const DEFAULT_FAST: [number, number] = [0.05, 0.4]
export const defaultAiRatio = (platform: string = process.platform, arch: string = process.arch): [number, number] =>
  platform === 'darwin' && arch === 'arm64' ? [2, 3] : [2, 6]
/** 实测值上下浮动这么多 */
const SPREAD = 0.3

let cache: Profile | undefined
/** 没初始化（例如测试里）时只记在内存里 */
let file: string | undefined

const load = (): Profile => (cache ??= (file && readJson<Profile>(file)) || {})

/** 启动时指定保存的文件；也用来在测试里换文件、清掉记录 */
export function initSpeed(path?: string): void {
  file = path
  cache = undefined
}

function save(p: Profile): void {
  if (!file) return
  try {
    writeJson(file, p)
  } catch (e) {
    console.warn('记录去水印速度失败：', (e as Error).message)
  }
}

export interface Work {
  /** 秒 */
  duration: number
  width?: number
  height?: number
  fps?: number
}

/** 折算后的工作量（秒） */
function units(method: WatermarkMethod, w: Work): number {
  if (method === 'ai') return w.duration * ((w.fps && w.fps > 0 ? Math.min(w.fps, 120) : 30) / 30)
  const px = w.width && w.height ? w.width * w.height : PX_1080P
  return w.duration * (px / PX_1080P)
}

/** 处理完记一笔；seconds 是真正处理的耗时（不含排队、下载模型） */
export function recordRun(method: WatermarkMethod, w: Work & { seconds: number; backend?: string }): void {
  if (!(w.duration >= MIN_DURATION) || !(w.seconds > 0)) return
  const ratio = w.seconds / units(method, w)
  const p = load()
  const old = p[method]
  p[method] = {
    ratio: old ? old.ratio * (1 - ALPHA) + ratio * ALPHA : ratio,
    samples: (old?.samples ?? 0) + 1,
    backend: w.backend ?? old?.backend,
    at: Date.now()
  }
  save(p)
}

/** AI 精修试跑后记下单帧耗时 */
export function recordCalibration(backend: string, msPerFrame: number, hosts: number): void {
  if (!(msPerFrame > 0)) return
  const p = load()
  p.calib = { backend, msPerFrame, hosts, at: Date.now() }
  save(p)
}

/** AI 精修每秒视频（30fps）要几秒：多个 CPU 进程并行时有效率损失（和 estimate.ts 的 cpuEfficiency 一致） */
function calibRatio(c: NonNullable<Profile['calib']>): number {
  const hosts = Math.max(1, c.hosts)
  return (c.msPerFrame / 1000) * 30 / (hosts * (1 / (1 + 0.12 * (hosts - 1))))
}

/** 视频时长的多少倍（[乐观, 保守]），以及依据 */
export function speedRatio(method: WatermarkMethod): { ratio: [number, number]; basis: SpeedEstimate['basis']; backend?: string } {
  const p = load()
  const e = p[method]
  if (e) return { ratio: [e.ratio * (1 - SPREAD), e.ratio * (1 + SPREAD)], basis: 'measured', backend: e.backend }
  if (method === 'ai' && p.calib) {
    const r = calibRatio(p.calib)
    // 画面静止的帧会沿用上一帧的结果，乐观的一头打个折
    return { ratio: [r * 0.6, r * 1.2], basis: 'calibrated', backend: p.calib.backend }
  }
  return { ratio: method === 'ai' ? defaultAiRatio() : DEFAULT_FAST, basis: 'default' }
}

/** 估算处理一个视频要多久 */
export function estimateTime(method: WatermarkMethod, w: Work): SpeedEstimate {
  const { ratio, basis, backend } = speedRatio(method)
  const u = units(method, w)
  return {
    seconds: [Math.round(PREPARE[method] + u * ratio[0]), Math.round(PREPARE[method] + u * ratio[1])],
    basis,
    backend
  }
}
