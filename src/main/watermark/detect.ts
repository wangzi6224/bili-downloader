// 水印位置识别。B站水印是“昵称 + bilibili 标志”一行半透明白字，放在画面某个角，大小随分辨率等比缩放。
// 先在四个角的边带里找 bilibili 标志（模板归一化互相关），找到了再往左找昵称，这样定出的框才放心自动处理；
// 找不到标志时退回通用办法：跨帧一直存在的边缘连成块、按水印的形状挑一个，只作为手动框选的建议。
// 这个文件不能有 import，校准脚本直接用 Node 加载它

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type Corner = 'tl' | 'tr' | 'bl' | 'br'

export interface DetectResult {
  /** 分析尺寸下的框；只要有通过约束的候选就给出最高分的那个，是否采用由调用方按阈值决定 */
  box?: Rect
  corner?: Corner
  /** 没有候选时为 0 */
  score: number
  /** few-frames：有效帧不够；static：画面整体几乎不动（仍给出 box 供参考）；none：没有候选 */
  reason?: 'few-frames' | 'static' | 'none'
}

/** 自动去水印采用的最低分：只有认出 B站标志的才会达到，宁可漏掉也不能误伤画面 */
export const AUTO_MIN_SCORE = 0.7
/** 去水印对话框里作为建议位置的最低分 */
export const SUGGEST_MIN_SCORE = 0.35

/** 分析时把长边缩到这么大 */
const MAX_SIDE = 640
/** 抽帧数量的上下限 */
const MIN_FRAMES = 4
const MAX_FRAMES = 12
/** 短于这个时长（秒）不识别 */
const MIN_DURATION = 4
/** 整帧灰度标准差低于这个值的帧（黑场、淡入淡出、纯色）不参与 */
const FLAT_STD = 8
/** 像素的跨帧方差超过这个值算“在动” */
const DYNAMIC_VAR = 100
/** 在动的像素占比低于这个值，说明画面整体静止（PPT、静态图），持续边缘分不出水印 */
const MIN_DYNAMIC = 0.2
/** Sobel（|gx|+|gy|）超过这个值算边缘 */
const EDGE_T = 48
/** 至少这么大比例的帧里都是边缘，才算“持续边缘” */
const PERSIST = 0.75
/** 每个角的搜索范围（占宽、高的比例） */
const ROI_W = 0.4
const ROI_H = 0.25
/** 连通前的膨胀半径（占短边的比例），把文字笔画连成块；横向大一些，让一行字连起来 */
const DILATE_X = 0.02
const DILATE_Y = 0.008
/** 持续边缘像素少于这个数的块丢掉 */
const MIN_PIXELS = 15
/** 两块横向间距不超过高度的这么多倍、纵向重叠超过这个比例就合并（同一行文字） */
const MERGE_GAP_X = 1
const MERGE_OVERLAP_Y = 0.3
/** 上下两块间距不超过高度的这么多倍、横向有重叠就合并（logo 和昵称分两行） */
const MERGE_GAP_Y = 0.6
/** 块的高、宽占短边的比例范围 */
const MIN_H = 0.025
const MAX_H = 0.2
const MIN_W = 0.06
const MAX_W = 0.8
/** 宽高比范围：水印是横向的一行或两行字 */
const MIN_ASPECT = 1.2
const MAX_ASPECT = 15
/** 离最近两条边的最大距离（占宽、高的比例） */
const MAX_MARGIN_X = 0.08
const MAX_MARGIN_Y = 0.1
/** 框里持续边缘像素的最低密度 */
const MIN_DENSITY = 0.08
/** 横向、纵向连续的持续边缘超过这个长度（占短边的比例）算长直线（门框、画框、黑边分界线），不参与识别 */
const LINE_H = 0.5
const LINE_V = 0.15
/** 框外一圈的宽度（占框高的比例）和这一圈里持续边缘的上限：水印周围应该是变化的画面 */
const RING_PAD = 0.6
const RING_P = 0.5
const MAX_RING = 0.12
/** B站水印默认在右上角，其他角稍微降权 */
const PRIOR: Record<Corner, number> = { tr: 1, tl: 0.92, bl: 0.92, br: 0.92 }
/** 没认出 B站标志的候选，分数封顶在自动阈值以下，只作为建议 */
const GENERIC_CAP = 0.6

