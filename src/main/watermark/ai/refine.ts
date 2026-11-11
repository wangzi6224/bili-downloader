// AI 精修：一个 ffmpeg 解码出原始帧 → 切出水印长条交给推理进程（画面没变就沿用上次的结果）→
// 按顺序把结果写回帧 → 另一个 ffmpeg 编码，音频、字幕、封面从原文件复制。三段同时进行，全程有背压
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { availableParallelism, totalmem } from 'node:os'
import { join } from 'node:path'
import type { Writable } from 'node:stream'
import { t as tr } from '@shared/i18n'
import type { ProcessingInfo, WatermarkRegion } from '@shared/types'
import { clampRegion, markWatermarkText } from '@shared/watermark'
import { AbortError, FfmpegError } from '../../download/errors'
import { explainFfmpegError, ffmpegPath, isEncoderFailure } from '../../download/mux'
import { buildCoverExtractArgs, coverFileName } from '../delogo'
import { markBroken as markEncoderBroken, pickEncoder, softwareEncoder, targetKbps, type Encoder } from '../encoder'
import { awakeTimer, ffmpegCapture, heavyTurn } from '../ffmpegJob'
import { trackJob } from '../orphans'
import { probeMedia, type MediaProbe } from '../probe'
import { recordCalibration, recordRun } from '../speed'
import { HOPELESS } from '../transcode'
import { analyze, makeCodec, type Analysis } from './analysis'
import { buildDecodeArgs, buildEncodeArgs, rateValue } from './args'
import { cpuPlan, markBroken, openPool } from './backend'
import type { Backend } from './hostCore'
import type { AiModel } from './model'
import { HostError, type InferencePool, type SpawnHost } from './pool'
import { sameScene, type Patch, type StripCodec } from './pixels'

/** 这么久没有写出一帧，视为卡死（醒着的时间，系统睡眠不算） */
const IDLE_MS = 180_000
const STDERR_MAX = 4000

/** 编码那一端失败了：换软件编码器可能就好 */
export class EncodeError extends FfmpegError {}

/** 往编码进程写帧时发现它已经退出了；runPass 据此按编码失败报，带上编码器的输出 */
class EncoderGoneError extends Error {
  constructor() {
    super(tr('wm.encoderExited'))
  }
}

/** 进度上显示的后端说明，例如“GPU”“CPU × 6” */
export function backendLabel(backend: Backend, hosts: number): string {
  if (backend === 'coreml') return tr('wm.backendCoreml')
  if (backend === 'webgpu') return 'GPU'
  return hosts > 1 ? `CPU × ${hosts}` : 'CPU'
}

/**
 * 包一层推理：当前后端的进程出问题（崩溃、超时、驱动错误）时，标记它坏了，换下一个后端继续，
 * 已经做完的帧不用重来。换过之后再出错就报给调用方
 */
export class Inferencer {
  private switching: Promise<InferencePool> | undefined

  constructor(
    private pool: InferencePool,
    private readonly reopen: () => Promise<InferencePool>,
    private readonly onSwitch: (pool: InferencePool) => void = () => {}
  ) {}

  get current(): InferencePool {
    return this.pool
  }

  async run(image: Float32Array): Promise<Float32Array> {
    const pool = this.pool
    try {
      return await pool.run(image)
    } catch (e) {
      if (!(e instanceof HostError)) throw e
      if (this.pool === pool && !this.switching) {
        markBroken(pool.backend, e.message)
        pool.close()
        this.switching = this.reopen().then((p) => {
          this.pool = p
          this.onSwitch(p)
          return p
        })
      }
      const next = await this.switching!
      if (next === pool) throw e
      return next.run(image)
    }
  }

  close(): void {
    this.pool.close()
    void this.switching?.then((p) => p.close(), () => {})
  }
}

