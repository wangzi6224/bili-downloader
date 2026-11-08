import type { WatermarkRegion } from '@shared/types'

/** 拖动的是框本身还是某条边、某个角 */
export type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export const HANDLES: Exclude<Handle, 'move'>[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** 框最小的边长（视频像素） */
export const MIN_BOX = 8

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), Math.max(lo, hi))

/**
 * 从拖动开始时的框 start 出发，按位移（视频像素）算出新框。
 * 和主进程一样离画面四边至少留 1 像素（ffmpeg 的 delogo 不能贴边）
 */
export function dragRect(start: WatermarkRegion, handle: Handle, dx: number, dy: number, W: number, H: number, min = MIN_BOX): WatermarkRegion {
  if (handle === 'move') {
    return {
      x: Math.round(clamp(start.x + dx, 1, W - 1 - start.w)),
      y: Math.round(clamp(start.y + dy, 1, H - 1 - start.h)),
      w: start.w,
      h: start.h
    }
  }
  let x0 = start.x
  let y0 = start.y
  let x1 = start.x + start.w
  let y1 = start.y + start.h
  if (handle.includes('w')) x0 = clamp(x0 + dx, 1, x1 - min)
  if (handle.includes('e')) x1 = clamp(x1 + dx, x0 + min, W - 1)
  if (handle.includes('n')) y0 = clamp(y0 + dy, 1, y1 - min)
  if (handle.includes('s')) y1 = clamp(y1 + dy, y0 + min, H - 1)
  x0 = Math.round(x0)
  y0 = Math.round(y0)
  return { x: x0, y: y0, w: Math.round(x1) - x0, h: Math.round(y1) - y0 }
}

/** 方向键微移框，按住 Shift 一次移 10 像素；不是方向键返回 null */
export function nudge(r: WatermarkRegion, key: string, shift: boolean, W: number, H: number): WatermarkRegion | null {
  const step = shift ? 10 : 1
  const d: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step]
  }
  const v = d[key]
  return v ? dragRect(r, 'move', v[0], v[1], W, H) : null
}

/** 视频像素 → 界面上的像素 */
export const toView = (r: WatermarkRegion, scale: number): WatermarkRegion => ({
  x: r.x * scale,
  y: r.y * scale,
  w: r.w * scale,
  h: r.h * scale
})

/** “换一帧”轮流看的位置 */
const FRAME_POINTS = [0.1, 0.3, 0.5, 0.7, 0.9]

/** 当前帧之后的下一个取帧时间（秒），到头了从第一个开始 */
export function nextFrameTime(duration: number, current: number): number {
  const times = FRAME_POINTS.map((p) => Math.round(duration * p * 1000) / 1000)
  return times.find((t) => t > current + 0.001) ?? times[0]
}

/** 拖动手柄的位置和鼠标样式（相对框的百分比） */
export function handleStyle(h: Exclude<Handle, 'move'>): { left: string; top: string; cursor: string } {
  const left = h.includes('w') ? '0%' : h.includes('e') ? '100%' : '50%'
  const top = h.includes('n') ? '0%' : h.includes('s') ? '100%' : '50%'
  const cursor = h === 'n' || h === 's' ? 'ns-resize' : h === 'e' || h === 'w' ? 'ew-resize' : h === 'ne' || h === 'sw' ? 'nesw-resize' : 'nwse-resize'
  return { left, top, cursor }
}