/** bilibili 标志（从 480p 画面里取的，# 是笔画），水印里它总在昵称右边 */
export const LOGO = [
  '...##.............................##..........................',
  '#####...........................####..........................',
  '#####..........................#####..........................',
  '#####................###.......#####................####......',
  '#####................####.......####................####......',
  '#####................####.......####.................###......',
  '.####................####.......####.................###......',
  '.####................####.......####.................###......',
  '.####............###..###....#..####............#.##.###..#...',
  '.####...........####..###.####...###............####.###..####',
  '.####............###..###.####...####...........####.###..####',
  '.####............####.###..###...####...........####..##..####',
  '..###............#.#..###..###...####...........##....###.####',
  '..###.................###........####.................###.....',
  '..###............####.###..###...####............###..###.####',
  '..###............####..##..####..####............###..###.####',
  '..####............###..##..####...###............####.###.####',
  '..##########......###..###.####...##########.....####.###.####',
  '..#############...###..###.####...############...####.###.####',
  '..###############.####.###.####...##############..###.###..###',
  '...#####.#############.###.####...######.########.###..##..###',
  '...#####....######.###.###.####...######...######.###..##..###',
  '...#####...######..###.###.####...######..#######.###..##..###',
  '...#####..#######..###.###..###...######.#######..###..###.###',
  '...############....###......###...#############....###.....###',
  '...##########...............##....###########..............###',
  '...########.......................########....................'
]
/** 标志高度占短边的比例：B站按画面短边等比缩放水印 */
const LOGO_H = 27 / 480
/** 标志离上（下）边、右边约 0.03 倍短边；搜索时上下放宽到这么多 */
const LOGO_BAND = 0.07
/** 右边的水印右对齐，标志右边缘离右边不超过这么多（占短边） */
const LOGO_RIGHT = 0.06
/** 左边的水印从左往右排，标志前面是昵称，标志最远到这里（占短边） */
const LOGO_LEFT = 0.75
/** 归一化互相关达到这个值算认出了标志（真水印 0.8 以上，其他画面 0.5 以下） */
const LOGO_MIN = 0.7
/** 昵称：标志左边一行里的持续边缘（比例 ≥ NAME_P），空隙不超过标志高度的 NAME_GAP 倍算连着 */
const NAME_P = 0.5
const NAME_GAP = 0.8
/** 和这一行上下各这么高（占标志高度）的范围比，行内边缘要多出来才算文字，背景纹理上下一样多 */
const NAME_PAD = 0.5
/** 逐列的差在左右各这么宽（占标志高度）的窗口里平均，平均每列多出标志高度的这么多倍才算文字 */
const NAME_WIN = 0.2
const NAME_EXCESS = 0.2
/** 行内至少有这么多边缘、且比上下多这么多的列，算作昵称的一部分（不重置空隙计数） */
const NAME_WEAK = 2
/** 昵称最长 16 个字，最宽约为标志高度的这么多倍 */
const NAME_MAX = 10
/** 昵称至少有这么宽（占标志高度）才算找到了 */
const NAME_MIN = 0.4

export function analysisSize(W: number, H: number): { w: number; h: number; scale: number } {
  const s = Math.min(1, MAX_SIDE / Math.max(W, H))
  const w = Math.max(2, Math.round((W * s) / 2) * 2)
  const h = Math.max(2, Math.round((H * s) / 2) * 2)
  return { w, h, scale: w / W }
}

export function frameCount(duration: number): number {
  if (!(duration >= MIN_DURATION)) return 0
  return Math.min(MAX_FRAMES, Math.max(MIN_FRAMES, Math.floor(duration / 2)))
}

interface Blob {
  x0: number
  y0: number
  x1: number
  y1: number
  /** 持续边缘像素数 */
  cnt: number
  /** 这些像素的持续比例之和 */
  psum: number
}

function frameStd(f: Uint8Array): number {
  let a = 0
  let b = 0
  for (let i = 0; i < f.length; i++) {
    a += f[i]
    b += f[i] * f[i]
  }
  const m = a / f.length
  return Math.sqrt(Math.max(0, b / f.length - m * m))
}

