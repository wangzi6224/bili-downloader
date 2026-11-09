import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProcessingInfo } from '@shared/types'
import { AbortError, FfmpegError } from '../../download/errors'
import type { MediaProbe } from '../probe'
import type { Analysis } from './analysis'
import { HostError, type InferencePool } from './pool'

const h = vi.hoisted(() => ({
  spawn: vi.fn(),
  capture: vi.fn(),
  probe: vi.fn(),
  analyze: vi.fn(),
  openPool: vi.fn(),
  pickEncoder: vi.fn(),
  markEncoderBroken: vi.fn(),
  markBroken: vi.fn(),
  untrack: vi.fn()
}))
vi.mock('node:child_process', () => ({ spawn: h.spawn }))
vi.mock('../../download/mux', async (o) => ({ ...(await o<typeof import('../../download/mux')>()), ffmpegPath: () => 'ffmpeg' }))
vi.mock('../orphans', () => ({ trackJob: () => h.untrack }))
vi.mock('../probe', async (o) => ({ ...(await o<typeof import('../probe')>()), probeMedia: h.probe }))
vi.mock('../ffmpegJob', async (o) => ({ ...(await o<typeof import('../ffmpegJob')>()), ffmpegCapture: h.capture }))
vi.mock('./analysis', async (o) => ({ ...(await o<typeof import('./analysis')>()), analyze: h.analyze }))
vi.mock('./backend', async (o) => ({ ...(await o<typeof import('./backend')>()), openPool: h.openPool, markBroken: h.markBroken }))
vi.mock('../encoder', async (o) => ({ ...(await o<typeof import('../encoder')>()), pickEncoder: h.pickEncoder, markBroken: h.markEncoderBroken }))

const { backendLabel, etaTracker, frames, grabFrame, Inferencer, refineVideo, runPass, EncodeError } = await import('./refine')
const { makeCodec } = await import('./analysis')

const W = 32
const H = 16
const FRAME = (W * H * 3) / 2

const A: Analysis = {
  width: W,
  height: H,
  strip: { x: 0, y: 0, w: 32, h: 16, mw: 32, mh: 16 },
  mask: Uint8Array.from({ length: 32 * 16 }, (_, i) => (i % 32 >= 8 && i % 32 < 24 && i >= 4 * 32 && i < 12 * 32 ? 1 : 0)),
  fallback: false,
  color: { matrix: 'bt709', full: false },
  rate: '30',
  videoIndex: 0
}

/** 亮度为 v 的一帧 */
const frameOf = (v: number): Buffer => {
  const b = Buffer.alloc(FRAME, 128)
  b.fill(v, 0, W * H)
  return b
}

class FakeProc extends EventEmitter {
  pid = 4321
  exitCode: number | null = null
  signalCode: string | null = null
  stdout = new PassThrough()
  stderr = new PassThrough()
  stdin: Writable
  written: Buffer[] = []
  constructor(
    private readonly onEnd: (p: FakeProc) => void,
    onWrite?: (p: FakeProc, chunk: Buffer) => boolean
  ) {
    super()
    this.stdin = new Writable({
      write: (chunk: Buffer, _e, cb) => {
        if (onWrite && !onWrite(this, chunk)) return cb(new Error('EPIPE'))
        this.written.push(chunk)
        cb()
      },
      final: (cb) => {
        cb()
        setImmediate(() => this.onEnd(this))
      }
    })
  }
  finish(code: number | null): void {
    if (this.exitCode !== null || this.signalCode !== null) return
    this.exitCode = code
    this.stdout.end()
    this.emit('close', code)
  }
  kill = vi.fn(() => {
    if (this.exitCode === null && this.signalCode === null) {
      this.signalCode = 'SIGKILL'
      this.stdout.end()
      this.emit('close', null)
    }
    return true
  })
}

