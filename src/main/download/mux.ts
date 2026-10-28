import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

let cached: string | undefined

/** 打包后用随包的 ffmpeg；开发时用 resources/ffmpeg/<arch>，再退回系统 ffmpeg */
export function ffmpegPath(): string {
  if (cached) return cached
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'ffmpeg', 'ffmpeg')]
    : [
        join(app.getAppPath(), 'resources', 'ffmpeg', process.arch, 'ffmpeg'),
        '/opt/homebrew/bin/ffmpeg',
        '/usr/local/bin/ffmpeg'
      ]
  cached = candidates.find((p) => existsSync(p)) ?? 'ffmpeg'
  return cached
}

export function runFfmpeg(args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { signal })
    let stderr = ''
    proc.stderr.on('data', (d) => {
      stderr = (stderr + d).slice(-2000)
    })
    proc.on('error', (e) => reject(e.name === 'AbortError' ? e : new Error(`无法运行 ffmpeg：${e.message}`)))
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg 合并失败（${code}）：${stderr.trim().split('\n').pop() ?? ''}`))
    })
  })
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

/** format：m4a 用 ipod 封装器，flac 用 flac */
export function remuxAudio(
  input: string,
  out: string,
  title: string,
  format: 'ipod' | 'flac',
  signal?: AbortSignal
): Promise<void> {
  return runFfmpeg(
    ['-i', input, '-map', '0:a:0', '-c', 'copy', '-metadata', `title=${title}`, '-f', format, out],
    signal
  )
}
