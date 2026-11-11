// yuv420p 整帧和模型张量之间的转换：切出长条转成 RGB 交给模型，再把结果只写回掩码里的像素。
// 每帧都要跑，所以要写回的像素位置和采样坐标都事先算好

import { t } from '@shared/i18n'
import type { Strip } from './strip'

export interface ColorSpec {
  matrix: 'bt709' | 'bt601'
  /** 全范围（0-255）；否则是有限范围（亮度 16-235） */
  full: boolean
}

/** 模型结果里要写回画面的值：顺序和 StripCodec 的 lumaIdx、chromaIdx 对应 */
export interface Patch {
  y: Uint8Array
  u: Uint8Array
  v: Uint8Array
}

interface Coef {
  kr: number
  kb: number
  /** Y、UV 的偏移和缩放 */
  y0: number
  ys: number
  cs: number
}

function coef(c: ColorSpec): Coef {
  const [kr, kb] = c.matrix === 'bt709' ? [0.2126, 0.0722] : [0.299, 0.114]
  return c.full ? { kr, kb, y0: 0, ys: 1, cs: 1 } : { kr, kb, y0: 16, ys: 219 / 255, cs: 224 / 255 }
}

const clamp8 = (v: number): number => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v))

/** 在一个平面上双线性取值，坐标超出时收到边上 */
function sample(plane: Uint8Array, offset: number, pw: number, ph: number, x: number, y: number): number {
  const fx = Math.min(Math.max(x, 0), pw - 1)
  const fy = Math.min(Math.max(y, 0), ph - 1)
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(x0 + 1, pw - 1)
  const y1 = Math.min(y0 + 1, ph - 1)
  const ax = fx - x0
  const ay = fy - y0
  const r0 = offset + y0 * pw
  const r1 = offset + y1 * pw
  const top = plane[r0 + x0] * (1 - ax) + plane[r0 + x1] * ax
  const bottom = plane[r1 + x0] * (1 - ax) + plane[r1 + x1] * ax
  return top * (1 - ay) + bottom * ay
}

/** 在模型输出（CHW）上双线性取一个通道的值 */
function sampleOut(out: Float32Array, ch: number, mw: number, mh: number, x: number, y: number): number {
  const fx = Math.min(Math.max(x, 0), mw - 1)
  const fy = Math.min(Math.max(y, 0), mh - 1)
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(x0 + 1, mw - 1)
  const y1 = Math.min(y0 + 1, mh - 1)
  const ax = fx - x0
  const ay = fy - y0
  const base = ch * mw * mh
  const r0 = base + y0 * mw
  const r1 = base + y1 * mw
  return (out[r0 + x0] * (1 - ax) + out[r0 + x1] * ax) * (1 - ay) + (out[r1 + x0] * (1 - ax) + out[r1 + x1] * ax) * ay
}

export class StripCodec {
  /** 掩码覆盖的亮度像素在整帧里的下标 */
  readonly lumaIdx: Int32Array
  /** 掩码碰到的色度像素在 U 平面里的下标（V 平面相同） */
  readonly chromaIdx: Int32Array
  /** 模型的 mask 输入（mh×mw），1 表示要重画 */
  readonly maskTensor: Float32Array
  private readonly k: Coef
  private readonly sx: number
  private readonly sy: number

  /**
   * W、H 是画面尺寸；mask 是长条里（strip.w × strip.h）要重画的像素
   */
  constructor(
    readonly W: number,
    readonly H: number,
    readonly strip: Strip,
    mask: Uint8Array,
    color: ColorSpec
  ) {
    if (mask.length !== strip.w * strip.h) throw new Error(t('wm.maskSize'))
    this.k = coef(color)
    this.sx = strip.mw / strip.w
    this.sy = strip.mh / strip.h
    const luma: number[] = []
    const chroma = new Set<number>()
    const cw = W / 2
    for (let y = 0; y < strip.h; y++) {
      for (let x = 0; x < strip.w; x++) {
        if (!mask[y * strip.w + x]) continue
        const fx = strip.x + x
        const fy = strip.y + y
        luma.push(fy * W + fx)
        chroma.add((fy >> 1) * cw + (fx >> 1))
      }
    }
    this.lumaIdx = Int32Array.from(luma)
    this.chromaIdx = Int32Array.from([...chroma].sort((a, b) => a - b))
    // 模型像素对应的原画面范围里有任何一个要重画，它就要重画
    const mt = new Float32Array(strip.mw * strip.mh)
    for (let v = 0; v < strip.mh; v++) {
      const ya = Math.floor(v / this.sy)
      const yb = Math.max(ya, Math.min(strip.h - 1, Math.ceil((v + 1) / this.sy) - 1))
      for (let u = 0; u < strip.mw; u++) {
        const xa = Math.floor(u / this.sx)
        const xb = Math.max(xa, Math.min(strip.w - 1, Math.ceil((u + 1) / this.sx) - 1))
        let hit = 0
        for (let y = ya; y <= yb && !hit; y++) for (let x = xa; x <= xb && !hit; x++) hit = mask[y * strip.w + x]
        mt[v * strip.mw + u] = hit ? 1 : 0
      }
    }
    this.maskTensor = mt
  }