/** 解码进程：吐出这些帧后正常退出（或按 code 退出） */
function decoder(list: Buffer[], code = 0, stderr = ''): FakeProc {
  const p = new FakeProc(() => {})
  setImmediate(() => {
    // 故意按不对齐的块写，检验切帧
    const all = Buffer.concat(list)
    for (let i = 0; i < all.length; i += 700) p.stdout.write(all.subarray(i, i + 700))
    if (stderr) p.stderr.write(stderr)
    setImmediate(() => p.finish(code))
  })
  return p
}

/** 编码进程：输入结束后按 code 退出 */
function encoder(code = 0, stderr = '', onWrite?: (p: FakeProc, chunk: Buffer) => boolean): FakeProc {
  const p = new FakeProc((self) => {
    if (stderr) self.stderr.write(stderr)
    setImmediate(() => self.finish(code))
  }, onWrite)
  return p
}

function setupSpawn(dec: () => FakeProc, enc: () => FakeProc): { decs: FakeProc[]; encs: FakeProc[] } {
  const decs: FakeProc[] = []
  const encs: FakeProc[] = []
  h.spawn.mockImplementation((_cmd: string, args: string[]) => {
    if (args.includes('pipe:0')) {
      const e = enc()
      encs.push(e)
      return e
    }
    const d = dec()
    decs.push(d)
    return d
  })
  return { decs, encs }
}

/** 推理：把 RGB 都变成 1（写回后亮度很低），记录调用次数 */
const infer = vi.fn(async (img: Float32Array) => img.map(() => 1))

const passInput = (o: Partial<Parameters<typeof runPass>[0]> = {}): Parameters<typeof runPass>[0] => ({
  decodeArgs: ['-i', 'in.mp4', 'pipe:1'],
  encodeArgs: ['-i', 'pipe:0', 'out.mp4'],
  output: 'out.mp4',
  frameSize: FRAME,
  codec: makeCodec(A),
  infer,
  inflight: 3,
  signal: new AbortController().signal,
  onFrame: () => {},
  ...o
})

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset()
  infer.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('小工具', () => {
  it('后端说明', () => {
    expect(backendLabel('webgpu', 1)).toBe('GPU')
    expect(backendLabel('coreml', 1)).toBe('Apple 神经引擎')
    expect(backendLabel('cpu', 1)).toBe('CPU')
    expect(backendLabel('cpu', 6)).toBe('CPU × 6')
  })

  it('按帧大小切字节流，块的边界不影响', async () => {
    async function* chunks(): AsyncGenerator<Buffer> {
      yield Buffer.from([1, 2, 3])
      yield Buffer.from([4, 5, 6, 7, 8])
      yield Buffer.from([9])
    }
    const out: number[][] = []
    for await (const f of frames(chunks(), 4)) out.push([...f])
    expect(out).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8]
    ])
  })

  it('剩余时间：开头几秒不报，之后按最近 30 秒的速度', () => {
    let now = 0
    const eta = etaTracker(1000, () => now)
    expect(eta(0)).toBeUndefined()
    now = 2000
    expect(eta(100)).toBeUndefined()
    now = 4000
    expect(eta(200)).toBe(16)
    now = 40_000
    expect(eta(200)).toBeUndefined()
    expect(etaTracker(undefined, () => now)(5)).toBeUndefined()
  })

  it('抽一整帧；大小不对报错', async () => {
    h.capture.mockResolvedValueOnce({ code: 0, stdout: Buffer.alloc(FRAME), stderr: '' })
    expect((await grabFrame('a.mp4', A, 1.5)).length).toBe(FRAME)
    expect(h.capture.mock.calls[0][0]).toContain('crop=32:16:0:0,format=yuv420p')
    h.capture.mockResolvedValueOnce({ code: 1, stdout: Buffer.alloc(3), stderr: 'bad' })
    await expect(grabFrame('a.mp4', A, 1)).rejects.toThrow('没能从视频里取出画面')
  })
})