interface Stats {
  /** 逐像素：是持续边缘的帧占比 */
  P: Float32Array
  /** 在动像素的占比 */
  dynamic: number
  /** 跨帧最小值、均值：半透明白字在最小值图上最显眼，背景不怎么动时均值图更稳 */
  min: Float32Array
  mean: Float32Array
}

function persistence(frames: Uint8Array[], w: number, h: number): Stats {
  const n = frames.length
  const P = new Float32Array(w * h)
  const sum = new Float32Array(w * h)
  const sq = new Float32Array(w * h)
  const min = new Float32Array(w * h).fill(255)
  const step = 1 / n
  for (const f of frames) {
    for (let i = 0; i < f.length; i++) {
      sum[i] += f[i]
      sq[i] += f[i] * f[i]
      if (f[i] < min[i]) min[i] = f[i]
    }
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x
        const a = f[i - w - 1]
        const c = f[i - w + 1]
        const g = f[i + w - 1]
        const k = f[i + w + 1]
        const gx = c + 2 * f[i + 1] + k - a - 2 * f[i - 1] - g
        const gy = g + 2 * f[i + w] + k - a - 2 * f[i - w] - c
        if ((gx < 0 ? -gx : gx) + (gy < 0 ? -gy : gy) > EDGE_T) P[i] += step
      }
    }
  }
  let moving = 0
  const mean = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const m = (mean[i] = sum[i] / n)
    if (sq[i] / n - m * m > DYNAMIC_VAR) moving++
  }
  return { P, dynamic: moving / (w * h), min, mean }
}

/** 把标志模板缩放到 tw×th（面积平均），减去均值，返回模板和它的模长 */
function logoTemplate(tw: number, th: number): { t: Float32Array; norm: number } {
  const TW = LOGO[0].length
  const TH = LOGO.length
  const t = new Float32Array(tw * th)
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const sx0 = Math.floor((x * TW) / tw)
      const sx1 = Math.ceil(((x + 1) * TW) / tw)
      const sy0 = Math.floor((y * TH) / th)
      const sy1 = Math.ceil(((y + 1) * TH) / th)
      let on = 0
      for (let yy = sy0; yy < sy1; yy++) for (let xx = sx0; xx < sx1; xx++) if (LOGO[yy][xx] === '#') on++
      t[y * tw + x] = on / ((sx1 - sx0) * (sy1 - sy0))
    }
  }
  const m = t.reduce((a, b) => a + b, 0) / t.length
  let ss = 0
  for (let i = 0; i < t.length; i++) {
    t[i] -= m
    ss += t[i] * t[i]
  }
  return { t, norm: Math.sqrt(ss) }
}

interface LogoHit {
  x: number
  y: number
  w: number
  h: number
  ncc: number
}

/** 在 img 的 [x0,x1]×[y0,y1]（模板左上角的范围）里找和模板最像的位置 */
function matchIn(img: Float32Array, w: number, tpl: { t: Float32Array; norm: number }, tw: number, th: number, x0: number, x1: number, y0: number, y1: number, best: LogoHit): void {
  const n = tw * th
  const { t, norm } = tpl
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let sum = 0
      let sq = 0
      let dot = 0
      for (let j = 0; j < th; j++) {
        const row = (y + j) * w + x
        const tr = j * tw
        for (let i = 0; i < tw; i++) {
          const v = img[row + i]
          sum += v
          sq += v * v
          dot += v * t[tr + i]
        }
      }
      const varI = sq - (sum * sum) / n
      // 平坦区域（纯色）没有可比的
      if (varI < n) continue
      const ncc = dot / (Math.sqrt(varI) * norm)
      if (ncc > best.ncc) Object.assign(best, { x, y, w: tw, h: th, ncc })
    }
  }
}

