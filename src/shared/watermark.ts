import type { DownloadOptions, MediaItem, WatermarkRegion } from './types'

/** 区域宽或高小于这个值就没有处理的意义 */
const MIN_SIDE = 4

/**
 * 取整并收进画面：ffmpeg 的 delogo 要求区域离四边至少 1 像素（x≥1、y≥1、x+w≤W-1、y+h≤H-1），
 * 否则报 “Logo area is outside of the frame”。收完太小或参数不是数字时返回 null
 */
export function clampRegion(r: WatermarkRegion, W: number, H: number): WatermarkRegion | null {
  if (![r.x, r.y, r.w, r.h, W, H].every(Number.isFinite)) return null
  const x0 = Math.max(1, Math.round(r.x))
  const y0 = Math.max(1, Math.round(r.y))
  const x1 = Math.min(Math.round(W) - 1, Math.round(r.x + r.w))
  const y1 = Math.min(Math.round(H) - 1, Math.round(r.y + r.h))
  if (x1 - x0 < MIN_SIDE || y1 - y0 < MIN_SIDE) return null
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** 四周各外扩一点，盖住文字的抗锯齿边和阴影；结果需要再 clampRegion */
export function padRegion(r: WatermarkRegion, ratio = 0.25, min = 4): WatermarkRegion {
  const p = Math.max(min, Math.round(r.h * ratio))
  return { x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p }
}

export const delogoFilter = (r: WatermarkRegion): string => `delogo=x=${r.x}:y=${r.y}:w=${r.w}:h=${r.h}`

/** 区域在画面的哪个角，用于提示文案 */
export function cornerName(r: WatermarkRegion, W: number, H: number): string {
  const top = r.y + r.h / 2 < H / 2
  const left = r.x + r.w / 2 < W / 2
  return `${left ? '左' : '右'}${top ? '上' : '下'}角`
}

/**
 * 没识别到时给的默认框：右上角。B站水印按短边 S 等比缩放，一行高约 0.056·S、离上边约 0.033·S、
 * 离右边约 0.03·S，宽度随昵称长短在 0.24～0.52·S 之间（中位数约 0.31·S），这里四周各留一点余量
 */
export function defaultRegion(W: number, H: number): WatermarkRegion {
  const s = Math.min(W, H)
  const box = { x: W - Math.round(s * 0.35), y: Math.round(s * 0.02), w: Math.round(s * 0.33), h: Math.round(s * 0.08) }
  return clampRegion(box, W, H) ?? { x: 1, y: 1, w: Math.max(1, W - 2), h: Math.max(1, H - 2) }
}

/** 结果里有画面，才谈得上去水印 */
export const isVideoTask = (t: { item: Pick<MediaItem, 'kind'>; options: Pick<DownloadOptions, 'output'> }): boolean =>
  t.item.kind !== 'audio' && t.options.output !== 'audio'

const MANUAL_HINT = '（可以在任务上点“去水印…”手动框选）'

/** 去水印相关的提示，都以“去水印”开头，方便替换 */
export const WM_NOTE = {
  none: `去水印：没有识别到水印，已保留原视频${MANUAL_HINT}`,
  static: `去水印：画面变化太少，没法自动识别，已保留原视频${MANUAL_HINT}`,
  fewFrames: `去水印：视频太短或画面太暗，没法自动识别，已保留原视频${MANUAL_HINT}`,
  hdr: '去水印：暂不支持 HDR 和杜比视界视频，已保留原视频',
  interrupted: '去水印没有完成（应用中途退出了），已保留原视频',
  moved: '去水印没有完成：处理期间原视频被移动或删除了',
  failed: (reason: string): string => `${reason.startsWith('去水印') ? reason : `去水印失败：${reason}`}，已保留原视频`
}

/** 任务提示用“；”拼接，去掉其中旧的去水印提示，其余保留 */
export function stripWatermarkNotes(note: string | undefined): string | undefined {
  const rest = (note ?? '')
    .split('；')
    .filter((s) => s && !s.startsWith('去水印'))
    .join('；')
  return rest || undefined
}

/** 把一条去水印提示合进任务提示，替换掉旧的 */
export function withWatermarkNote(note: string | undefined, wm: string | undefined): string | undefined {
  return [stripWatermarkNotes(note), wm].filter(Boolean).join('；') || undefined
}
