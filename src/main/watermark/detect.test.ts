import { describe, expect, it } from 'vitest'
import { analysisSize, AUTO_MIN_SCORE, detectWatermark, frameCount, LOGO, type Rect, SUGGEST_MIN_SCORE } from './detect'

/** 带种子的伪随机数，保证每次生成的画面一样 */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const W = 320
const H = 180

/** 每帧不同的平滑背景（粗网格双线性插值）加几个随机位置的色块，亮度控制在 0-200 */
function background(w: number, h: number, rand: () => number): Uint8Array {
  const cell = 40
  const gw = Math.ceil(w / cell) + 1
  const gh = Math.ceil(h / cell) + 1
  const grid = Array.from({ length: gw * gh }, () => rand() * 200)
  const f = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x / cell
      const gy = y / cell
      const x0 = Math.floor(gx)
      const y0 = Math.floor(gy)
      const fx = gx - x0
      const fy = gy - y0
      const v =
        grid[y0 * gw + x0] * (1 - fx) * (1 - fy) +
        grid[y0 * gw + x0 + 1] * fx * (1 - fy) +
        grid[(y0 + 1) * gw + x0] * (1 - fx) * fy +
        grid[(y0 + 1) * gw + x0 + 1] * fx * fy
      f[y * w + x] = v
    }
  }
  for (let k = 0; k < 6; k++) {
    const bw = 10 + Math.floor(rand() * 40)
    const bh = 10 + Math.floor(rand() * 30)
    const bx = Math.floor(rand() * (w - bw))
    const by = Math.floor(rand() * (h - bh))
    fill(f, w, { x: bx, y: by, w: bw, h: bh }, Math.floor(rand() * 200))
  }
  return f
}

function fill(f: Uint8Array, w: number, r: Rect, v: number): void {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) f[y * w + x] = v
}

/** 半透明白色叠加 */
function blend(f: Uint8Array, w: number, r: Rect, alpha = 0.7): void {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) f[y * w + x] = Math.round(f[y * w + x] * (1 - alpha) + 255 * alpha)
  }
}

/** 把 bilibili 标志缩放到 th 高，半透明白色叠到 (x, y) */
function drawLogo(f: Uint8Array, w: number, x: number, y: number, th: number, alpha = 0.8): void {
  const tw = Math.round((th * LOGO[0].length) / LOGO.length)
  for (let j = 0; j < th; j++) {
    for (let i = 0; i < tw; i++) {
      if (LOGO[Math.floor((j * LOGO.length) / th)][Math.floor((i * LOGO[0].length) / tw)] !== '#') continue
      const k = (y + j) * w + x + i
      f[k] = Math.round(f[k] * (1 - alpha) + 255 * alpha)
    }
  }
}

/** 一行“字”：n 个 2 像素描边的空心方块，宽 gw、间距 2 */
function text(x: number, y: number, n: number, gh = 12, gw = 8): Rect[] {
  const strokes: Rect[] = []
  for (let i = 0; i < n; i++) {
    const gx = x + i * (gw + 2)
    strokes.push({ x: gx, y, w: gw, h: 2 }, { x: gx, y: y + gh - 2, w: gw, h: 2 }, { x: gx, y, w: 2, h: gh }, { x: gx + gw - 2, y, w: 2, h: gh })
  }
  return strokes
}

const width = (n: number, gw = 8): number => n * (gw + 2) - 2

interface Scene {
  w?: number
  h?: number
  n?: number
  seed?: number
  /** 每帧都叠加的水印笔画 */
  marks?: Rect[]
  /** 叠在背景上、每帧不变的不透明图形（值, 区域） */
  solid?: [number, Rect][]
  /** 逐帧额外处理 */
  extra?: (f: Uint8Array, i: number) => void
  /** bilibili 标志的位置和高度 */
  logo?: { x: number; y: number; th: number }
  /** 所有帧共用同一个背景（画面不动） */
  still?: boolean
}