/** 在四个角的上下边带里找 bilibili 标志 */
function findLogo(st: Stats, w: number, h: number): LogoHit | undefined {
  const S = Math.min(w, h)
  const th = Math.round(S * LOGO_H)
  const tw = Math.round((th * LOGO[0].length) / LOGO.length)
  if (th < 8 || tw >= w || th >= h) return undefined
  const tpl = logoTemplate(tw, th)
  const band = Math.round(S * LOGO_BAND)
  const rows: [number, number][] = [
    [0, Math.min(band, h - th)],
    [Math.max(0, h - th - band), h - th]
  ]
  const cols: [number, number][] = [
    [0, Math.min(w - tw, Math.round(S * LOGO_LEFT))],
    [Math.max(0, w - tw - Math.round(S * LOGO_RIGHT)), w - tw]
  ]
  const best: LogoHit = { x: 0, y: 0, w: tw, h: th, ncc: -1 }
  for (const img of [st.min, st.mean]) {
    for (const [y0, y1] of rows) for (const [x0, x1] of cols) matchIn(img, w, tpl, tw, th, x0, x1, y0, y1, best)
  }
  return best.ncc >= LOGO_MIN ? best : undefined
}

/**
 * 昵称在标志左边同一行：逐列比较这一行里的持续边缘和它上下同样高度里的持续边缘，
 * 行内多出来的就是文字。背景是不动的纹理（草地、树、游戏界面）时上下也有边缘，
 * 但叠上昵称后行内仍会多出一截；空隙太长或超过最长昵称才停。宁可宽一点，也不留半截昵称。
 * 返回昵称最左边的 x
 */
function nameStart(P: Float32Array, line: Uint8Array, w: number, h: number, logo: LogoHit): number {
  const maxK = Math.min(logo.x, Math.round(logo.h * NAME_MAX))
  const pad = Math.round(logo.h * NAME_PAD)
  const top = Math.max(0, logo.y - pad)
  const bottom = Math.min(h, logo.y + logo.h + pad)
  // 上下两条加起来和这一行一样高；贴着画面边缘被截掉时按比例补齐
  const scale = logo.h / Math.max(1, logo.y - top + bottom - logo.y - logo.h)
  const edge = (x: number, y: number): number => (P[y * w + x] >= NAME_P && !line[y * w + x] ? 1 : 0)
  // 标志左边第 k+1 列：inside 是行内边缘数，diff 是行内减去上下的
  const inside = new Uint16Array(maxK)
  const diff = new Float32Array(maxK)
  for (let k = 0; k < maxK; k++) {
    const x = logo.x - 1 - k
    let outside = 0
    for (let y = logo.y; y < logo.y + logo.h; y++) inside[k] += edge(x, y)
    for (let y = top; y < logo.y; y++) outside += edge(x, y)
    for (let y = logo.y + logo.h; y < bottom; y++) outside += edge(x, y)
    diff[k] = inside[k] - outside * scale
  }
  const r = Math.max(1, Math.round(logo.h * NAME_WIN))
  const need = logo.h * NAME_EXCESS
  const gapMax = Math.round(logo.h * NAME_GAP)
  // 窗口里文字明显（行内比上下多出一截）的列确认昵称还在继续；
  // 只多出一点的列（开头是“一”“-”“_”这类横笔画、浅色背景上很淡的字）也算进框，但不能单靠它们一直往左走
  let left = -1
  let gap = 0
  for (let k = 0; k < maxK && gap <= gapMax; k++) {
    let sum = 0
    let n = 0
    for (let j = Math.max(0, k - r); j <= Math.min(maxK - 1, k + r); j++) {
      sum += diff[j]
      n++
    }
    if (sum / n >= need) {
      left = k
      gap = 0
    } else if (left >= 0 && inside[k] >= NAME_WEAK && diff[k] >= NAME_WEAK) left = k
    else gap++
  }
  return left < 0 ? logo.x : logo.x - 1 - left
}

/** 长直线上的像素：在 P ≥ RING_P 的图里横向或纵向连续得太长 */
function lineMap(P: Float32Array, w: number, h: number): Uint8Array {
  const S = Math.min(w, h)
  const lenH = Math.round(S * LINE_H)
  const lenV = Math.round(S * LINE_V)
  const line = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    let run = 0
    for (let x = 0; x <= w; x++) {
      if (x < w && P[y * w + x] >= RING_P) {
        run++
        continue
      }
      if (run >= lenH) line.fill(1, y * w + x - run, y * w + x)
      run = 0
    }
  }
  for (let x = 0; x < w; x++) {
    let run = 0
    for (let y = 0; y <= h; y++) {
      if (y < h && P[y * w + x] >= RING_P) {
        run++
        continue
      }
      if (run >= lenV) for (let k = y - run; k < y; k++) line[k * w + x] = 1
      run = 0
    }
  }
  return line
}

