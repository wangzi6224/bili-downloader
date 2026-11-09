import { describe, expect, it } from 'vitest'
import { estimateSeconds, inferFps } from './estimate'

describe('inferFps', () => {
  it('GPU 一个进程；CPU 多个进程有效率损失', () => {
    expect(inferFps('webgpu', 80, 1)).toBeCloseTo(12.5)
    expect(inferFps('cpu', 300, 1)).toBeCloseTo(3.33, 1)
    expect(inferFps('cpu', 300, 8)).toBeGreaterThan(12)
    expect(inferFps('cpu', 300, 8)).toBeLessThan(26.7)
  })
})

describe('estimateSeconds', () => {
  const base = { frames: 18000, reuse: 0, msPerFrame: 80, backend: 'webgpu' as const, hosts: 1, width: 1920, height: 1080 }

  it('10 分钟 1080p、GPU 80ms：大约 24 分钟', () => {
    const [lo, hi] = estimateSeconds(base)
    expect(lo).toBeGreaterThan(20 * 60)
    expect(hi).toBeLessThan(30 * 60)
    expect(lo).toBeLessThan(hi)
  })

  it('画面静止的帧多就快；保守的一头按一半算', () => {
    const [lo, hi] = estimateSeconds({ ...base, reuse: 0.6 })
    expect(lo).toBeLessThan(11 * 60)
    expect(hi).toBeGreaterThan(lo * 1.4)
  })

  it('推理很快时以解码编码为准', () => {
    // 4K 下流水线每秒约 37.5 帧，乐观的一头再乘 0.9
    const [lo] = estimateSeconds({ ...base, msPerFrame: 1, width: 3840, height: 2160 })
    expect(lo).toBeGreaterThan((18000 / 37.5) * 0.9)
  })
})
