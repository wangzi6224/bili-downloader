import { describe, expect, it } from 'vitest'
import { sameScene, StripCodec, type ColorSpec } from './pixels'
import type { Strip } from './strip'

const W = 64
const H = 32

/** 一帧 yuv420p：亮度是渐变，色度是另外两种渐变 */
function frame(seed = 0): Uint8Array {
  const f = new Uint8Array((W * H * 3) / 2)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) f[y * W + x] = 40 + ((x * 3 + y * 2 + seed) % 160)
  const u = W * H
  const v = u + (W / 2) * (H / 2)
  for (let y = 0; y < H / 2; y++) {
    for (let x = 0; x < W / 2; x++) {
      f[u + y * (W / 2) + x] = 100 + ((x + seed) % 50)
      f[v + y * (W / 2) + x] = 140 - ((y + seed) % 40)
    }
  }
  return f
}

const BT709: ColorSpec = { matrix: 'bt709', full: false }

/** 长条里中间一块要重画 */
function mask(s: Strip): Uint8Array {
  const m = new Uint8Array(s.w * s.h)
  for (let y = 4; y < 12; y++) for (let x = 6; x < 26; x++) m[y * s.w + x] = 1
  return m
}

describe('StripCodec', () => {
  const strip: Strip = { x: 16, y: 8, w: 32, h: 16, mw: 32, mh: 16 }

  it('只记录掩码覆盖的像素；色度按 2×2 块', () => {
    const c = new StripCodec(W, H, strip, mask(strip), BT709)
    expect(c.lumaIdx.length).toBe(8 * 20)
    expect(c.chromaIdx.length).toBe(4 * 10)
    expect(c.lumaIdx[0]).toBe((8 + 4) * W + 16 + 6)
    expect([...c.maskTensor].filter((v) => v === 1).length).toBe(8 * 20)
  })

  it('模型原样输出时，写回的像素和原来几乎一样（BT.709 有限范围、BT.601 全范围）', () => {
    for (const color of [BT709, { matrix: 'bt601', full: true } as ColorSpec]) {
      const f = frame()
      const c = new StripCodec(W, H, strip, mask(strip), color)
      const img = c.toTensor(f)
      expect(img.length).toBe(3 * 32 * 16)
      expect(Math.max(...img)).toBeLessThanOrEqual(1)
      const patch = c.render(img.map((v) => v * 255))
      const g = f.slice()
      c.apply(g, patch)
      let maxDiff = 0
      for (let i = 0; i < f.length; i++) maxDiff = Math.max(maxDiff, Math.abs(f[i] - g[i]))
      expect(maxDiff).toBeLessThanOrEqual(3)
    }
  })

  it('写回只改掩码里的像素', () => {
    const f = frame()
    const c = new StripCodec(W, H, strip, mask(strip), BT709)
    const out = new Float32Array(3 * 32 * 16).fill(255)
    const g = f.slice()
    c.apply(g, c.render(out))
    const luma = new Set(c.lumaIdx)
    for (let i = 0; i < W * H; i++) {
      if (luma.has(i)) expect(g[i]).toBe(235)
      else expect(g[i]).toBe(f[i])
    }
    // 白色：色度回到中间
    expect(g[W * H + c.chromaIdx[0]]).toBe(128)
  })

  it('缩放：模型输入比长条小，写回时按比例取值', () => {
    const big: Strip = { x: 0, y: 0, w: 64, h: 32, mw: 32, mh: 16 }
    const m = new Uint8Array(64 * 32)
    for (let y = 8; y < 24; y++) for (let x = 8; x < 56; x++) m[y * 64 + x] = 1
    const c = new StripCodec(W, H, big, m, BT709)
    expect([...c.maskTensor].filter((v) => v === 1).length).toBe(8 * 24)
    const f = frame()
    const g = f.slice()
    c.apply(g, c.render(c.toTensor(f).map((v) => v * 255)))
    let sum = 0
    for (const i of c.lumaIdx) sum += Math.abs(g[i] - f[i])
    // 先缩小再放大会损失细节，但整体接近
    expect(sum / c.lumaIdx.length).toBeLessThan(6)
  })

  it('长条的亮度', () => {
    const f = frame()
    const c = new StripCodec(W, H, strip, mask(strip), BT709)
    const l = c.lumaStrip(f)
    expect(l.length).toBe(32 * 16)
    expect(l[0]).toBe(f[8 * W + 16])
    expect(l[31 * 1 + 15 * 32]).toBe(f[(8 + 15) * W + 16 + 31])
  })

  it('尺寸不对时报错', () => {
    expect(() => new StripCodec(W, H, strip, new Uint8Array(3), BT709)).toThrow('掩码尺寸')
    const c = new StripCodec(W, H, strip, mask(strip), BT709)
    expect(() => c.render(new Float32Array(5))).toThrow('输出的尺寸')
  })
})

describe('sameScene', () => {
  const a = new Uint8Array(40 * 20).map((_, i) => (i * 7) % 200)

  it('只有轻微噪点时算同一画面', () => {
    const b = a.map((v, i) => v + (i % 3 === 0 ? 1 : 0))
    expect(sameScene(a, b, 40, 20)).toBe(true)
  })

  it('局部变化（一块画面动了）或整体变亮都不算', () => {
    const local = a.slice()
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) local[y * 40 + x] += 20
    expect(sameScene(a, local, 40, 20)).toBe(false)
    const brighter = a.map((v) => v + 2)
    expect(sameScene(a, brighter, 40, 20)).toBe(false)
  })
})