describe('Inferencer', () => {
  const pool = (backend: InferencePool['backend'], run: (img: Float32Array) => Promise<Float32Array>): InferencePool =>
    ({ backend, hosts: [{}], run: vi.fn(run), close: vi.fn() }) as unknown as InferencePool

  it('后端出错时标记坏了、换下一个接着跑，同时失败的几帧只换一次', async () => {
    const gpu = pool('webgpu', async () => {
      throw new HostError('GPU 挂了')
    })
    const cpu = pool('cpu', async (img) => img.map((v) => v + 1))
    const reopen = vi.fn(async () => cpu)
    const switched = vi.fn()
    const inf = new Inferencer(gpu, reopen, switched)
    const outs = await Promise.all([inf.run(new Float32Array([1])), inf.run(new Float32Array([2]))])
    expect(outs.map((o) => o[0])).toEqual([2, 3])
    expect(reopen).toHaveBeenCalledTimes(1)
    expect(h.markBroken).toHaveBeenCalledWith('webgpu', 'GPU 挂了')
    expect(gpu.close).toHaveBeenCalled()
    expect(switched).toHaveBeenCalledWith(cpu)
    expect(inf.current).toBe(cpu)
    inf.close()
    expect(cpu.close).toHaveBeenCalled()
  })

  it('不是后端的问题直接抛出；换过之后还出错也抛出', async () => {
    const plain = new Inferencer(
      pool('cpu', async () => {
        throw new Error('别的错')
      }),
      async () => {
        throw new Error('不该换')
      }
    )
    await expect(plain.run(new Float32Array(1))).rejects.toThrow('别的错')

    const bad = (): InferencePool =>
      pool('cpu', async () => {
        throw new HostError('坏')
      })
    const twice = new Inferencer(bad(), async () => bad())
    await expect(twice.run(new Float32Array(1))).rejects.toThrow('坏')

    // 换来换去还是同一个（没有别的后端可用）
    const same = bad()
    const inf = new Inferencer(same, async () => same)
    await expect(inf.run(new Float32Array(1))).rejects.toThrow('坏')
  })

  it('换后端失败：报换的时候的错', async () => {
    const inf = new Inferencer(
      pool('webgpu', async () => {
        throw new HostError('GPU 挂了')
      }),
      async () => {
        throw new Error('没有可用的 AI 推理方式')
      }
    )
    await expect(inf.run(new Float32Array(1))).rejects.toThrow('没有可用的 AI 推理方式')
    inf.close()
  })
})

