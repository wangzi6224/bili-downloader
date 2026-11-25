// YouTube 组件：yt-dlp 的单目录版，第一次用 YouTube 时从 GitHub 下载，校验 sha256 后放在用户数据目录，之后自动更新。
// 每个版本一个目录，current.json 指向在用的版本；换版本时正在跑的进程继续用旧目录，用完再删
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createReadStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { t } from '@shared/i18n'
import type { YtEngineStatus } from '@shared/types'
import { readJson, writeJson } from '../store'
import { AbortError } from '../download/errors'
import { fetchFile } from '../download/fetchFile'
import { unzip } from './unzip'

const REPO = 'https://github.com/yt-dlp/yt-dlp'
/** 自动检查更新的间隔 */
export const CHECK_INTERVAL = 24 * 3600_000
/** 首次运行（macOS 会先做安全扫描，可能要二十秒）最长等多久 */
const WARMUP_TIMEOUT = 120_000
const UA = 'bili-downloader'

export const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** 各系统用的单目录压缩包：启动比单文件版快得多（单文件每次启动都要先解包），Windows 上也只有一个进程 */
export function assetFor(platform: NodeJS.Platform, arch: string): string | undefined {
  if (platform === 'darwin') return 'yt-dlp_macos.zip'
  if (platform === 'win32') return { x64: 'yt-dlp_win.zip', arm64: 'yt-dlp_win_arm64.zip', ia32: 'yt-dlp_win_x86.zip' }[arch]
  if (platform === 'linux') return { x64: 'yt-dlp_linux.zip', arm64: 'yt-dlp_linux_aarch64.zip', arm: 'yt-dlp_linux_armv7l.zip' }[arch]
  return undefined
}

/** 版本号 2026.11.23、2026.11.23.1 比大小 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

/** SHA2-256SUMS 里某个文件的值（每行 “sha256  文件名”） */
export function sumFor(sums: string, asset: string): string | undefined {
  for (const line of sums.split(/\r?\n/)) {
    const m = /^([0-9a-f]{64})\s+\*?(.+)$/i.exec(line.trim())
    if (m && m[2] === asset) return m[1].toLowerCase()
  }
  return undefined
}

export interface EngineDeps {
  platform: NodeJS.Platform
  arch: string
  /** 最新版本号 */
  latest(signal: AbortSignal): Promise<string>
  fetchText(url: string, signal: AbortSignal): Promise<string>
  download(url: string, dest: string, signal: AbortSignal, onProgress: (done: number, total: number) => void): Promise<void>
  /** 运行一次程序，返回标准输出 */
  run(exe: string, args: string[], signal: AbortSignal): Promise<string>
  now(): number
}

