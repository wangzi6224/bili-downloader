import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultAiRatio, estimateTime, initSpeed, recordCalibration, recordRun, speedRatio } from './speed'

let dir = ''
let file = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'speed-'))
  file = join(dir, 'watermark-speed.json')
  initSpeed(file)
})

afterEach(() => {
  initSpeed()
  rmSync(dir, { recursive: true, force: true })
})

describe('没跑过时', () => {
  it('用保守的默认倍数；Apple 芯片上 AI 精修快一些', () => {
    expect(speedRatio('fast')).toEqual({ ratio: [0.05, 0.4], basis: 'default' })
    expect(speedRatio('ai')).toEqual({ ratio: defaultAiRatio(), basis: 'default' })
    expect(defaultAiRatio('darwin', 'arm64')).toEqual([2, 3])
    expect(defaultAiRatio('darwin', 'x64')).toEqual([2, 6])
    expect(defaultAiRatio('win32', 'x64')).toEqual([2, 6])
  })

  it('估算：加上准备时间；快速去除按像素数折算，AI 精修按帧率折算', () => {
    // 1080p 100 秒：5 + 100 × [0.05, 0.4]
    expect(estimateTime('fast', { duration: 100, width: 1920, height: 1080 })).toEqual({ seconds: [10, 45], basis: 'default', backend: undefined })
    // 4K 是 1080p 的 4 倍工作量；不知道尺寸时按 1080p
    expect(estimateTime('fast', { duration: 100, width: 3840, height: 2160 }).seconds).toEqual([25, 165])
    expect(estimateTime('fast', { duration: 100 }).seconds).toEqual([10, 45])
    const [lo, hi] = defaultAiRatio()
    // 60fps 是 30fps 的两倍帧数；不知道帧率或帧率不对时按 30；太高的按 120 封顶
    expect(estimateTime('ai', { duration: 100, fps: 60 }).seconds).toEqual([15 + 200 * lo, 15 + 200 * hi])
    expect(estimateTime('ai', { duration: 100 }).seconds).toEqual([15 + 100 * lo, 15 + 100 * hi])
    expect(estimateTime('ai', { duration: 100, fps: 0 }).seconds).toEqual([15 + 100 * lo, 15 + 100 * hi])
    expect(estimateTime('ai', { duration: 10, fps: 1000 }).seconds).toEqual([15 + 40 * lo, 15 + 40 * hi])
  })
})

describe('记录', () => {
  it('跑过之后按实测 ±30%，新的记录按 0.4 的权重平均，记下后端；写进文件', () => {
    // 1080p 100 秒用了 20 秒：0.2 倍
    recordRun('fast', { seconds: 20, duration: 100, width: 1920, height: 1080 })
    let r = speedRatio('fast')
    expect(r.basis).toBe('measured')
    expect(r.ratio[0]).toBeCloseTo(0.14)
    expect(r.ratio[1]).toBeCloseTo(0.26)
    // 第二次 0.4 倍：0.2 × 0.6 + 0.4 × 0.4 = 0.28
    recordRun('fast', { seconds: 40, duration: 100 })
    r = speedRatio('fast')
    expect(r.ratio[0]).toBeCloseTo(0.28 * 0.7)

    recordRun('ai', { seconds: 300, duration: 100, fps: 30, backend: 'GPU' })
    expect(speedRatio('ai')).toMatchObject({ basis: 'measured', backend: 'GPU' })
    expect(estimateTime('ai', { duration: 10 })).toEqual({ seconds: [15 + 21, 15 + 39], basis: 'measured', backend: 'GPU' })
    // 没带后端时沿用上次的
    recordRun('ai', { seconds: 300, duration: 100 })
    expect(speedRatio('ai').backend).toBe('GPU')

    const saved = JSON.parse(readFileSync(file, 'utf8'))
    expect(saved.fast).toMatchObject({ samples: 2 })
    expect(saved.ai).toMatchObject({ samples: 2, ratio: 3, backend: 'GPU' })
    // 重新加载后仍然在
    initSpeed(file)
    expect(speedRatio('ai').basis).toBe('measured')
  })

  it('太短的视频、耗时不对的不记', () => {
    recordRun('fast', { seconds: 20, duration: 4 })
    recordRun('fast', { seconds: 0, duration: 100 })
    recordRun('fast', { seconds: Number.NaN, duration: 100 })
    recordRun('fast', { seconds: 10, duration: Number.NaN })
    expect(speedRatio('fast').basis).toBe('default')
  })

  it('AI 精修还没完整跑过时用试跑的单帧耗时估；跑过之后以实测为准', () => {
    recordCalibration('CPU × 4', 0, 4)
    expect(speedRatio('ai').basis).toBe('default')
    // GPU 每帧 50ms：30fps 的视频 1.5 倍
    recordCalibration('GPU', 50, 1)
    let r = speedRatio('ai')
    expect(r).toMatchObject({ basis: 'calibrated', backend: 'GPU' })
    expect(r.ratio[0]).toBeCloseTo(1.5 * 0.6)
    expect(r.ratio[1]).toBeCloseTo(1.5 * 1.2)
    // 4 个 CPU 进程每帧 400ms：12 ÷ (4 × 1/1.36) = 4.08 倍
    recordCalibration('CPU × 4', 400, 4)
    r = speedRatio('ai')
    expect(r.ratio[1]).toBeCloseTo(4.08 * 1.2)
    // 进程数不对时按 1 个算
    recordCalibration('CPU', 100, 0)
    expect(speedRatio('ai').ratio[1]).toBeCloseTo(3 * 1.2)
    // 快速去除不受影响
    expect(speedRatio('fast').basis).toBe('default')

    recordRun('ai', { seconds: 200, duration: 100 })
    expect(speedRatio('ai').basis).toBe('measured')
    expect(JSON.parse(readFileSync(file, 'utf8')).calib).toMatchObject({ backend: 'CPU', msPerFrame: 100, hosts: 0 })
  })

  it('文件损坏时当作没有记录；写不进去时只记日志；没初始化时只记在内存里', () => {
    writeFileSync(file, '{broken')
    initSpeed(file)
    expect(speedRatio('fast').basis).toBe('default')

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // 目录当文件写：失败
    initSpeed(dir)
    recordRun('fast', { seconds: 20, duration: 100 })
    recordCalibration('GPU', 50, 1)
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls[0][0]).toBe('记录去水印速度失败：')
    // 内存里还是记下了
    expect(speedRatio('fast').basis).toBe('measured')
    warn.mockRestore()

    initSpeed()
    recordRun('fast', { seconds: 20, duration: 100 })
    expect(speedRatio('fast').basis).toBe('measured')
  })
})
