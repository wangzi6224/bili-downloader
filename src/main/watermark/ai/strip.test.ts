import { describe, expect, it } from 'vitest'
import { ALIGN, planStrip } from './strip'

const check = (s: ReturnType<typeof planStrip>, W: number, H: number): void => {
  for (const v of [s.x, s.y, s.w, s.h]) expect(v % 2).toBe(0)
  expect(s.mw % ALIGN).toBe(0)
  expect(s.mh % ALIGN).toBe(0)
  expect(s.x).toBeGreaterThanOrEqual(0)
  expect(s.y).toBeGreaterThanOrEqual(0)
  expect(s.x + s.w).toBeLessThanOrEqual(W)
  expect(s.y + s.h).toBeLessThanOrEqual(H)
}

describe('planStrip', () => {
  it('1080p 右上角的水印：留出上下文，不缩放，包住笔画', () => {
    const b = { x: 1530, y: 40, w: 346, h: 66 }
    const s = planStrip(b, 1920, 1080)
    check(s, 1920, 1080)
    expect([s.w, s.h]).toEqual([s.mw, s.mh])
    expect(s.x).toBeLessThanOrEqual(b.x - 30)
    expect(s.x + s.w).toBeGreaterThanOrEqual(b.x + b.w)
    expect(s.y).toBe(0)
    expect(s.y + s.h).toBeGreaterThanOrEqual(b.y + b.h + 30)
  })

  it('4K 的水印太大：缩小后交给模型，不超过上限', () => {
    const s = planStrip({ x: 3000, y: 80, w: 760, h: 140 }, 3840, 2160)
    check(s, 3840, 2160)
    expect(s.mw).toBeLessThanOrEqual(768)
    expect(s.mh).toBeLessThanOrEqual(256)
    expect(s.mw * s.mh).toBeLessThanOrEqual(160_000 * 1.2)
    expect(s.w).toBeGreaterThan(s.mw)
    expect(s.x + s.w).toBeGreaterThanOrEqual(3760)
  })

  it('左下角、贴边：收进画面', () => {
    const s = planStrip({ x: 0, y: 1000, w: 300, h: 60 }, 1920, 1080)
    check(s, 1920, 1080)
    expect(s.x).toBe(0)
    expect(s.y + s.h).toBe(1080)
  })

  it('画面比模型输入还小：用整个画面', () => {
    const s = planStrip({ x: 2, y: 2, w: 60, h: 10 }, 64, 20)
    check(s, 64, 20)
    expect([s.x, s.y, s.w, s.h]).toEqual([0, 0, 64, 20])
    expect(s.mh).toBe(ALIGN * 2)
  })
})
