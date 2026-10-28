import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { AbortError, FfmpegError } from './errors'

let cached: string | undefined

/** 打包后用随包的 ffmpeg；开发时优先用系统安装的 ffmpeg，再退回 resources/ffmpeg/<arch> */
export function ffmpegPath(): string {
  if (cached) return cached
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'ffmpeg', 'ffmpeg')]
    : [
        '/opt/homebrew/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        join(app.getAppPath(), 'resources', 'ffmpeg', process.arch, 'ffmpeg')
      ]
  cached = candidates.find((p) => existsSync(p)) ?? 'ffmpeg'
  return cached
}

/** 把 ffmpeg 的报错翻译成用户能看懂的原因 */
export function explainFfmpegError(stderr: string, code: number | null): string {
  const s = stderr.toLowerCase()
  if (s.includes('no space left')) return '合并失败：磁盘空间不足'
  if (s.includes('permission denied') || s.includes('operation not permitted')) return '合并失败：没有写入目标目录的权限'
  if (s.includes('invalid data found') || s.includes('moov atom not found') || s.includes('error while decoding')) {
    return '合并失败：下载的文件已损坏，请点“重新下载”'
  }
  if (s.includes('could not find tag for codec') || s.includes('not supported in container')) {
    return '合并失败：这种编码放不进当前封装格式，请在设置里改用 MKV'
  }
  const last = stderr.trim().split('\n').pop() ?? ''
  return `合并失败（ffmpeg 退出码 ${code}）：${last}`
}

/** 合并很吃磁盘 IO，同一时间只运行一个 ffmpeg，其余排队 */
let queue: Promise<unknown> = Promise.resolve()

/** 单次合并超过这个时间视为卡死 */
const WATCHDOG_MS = 30 * 60_000

function spawnFfmpeg(args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortError())
    const proc = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args])
    let stderr = ''
    const onAbort = (): void => {
      proc.kill('SIGKILL')
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    const watchdog = setTimeout(() => proc.kill('SIGKILL'), WATCHDOG_MS)
    proc.stderr.on('data', (d) => {
      stderr = (stderr + d).slice(-4000)
    })
    proc.on('error', (e) => reject(new FfmpegError(`无法运行 ffmpeg：${e.message}`)))
    proc.on('close', (code, sig) => {
      clearTimeout(watchdog)
      signal?.removeEventListener('abort', onAbort)
      if (signal?.aborted) reject(new AbortError())
      else if (code === 0) resolve()
      else if (sig === 'SIGKILL') reject(new FfmpegError('合并超时，ffmpeg 没有响应'))
      else reject(new FfmpegError(explainFfmpegError(stderr, code)))
    })
  })
}

export function runFfmpeg(args: string[], signal?: AbortSignal): Promise<void> {
  const run = queue.then(() => spawnFfmpeg(args, signal))
  queue = run.catch(() => {})
  return run
}

export interface MuxVideoOptions {
  video: string
  audio?: string
  out: string
  title: string
  hevc: boolean
  dolbyVision: boolean
}

export function muxVideo(o: MuxVideoOptions, signal?: AbortSignal): Promise<void> {
  const args = ['-i', o.video]
  if (o.audio) args.push('-i', o.audio)
  args.push('-map', '0:v:0')
  if (o.audio) args.push('-map', '1:a:0')
  args.push('-c', 'copy')
  // QuickTime 只认 hvc1 / dvh1 标签的 HEVC
  if (o.dolbyVision) args.push('-tag:v', 'dvh1', '-strict', 'unofficial')
  else if (o.hevc) args.push('-tag:v', 'hvc1')
  args.push('-metadata', `title=${o.title}`, '-movflags', '+faststart', '-f', 'mp4', o.out)
  return runFfmpeg(args, signal)
}

/**
 * 仅音频：m4a 用 mp4 封装器写（随包的静态 ffmpeg 不一定带 ipod 封装器），flac 用 flac 封装器
 */
export function remuxAudio(
  input: string,
  out: string,
  title: string,
  format: 'm4a' | 'flac',
  signal?: AbortSignal
): Promise<void> {
  return runFfmpeg(
    ['-i', input, '-map', '0:a:0', '-c', 'copy', '-metadata', `title=${title}`, '-f', format === 'm4a' ? 'mp4' : 'flac', out],
    signal
  )
}
