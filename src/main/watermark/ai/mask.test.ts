import { describe, expect, it } from 'vitest'
import { estimateStrokeMask, lowPercentile, maskBounds, morph } from './mask'

const W = 120
const H = 40
const BOX = { x: 10, y: 8, w: 100, h: 24 }

/** 字：框里几条细竖线（宽 3） */
const isStroke = (x: number, y: number): boolean => y >= 12 && y < 28 && x >= 20 && x < 100 && x % 10 < 3

/** 背景随机，水印按 α=0.75 叠白色；有一半的帧背景偏暗 */
function frames(n: number, alpha = 0.75, stroke = isStroke): Uint8Array[] {
  let seed = 7
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  return Array.from({ length: n }, (_, k) => {
    const f = new Uint8Array(W * H)
    const base = k % 2 ? 20 + rnd() * 40 : 80 + rnd() * 150
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const b = base + rnd() * 20
        f[y * W + x] = Math.round(stroke(x, y) ? alpha * 235 + (1 - alpha) * b : b)
      }
    }
    return f
  })
}

describe('lowPercentile', () => {
  it('每个像素取第几低的值', () => {
    const fs = [10, 50, 30, 20, 40].map((v) => new Uint8Array([v, 255 - v]))
    expect([...lowPercentile(fs, 2, 0)]).toEqual([10, 205])
    expect([...lowPercentile(fs, 2, 0.4)]).toEqual([30, 225])
    expect([...lowPercentile(fs, 2, 1)]).toEqual([50, 245])
  })
})

describe('morph', () => {
  it('腐蚀去掉细线，膨胀把点扩成方块', () => {
    const img = new Uint8Array(9 * 9)
    img[4 * 9 + 4] = 200
    const d = morph(img, 9, 9, 1, true)
    expect([...d].filter((v) => v === 200).length).toBe(9)
    expect([...morph(d, 9, 9, 1, false)].filter((v) => v === 200).length).toBe(1)
    expect(morph(img, 9, 9, 0, true)).toEqual(img)
  })
})

describe('estimateStrokeMask', () => {
  it('找出半透明白字的笔画，外扩一点，不碰框外', () => {
    const m = estimateStrokeMask(frames(24), W, H, BOX, 1080)
    expect(m.fallback).toBe(false)
    let hit = 0
    let strokes = 0
    let outside = 0
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = m.mask[y * W + x]
        if (isStroke(x, y)) {
          strokes++
          hit += v
        }
        if (v && (x < BOX.x - 3 || x >= BOX.x + BOX.w + 3 || y < BOX.y - 3 || y >= BOX.y + BOX.h + 3)) outside++
      }
    }
    expect(hit).toBe(strokes)
    expect(outside).toBe(0)
    expect(m.cover).toBeGreaterThan(0.03)
    expect(m.cover).toBeLessThan(0.5)
  })

  it('认不出笔画时退回整个框（外扩）', () => {
    const none = estimateStrokeMask(frames(10, 0), W, H, BOX, 1080)
    expect(none.fallback).toBe(true)
    expect(none.cover).toBe(1)
    expect(none.mask[BOX.y * W + BOX.x]).toBe(1)
    expect(none.mask[(BOX.y - 3) * W + BOX.x]).toBe(1)
    expect(none.mask[0]).toBe(0)
    // 框里全是字：也不可信
    const full = estimateStrokeMask(frames(10, 0.75, (x, y) => y >= BOX.y && y < BOX.y + BOX.h && x >= BOX.x && x < BOX.x + BOX.w), W, H, BOX, 1080)
    expect(full.fallback).toBe(true)
  })

  it('没有帧或框在画面外时退回整个框', () => {
    expect(estimateStrokeMask([], W, H, BOX, 1080).fallback).toBe(true)
    const off = estimateStrokeMask(frames(4), W, H, { x: 500, y: 500, w: 10, h: 10 }, 1080)
    expect(off.fallback).toBe(true)
    expect(off.mask.every((v) => v === 0)).toBe(true)
  })
})

describe('maskBounds', () => {
  it('外接矩形；空掩码返回 undefined', () => {
    const m = new Uint8Array(10 * 5)
    expect(maskBounds(m, 10, 5)).toBeUndefined()
    m[1 * 10 + 2] = 1
    m[3 * 10 + 7] = 1
    expect(maskBounds(m, 10, 5)).toEqual({ x: 2, y: 1, w: 6, h: 3 })
  })
})
