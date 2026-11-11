import { t } from './i18n'
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
  if (top) return t(left ? 'wm.cornerTopLeft' : 'wm.cornerTopRight')
  return t(left ? 'wm.cornerBottomLeft' : 'wm.cornerBottomRight')
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

/**
 * 去水印提示开头的标记（U+2060 WORD JOINER，不占位置、看不见）。任务提示会存进 tasks.json，
 * 换一条去水印提示时要认出旧的那条，而界面语言可能已经换过，所以不按文案判断，只看这个标记
 */
export const WM_MARK = '\u2060'

/** 打上去水印标记（已经有了就不重复打） */
export const markWatermarkText = (s: string): string => (s.startsWith(WM_MARK) ? s : WM_MARK + s)

/** 是不是去水印提示（或已经是完整的去水印报错）。旧版本存下的提示没有标记，都是以“去水印”开头的中文 */
export const isWatermarkText = (s: string): boolean => s.startsWith(WM_MARK) || s.startsWith('去水印')

const unmark = (s: string): string => (s.startsWith(WM_MARK) ? s.slice(WM_MARK.length) : s)

/** 去水印相关的提示，都带 WM_MARK 标记，方便替换；按当前界面语言生成 */
export const WM_NOTE = {
  none: (): string => markWatermarkText(t('wm.noteNone')),
  static: (): string => markWatermarkText(t('wm.noteStatic')),
  fewFrames: (): string => markWatermarkText(t('wm.noteFewFrames')),
  hdr: (): string => markWatermarkText(t('wm.noteHdr')),
  interrupted: (): string => markWatermarkText(t('wm.noteInterrupted')),
  moved: (): string => markWatermarkText(t('wm.noteMoved')),
  /** reason 本身已经是完整的去水印报错（带标记，例如“去水印失败：磁盘空间不足”）时不再加前缀 */
  failed: (reason: string): string =>
    markWatermarkText(isWatermarkText(reason) ? t('wm.noteFailedWhole', { reason: unmark(reason) }) : t('wm.noteFailed', { reason })),
  aiFallback: (reason: string): string => markWatermarkText(t('wm.noteAiFallback', { reason: unmark(reason) })),
  aiFailed: (reason: string): string => markWatermarkText(t('wm.noteAiFailed', { reason: unmark(reason) }))
}

/** 任务提示用“；”拼接，去掉其中旧的去水印提示，其余保留 */
export function stripWatermarkNotes(note: string | undefined): string | undefined {
  const rest = (note ?? '')
    .split('；')
    .filter((s) => s && !isWatermarkText(s))
    .join('；')
  return rest || undefined
}

/** 把一条去水印提示合进任务提示，替换掉旧的 */
export function withWatermarkNote(note: string | undefined, wm: string | undefined): string | undefined {
  return [stripWatermarkNotes(note), wm].filter(Boolean).join('；') || undefined
}