  /** 长条转成模型的 image 输入：RGB、CHW、0-1 */
  toTensor(frame: Uint8Array): Float32Array {
    const { W, H, strip, k } = this
    const { mw, mh } = strip
    const out = new Float32Array(3 * mw * mh)
    const plane = mw * mh
    const uOff = W * H
    const vOff = uOff + (W / 2) * (H / 2)
    const g = 1 - k.kr - k.kb
    for (let v = 0; v < mh; v++) {
      const y = strip.y + (v + 0.5) / this.sy - 0.5
      for (let u = 0; u < mw; u++) {
        const x = strip.x + (u + 0.5) / this.sx - 0.5
        const Y = (sample(frame, 0, W, H, x, y) - k.y0) / k.ys
        const U = (sample(frame, uOff, W / 2, H / 2, (x + 0.5) / 2 - 0.5, (y + 0.5) / 2 - 0.5) - 128) / k.cs
        const V = (sample(frame, vOff, W / 2, H / 2, (x + 0.5) / 2 - 0.5, (y + 0.5) / 2 - 0.5) - 128) / k.cs
        const r = Y + 2 * (1 - k.kr) * V
        const b = Y + 2 * (1 - k.kb) * U
        const gg = (Y - k.kr * r - k.kb * b) / g
        const i = v * mw + u
        out[i] = Math.min(1, Math.max(0, r / 255))
        out[plane + i] = Math.min(1, Math.max(0, gg / 255))
        out[2 * plane + i] = Math.min(1, Math.max(0, b / 255))
      }
    }
    return out
  }

  /** 原画面坐标 → 模型输出坐标 */
  private mx(fx: number): number {
    return (fx - this.strip.x + 0.5) * this.sx - 0.5
  }
  private my(fy: number): number {
    return (fy - this.strip.y + 0.5) * this.sy - 0.5
  }

  /** 把模型输出（RGB、CHW、0-255）换算成要写回的 YUV 值 */
  render(out: Float32Array): Patch {
    const { W, strip, k } = this
    const { mw, mh } = strip
    if (out.length !== 3 * mw * mh) throw new Error(t('wm.outputSize'))
    const rgb = (fx: number, fy: number): [number, number, number] => {
      const x = this.mx(fx)
      const y = this.my(fy)
      return [sampleOut(out, 0, mw, mh, x, y), sampleOut(out, 1, mw, mh, x, y), sampleOut(out, 2, mw, mh, x, y)]
    }
    const g = 1 - k.kr - k.kb
    const py = new Uint8Array(this.lumaIdx.length)
    for (let i = 0; i < py.length; i++) {
      const idx = this.lumaIdx[i]
      const [r, gg, b] = rgb(idx % W, Math.floor(idx / W))
      py[i] = clamp8(k.y0 + (k.kr * r + g * gg + k.kb * b) * k.ys)
    }
    const cw = W / 2
    const pu = new Uint8Array(this.chromaIdx.length)
    const pv = new Uint8Array(this.chromaIdx.length)
    for (let i = 0; i < pu.length; i++) {
      const idx = this.chromaIdx[i]
      // 色度像素在亮度坐标里的中心
      const [r, gg, b] = rgb((idx % cw) * 2 + 0.5, Math.floor(idx / cw) * 2 + 0.5)
      const yy = k.kr * r + g * gg + k.kb * b
      pu[i] = clamp8(128 + ((b - yy) / (2 * (1 - k.kb))) * k.cs)
      pv[i] = clamp8(128 + ((r - yy) / (2 * (1 - k.kr))) * k.cs)
    }
    return { y: py, u: pu, v: pv }
  }

  /** 把结果写进整帧 */
  apply(frame: Uint8Array, p: Patch): void {
    const uOff = this.W * this.H
    const vOff = uOff + (this.W / 2) * (this.H / 2)
    for (let i = 0; i < this.lumaIdx.length; i++) frame[this.lumaIdx[i]] = p.y[i]
    for (let i = 0; i < this.chromaIdx.length; i++) {
      frame[uOff + this.chromaIdx[i]] = p.u[i]
      frame[vOff + this.chromaIdx[i]] = p.v[i]
    }
  }

  /** 长条范围的亮度，判断画面有没有变化用 */
  lumaStrip(frame: Uint8Array): Uint8Array {
    const { W, strip } = this
    const out = new Uint8Array(strip.w * strip.h)
    for (let y = 0; y < strip.h; y++) {
      const row = (strip.y + y) * W + strip.x
      out.set(frame.subarray(row, row + strip.w), y * strip.w)
    }
    return out
  }
}

/** 判断画面没变的门槛：16×16 小块平均差的最大值、整条平均差 */
const BLOCK = 16
const MAX_BLOCK_DIFF = 2.5
const MAX_MEAN_DIFF = 1

/**
 * 两帧长条的亮度几乎一样（静止画面、只有压缩噪点）：可以直接沿用上次的结果，
 * 省掉推理，也避免模型每帧补得略有不同造成的闪烁。和上一次真正推理的那帧比，变化不会越积越多
 */
export function sameScene(a: Uint8Array, b: Uint8Array, w: number, h: number): boolean {
  let total = 0
  for (let by = 0; by < h; by += BLOCK) {
    for (let bx = 0; bx < w; bx += BLOCK) {
      let sum = 0
      let n = 0
      for (let y = by; y < Math.min(h, by + BLOCK); y++) {
        for (let x = bx; x < Math.min(w, bx + BLOCK); x++) {
          sum += Math.abs(a[y * w + x] - b[y * w + x])
          n++
        }
      }
      if (sum / n > MAX_BLOCK_DIFF) return false
      total += sum
    }
  }
  return total / (w * h) <= MAX_MEAN_DIFF
}
