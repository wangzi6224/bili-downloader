import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaProbe } from '../probe'
import type { Analysis } from './analysis'

const h = vi.hoisted(() => ({ probe: vi.fn(), analyze: vi.fn(), reuse: vi.fn(), openPool: vi.fn(), grabFrame: vi.fn(), capture: vi.fn() }))
vi.mock('../probe', () => ({ probeMedia: h.probe }))
vi.mock('./analysis', async (o) => ({ ...(await o<typeof import('./analysis')>()), analyze: h.analyze, estimateReuse: h.reuse }))
vi.mock('./backend', async (o) => ({ ...(await o<typeof import('./backend')>()), openPool: h.openPool }))
vi.mock('./refine', async (o) => ({ ...(await o<typeof import('./refine')>()), grabFrame: h.grabFrame }))
vi.mock('../ffmpegJob', () => ({ ffmpegCapture: h.capture }))

const { AiSessions, frameJpeg } = await import('./session')

const W = 32
const H = 16
const A: Analysis = {
  width: W,
  height: H,
  strip: { x: 0, y: 0, w: 32, h: 16, mw: 32, mh: 16 },
  mask: new Uint8Array(32 * 16).fill(1),
  fallback: false,
  color: { matrix: 'bt709', full: false },
  rate: '30',
  videoIndex: 0
}
const PROBE: MediaProbe = {
  duration: 100,
  video: { index: 0, codec: 'h264', width: W, height: H, rotation: 0, hdr: false, dolbyVision: false },
  streams: []
}
const JPEG = Buffer.from([0xff, 0xd8, 1, 2])