/** GitHub 接口每小时有次数限制，不行就看 releases/latest 跳转到哪个版本 */
async function latestRelease(signal: AbortSignal): Promise<string> {
  try {
    const res = await fetch('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', {
      headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' },
      signal
    })
    if (res.ok) {
      const tag = ((await res.json()) as { tag_name?: string }).tag_name
      if (tag) return tag
    } else {
      await res.body?.cancel()
    }
  } catch (e) {
    if (signal.aborted) throw e
  }
  const res = await fetch(`${REPO}/releases/latest`, { headers: { 'User-Agent': UA }, redirect: 'manual', signal })
  await res.body?.cancel()
  const tag = /\/releases\/tag\/([^/?#]+)/.exec(res.headers.get('location') ?? '')?.[1]
  if (!tag) throw new Error(`HTTP ${res.status}`)
  return decodeURIComponent(tag)
}

export const defaultDeps = (): EngineDeps => ({
  platform: process.platform,
  arch: process.arch,
  latest: latestRelease,
  async fetchText(url, signal) {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.text()
  },
  download: (url, dest, signal, onProgress) =>
    fetchFile({ urls: [url], dest, fingerprint: url, threads: 4, headers: { 'User-Agent': UA }, signal, onProgress }),
  run: (exe, args, signal) =>
    new Promise((resolve, reject) => {
      execFile(exe, args, { signal, timeout: WARMUP_TIMEOUT, windowsHide: true, encoding: 'utf8' }, (err, stdout) =>
        err ? reject(err) : resolve(stdout))
    }),
  now: Date.now
})

async function sha256File(path: string, signal: AbortSignal): Promise<string> {
  const h = createHash('sha256')
  for await (const chunk of createReadStream(path, { signal })) h.update(chunk as Buffer)
  return h.digest('hex')
}

interface Current {
  version: string
  /** 目录里的可执行文件名 */
  exe: string
  checkedAt?: number
  latest?: string
}

/** 启动失败的原因：被杀毒软件拦了（Windows 上常见 EPERM、文件被删）单独提示 */
function runError(e: unknown, exe: string): Error {
  const code = (e as { code?: string }).code
  if (code === 'EPERM' || code === 'EACCES' || code === 'ENOENT' || code === 'UNKNOWN') return new Error(t('yt.engineBlocked', { path: exe }))
  return new Error(t('yt.engineBroken', { reason: reason(e) }))
}

export class YtEngine extends EventEmitter {
  private state: YtEngineStatus
  private job: Promise<string> | undefined
  /** 正在安装的版本：它的下载、解压残留不能被清理掉 */
  private installing: string | undefined
  private ac: AbortController | undefined
  /** 每个版本正在被几个进程使用 */
  private inUse = new Map<string, number>()

  constructor(
    private readonly dir: string,
    private readonly deps: EngineDeps = defaultDeps()
  ) {
    super()
    const cur = this.current()
    this.state = cur
      ? { state: 'ready', version: cur.version, latest: cur.latest, checkedAt: cur.checkedAt }
      : { state: 'missing' }
    this.cleanup()
  }

  private get currentFile(): string {
    return join(this.dir, 'current.json')
  }

  /** 在用的版本；目录被删了就当没装 */
  private current(): Current | undefined {
    const c = readJson<Current>(this.currentFile)
    return c?.version && c.exe && existsSync(join(this.dir, c.version, c.exe)) ? c : undefined
  }

  status(): YtEngineStatus {
    return { ...this.state }
  }

  private set(s: YtEngineStatus): void {
    this.state = s
    this.emit('status', this.status())
  }

  /** 已装好的可执行文件，没装时为空 */
  exePath(): string | undefined {
    const c = this.current()
    return c && join(this.dir, c.version, c.exe)
  }

  /** 拿到可用的 yt-dlp：没装就先装最新版（已经在装就等它） */
  async ensure(): Promise<string> {
    const exe = this.exePath()
    if (exe) return exe
    return this.job ?? this.install()
  }

  /**
   * 用 yt-dlp 做一件事：期间这个版本的目录不会被删（更新换了新版本，旧的要等所有进程用完再删）
   */
  async use<T>(fn: (exe: string) => Promise<T>): Promise<T> {
    const exe = await this.ensure()
    const version = this.current()!.version
    this.inUse.set(version, (this.inUse.get(version) ?? 0) + 1)
    try {
      return await fn(exe)
    } finally {
      const n = this.inUse.get(version)! - 1
      if (n > 0) this.inUse.set(version, n)
      else this.inUse.delete(version)
      this.cleanup()
    }
  }

  /** 检查更新：已经装了才检查（没装的等第一次用 YouTube 时再装）；有新版本就在后台换上 */
  async checkUpdate(force = false): Promise<YtEngineStatus> {
    const cur = this.current()
    if (!cur || this.job) return this.status()
    if (!force && cur.checkedAt && this.deps.now() - cur.checkedAt < CHECK_INTERVAL) return this.status()
    const ac = new AbortController()
    let latest: string
    try {
      latest = await this.deps.latest(ac.signal)
    } catch (e) {
      // 检查失败不影响使用，下次再查
      if (force) this.set({ ...this.state, message: t('yt.engineUnreachable', { reason: reason(e) }) })
      return this.status()
    }
    const checkedAt = this.deps.now()
    writeJson(this.currentFile, { ...cur, checkedAt, latest })
    this.set({ ...this.state, latest, checkedAt, message: undefined })
    if (compareVersions(latest, cur.version) > 0) {
      await this.install(latest).catch(() => undefined)
    }
    return this.status()
  }

  /** 取消正在进行的下载 */
  cancel(): void {
    this.ac?.abort()
  }

  /** 下载、校验、解压、试运行指定版本（缺省最新版），成功后切换过去 */
  private install(version?: string): Promise<string> {
    const ac = new AbortController()
    this.ac = ac
    const prev = this.current()
    const job = this.doInstall(ac.signal, version, prev).then(
      (exe) => {
        const cur = this.current()!
        this.set({ state: 'ready', version: cur.version, latest: cur.latest, checkedAt: cur.checkedAt })
        return exe
      },
      (e: unknown) => {
        const message = ac.signal.aborted ? undefined : reason(e)
        // 更新失败时旧版本照常能用
        if (prev) this.set({ state: 'ready', version: prev.version, latest: prev.latest, checkedAt: prev.checkedAt, message })
        else this.set({ state: ac.signal.aborted ? 'missing' : 'error', message })
        throw ac.signal.aborted ? new AbortError() : e
      }
    ).finally(() => {
      // 同一时间只有一个安装（ensure 和 checkUpdate 都会等正在进行的那个）
      this.job = undefined
      this.ac = undefined
      this.installing = undefined
    })
    this.job = job
    return job
  }

  private async doInstall(signal: AbortSignal, wanted: string | undefined, prev: Current | undefined): Promise<string> {
    const { platform, arch } = this.deps
    const asset = assetFor(platform, arch)
    if (!asset) throw new Error(t('yt.engineUnsupported', { platform, arch }))
    const progress = (s: Partial<YtEngineStatus>): void =>
      this.set({ ...(prev ? { state: 'ready', version: prev.version, updating: true } : { state: 'downloading' }), latest: this.state.latest, ...s })
    progress({ stage: 'download', done: 0 })
    const unreachable = (e: unknown): never => {
      if (signal.aborted) throw new AbortError()
      throw new Error(t('yt.engineUnreachable', { reason: reason(e) }))
    }
    const version = wanted ?? (await this.deps.latest(signal).catch(unreachable))
    this.installing = version
    const base = `${REPO}/releases/download/${encodeURIComponent(version)}`
    const sums = await this.deps.fetchText(`${base}/SHA2-256SUMS`, signal).catch(unreachable)
    const want = sumFor(sums, asset)
    if (!want) throw new Error(t('yt.engineNoSum', { asset }))

    mkdirSync(this.dir, { recursive: true })
    const zip = join(this.dir, `${version}.zip.download`)
    let last = 0
    await this.deps.download(`${base}/${asset}`, zip, signal, (done, size) => {
      const now = this.deps.now()
      if (now - last < 250 && done < size) return
      last = now
      progress({ stage: 'download', done, size })
    }).catch(unreachable)

    progress({ stage: 'verify' })
    if ((await sha256File(zip, signal)) !== want) {
      rmSync(zip, { force: true })
      throw new Error(t('yt.engineChecksum'))
    }

    progress({ stage: 'extract' })
    const partial = join(this.dir, `${version}.partial`)
    rmSync(partial, { recursive: true, force: true })
    const top = await unzip(zip, partial, signal)
    const exeName = top.find((n) => /^yt-dlp/i.test(n))
    if (!exeName) throw new Error(t('yt.engineBroken', { reason: asset }))

    // 第一次运行顺便确认能用：macOS 首次运行新程序要先做安全扫描，在这里等掉，用户解析时就不会卡
    progress({ stage: 'warmup' })
    const out = await this.deps.run(join(partial, exeName), ['--version'], signal).catch((e: unknown) => {
      if (signal.aborted) throw new AbortError()
      throw runError(e, join(partial, exeName))
    })
    if (out.trim() !== version) throw new Error(t('yt.engineBroken', { reason: out.trim().slice(0, 200) || 'no output' }))

    const target = join(this.dir, version)
    rmSync(target, { recursive: true, force: true })
    renameSync(partial, target)
    rmSync(zip, { force: true })
    writeJson(this.currentFile, { version, exe: exeName, checkedAt: this.deps.now(), latest: version } satisfies Current)
    this.cleanup()
    return join(target, exeName)
  }

  /** 删掉不再用的旧版本和没下完的残留（正在下载的除外） */
  private cleanup(): void {
    const cur = this.current()?.version
    let names: string[]
    try {
      names = readdirSync(this.dir)
    } catch {
      return
    }
    for (const name of names) {
      if (name === 'current.json' || name === cur || this.inUse.has(name)) continue
      if (this.installing && name.startsWith(`${this.installing}.`)) continue
      rmSync(join(this.dir, name), { recursive: true, force: true })
    }
  }
}