describe('runPass', () => {
  it('画面不变的帧沿用上次的结果，按顺序写回、只改掩码里的像素', async () => {
    const list = [frameOf(100), frameOf(100), frameOf(101), frameOf(180), frameOf(180)]
    const { encs } = setupSpawn(() => decoder(list), () => encoder())
    const onFrame = vi.fn()
    const r = await runPass(passInput({ onFrame }))
    expect(r).toEqual({ frames: 5, inferred: 2 })
    expect(infer).toHaveBeenCalledTimes(2)
    expect(onFrame).toHaveBeenLastCalledWith(5)
    const out = Buffer.concat(encs[0].written)
    expect(out.length).toBe(5 * FRAME)
    const codec = makeCodec(A)
    const masked = codec.lumaIdx[0]
    expect(out[masked]).toBeLessThan(30)
    expect(out[0]).toBe(100)
    expect(out[3 * FRAME]).toBe(180)
    expect(h.untrack).toHaveBeenCalled()
  })

  it('编码进程失败：报编码错误，带上它的输出', async () => {
    setupSpawn(() => decoder([frameOf(1)]), () => encoder(1, 'Error while opening encoder'))
    const e = await runPass(passInput()).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(EncodeError)
    expect((e as FfmpegError).stderr).toContain('opening encoder')
  })

  it('编码进程中途退出、写不进去：也按编码错误报', async () => {
    setupSpawn(
      () => decoder([frameOf(1), frameOf(50), frameOf(90), frameOf(130), frameOf(170)]),
      () =>
        encoder(0, '', (p) => {
          p.stderr.write('Conversion failed')
          p.finish(1)
          p.stdin.destroy()
          return false
        })
    )
    await expect(runPass(passInput())).rejects.toBeInstanceOf(EncodeError)
  })

  it('解码失败', async () => {
    setupSpawn(() => decoder([frameOf(1)], 1, 'moov atom not found'), () => encoder())
    await expect(runPass(passInput())).rejects.toThrow(FfmpegError)
  })

  it('推理出错：结束两个进程，把错误报出来', async () => {
    const { decs, encs } = setupSpawn(() => decoder([frameOf(1), frameOf(90)]), () => encoder())
    await expect(
      runPass(
        passInput({
          infer: async () => {
            throw new Error('推理超时')
          }
        })
      )
    ).rejects.toThrow('推理超时')
    expect(decs[0].exitCode === null ? decs[0].signalCode : 'exited').toBeTruthy()
    expect(encs[0].kill).toHaveBeenCalled()
  })

  it('取消：结束进程，报取消', async () => {
    const ac = new AbortController()
    setupSpawn(
      () => decoder([frameOf(1), frameOf(90), frameOf(180)]),
      () => encoder()
    )
    const slow = vi.fn(
      (img: Float32Array) =>
        new Promise<Float32Array>((r) => {
          ac.abort()
          setTimeout(() => r(img), 5)
        })
    )
    await expect(runPass(passInput({ infer: slow, signal: ac.signal }))).rejects.toBeInstanceOf(AbortError)
    const pre = new AbortController()
    pre.abort()
    await expect(runPass(passInput({ signal: pre.signal }))).rejects.toBeInstanceOf(AbortError)
  })

  it('长时间没有进展：判定卡死', async () => {
    setupSpawn(() => decoder([frameOf(1)]), () => encoder())
    const stuck = (): Promise<Float32Array> => new Promise(() => {})
    await expect(runPass(passInput({ infer: stuck, idleMs: 50 }))).rejects.toThrow('去水印超时')
  })
})