/** 一个角里的持续边缘块（坐标是整幅画面的） */
function cornerBlobs(mask: Uint8Array, P: Float32Array, w: number, h: number, corner: Corner): Blob[] {
  const rw = Math.round(w * ROI_W)
  const rh = Math.round(h * ROI_H)
  const ox = corner[1] === 'l' ? 0 : w - rw
  const oy = corner[0] === 't' ? 0 : h - rh
  const S = Math.min(w, h)
  const rx = Math.max(2, Math.round(S * DILATE_X))
  const ry = Math.max(1, Math.round(S * DILATE_Y))
  // 只在搜索范围里膨胀
  const dil = new Uint8Array(rw * rh)
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      if (!mask[(oy + y) * w + ox + x]) continue
      for (let yy = Math.max(0, y - ry); yy <= Math.min(rh - 1, y + ry); yy++) {
        dil.fill(1, yy * rw + Math.max(0, x - rx), yy * rw + Math.min(rw - 1, x + rx) + 1)
      }
    }
  }
  const innerX = corner[1] === 'l' ? rw - 1 : 0
  const innerY = corner[0] === 't' ? rh - 1 : 0
  const seen = new Uint8Array(rw * rh)
  const blobs: Blob[] = []
  const stack: number[] = []
  const visit = (q: number): void => {
    if (dil[q] && !seen[q]) {
      seen[q] = 1
      stack.push(q)
    }
  }
  for (let start = 0; start < rw * rh; start++) {
    if (!dil[start] || seen[start]) continue
    seen[start] = 1
    stack.push(start)
    const b: Blob = { x0: Infinity, y0: Infinity, x1: -1, y1: -1, cnt: 0, psum: 0 }
    /** 碰到了搜索范围靠画面中间的那条边：伸向画面中间的东西（黑边分界线、横幅）不是水印 */
    let inner = false
    while (stack.length) {
      const p = stack.pop() as number
      const x = p % rw
      const y = (p - x) / rw
      if (x === innerX || y === innerY) inner = true
      const gi = (oy + y) * w + ox + x
      if (mask[gi]) {
        b.cnt++
        b.psum += P[gi]
        if (x < b.x0) b.x0 = x
        if (x > b.x1) b.x1 = x
        if (y < b.y0) b.y0 = y
        if (y > b.y1) b.y1 = y
      }
      if (x > 0) visit(p - 1)
      if (x < rw - 1) visit(p + 1)
      if (y > 0) visit(p - rw)
      if (y < rh - 1) visit(p + rw)
    }
    // 伸向中间的块直接丢掉，也不参与合并，免得把旁边的水印一起拖下水
    if (b.cnt < MIN_PIXELS || inner) continue
    blobs.push({ ...b, x0: b.x0 + ox, x1: b.x1 + ox, y0: b.y0 + oy, y1: b.y1 + oy })
  }
  return mergeBlobs(blobs)
}

/** 同一行相邻的字、上下两行（logo 和昵称）合成一块，直到不再变化 */
function mergeBlobs(blobs: Blob[]): Blob[] {
  const list = blobs.slice()
  let merged = true
  while (merged) {
    merged = false
    outer: for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (!adjacent(list[i], list[j])) continue
        const a = list[i]
        const b = list[j]
        list[i] = {
          x0: Math.min(a.x0, b.x0),
          y0: Math.min(a.y0, b.y0),
          x1: Math.max(a.x1, b.x1),
          y1: Math.max(a.y1, b.y1),
          cnt: a.cnt + b.cnt,
          psum: a.psum + b.psum
        }
        list.splice(j, 1)
        merged = true
        break outer
      }
    }
  }
  return list
}

function adjacent(a: Blob, b: Blob): boolean {
  const ah = a.y1 - a.y0 + 1
  const bh = b.y1 - b.y0 + 1
  const maxH = Math.max(ah, bh)
  const gapX = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1) - 1
  const gapY = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1) - 1
  const overlapY = -gapY - 1
  if (gapX <= maxH * MERGE_GAP_X && overlapY >= Math.min(ah, bh) * MERGE_OVERLAP_Y) return true
  return gapX < 0 && gapY >= 0 && gapY <= maxH * MERGE_GAP_Y
}

