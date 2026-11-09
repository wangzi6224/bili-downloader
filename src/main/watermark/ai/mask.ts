// 估计水印笔画的掩码：只把笔画（外扩一点）交给模型重画，笔画之间的真实画面保留下来，
// 比整个方框都重画清楚，帧和帧之间也更稳定。
// B站水印是半透明的白字：看到的 = α·白 + (1−α)·原画面，总比原画面亮。每个像素取多帧里偏暗的那个值，
// 背景暗下来的帧里字最显眼；再用开运算（先腐蚀后膨胀）抹掉比结构元素细的亮笔画得到背景，相减就是笔画。
// 这个文件不能有 import，校准脚本直接用 Node 加载它

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** 取多帧里第几低的值（占帧数的比例）：比最小值抗噪，又能用上背景最暗的那些帧 */
const LOW_Q = 0.15
/** 开运算的结构元素边长（占画面短边）：比文字和标志的笔画粗，比整行字细 */
const OPEN_SIDE = 0.03
/** 笔画判定的门槛：不低于 MIN_T，也不低于框内强响应（98 分位）的这个比例 */
const MIN_T = 6
const REL_T = 0.3
/** 框内强响应低于这个值说明没有半透明的字（只有背景纹理、噪点）：暗背景下真水印在 150 左右，背景一直很亮时也有 30 多 */
const MIN_PEAK = 20
/** 掩码外扩（占短边），盖住字的抗锯齿边和压缩带来的光晕 */
const GROW = 0.003
const MIN_GROW = 2
/** 掩码占框面积的合理范围，超出说明没认出笔画（画面太静止、背景一直很亮），退回整个框 */
const MIN_COVER = 0.03
const MAX_COVER = 0.75

/** 每个像素在所有帧里第 q 低的值 */
export function lowPercentile(frames: Uint8Array[], size: number, q = LOW_Q): Uint8Array {
  const out = new Uint8Array(size)
  const k = Math.min(frames.length - 1, Math.floor(frames.length * q))
  const hist = new Uint16Array(256)
  for (let i = 0; i < size; i++) {
    hist.fill(0)
    for (const f of frames) hist[f[i]]++
    let acc = 0
    let v = 0
    for (; v < 256; v++) {
      acc += hist[v]
      if (acc > k) break
    }
    out[i] = v
  }
  return out
}

/** 一维滑动最小/最大值（窗口半径 r），用于可分离的方形腐蚀、膨胀 */
function slide(src: Uint8Array, dst: Uint8Array, n: number, stride: number, offset: number, r: number, max: boolean): void {
  for (let i = 0; i < n; i++) {
    let best = max ? 0 : 255
    const a = Math.max(0, i - r)
    const b = Math.min(n - 1, i + r)
    for (let j = a; j <= b; j++) {
      const v = src[offset + j * stride]
      if (max ? v > best : v < best) best = v
    }
    dst[offset + i * stride] = best
  }
}

/** 方形结构元素（边长 2r+1）的腐蚀或膨胀 */
export function morph(img: Uint8Array, w: number, h: number, r: number, max: boolean): Uint8Array {
  if (r <= 0) return img.slice()
  const tmp = new Uint8Array(img.length)
  const out = new Uint8Array(img.length)
  for (let y = 0; y < h; y++) slide(img, tmp, w, 1, y * w, r, max)
  for (let x = 0; x < w; x++) slide(tmp, out, h, w, x, r, max)
  return out
}

export interface StrokeMask {
  /** 和输入帧同样大小，1 表示要重画 */
  mask: Uint8Array
  /** 没认出笔画，用的是整个框 */
  fallback: boolean
  /** 掩码占框的比例 */
  cover: number
}

function boxMask(w: number, h: number, box: Rect): Uint8Array {
  const m = new Uint8Array(w * h)
  for (let y = Math.max(0, box.y); y < Math.min(h, box.y + box.h); y++) {
    m.fill(1, y * w + Math.max(0, box.x), y * w + Math.min(w, box.x + box.w))
  }
  return m
}

/**
 * frames 是同一块区域（宽 w、高 h）的多帧亮度，box 是用户框在这块区域里的位置，
 * shortSide 是原画面的短边（水印大小随它缩放）。只在框里找笔画
 */
export function estimateStrokeMask(frames: Uint8Array[], w: number, h: number, box: Rect, shortSide: number): StrokeMask {
  const inBox = boxMask(w, h, box)
  const boxArea = inBox.reduce((a, v) => a + v, 0)
  const grow = Math.max(MIN_GROW, Math.round(shortSide * GROW))
  const fallback = (): StrokeMask => ({ mask: morph(inBox, w, h, grow, true), fallback: true, cover: 1 })
  if (!frames.length || !boxArea) return fallback()

  const low = lowPercentile(frames, w * h)
  const r = Math.max(2, Math.round((shortSide * OPEN_SIDE) / 2))
  const bg = morph(morph(low, w, h, r, false), w, h, r, true)
  const score = new Uint8Array(w * h)
  const inside: number[] = []
  for (let i = 0; i < score.length; i++) {
    score[i] = Math.max(0, low[i] - bg[i])
    if (inBox[i]) inside.push(score[i])
  }
  inside.sort((a, b) => a - b)
  const peak = inside[Math.floor((inside.length - 1) * 0.98)]
  if (peak < MIN_PEAK) return fallback()
  const t = Math.max(MIN_T, REL_T * peak)
  const core = new Uint8Array(w * h)
  let n = 0
  for (let i = 0; i < core.length; i++) {
    if (inBox[i] && score[i] > t) {
      core[i] = 1
      n++
    }
  }
  const cover = n / boxArea
  if (cover < MIN_COVER || cover > MAX_COVER) return fallback()
  return { mask: morph(core, w, h, grow, true), fallback: false, cover }
}

/** 掩码的外接矩形；空掩码返回 undefined */
export function maskBounds(mask: Uint8Array, w: number, h: number): Rect | undefined {
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return x1 < 0 ? undefined : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}
