// 运行 yt-dlp：固定的公共参数、逐行读输出、解析进度、中止时连子进程一起结束
import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process'
import { AbortError } from '../download/errors'
import { classifyYtError } from './errors'

export interface YtEnv {
  exe: string
  /** 当 JS 运行时用的 Node：应用自己的可执行文件（配合 ELECTRON_RUN_AS_NODE） */
  jsRuntime: string
  ffmpeg?: string
  /** 空串表示直连（不读系统环境变量里的代理） */
  proxy?: string
  /** Netscape 格式的 cookie 文件 */
  cookies?: string
  /** yt-dlp 缓存播放器脚本、挑战结果的目录，下次解析更快 */
  cacheDir?: string
}

export interface RunOptions {
  signal?: AbortSignal
  /** 逐行收到标准输出；不传时整段收集后返回 */
  onLine?: (line: string) => void
  spawn?: typeof nodeSpawn
  platform?: NodeJS.Platform
}

/** 进度行的前缀（--progress-template 'download:@@P%(progress)j'） */
export const PROGRESS_PREFIX = '@@P'
export const PROGRESS_ARGS = ['--newline', '--progress-template', `download:${PROGRESS_PREFIX}%(progress)j`, '--progress-delta', '0.5']

export interface YtProgress {
  status: 'downloading' | 'finished' | 'error'
  downloaded: number
  total?: number
  filename?: string
}

/** 解析一行进度；不是进度行时返回空 */
export function parseProgress(line: string): YtProgress | undefined {
  if (!line.startsWith(PROGRESS_PREFIX)) return undefined
  try {
    const p = JSON.parse(line.slice(PROGRESS_PREFIX.length)) as {
      status?: string
      downloaded_bytes?: number
      total_bytes?: number | null
      total_bytes_estimate?: number | null
      filename?: string
    }
    const status = p.status === 'finished' || p.status === 'error' ? p.status : 'downloading'
    const total = p.total_bytes ?? p.total_bytes_estimate ?? undefined
    return { status, downloaded: p.downloaded_bytes ?? 0, total: total ? Math.round(total) : undefined, filename: p.filename }
  } catch {
    return undefined
  }
}

/** 每次都带的参数：不读用户的配置文件，输出 UTF-8（中文 Windows 默认 GBK），只用指定的 JS 运行时 */
export function baseArgs(env: YtEnv): string[] {
  return [
    '--ignore-config',
    '--encoding', 'utf-8',
    '--no-color',
    '--no-warnings',
    // 先关掉自动发现：用户装了 deno 时 yt-dlp 会优先用它
    '--no-js-runtimes',
    '--js-runtimes', `node:${env.jsRuntime}`,
    ...(env.ffmpeg ? ['--ffmpeg-location', env.ffmpeg] : []),
    '--proxy', env.proxy ?? '',
    ...(env.cookies ? ['--cookies', env.cookies] : []),
    ...(env.cacheDir ? ['--cache-dir', env.cacheDir] : ['--no-cache-dir'])
  ]
}

/** 结束进程和它启动的子进程（JS 运行时、ffmpeg）：只结束 yt-dlp 本身的话它们会留在后台 */
export function killTree(child: ChildProcess, platform: NodeJS.Platform = process.platform, spawn: typeof nodeSpawn = nodeSpawn): void {
  if (child.pid === undefined || child.exitCode !== null) return
  if (platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill())
    return
  }
  try {
    // detached 启动的进程自成一个进程组，负的 pid 表示整组
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

const STDERR_KEEP = 64 * 1024

/** 运行一次 yt-dlp；非 0 退出时按输出抛出对应的错误，中止时抛 AbortError */
export function runYtdlp(env: YtEnv, args: string[], o: RunOptions = {}): Promise<{ stdout: string; stderr: string }> {
  const spawn = o.spawn ?? nodeSpawn
  const platform = o.platform ?? process.platform
  return new Promise((resolve, reject) => {
    if (o.signal?.aborted) return reject(new AbortError())
    const child = spawn(env.exe, [...baseArgs(env), ...args], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      detached: platform !== 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const out: Buffer[] = []
    let stderr = ''
    let pending = ''
    const onAbort = (): void => killTree(child, platform, spawn)
    o.signal?.addEventListener('abort', onAbort, { once: true })
    child.stdout!.on('data', (chunk: Buffer) => {
      if (!o.onLine) {
        out.push(chunk)
        return
      }
      pending += chunk.toString('utf8')
      const lines = pending.split(/\r?\n/)
      pending = lines.pop()!
      for (const line of lines) if (line) o.onLine(line)
    })
    child.stderr!.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-STDERR_KEEP)
    })
    child.on('error', (e) => {
      o.signal?.removeEventListener('abort', onAbort)
      reject(e)
    })
    child.on('close', (code) => {
      o.signal?.removeEventListener('abort', onAbort)
      if (pending && o.onLine) o.onLine(pending)
      if (o.signal?.aborted) return reject(new AbortError())
      if (code === 0) resolve({ stdout: Buffer.concat(out).toString('utf8'), stderr })
      else reject(classifyYtError(stderr, code))
    })
  })
}
