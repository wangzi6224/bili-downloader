import { spawn } from 'node:child_process'
import { AbortError, FfmpegError } from '../download/errors'
import { explainFfmpegError, ffmpegPath } from '../download/mux'
import { trackJob } from './orphans'

export interface TranscodeProgress {
  /** 0-99.9，跑完前不给 100，免得界面先显示完成 */
  pct: number
  /** 剩余秒数 */
  eta?: number
}

export interface CaptureResult {
  code: number | null
  stdout: Buffer
  stderr: string
}

/** 读媒体信息时要整段 stderr（简介等元数据可能很长），只在异常大时截掉开头 */
const CAPTURE_STDERR_MAX = 1_000_000
/** 转码的 stderr 只用来报错 */
const TRANSCODE_STDERR_MAX = 4000
/** 转码多久没有进展视为卡死 */
const IDLE_MS = 120_000
/** 心跳间隔 */
const TICK_MS = 1000
/** 两次心跳隔了这么久，说明系统睡眠过（合盖、手动睡眠）或整个应用被挂起 */
const SLEEP_GAP_MS = 10_000

/**
 * 只算醒着的时间的钟：靠心跳发现睡眠，睡着的那段不计。
 * Windows 上计时器把睡眠时间也算进去，醒来后超时会立刻到期，可这段时间 ffmpeg 也停着，不能算它卡死
 */
export class AwakeClock {
  private start: number
  private last: number
  private slept = 0
  constructor(now: number) {
    this.start = this.last = now
  }
  tick(now: number): void {
    const gap = now - this.last
    this.last = now
    if (gap > SLEEP_GAP_MS) this.slept += gap - TICK_MS
  }
  /** 从开始（或上次 reset）到 now 醒着的毫秒数 */
  elapsed(now: number): number {
    this.tick(now)
    return now - this.start - this.slept
  }
  reset(now: number): void {
    this.start = this.last = now
    this.slept = 0
  }
}

/** 醒着的时间累计到 ms 才调用 onExpire；reset 从头计时。now 只在测试里替换 */
export function awakeTimer(ms: number, onExpire: () => void, now: () => number = Date.now): { reset: () => void; stop: () => void } {
  const clock = new AwakeClock(now())
  const beat = setInterval(() => clock.tick(now()), TICK_MS)
  let timer: NodeJS.Timeout | undefined
  const arm = (wait: number): void => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      const awake = clock.elapsed(now())
      // 中间睡过一觉：还没到时间，补上剩下的
      if (awake < ms) return arm(ms - awake)
      clearInterval(beat)
      onExpire()
    }, wait)
  }
  arm(ms)
  return {
    reset: () => {
      clock.reset(now())
      arm(ms)
    },
    stop: () => {
      clearTimeout(timer)
      clearInterval(beat)
    }
  }
}

/**
 * 跑一次 ffmpeg 收集输出，不排队：读信息、抽帧、试编码都很快，不该被几分钟的转码挡住。
 * 非 0 退出码不算失败（ffmpeg -i 不给输出文件时就是 1），交给调用方判断
 */
export function ffmpegCapture(
  args: string[],
  o: { signal?: AbortSignal; timeoutMs?: number; maxBytes?: number; loglevel?: string; stdin?: Uint8Array } = {}
): Promise<CaptureResult> {
  const { signal, timeoutMs = 60_000, maxBytes = 64 * 1024 * 1024, loglevel = 'error' } = o
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortError())
    const proc = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', loglevel, '-nostdin', ...args])
    // 输入从 pipe:0 读（比如原始帧转 JPEG）；ffmpeg 提前退出时写入会报 EPIPE，以退出码为准
    if (o.stdin) {
      proc.stdin.on('error', () => {})
      proc.stdin.end(o.stdin)
    }
    const chunks: Buffer[] = []
    let size = 0
    let stderr = ''
    /** 被我们主动结束的原因，进程退出后按它报错 */
    let failure: Error | undefined
    const stop = (e: Error): void => {
      failure ??= e
      proc.kill('SIGKILL')
    }
    const onAbort = (): void => stop(new AbortError())
    signal?.addEventListener('abort', onAbort, { once: true })
    const timer = awakeTimer(timeoutMs, () => stop(new FfmpegError('ffmpeg 没有响应', stderr)))
    const cleanup = (): void => {
      timer.stop()
      signal?.removeEventListener('abort', onAbort)
    }
    proc.stdout.on('data', (d: Buffer) => {
      if (failure) return
      size += d.length
      if (size > maxBytes) return stop(new FfmpegError('ffmpeg 输出的数据超出预期', stderr))
      chunks.push(d)
    })
    proc.stderr.on('data', (d) => {
      stderr = (stderr + d).slice(-CAPTURE_STDERR_MAX)
    })
    proc.on('error', (e) => {
      cleanup()
      reject(new FfmpegError(`无法运行 ffmpeg：${e.message}`))
    })
    proc.on('close', (code) => {
      cleanup()
      if (failure) reject(failure)
      else resolve({ code, stdout: Buffer.concat(chunks), stderr })
    })
  })
}

type ProgressBlock = Record<string, string>