describe('refineVideo', () => {
  const probe: MediaProbe = {
    duration: 0.1,
    video: { index: 0, codec: 'h264', width: W, height: H, rotation: 0, hdr: false, dolbyVision: false, fps: 30, bitrate: 1000 },
    streams: [{ index: 0, type: 'video', codec: 'h264', attachedPic: false }]
  }
  const fakePool = { backend: 'webgpu', hosts: [{}], msPerFrame: 80, run: vi.fn(async (img: Float32Array) => img.map(() => 1)), close: vi.fn() }
  const model = { fixed: vi.fn(async () => '/m/lama-16x32.onnx') }
  const base = (o: Partial<Parameters<typeof refineVideo>[0]> = {}): Parameters<typeof refineVideo>[0] => ({
    input: '/v/a.mp4',
    output: '/v/a.mp4.wm.tmp',
    workDir: '/tmp/w',
    region: { x: 2, y: 2, w: 20, h: 10 },
    format: 'mp4',
    signal: new AbortController().signal,
    onStage: vi.fn(),
    model: model as never,
    spawn: () => {
      throw new Error('不该直接启动')
    },
    ...o
  })

  beforeEach(() => {
    h.probe.mockResolvedValue(probe)
    h.analyze.mockResolvedValue(A)
    h.capture.mockResolvedValue({ code: 0, stdout: Buffer.alloc(FRAME, 60), stderr: '' })
    h.openPool.mockResolvedValue(fakePool)
    h.pickEncoder.mockResolvedValue({ name: 'h264_videotoolbox', codec: 'h264', hw: true })
    fakePool.close.mockClear()
  })

  it('分析、加载模型、逐帧处理，进度带上后端', async () => {
    setupSpawn(() => decoder(Array.from({ length: 12 }, (_, i) => frameOf(i * 20))), () => encoder())
    const stages: ProcessingInfo[] = []
    const r = await refineVideo(base({ onStage: (p) => stages.push(p) }))
    expect(r).toEqual({ codec: 'h264', width: W, height: H, region: { x: 2, y: 2, w: 20, h: 10 } })
    expect(model.fixed).toHaveBeenCalledWith(16, 32)
    expect(stages.map((s) => s.stage)).toEqual(['queue', 'analyze', 'refine', 'refine'])
    expect(stages[2]).toEqual({ manual: true, stage: 'refine', pct: 0, backend: 'GPU' })
    expect(stages[3].pct).toBeGreaterThan(0)
    expect(fakePool.close).toHaveBeenCalled()
    const encArgs = h.spawn.mock.calls.find((c) => (c[1] as string[]).includes('pipe:0'))![1] as string[]
    expect(encArgs).toContain('h264_videotoolbox')
  })

  it('下载流程里自动处理：进度不带手动标记，用传进来的码率', async () => {
    setupSpawn(() => decoder([frameOf(1)]), () => encoder())
    const stages: ProcessingInfo[] = []
    await refineVideo(base({ manual: false, kbps: 4321, onStage: (p) => stages.push(p) }))
    expect(stages.every((p) => p.manual === undefined)).toBe(true)
    const encArgs = h.spawn.mock.calls.find((c) => (c[1] as string[]).includes('pipe:0'))![1] as string[]
    expect(encArgs).toContain('4321k')
  })

  it('硬件编码器跑起来失败：换软件编码整个重来', async () => {
    let n = 0
    setupSpawn(() => decoder([frameOf(1)]), () => encoder(n++ === 0 ? 1 : 0, n === 1 ? 'Error while opening encoder' : ''))
    const r = await refineVideo(base())
    expect(r.codec).toBe('h264')
    expect(h.markEncoderBroken).toHaveBeenCalled()
    const encCalls = h.spawn.mock.calls.filter((c) => (c[1] as string[]).includes('pipe:0'))
    expect(encCalls.length).toBe(2)
    expect(encCalls[1][1]).toContain('libx264')
  })

  it('软件编码失败、磁盘满：不重试', async () => {
    h.pickEncoder.mockResolvedValue({ name: 'libx264', codec: 'h264', hw: false })
    setupSpawn(() => decoder([frameOf(1)]), () => encoder(1, 'x'))
    await expect(refineVideo(base())).rejects.toBeInstanceOf(EncodeError)
    h.pickEncoder.mockResolvedValue({ name: 'h264_nvenc', codec: 'h264', hw: true })
    setupSpawn(() => decoder([frameOf(1)]), () => encoder(1, 'No space left on device'))
    await expect(refineVideo(base())).rejects.toBeInstanceOf(EncodeError)
    expect(h.spawn.mock.calls.filter((c) => (c[1] as string[]).includes('pipe:0')).length).toBe(2)
  })

  it('不能处理的视频', async () => {
    h.probe.mockResolvedValueOnce({ ...probe, video: undefined })
    await expect(refineVideo(base())).rejects.toThrow('没有视频画面')
    h.probe.mockResolvedValueOnce({ ...probe, video: { ...probe.video!, hdr: true } })
    await expect(refineVideo(base())).rejects.toThrow('HDR')
    await expect(refineVideo(base({ region: { x: 0, y: 0, w: 1, h: 1 } }))).rejects.toThrow('太小')
  })

  it('MKV 带封面：先导出封面再挂回去；没有时长时用提示的时长', async () => {
    h.probe.mockResolvedValue({ ...probe, duration: undefined, cover: { index: 1, codec: 'mjpeg' } })
    h.capture.mockImplementation(async (args: string[]) =>
      args.includes('copy') ? { code: 1, stdout: Buffer.alloc(0), stderr: '' } : { code: 0, stdout: Buffer.alloc(FRAME, 60), stderr: '' }
    )
    setupSpawn(() => decoder([frameOf(1)]), () => encoder())
    await refineVideo(base({ format: 'mkv', durationHint: 3, workDir: '/tmp/refine-test-work' }))
    expect(h.capture.mock.calls.some((c) => (c[0] as string[]).includes('copy'))).toBe(true)
  })
})