/** 按原分辨率抽一整帧 yuv420p（试跑、预览用）；宽高取偶数，和解码管道一致 */
export async function grabFrame(path: string, a: Analysis, time: number, signal?: AbortSignal): Promise<Buffer> {
  const size = (a.width * a.height * 3) / 2
  const r = await ffmpegCapture(
    ['-ss', time.toFixed(3), '-i', path, '-map', `0:${a.videoIndex}`, '-frames:v', '1', '-vf', `crop=${a.width}:${a.height}:0:0,format=yuv420p`, '-f', 'rawvideo', 'pipe:1'],
    { signal, maxBytes: size * 2 }
  )
  if (r.stdout.length !== size) throw new FfmpegError(tr('wm.grabFailed'), r.stderr)
  return r.stdout
}

/** 写一帧，管道满了就等它腾出空间；对方退出了就报错，不会一直等下去 */
function writeFrame(stream: Writable, buf: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    if (stream.destroyed || stream.writableEnded) return reject(new EncoderGoneError())
    if (stream.write(buf)) return resolve()
    const cleanup = (): void => {
      stream.off('drain', onDrain)
      stream.off('close', onClose)
    }
    const onDrain = (): void => {
      cleanup()
      resolve()
    }
    const onClose = (): void => {
      cleanup()
      reject(new EncoderGoneError())
    }
    stream.on('drain', onDrain)
    stream.on('close', onClose)
  })
}

/** 从字节流里按固定大小切出一帧帧 */
export async function* frames(stream: AsyncIterable<Buffer>, size: number): AsyncGenerator<Buffer> {
  let carry: Buffer[] = []
  let have = 0
  for await (const chunk of stream) {
    carry.push(chunk)
    have += chunk.length
    while (have >= size) {
      const all = carry.length === 1 ? carry[0] : Buffer.concat(carry, have)
      yield Buffer.from(all.subarray(0, size))
      const rest = all.subarray(size)
      carry = rest.length ? [rest] : []
      have = rest.length
    }
  }
}

export interface PassInput {
  decodeArgs: string[]
  encodeArgs: string[]
  /** 编码输出的文件，应用崩溃后靠它认出没退出的 ffmpeg */
  output: string
  frameSize: number
  codec: StripCodec
  infer: (image: Float32Array) => Promise<Float32Array>
  /** 同时在途的帧数上限 */
  inflight: number
  signal: AbortSignal
  onFrame: (written: number) => void
  idleMs?: number
}

export interface PassResult {
  frames: number
  inferred: number
}

function run(args: string[]): ChildProcess {
  return spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args], { stdio: ['pipe', 'pipe', 'pipe'] })
}