function frames({ w = W, h = H, n = 12, seed = 1, marks = [], solid = [], extra, logo, still }: Scene): Uint8Array[] {
  const rand = rng(seed)
  const base = still ? new Uint8Array(w * h).map((_, i) => 40 + ((i % w) * 120) / w) : undefined
  return Array.from({ length: n }, (_, i) => {
    const f = base ? base.slice() : background(w, h, rand)
    for (const [v, r] of solid) fill(f, w, r, v)
    for (const r of marks) blend(f, w, r)
    if (logo) drawLogo(f, w, logo.x, logo.y, logo.th)
    extra?.(f, i)
    return f
  })
}

/** 框和真实位置的偏差都在几个像素内 */
function expectNear(box: Rect | undefined, want: Rect, tol = 3): void {
  expect(box).toBeDefined()
  const b = box as Rect
  expect(Math.abs(b.x - want.x)).toBeLessThanOrEqual(tol)
  expect(Math.abs(b.y - want.y)).toBeLessThanOrEqual(tol)
  expect(Math.abs(b.x + b.w - want.x - want.w)).toBeLessThanOrEqual(tol)
  expect(Math.abs(b.y + b.h - want.y - want.h)).toBeLessThanOrEqual(tol)
}

describe('analysisSize', () => {
  it('长边缩到 640，宽高取偶数', () => {
    expect(analysisSize(1920, 1080)).toEqual({ w: 640, h: 360, scale: 640 / 1920 })
    expect(analysisSize(1080, 1920)).toEqual({ w: 360, h: 640, scale: 360 / 1080 })
    expect(analysisSize(853, 481)).toEqual({ w: 640, h: 360, scale: 640 / 853 })
  })

  it('小于 640 的不放大', () => {
    expect(analysisSize(320, 240)).toEqual({ w: 320, h: 240, scale: 1 })
    expect(analysisSize(321, 181)).toEqual({ w: 322, h: 182, scale: 322 / 321 })
  })
})

describe('frameCount', () => {
  it('每两秒一帧，4 到 12 帧；太短或不是数字时不识别', () => {
    expect(frameCount(3.9)).toBe(0)
    expect(frameCount(Number.NaN)).toBe(0)
    expect(frameCount(4)).toBe(4)
    expect(frameCount(10)).toBe(5)
    expect(frameCount(24)).toBe(12)
    expect(frameCount(7200)).toBe(12)
  })
})

