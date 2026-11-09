import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AbortError } from '../../download/errors'
import type { ProbeVideo } from '../probe'

const h = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('../ffmpegJob', () => ({ ffmpegCapture: h.capture }))

const { analyze, estimateReuse, grabGrayCrop, makeCodec } = await import('./analysis')

const V: ProbeVideo = { index: 0, codec: 'h264', width: 640, height: 360, rotation: 0, hdr: false, dolbyVision: false, fps: 29.97, color: { range: 'tv', space: 'bt709' } }
/** 水印：右上角一行细竖线，半透明白 */
const isStroke = (x: number, y: number): boolean => y >= 14 && y < 30 && x >= 470 && x < 620 && x % 8 < 3

/** 按 crop 参数生成灰度帧：背景随调用次数变暗变亮，笔画按 α=0.75 叠白 */
let call = 0
function respond(args: string[]): { code: number; stdout: Buffer; stderr: string } {
  const vf = args[args.indexOf('-vf') + 1]
  const [w, hh, x0, y0] = /crop=(\d+):(\d+):(\d+):(\d+)/.exec(vf)!.slice(1).map(Number)
  const n = Number(args[args.indexOf('-frames:v') + 1])
  const k = call++
  const out = Buffer.alloc(w * hh * n)
  for (let f = 0; f < n; f++) {
    const base = k % 2 ? 30 : 160
    for (let y = 0; y < hh; y++) {
      for (let x = 0; x < w; x++) {
        const b = base + ((x * 7 + y * 3) % 20)
        out[f * w * hh + y * w + x] = isStroke(x0 + x, y0 + y) ? Math.round(0.75 * 235 + 0.25 * b) : b
      }
    }
  }
  return { code: 0, stdout: out, stderr: '' }
}

beforeEach(() => {
  call = 0
  h.capture.mockReset().mockImplementation(async (args: string[]) => respond(args))
})

describe('grabGrayCrop', () => {
  it('按原分辨率抽一块灰度，可以连续抽几帧', async () => {
    const r = await grabGrayCrop('a.mp4', 2, 1.5, { x: 10, y: 20, w: 8, h: 4 }, 2)
    expect(r.length).toBe(2)
    expect(r[0].length).toBe(32)
    const args = h.capture.mock.calls[0][0] as string[]
    expect(args).toEqual(expect.arrayContaining(['-ss', '1.500', '-map', '0:2', '-frames:v', '2', '-vf', 'crop=8:4:10:20,format=gray']))
    h.capture.mockResolvedValueOnce({ code: 0, stdout: Buffer.alloc(40), stderr: '' })
    expect((await grabGrayCrop('a.mp4', 0, 0, { x: 0, y: 0, w: 8, h: 4 }, 2)).length).toBe(1)
  })
})

describe('analyze', () => {
  it('找到笔画、定长条，掩码换到长条坐标；帧率、色彩跟原视频', async () => {
    const a = await analyze({ path: 'a.mp4', v: V, duration: 60, region: { x: 460, y: 8, w: 170, h: 28 } })
    expect(h.capture).toHaveBeenCalledTimes(48)
    expect(a.fallback).toBe(false)
    expect(a.rate).toBe('30000/1001')
    expect(a.color).toEqual({ matrix: 'bt709', full: false })
    expect([a.width, a.height]).toEqual([640, 360])
    const { strip, mask } = a
    expect(strip.x).toBeLessThanOrEqual(470)
    expect(strip.x + strip.w).toBeGreaterThanOrEqual(620)
    let hit = 0
    let total = 0
    for (let y = 0; y < strip.h; y++) {
      for (let x = 0; x < strip.w; x++) {
        if (!isStroke(strip.x + x, strip.y + y)) continue
        total++
        hit += mask[y * strip.w + x]
      }
    }
    expect(hit).toBe(total)
    expect(makeCodec(a).lumaIdx.length).toBeGreaterThan(total)
  })

  it('取消', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(analyze({ path: 'a.mp4', v: V, duration: 60, region: { x: 460, y: 8, w: 170, h: 28 }, signal: ac.signal })).rejects.toBeInstanceOf(
      AbortError
    )
  })
})

describe('estimateReuse', () => {
  it('相邻两帧一样的比例（打折）；抽不到帧时为 0', async () => {
    const a = await analyze({ path: 'a.mp4', v: V, duration: 60, region: { x: 460, y: 8, w: 170, h: 28 } })
    // 相邻两帧完全一样
    expect(await estimateReuse({ path: 'a.mp4', a, duration: 60 })).toBeCloseTo(0.85)
    // 一半位置的两帧不一样
    let n = 0
    h.capture.mockImplementation(async (args: string[]) => {
      const r = respond(args)
      if (n++ % 2) r.stdout.fill(255, r.stdout.length / 2)
      return r
    })
    expect(await estimateReuse({ path: 'a.mp4', a, duration: 60 })).toBeCloseTo(0.425)
    h.capture.mockResolvedValue({ code: 1, stdout: Buffer.alloc(0), stderr: '' })
    expect(await estimateReuse({ path: 'a.mp4', a, duration: 60 })).toBe(0)
  })
})
