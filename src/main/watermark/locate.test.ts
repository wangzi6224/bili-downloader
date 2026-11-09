import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProbeVideo } from './probe'

vi.mock('./detect', () => ({
  SUGGEST_MIN_SCORE: 0.35,
  AUTO_MIN_SCORE: 0.7,
  analysisSize: vi.fn(),
  detectWatermark: vi.fn(),
  frameCount: vi.fn()
}))
vi.mock('./frames', () => ({ grabFrames: vi.fn(), sampleTimes: vi.fn() }))

const { analysisSize, detectWatermark, frameCount } = await import('./detect')
const { grabFrames, sampleTimes } = await import('./frames')
const { isConfident, locateWatermark } = await import('./locate')

const V: ProbeVideo = { index: 0, codec: 'h264', width: 1920, height: 1080, rotation: 0, hdr: false, dolbyVision: false }
const FRAMES = [new Uint8Array(4)]

beforeEach(() => {
  vi.mocked(frameCount).mockReset().mockReturnValue(12)
  vi.mocked(analysisSize).mockReset().mockReturnValue({ w: 640, h: 360, scale: 1 / 3 })
  vi.mocked(sampleTimes).mockReset().mockReturnValue([1, 2])
  vi.mocked(grabFrames).mockReset().mockResolvedValue(FRAMES)
  vi.mocked(detectWatermark).mockReset()
})

describe('locateWatermark', () => {
  it('太短不抽帧', async () => {
    vi.mocked(frameCount).mockReturnValue(0)
    expect(await locateWatermark('/v.m4s', V, 3)).toEqual({ result: { score: 0, reason: 'few-frames' } })
    expect(grabFrames).not.toHaveBeenCalled()
  })

  it('按分析尺寸抽帧，识别到的框换算回原分辨率并外扩', async () => {
    const signal = new AbortController().signal
    const result = { box: { x: 560, y: 10, w: 70, h: 16 }, corner: 'tr' as const, score: 0.8 }
    vi.mocked(detectWatermark).mockReturnValue(result)
    expect(await locateWatermark('/v.m4s', { ...V, index: 2 }, 100, signal)).toEqual({
      result,
      region: { x: 1668, y: 18, w: 234, h: 72 }
    })
    expect(sampleTimes).toHaveBeenCalledWith(100, 12)
    expect(grabFrames).toHaveBeenCalledWith('/v.m4s', 2, [1, 2], 640, 360, signal)
    expect(detectWatermark).toHaveBeenCalledWith(FRAMES, 640, 360)
  })

  it('分数不够建议、没有框、换算后太小时不给区域', async () => {
    vi.mocked(detectWatermark).mockReturnValueOnce({ box: { x: 1, y: 1, w: 50, h: 10 }, score: 0.2 })
    expect((await locateWatermark('/v', V, 100)).region).toBeUndefined()
    vi.mocked(detectWatermark).mockReturnValueOnce({ score: 0, reason: 'none' })
    expect((await locateWatermark('/v', V, 100)).region).toBeUndefined()
    vi.mocked(detectWatermark).mockReturnValueOnce({ box: { x: 5000, y: 1, w: 50, h: 10 }, score: 0.9 })
    expect((await locateWatermark('/v', V, 100)).region).toBeUndefined()
  })
})

describe('isConfident', () => {
  const R = { x: 1, y: 1, w: 10, h: 10 }
  it('有位置、分数够自动处理、画面不是几乎不动才算认得准', () => {
    expect(isConfident({ result: { score: 0.7 }, region: R })).toBe(true)
    expect(isConfident({ result: { score: 0.69 }, region: R })).toBe(false)
    expect(isConfident({ result: { score: 0.9, reason: 'static' }, region: R })).toBe(false)
    expect(isConfident({ result: { score: 0.9 } })).toBe(false)
  })
})