describe('detectWatermark', () => {
  const n = 6
  const tw = width(n)
  const cases: [string, Rect][] = [
    ['tr', { x: W - 8 - tw, y: 8, w: tw, h: 12 }],
    ['tl', { x: 8, y: 8, w: tw, h: 12 }],
    ['br', { x: W - 8 - tw, y: H - 8 - 12, w: tw, h: 12 }],
    ['bl', { x: 8, y: H - 8 - 12, w: tw, h: 12 }]
  ]

  it.each(cases)('没有 B站标志时，%s 角的水印只作为建议', (corner, want) => {
    const r = detectWatermark(frames({ marks: text(want.x, want.y, n) }), W, H)
    expect(r.corner).toBe(corner)
    expect(r.reason).toBeUndefined()
    expect(r.score).toBeGreaterThanOrEqual(SUGGEST_MIN_SCORE)
    expect(r.score).toBeLessThan(AUTO_MIN_SCORE)
    expectNear(r.box, want)
  })

  it('没有水印', () => {
    expect(detectWatermark(frames({}), W, H)).toEqual({ score: 0, reason: 'none' })
  })

  it('画面不动时标记 static，但仍给出位置供参考', () => {
    const want = cases[0][1]
    // 平滑渐变上叠水印，每帧一样
    const f = new Uint8Array(W * H).map((_, i) => (i % W) / 2)
    for (const r of text(want.x, want.y, n)) blend(f, W, r)
    const r = detectWatermark([f, f, f, f, f], W, H)
    expect(r.reason).toBe('static')
    expect(r.corner).toBe('tr')
    expectNear(r.box, want)
  })

  it('画面不动且没有候选', () => {
    // 纯渐变背景没有边缘
    const f = new Uint8Array(W * H).map((_, i) => (i % W) / 2)
    expect(detectWatermark([f, f, f, f], W, H)).toEqual({ score: 0, reason: 'static' })
  })

  it('有效帧不够：帧太少、纯色帧被丢掉、长度不对的帧被忽略、画面太小', () => {
    const marks = text(cases[0][1].x, cases[0][1].y, n)
    expect(detectWatermark(frames({ marks, n: 3 }), W, H)).toEqual({ score: 0, reason: 'few-frames' })
    const black = new Uint8Array(W * H)
    expect(detectWatermark([...frames({ marks, n: 3 }), black, black, black], W, H).reason).toBe('few-frames')
    const wrong = new Uint8Array(10)
    expect(detectWatermark([wrong, wrong, wrong, wrong], W, H).reason).toBe('few-frames')
    expect(detectWatermark([new Uint8Array(16), new Uint8Array(16), new Uint8Array(16), new Uint8Array(16)], 4, 4).reason).toBe(
      'few-frames'
    )
  })

  it('长度不对的帧不影响识别', () => {
    const want = cases[0][1]
    const r = detectWatermark([new Uint8Array(5), ...frames({ marks: text(want.x, want.y, n) })], W, H)
    expectNear(r.box, want)
  })

  it('黑边里的水印', () => {
    // 上下各 30 像素黑边，水印在上方黑边里
    const want = { x: W - 8 - tw, y: 8, w: tw, h: 12 }
    const solid: [number, Rect][] = [
      [0, { x: 0, y: 0, w: W, h: 30 }],
      [0, { x: 0, y: H - 30, w: W, h: 30 }]
    ]
    const r = detectWatermark(frames({ marks: text(want.x, want.y, n), solid }), W, H)
    expect(r.corner).toBe('tr')
    expectNear(r.box, want)
  })

  it('黑边很窄、分界线紧贴水印时，分界线当长直线去掉，不影响识别', () => {
    const want = { x: W - 8 - tw, y: 4, w: tw, h: 12 }
    const solid: [number, Rect][] = [[0, { x: 0, y: 0, w: W, h: 20 }]]
    const r = detectWatermark(frames({ marks: text(want.x, want.y, n), solid }), W, H)
    expectNear(r.box, want)
  })

  it('门框之类的竖线穿过水印时，竖线当长直线去掉', () => {
    const want = cases[1][1]
    const solid: [number, Rect][] = [[230, { x: 30, y: 0, w: 3, h: H }]]
    const r = detectWatermark(frames({ marks: text(want.x, want.y, n), solid }), W, H)
    expect(r.corner).toBe('tl')
    expectNear(r.box, want)
  })

  it('水印周围是大半时间不变的纹理时，外圈太密被拒', () => {
    const want = cases[0][1]
    const tex = rng(7)
    const noise = Array.from({ length: (want.w + 14) * 6 }, () => Math.floor(tex() * 200))
    // 前 8 帧在水印下方贴同一块噪点：持续比例约 0.67，不够算进水印，但算进外圈
    const extra = (f: Uint8Array, i: number): void => {
      if (i >= 8) return
      for (let y = 0; y < 6; y++) for (let x = 0; x < want.w + 14; x++) f[(want.y + want.h + 1 + y) * W + want.x - 7 + x] = noise[y * (want.w + 14) + x]
    }
    expect(detectWatermark(frames({ marks: text(want.x, want.y, n), extra }), W, H)).toEqual({ score: 0, reason: 'none' })
  })

  it('横贯画面的线条不算水印', () => {
    const marks: Rect[] = [{ x: 0, y: 10, w: W, h: 3 }]
    expect(detectWatermark(frames({ marks }), W, H)).toEqual({ score: 0, reason: 'none' })
  })

  it('方形的 HUD 不算水印', () => {
    const hud: Rect[] = [
      { x: 8, y: 8, w: 30, h: 2 },
      { x: 8, y: 36, w: 30, h: 2 },
      { x: 8, y: 8, w: 2, h: 30 },
      { x: 36, y: 8, w: 2, h: 30 }
    ]
    expect(detectWatermark(frames({ marks: hud }), W, H)).toEqual({ score: 0, reason: 'none' })
  })

  it('伸到角落外面的大块、零星的小点都不算', () => {
    const tex = rng(5)
    const block = Array.from({ length: 140 * 60 }, () => Math.floor(tex() * 200))
    const extra = (f: Uint8Array): void => {
      // 左上角一大块不动的纹理，从画面边缘一直伸到搜索范围外
      for (let y = 0; y < 60; y++) for (let x = 0; x < 140; x++) f[y * W + x] = block[y * 140 + x]
    }
    // 右下角一个孤零零的点
    const dot: Rect[] = [{ x: W - 20, y: H - 20, w: 1, h: 1 }]
    expect(detectWatermark(frames({ marks: dot, extra }), W, H)).toEqual({ score: 0, reason: 'none' })
  })

  it('同一个角里隔得远的两块各算各的；贴着画面上边的字也能找到', () => {
    const r = detectWatermark(frames({ marks: [...text(196, 2, 2), ...text(W - 8 - width(4), 8, 4)] }), W, H)
    expect(r.box?.w).toBeLessThan(width(4) + 6)
  })

  it('错开半行以上的两段字不合并', () => {
    const a = text(W - 8 - 104, 8, 4)
    const b = text(W - 8 - 104 + width(4) + 12, 8 + 11, 4)
    const r = detectWatermark(frames({ marks: [...a, ...b] }), W, H)
    expect(r.box?.w).toBeLessThan(width(4) + 6)
  })

  it('太小、太大、太扁、太稀、离边太远的都不算', () => {
    // 太小：只有一个字
    expect(detectWatermark(frames({ marks: text(W - 18, 8, 1, 4) }), W, H).reason).toBe('none')
    // 太扁：宽高比超过 15
    expect(detectWatermark(frames({ marks: [{ x: W - 92, y: 8, w: 84, h: 3 }] }), W, H).reason).toBe('none')
    // 太稀：斜着排的一串单像素点，膨胀后连成一块，但框里大多是空的
    const dots: Rect[] = Array.from({ length: 8 }, (_, k) => ({ x: W - 70 + 8 * k, y: 8 + 2 * k, w: 1, h: 1 }))
    expect(detectWatermark(frames({ marks: dots }), W, H).reason).toBe('none')
    // 太高：比短边的 20% 还高
    expect(detectWatermark(frames({ marks: text(W - 8 - width(3, 30), 4, 3, 40, 30) }), W, H).reason).toBe('none')
    // 离边太远
    expect(detectWatermark(frames({ marks: text(W - 40 - tw, 25, n) }), W, H).reason).toBe('none')
  })

  it('同一行隔开的两段文字合成一个框', () => {
    // “bilibili” 和 “@UP主” 之间空 10 像素，膨胀连不上，靠合并
    const a = text(W - 8 - 110, 8, 6)
    const b = text(W - 8 - 110 + width(6) + 10, 8, 4)
    const r = detectWatermark(frames({ marks: [...a, ...b] }), W, H)
    expectNear(r.box, { x: W - 118, y: 8, w: width(6) + 10 + width(4), h: 12 })
  })

  it('上下两行（logo 和昵称）合成一个框', () => {
    const top = text(W - 8 - width(6), 8, 6)
    const bottom = text(W - 8 - width(4), 8 + 12 + 5, 4)
    const r = detectWatermark(frames({ marks: [...top, ...bottom] }), W, H)
    expectNear(r.box, { x: W - 8 - width(6), y: 8, w: width(6), h: 29 })
  })

  it('竖屏视频', () => {
    const want = { x: 8, y: 320 - 8 - 12, w: tw, h: 12 }
    const r = detectWatermark(frames({ w: 180, h: 320, marks: text(want.x, want.y, n) }), 180, 320)
    expect(r.corner).toBe('bl')
    expect(r.score).toBeGreaterThanOrEqual(SUGGEST_MIN_SCORE)
    expectNear(r.box, want)
  })

  it('两个角都像时优先右上角', () => {
    const tr = cases[0][1]
    const tl = cases[1][1]
    const r = detectWatermark(frames({ marks: [...text(tr.x, tr.y, n), ...text(tl.x, tl.y, n)] }), W, H)
    expect(r.corner).toBe('tr')
  })

  it('建议阈值低于自动阈值', () => {
    expect(SUGGEST_MIN_SCORE).toBeLessThan(AUTO_MIN_SCORE)
  })

})