/** 跑一遍完整的“解码 → 推理 → 编码” */
export async function runPass(o: PassInput): Promise<PassResult> {
  if (o.signal.aborted) throw new AbortError()
  const dec = run(o.decodeArgs)
  const enc = run(['-y', ...o.encodeArgs])
  const untrack = trackJob(enc.pid, o.output)
  let decErr = ''
  let encErr = ''
  dec.stderr!.on('data', (d) => (decErr = (decErr + d).slice(-STDERR_MAX)))
  enc.stderr!.on('data', (d) => (encErr = (encErr + d).slice(-STDERR_MAX)))
  // 编码进程先退出时，往它的 stdin 写会报 EPIPE，由退出码说明原因
  enc.stdin!.on('error', () => {})
  dec.stdin!.end()
  const exited = (p: ChildProcess): Promise<number | null> =>
    new Promise((r) => {
      if (p.exitCode !== null || p.signalCode !== null) return r(p.exitCode)
      p.once('close', (code) => r(code))
      p.once('error', () => r(-1))
    })
  const decExit = exited(dec)
  const encExit = exited(enc)
  let stalled = false
  // 卡死或取消时，正在等的推理结果可能永远不回来，用它打断等待
  let interrupt!: (e: Error) => void
  const interrupted = new Promise<never>((_, reject) => (interrupt = reject))
  interrupted.catch(() => {})
  const kill = (): void => {
    dec.kill('SIGKILL')
    enc.kill('SIGKILL')
  }
  const idle = awakeTimer(o.idleMs ?? IDLE_MS, () => {
    stalled = true
    kill()
    interrupt(new Error('stalled'))
  })
  const onAbort = (): void => {
    kill()
    interrupt(new AbortError())
  }
  o.signal.addEventListener('abort', onAbort, { once: true })

  const queue: { frame: Buffer; patch: Promise<Patch> }[] = []
  let anchor: { luma: Uint8Array; patch: Promise<Patch> } | undefined
  let written = 0
  let inferred = 0
  const { strip } = o.codec
  const flush = async (): Promise<void> => {
    const item = queue.shift()!
    o.codec.apply(item.frame, await Promise.race([item.patch, interrupted]))
    await writeFrame(enc.stdin!, item.frame)
    written++
    idle.reset()
    o.onFrame(written)
  }
  try {
    for await (const frame of frames(dec.stdout!, o.frameSize)) {
      const luma = o.codec.lumaStrip(frame)
      let patch: Promise<Patch>
      if (anchor && sameScene(anchor.luma, luma, strip.w, strip.h)) {
        patch = anchor.patch
      } else {
        patch = o.infer(o.codec.toTensor(frame)).then((out) => o.codec.render(out))
        // 出错时在 flush 里等它才会抛出，先挂上处理免得被当成没人管的 rejection
        patch.catch(() => {})
        anchor = { luma, patch }
        inferred++
      }
      queue.push({ frame, patch })
      while (queue.length >= o.inflight) await flush()
    }
    while (queue.length) await flush()
    enc.stdin!.end()
    const [dc, ec] = await Promise.all([decExit, encExit])
    if (o.signal.aborted) throw new AbortError()
    if (stalled) throw new FfmpegError(markWatermarkText(tr('wm.stalled')), encErr || decErr)
    if (dc !== 0) throw new FfmpegError(explainFfmpegError(decErr, dc, 'read'), decErr)
    if (ec !== 0) throw new EncodeError(explainFfmpegError(encErr, ec, 'watermark'), encErr)
    return { frames: written, inferred }
  } catch (e) {
    kill()
    await Promise.all([decExit, encExit])
    if (o.signal.aborted) throw new AbortError()
    if (stalled) throw new FfmpegError(markWatermarkText(tr('wm.stalled')), encErr || decErr)
    // 编码进程先挂了，写帧时才发现：按编码失败报，带上它的输出
    if (e instanceof EncoderGoneError) throw new EncodeError(explainFfmpegError(encErr, enc.exitCode, 'watermark'), encErr)
    throw e
  } finally {
    idle.stop()
    untrack()
    o.signal.removeEventListener('abort', onAbort)
  }
}

export interface RefineInput {
  input: string
  output: string
  /** 放导出的封面，调用方负责删除 */
  workDir: string
  region: WatermarkRegion
  format: 'mp4' | 'mkv'
  durationHint?: number
  signal: AbortSignal
  onStage: (p: ProcessingInfo) => void
  model: AiModel
  spawn: SpawnHost
  /** 对已完成任务手动发起（默认）；下载流程里的自动去水印传 false，进度上不带 manual */
  manual?: boolean
  /** 目标码率；分片 MP4 里读出的码率不准，下载流程用接口给的码率算好传进来 */
  kbps?: number
}

/** 剩余时间：最近一段的速度估算，开头几秒数据太少不报 */
export function etaTracker(total: number | undefined, now: () => number = Date.now): (written: number) => number | undefined {
  const start = now()
  const marks: [number, number][] = []
  return (written) => {
    const t = now()
    marks.push([t, written])
    while (marks.length > 2 && t - marks[0][0] > 30_000) marks.shift()
    if (!total || t - start < 3000 || marks.length < 2) return undefined
    const [t0, w0] = marks[0]
    const rate = (written - w0) / ((t - t0) / 1000)
    return rate > 0 ? Math.max(0, Math.round((total - written) / rate)) : undefined
  }
}

async function exportCover(o: RefineInput, probe: MediaProbe): Promise<string | undefined> {
  if (o.format !== 'mkv' || !probe.cover) return undefined
  mkdirSync(o.workDir, { recursive: true })
  const dest = join(o.workDir, coverFileName(probe.cover))
  const r = await ffmpegCapture(buildCoverExtractArgs(o.input, probe.cover.index, dest), { signal: o.signal })
  return r.code === 0 && existsSync(dest) ? dest : undefined
}