const pool = (backend: 'webgpu' | 'cpu') => ({ backend, msPerFrame: 100, hosts: [{}], run: vi.fn(async (img: Float32Array) => img.map(() => 0.5)), close: vi.fn() })
const model = { fixed: vi.fn(async () => '/m.onnx') }
const REGION = { x: 1, y: 1, w: 20, h: 8 }

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset()
  h.probe.mockResolvedValue(PROBE)
  h.analyze.mockResolvedValue(A)
  h.reuse.mockResolvedValue(0.5)
  h.grabFrame.mockImplementation(async () => Buffer.alloc((W * H * 3) / 2, 100))
  h.capture.mockResolvedValue({ code: 0, stdout: JPEG, stderr: '' })
  h.openPool.mockImplementation(async () => pool('webgpu'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AiSessions', () => {
  it('估算：用试跑的速度和沿用比例；同一个框只准备一次', async () => {
    const s = new AiSessions(model as never, () => ({}) as never)
    const e = await s.estimate('t1', '/v.mp4', REGION)
    expect(e).toMatchObject({ backend: 'webgpu', label: 'GPU', frames: 3000, reuse: 0.5, fallback: false })
    expect(e.seconds[0]).toBeLessThan(e.seconds[1])
    await s.estimate('t1', '/v.mp4', REGION)
    await s.preview('t1', '/v.mp4', 5, REGION)
    expect(h.analyze).toHaveBeenCalledTimes(1)
    expect(h.reuse).toHaveBeenCalledTimes(1)
    expect(h.openPool.mock.calls[0][0].cpu.hosts).toBe(1)
  })

  it('CPU：显示正式处理时会开的进程数', async () => {
    h.openPool.mockImplementation(async () => pool('cpu'))
    const s = new AiSessions(model as never, () => ({}) as never)
    const e = await s.estimate('t1', '/v.mp4', REGION)
    expect(e.backend).toBe('cpu')
    expect(e.label).toMatch(/^CPU/)
  })

  it('预览：把 AI 的结果写进这一帧再转 JPEG；时间收进片长', async () => {
    const p = pool('webgpu')
    h.openPool.mockResolvedValue(p)
    const s = new AiSessions(model as never, () => ({}) as never)
    expect(await s.preview('t1', '/v.mp4', 999, REGION)).toBe(`data:image/jpeg;base64,${JPEG.toString('base64')}`)
    expect(h.grabFrame.mock.calls.at(-1)![2]).toBeCloseTo(99.9)
    await s.preview('t1', '/v.mp4', Number.NaN, REGION)
    expect(h.grabFrame.mock.calls.at(-1)![2]).toBe(0)
    expect(p.run).toHaveBeenCalledTimes(2)
    const input = h.capture.mock.calls[0][1].stdin as Uint8Array
    // 推理结果是灰色，写回后亮度不再是 100
    expect(input[0]).not.toBe(100)
  })

  it('框变了重新准备，旧的推理进程关掉；准备失败的不留着', async () => {
    const first = pool('webgpu')
    h.openPool.mockResolvedValueOnce(first)
    const s = new AiSessions(model as never, () => ({}) as never)
    await s.estimate('t1', '/v.mp4', REGION)
    await s.estimate('t1', '/v.mp4', { ...REGION, x: 2 })
    await vi.waitFor(() => expect(first.close).toHaveBeenCalled())
    expect(h.analyze).toHaveBeenCalledTimes(2)

    h.analyze.mockRejectedValueOnce(new Error('坏了'))
    await expect(s.estimate('t2', '/v.mp4', REGION)).rejects.toThrow('坏了')
    await s.estimate('t2', '/v.mp4', REGION)
    expect(h.analyze).toHaveBeenCalledTimes(4)
  })

  it('不能处理的视频', async () => {
    const s = new AiSessions(model as never, () => ({}) as never)
    h.probe.mockResolvedValueOnce({ ...PROBE, video: undefined })
    await expect(s.estimate('a', '/v.mp4', REGION)).rejects.toThrow('没有视频画面')
    h.probe.mockResolvedValueOnce({ ...PROBE, video: { ...PROBE.video!, dolbyVision: true } })
    await expect(s.estimate('b', '/v.mp4', REGION)).rejects.toThrow('杜比视界')
    await expect(s.estimate('c', '/v.mp4', { x: 0, y: 0, w: 1, h: 1 })).rejects.toThrow('太小')
    h.probe.mockResolvedValueOnce({ ...PROBE, duration: undefined })
    expect((await s.estimate('d', '/v.mp4', REGION)).frames).toBe(0)
  })

  it('闲置、关闭对话框、全部关闭时释放推理进程', async () => {
    vi.useFakeTimers()
    const p1 = pool('webgpu')
    const p2 = pool('webgpu')
    const p3 = pool('webgpu')
    h.openPool.mockResolvedValueOnce(p1).mockResolvedValueOnce(p2).mockResolvedValueOnce(p3)
    const s = new AiSessions(model as never, () => ({}) as never)
    await s.estimate('t1', '/v.mp4', REGION)
    await vi.advanceTimersByTimeAsync(3 * 60_000)
    expect(p1.close).toHaveBeenCalled()
    await s.estimate('t2', '/v.mp4', REGION)
    s.release('t2')
    s.release('nope')
    await vi.advanceTimersByTimeAsync(0)
    expect(p2.close).toHaveBeenCalled()
    await s.estimate('t3', '/v.mp4', REGION)
    s.closeAll()
    await vi.advanceTimersByTimeAsync(0)
    expect(p3.close).toHaveBeenCalled()
  })
})

describe('frameJpeg', () => {
  it('按色彩范围、矩阵转 JPEG；ffmpeg 没给出 JPEG 时报错', async () => {
    await frameJpeg(new Uint8Array(4), { ...A, color: { matrix: 'bt601', full: true } }, 640)
    const args = h.capture.mock.calls[0][0] as string[]
    expect(args).toEqual(expect.arrayContaining(['-color_range', 'pc', '-colorspace', 'smpte170m', '-s', '32x16']))
    expect(args.join(' ')).toContain("scale='min(640,iw)':-2")
    h.capture.mockResolvedValueOnce({ code: 1, stdout: Buffer.alloc(0), stderr: 'x' })
    await expect(frameJpeg(new Uint8Array(4), A)).rejects.toThrow('没能生成预览画面')
  })
})