describe('认出 B站水印（昵称 + bilibili 标志）', () => {
  // 640x360：标志高 20、宽 46，离上、右边约 11 像素
  const BW = 640
  const BH = 360
  const th = 20
  const lw = 46
  /** 昵称：5 个 9x9 的字，间距 2，竖直方向在标志这一行中间偏下 */
  const name = (x: number, y: number): Rect[] => text(x, y + 7, 5, 9, 9)
  const nameW = width(5, 9)

  it.each([
    ['tr', BW - 11 - lw, 12],
    ['tl', 12 + nameW + 6, 12],
    ['br', BW - 11 - lw, BH - 12 - th],
    ['bl', 12 + nameW + 6, BH - 12 - th]
  ] as const)('%s 角：框住昵称和标志，可以自动处理', (corner, lx, ly) => {
    const nx = lx - 6 - nameW
    const r = detectWatermark(frames({ w: BW, h: BH, marks: name(nx, ly), logo: { x: lx, y: ly, th } }), BW, BH)
    expect(r.corner).toBe(corner)
    expect(r.reason).toBeUndefined()
    expect(r.score).toBeGreaterThanOrEqual(AUTO_MIN_SCORE)
    expectNear(r.box, { x: nx, y: ly, w: lx + lw - nx, h: th }, 3)
  })

  it('只有标志、找不到昵称时只作为建议，左边按四五个字估一个宽度', () => {
    const lx = BW - 11 - lw
    const r = detectWatermark(frames({ w: BW, h: BH, logo: { x: lx, y: 12, th } }), BW, BH)
    expect(r.corner).toBe('tr')
    expect(r.score).toBeGreaterThanOrEqual(SUGGEST_MIN_SCORE)
    expect(r.score).toBeLessThan(AUTO_MIN_SCORE)
    expectNear(r.box, { x: lx - 50, y: 12, w: lw + 50, h: th }, 3)
  })

  it('昵称左边隔一段是不动的纹理时，最多往那边多框一个字宽', () => {
    const lx = BW - 11 - lw
    const nx = lx - 6 - nameW
    // 昵称左侧一大块每帧不变的噪点，跨过这一行的上下
    const tex = rng(3)
    const noise = Array.from({ length: 120 * 60 }, () => Math.floor(tex() * 200))
    const extra = (f: Uint8Array): void => {
      for (let y = 0; y < 60; y++) for (let x = 0; x < 120; x++) f[y * BW + nx - 130 + x] = noise[y * 120 + x]
    }
    const r = detectWatermark(frames({ w: BW, h: BH, marks: name(nx, 12), logo: { x: lx, y: 12, th }, extra }), BW, BH)
    expect(r.score).toBeGreaterThanOrEqual(AUTO_MIN_SCORE)
    const box = r.box as Rect
    // 昵称后面的尾巴最多看一个标志高度，纹理块有 120 像素宽，不会一路框过去
    expect(box.x).toBeLessThanOrEqual(nx)
    expect(box.x).toBeGreaterThanOrEqual(nx - th - 3)
    expect(box.x + box.w).toBeGreaterThanOrEqual(lx + lw - 2)
  })

  it('昵称压在不动的纹理上（草地、树、游戏界面）时整段框进去', () => {
    const lx = BW - 11 - lw
    const nx = lx - 6 - nameW
    // 从昵称左边 40 像素到标志，整片每帧不变的稀疏暗点，上下都超出这一行
    const tex = rng(11)
    const dots: Rect[] = []
    for (let y = 0; y < 50; y += 2) for (let x = nx - 40; x < lx; x += 2) if (tex() < 0.06) dots.push({ x, y, w: 2, h: 2 })
    const extra = (f: Uint8Array): void => {
      for (let y = 0; y < 50; y++) for (let x = nx - 40; x < lx; x++) f[y * BW + x] = 120
      for (const d of dots) fill(f, BW, d, 40)
      for (const r of name(nx, 12)) blend(f, BW, r)
    }
    const r = detectWatermark(frames({ w: BW, h: BH, logo: { x: lx, y: 12, th }, extra }), BW, BH)
    expect(r.score).toBeGreaterThanOrEqual(AUTO_MIN_SCORE)
    const box = r.box as Rect
    // 昵称完整进框，往纹理里多出去的不超过一个标志高度
    expect(box.x).toBeLessThanOrEqual(nx)
    expect(box.x).toBeGreaterThanOrEqual(nx - th - 3)
    expect(box.x + box.w).toBeGreaterThanOrEqual(lx + lw - 2)
  })

  it('开头是“一”这种横笔画的字也框进去', () => {
    const lx = BW - 11 - lw
    const rest = lx - 6 - width(4, 9)
    // “一”：一条 9x2 的横线，和后面的字隔 2 像素
    const marks = [{ x: rest - 11, y: 23, w: 9, h: 2 }, ...text(rest, 19, 4, 9, 9)]
    const r = detectWatermark(frames({ w: BW, h: BH, marks, logo: { x: lx, y: 12, th } }), BW, BH)
    expect(r.score).toBeGreaterThanOrEqual(AUTO_MIN_SCORE)
    expect(r.box?.x).toBeLessThanOrEqual(rest - 11)
  })

  it('昵称中间有空格（“Mr_ 牛奶”）也连成一段', () => {
    const lx = BW - 11 - lw
    const part2 = lx - 6 - width(2, 9)
    const part1 = part2 - 12 - width(3, 9)
    const marks = [...text(part1, 19, 3, 9, 9), ...text(part2, 19, 2, 9, 9)]
    const r = detectWatermark(frames({ w: BW, h: BH, marks, logo: { x: lx, y: 12, th } }), BW, BH)
    expect(r.score).toBeGreaterThanOrEqual(AUTO_MIN_SCORE)
    expectNear(r.box, { x: part1, y: 12, w: lx + lw - part1, h: th }, 3)
  })

  it('画面不动时仍认出来，但标记 static', () => {
    const lx = BW - 11 - lw
    const nx = lx - 6 - nameW
    const r = detectWatermark(frames({ w: BW, h: BH, n: 6, marks: name(nx, 12), logo: { x: lx, y: 12, th }, still: true }), BW, BH)
    expect(r.reason).toBe('static')
    expect(r.corner).toBe('tr')
    expectNear(r.box, { x: nx, y: 12, w: lx + lw - nx, h: th }, 3)
  })

  it('画面太小、标志不到 8 像素高时不找标志', () => {
    const r = detectWatermark(frames({ w: 200, h: 112, logo: { x: 200 - 4 - 14, y: 4, th: 6 } }), 200, 112)
    expect(r.score).toBeLessThan(AUTO_MIN_SCORE)
  })

  it('640x360、12 帧算得够快', () => {
    const lx = BW - 11 - lw
    const f = frames({ w: BW, h: BH, marks: name(lx - 6 - nameW, 12), logo: { x: lx, y: 12, th } })
    detectWatermark(f, BW, BH)
    const t0 = performance.now()
    detectWatermark(f, BW, BH)
    // 平时约 40ms；覆盖率插桩、并行跑测试时会慢几倍，这里只防止数量级的退化
    expect(performance.now() - t0).toBeLessThan(1000)
  })
})