/** 按形状、位置、周围环境打分；不像水印返回 0 */
function scoreBlob(b: Blob, P: Float32Array, line: Uint8Array, w: number, h: number, corner: Corner): number {
  const bw = b.x1 - b.x0 + 1
  const bh = b.y1 - b.y0 + 1
  const S = Math.min(w, h)
  if (bh / S < MIN_H || bh / S > MAX_H || bw / S < MIN_W || bw / S > MAX_W) return 0
  if (bw / bh < MIN_ASPECT || bw / bh > MAX_ASPECT) return 0
  const marginX = corner[1] === 'l' ? b.x0 : w - 1 - b.x1
  const marginY = corner[0] === 't' ? b.y0 : h - 1 - b.y1
  if (marginX > w * MAX_MARGIN_X || marginY > h * MAX_MARGIN_Y) return 0
  const density = b.cnt / (bw * bh)
  if (density < MIN_DENSITY) return 0
  const pad = Math.max(3, Math.round(bh * RING_PAD))
  let ring = 0
  let ringN = 0
  for (let y = Math.max(0, b.y0 - pad); y <= Math.min(h - 1, b.y1 + pad); y++) {
    for (let x = Math.max(0, b.x0 - pad); x <= Math.min(w - 1, b.x1 + pad); x++) {
      if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) continue
      ringN++
      if (P[y * w + x] >= RING_P && !line[y * w + x]) ring++
    }
  }
  const ringD = ring / Math.max(1, ringN)
  if (ringD >= MAX_RING) return 0
  return (b.psum / b.cnt) * Math.min(1, 3 * density) * (1 - 5 * ringD) * PRIOR[corner]
}

export function detectWatermark(frames: Uint8Array[], w: number, h: number): DetectResult {
  const usable = frames.filter((f) => f.length === w * h)
  const valid = w >= 8 && h >= 8 ? usable.filter((f) => frameStd(f) >= FLAT_STD) : []
  if (valid.length < Math.max(MIN_FRAMES, Math.ceil(usable.length / 2))) return { score: 0, reason: 'few-frames' }
  const st = persistence(valid, w, h)
  const { P } = st
  const line = lineMap(P, w, h)
  const staticScene = st.dynamic < MIN_DYNAMIC
  const tag = staticScene ? { reason: 'static' as const } : {}

  const logo = findLogo(st, w, h)
  if (logo) {
    const left = nameStart(P, line, w, h, logo)
    const named = logo.x - left >= logo.h * NAME_MIN
    // 没找到昵称就猜一个四五个字的宽度，只作为建议
    const x0 = named ? left : Math.max(0, logo.x - Math.round(logo.h * 2.5))
    const box = { x: x0, y: logo.y, w: logo.x + logo.w - x0, h: logo.h }
    const top = logo.y + logo.h / 2 < h / 2
    const right = box.x + box.w / 2 >= w / 2
    const corner = `${top ? 't' : 'b'}${right ? 'r' : 'l'}` as Corner
    const score = Math.round((named ? logo.ncc : Math.min(logo.ncc, GENERIC_CAP)) * 1000) / 1000
    return { box, corner, score, ...tag }
  }

  const mask = new Uint8Array(w * h)
  for (let i = 0; i < mask.length; i++) mask[i] = P[i] >= PERSIST && !line[i] ? 1 : 0
  let best: { blob: Blob; corner: Corner; score: number } | undefined
  for (const corner of ['tr', 'tl', 'br', 'bl'] as Corner[]) {
    for (const blob of cornerBlobs(mask, P, w, h, corner)) {
      const score = scoreBlob(blob, P, line, w, h, corner)
      if (score > 0 && (!best || score > best.score)) best = { blob, corner, score }
    }
  }
  if (!best) return { score: 0, reason: staticScene ? 'static' : 'none' }
  const { blob, corner, score } = best
  const box = { x: blob.x0, y: blob.y0, w: blob.x1 - blob.x0 + 1, h: blob.y1 - blob.y0 + 1 }
  return { box, corner, score: Math.round(Math.min(score, GENERIC_CAP) * 1000) / 1000, ...tag }
}