/** -progress 的输出：每块若干行 key=value，以 progress=continue|end 结尾；一行可能被拆进两个 chunk */
function progressReader(onBlock: (b: ProgressBlock) => void): (chunk: Buffer | string) => void {
  let rest = ''
  let block: ProgressBlock = {}
  return (chunk) => {
    const lines = (rest + chunk).split('\n')
    rest = lines.pop() as string
    for (const raw of lines) {
      const line = raw.trim()
      const eq = line.indexOf('=')
      if (eq <= 0) continue
      const key = line.slice(0, eq)
      block[key] = line.slice(eq + 1).trim()
      if (key === 'progress') {
        onBlock(block)
        block = {}
      }
    }
  }
}

/** N/A、空值、负数都当作还不知道 */
function num(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** out_time_ms 名不副实，单位也是微秒 */
const outTimeUs = (b: ProgressBlock): number | undefined => num(b.out_time_us) ?? num(b.out_time_ms)

function toProgress(b: ProgressBlock, durationSec: number | undefined): TranscodeProgress | undefined {
  if (b.progress === 'end') return { pct: 99.9, eta: 0 }
  const us = outTimeUs(b)
  if (us === undefined || !durationSec || durationSec <= 0) return undefined
  const pos = us / 1e6
  const pct = Math.min(99.9, Math.round((pos / durationSec) * 1000) / 10)
  // speed 可能是 "speed= 8.9x"、"speed=N/A"
  const speed = num(b.speed?.replace(/x$/, ''))
  return speed ? { pct, eta: Math.max(0, Math.round((durationSec - pos) / speed)) } : { pct }
}

/** 把 -progress 输出换算成百分比和剩余时间；没有时长时只报结束 */
export function progressParser(
  durationSec: number | undefined,
  cb: (p: TranscodeProgress) => void
): (chunk: Buffer | string) => void {
  return progressReader((b) => {
    const p = toProgress(b, durationSec)
    if (p) cb(p)
  })
}

const TRANSCODE_PREFIX = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-nostats', '-progress', 'pipe:1']

interface TranscodeOptions {
  signal?: AbortSignal
  durationSec?: number
  onStart?: () => void
  onProgress?: (p: TranscodeProgress) => void
  idleMs?: number
}

function spawnTranscode(args: string[], o: TranscodeOptions): Promise<void> {
  const { signal, durationSec, onProgress, idleMs = IDLE_MS } = o
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), [...TRANSCODE_PREFIX, ...args])
    // 最后一个参数是输出文件，应用崩溃后下次启动靠它认出没退出的 ffmpeg
    const untrack = trackJob(proc.pid, args[args.length - 1] ?? '')
    o.onStart?.()
    let stderr = ''
    let stalled = false
    // 只看进度数值有没有增长：卡住的编码线程照样会定期打印一模一样的进度块
    const idle = awakeTimer(idleMs, () => {
      stalled = true
      proc.kill('SIGKILL')
    })
    let lastFrame = -1
    let lastUs = -1
    proc.stdout.on(
      'data',
      progressReader((b) => {
        const frame = num(b.frame) ?? -1
        const us = outTimeUs(b) ?? -1
        if (frame > lastFrame || us > lastUs) {
          lastFrame = Math.max(lastFrame, frame)
          lastUs = Math.max(lastUs, us)
          idle.reset()
        }
        const p = toProgress(b, durationSec)
        if (p) onProgress?.(p)
      })
    )
    const onAbort = (): void => {
      proc.kill('SIGKILL')
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    proc.stderr.on('data', (d) => {
      stderr = (stderr + d).slice(-TRANSCODE_STDERR_MAX)
    })
    const cleanup = (): void => {
      idle.stop()
      untrack()
      signal?.removeEventListener('abort', onAbort)
    }
    proc.on('error', (e) => {
      cleanup()
      reject(new FfmpegError(`无法运行 ffmpeg：${e.message}`))
    })
    proc.on('close', (code) => {
      cleanup()
      if (signal?.aborted) reject(new AbortError())
      else if (stalled) reject(new FfmpegError('去水印超时：ffmpeg 长时间没有进展', stderr))
      else if (code === 0) resolve()
      else reject(new FfmpegError(explainFfmpegError(stderr, code, '去水印'), stderr))
    })
  })
}

/**
 * 转码和 AI 精修很吃 CPU / GPU（NVENC 还有同时会话数上限），同一时间只跑一个；和合并的队列分开，不挡住别的任务合并
 */
let queue: Promise<unknown> = Promise.resolve()

/**
 * 排队等名额，轮到时返回归还名额的函数（用完必须调用）。排队期间被中止立刻结束，名额直接让给后面的
 */
export function heavyTurn(signal?: AbortSignal): Promise<() => void> {
  if (signal?.aborted) return Promise.reject(new AbortError())
  const turn = queue
  let release!: () => void
  const finished = new Promise<void>((r) => (release = r))
  queue = turn.then(() => finished)
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      release()
      reject(new AbortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    void turn.then(() => {
      signal?.removeEventListener('abort', onAbort)
      if (signal?.aborted) return release()
      resolve(release)
    })
  })
}

/**
 * 排队转码。排队期间被中止立刻结束，轮到时也不再启动进程；
 * onStart 在真正启动 ffmpeg 时调用，调用方据此把“排队中”换成“转码中”
 */
export async function runTranscode(args: string[], o: TranscodeOptions = {}): Promise<void> {
  const release = await heavyTurn(o.signal)
  try {
    await spawnTranscode(args, o)
  } finally {
    release()
  }
}