/** 把成品里的视频流换成 AI 去掉水印的版本，音频、字幕、封面、章节原样保留，写到 output */
export async function refineVideo(o: RefineInput): Promise<{ codec: Encoder['codec']; width: number; height: number; region: WatermarkRegion }> {
  const tag = o.manual === false ? {} : { manual: true }
  o.onStage({ ...tag, stage: 'queue' })
  const release = await heavyTurn(o.signal)
  let inferencer: Inferencer | undefined
  try {
    o.onStage({ ...tag, stage: 'analyze' })
    const probe = await probeMedia(o.input, o.signal)
    const v = probe.video
    if (!v) throw new Error(tr('wm.noVideoInFile'))
    if (v.hdr || v.dolbyVision) throw new Error(tr('wm.hdrUnsupported'))
    const region = clampRegion(o.region, v.width, v.height)
    if (!region) throw new Error(tr('wm.regionTooSmall'))
    const duration = probe.duration ?? o.durationHint ?? 0
    const a = await analyze({ path: o.input, v, duration, region, signal: o.signal })
    const codec = makeCodec(a)
    const model = await o.model.fixed(a.strip.mh, a.strip.mw)
    const sampleFrame = await grabFrame(o.input, a, duration * 0.5, o.signal)
    const sample = { image: codec.toTensor(sampleFrame), mask: codec.maskTensor, height: a.strip.mh, width: a.strip.mw }
    const cpu = cpuPlan({ logical: availableParallelism(), arch: process.arch, totalMem: totalmem() })
    const open = (): Promise<InferencePool> => openPool({ spawn: o.spawn, model, sample, signal: o.signal, cpu })
    let label = ''
    let hosts = 1
    const total = duration > 0 ? Math.round(duration * rateValue(a.rate)) : undefined
    const eta = etaTracker(total)
    const setPool = (p: InferencePool): void => {
      hosts = p.hosts.length
      label = backendLabel(p.backend, hosts)
    }
    inferencer = new Inferencer(await open(), open, setPool)
    setPool(inferencer.current)
    recordCalibration(label, inferencer.current.msPerFrame, hosts)
    o.onStage({ ...tag, stage: 'refine', pct: 0, backend: label })

    const coverFile = await exportCover(o, probe)
    const kbps = o.kbps ?? targetKbps(v.bitrate, a.width, a.height, v.fps)
    const inf = inferencer
    const pass = (enc: Encoder): Promise<PassResult> =>
      runPass({
        decodeArgs: buildDecodeArgs(o.input, a.videoIndex, a.rate),
        encodeArgs: buildEncodeArgs({ probe, input: o.input, output: o.output, width: a.width, height: a.height, rate: a.rate, enc, kbps, format: o.format, coverFile }),
        output: o.output,
        frameSize: (a.width * a.height * 3) / 2,
        codec,
        infer: (img) => inf.run(img),
        inflight: Math.max(4, hosts * 2 + 2),
        signal: o.signal,
        onFrame: (n) => {
          // 每 10 帧报一次，界面不用刷那么勤
          if (n % 10) return
          o.onStage({ ...tag, stage: 'refine', pct: total ? Math.min(99.9, Math.round((n / total) * 1000) / 10) : undefined, eta: eta(n), backend: label })
        }
      })
    let enc = await pickEncoder({ srcCodec: v.codec, width: a.width, height: a.height }, o.signal)
    let started = Date.now()
    try {
      await pass(enc)
    } catch (e) {
      // 硬件编码器跑起来才失败（显存不够、驱动问题）：换软件编码再来一次，和转码的规矩一样
      if (!(e instanceof EncodeError) || !enc.hw || o.signal.aborted || HOPELESS.test(e.stderr ?? '')) throw e
      if (isEncoderFailure(e.stderr)) markEncoderBroken(enc)
      enc = softwareEncoder({ width: a.width, height: a.height })
      started = Date.now()
      await pass(enc)
    }
    // 记下这台机器的速度（只算逐帧处理这一段），供以后估算
    recordRun('ai', { seconds: (Date.now() - started) / 1000, duration, width: a.width, height: a.height, fps: v.fps, backend: label })
    return { codec: enc.codec, width: v.width, height: v.height, region }
  } finally {
    inferencer?.close()
    release()
  }
}
