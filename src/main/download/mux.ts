import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { AbortError, FfmpegError } from './errors'

let cached: string | undefined

const ffmpegName = (): string => (process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')

/** 打包后用随包的 ffmpeg；开发时优先用系统安装的 ffmpeg，再退回 resources/ffmpeg/<系统>-<架构> */
export function ffmpegPath(): string {
  if (cached) return cached
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'ffmpeg', ffmpegName())]
    : [
        '/opt/homebrew/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        join(app.getAppPath(), 'resources', 'ffmpeg', `${process.platform}-${process.arch}`, ffmpegName())
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

export type OutFormat = 'mp4' | 'mkv' | 'm4a' | 'flac'

export interface MuxOptions {
  video?: string
  audio?: string
  out: string
  format: OutFormat
  title: string
  hevc?: boolean
  dolbyVision?: boolean
  /** 写进文件的封面（jpg / png） */
  cover?: string
  subtitles?: { path: string; language: string; title: string }[]
  /** FFMETADATA 格式的章节文件 */
  chapters?: string
  metadata?: Record<string, string | undefined>
}

/** 组装 ffmpeg 参数（导出供单元测试） */
export function buildMuxArgs(o: MuxOptions): string[] {
  const args: string[] = []
  let inputs = 0
  const input = (path: string, pre: string[] = []): number => {
    args.push(...pre, '-i', path)
    return inputs++
  }
  const mp4Family = o.format === 'mp4' || o.format === 'm4a'
  const videoContainer = o.format === 'mp4' || o.format === 'mkv'

  const vi = o.video ? input(o.video) : -1
  const ai = o.audio ? input(o.audio) : -1
  // MKV 的封面用附件，其余格式作为一路“附图”视频流
  const ci = o.cover && o.format !== 'mkv' ? input(o.cover) : -1
  const subs = videoContainer ? (o.subtitles ?? []) : []
  const si = subs.map((s) => input(s.path))
  const chi = o.chapters ? input(o.chapters, ['-f', 'ffmetadata']) : -1

  if (vi >= 0) args.push('-map', `${vi}:v:0`)
  if (ai >= 0) args.push('-map', `${ai}:a:0`)
  if (ci >= 0) args.push('-map', `${ci}:v:0`)
  for (const i of si) args.push('-map', `${i}:s:0`)
  if (chi >= 0) args.push('-map_chapters', String(chi))

  args.push('-c', 'copy')
  if (si.length) args.push('-c:s', o.format === 'mp4' ? 'mov_text' : 'srt')
  if (ci >= 0) args.push(`-disposition:v:${vi >= 0 ? 1 : 0}`, 'attached_pic')
  if (o.cover && o.format === 'mkv') {
    args.push('-attach', o.cover, '-metadata:s:t:0', `mimetype=${o.cover.endsWith('.png') ? 'image/png' : 'image/jpeg'}`)
    args.push('-metadata:s:t:0', `filename=cover${o.cover.endsWith('.png') ? '.png' : '.jpg'}`)
  }
  subs.forEach((s, k) => {
    args.push(`-metadata:s:s:${k}`, `language=${s.language}`, `-metadata:s:s:${k}`, `title=${s.title}`)
    // MP4 的轨道名在 handler_name 里，否则播放器里多条中文字幕会同名
    if (o.format === 'mp4') args.push(`-metadata:s:s:${k}`, `handler_name=${s.title}`)
  })

  // QuickTime 只认 hvc1 / dvh1 标签的 HEVC；只作用于主视频流，不碰封面
  if (vi >= 0 && o.format === 'mp4') {
    if (o.dolbyVision) args.push('-tag:v:0', 'dvh1', '-strict', 'unofficial')
    else if (o.hevc) args.push('-tag:v:0', 'hvc1')
  }

  args.push('-metadata', `title=${o.title}`)
  for (const [k, v] of Object.entries(o.metadata ?? {})) if (v) args.push('-metadata', `${k}=${v}`)
  if (mp4Family) args.push('-movflags', '+faststart')
  // m4a 用 mp4 封装器写（随包的静态 ffmpeg 不一定带 ipod 封装器）
  args.push('-f', mp4Family ? 'mp4' : o.format === 'mkv' ? 'matroska' : 'flac', o.out)
  return args
}

/**
 * 合并音视频并写入封面、字幕、章节。带附加内容的合并失败时（例如封面格式不受支持），
 * 退回只合并音视频，返回 false 让调用方把附加内容改为单独保存。
 */
export async function mux(o: MuxOptions, signal?: AbortSignal): Promise<boolean> {
  const hasExtras = Boolean(o.cover || o.subtitles?.length || o.chapters)
  try {
    await runFfmpeg(buildMuxArgs(o), signal)
    return true
  } catch (e) {
    if (!hasExtras || signal?.aborted || !(e instanceof FfmpegError)) throw e
    console.warn('嵌入附加内容失败，改为只合并音视频：', e.message)
    await runFfmpeg(buildMuxArgs({ ...o, cover: undefined, subtitles: undefined, chapters: undefined }), signal)
    return false
  }
}
