import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream } from 'node:stream/web'
import { app, shell } from 'electron'
import type { UpdateInfo, UpdateState } from '@shared/types'
import { logDir } from '../logger'
import { quitConfirmed } from '../quitGuard'
import { readJson, writeJson } from '../store'
import { send } from '../windows'
import { installBlocker, prepare, replaceAfterExit } from './install'
import { assetKey, compareVersions, notesSince, parseManifest, type ManifestFile } from './manifest'

/** 新版本发布在这个仓库的 Releases 里，每个 Release 都带一份 update.json（见 scripts/release.mjs） */
const REPO = 'wangzi6224/bili-downloader'
/** 测试更新流程时可以用 BILI_UPDATE_FEED=http://127.0.0.1:端口/update.json 指向本地的清单 */
const TEST_FEED = process.env.BILI_UPDATE_FEED
const FEED = TEST_FEED || `https://github.com/${REPO}/releases/latest/download/update.json`
/** 后台一直开着时，每天再查一次 */
const RECHECK_MS = 24 * 3600_000
/** 这么久没收到数据就断开重连 */
const STALL_MS = 60_000
const RETRIES = 4
/** 自动更新下载的安装包：macOS 是 zip，Linux 是 AppImage */
const PACKAGE_EXT = process.platform === 'darwin' ? 'zip' : 'AppImage'

/** 去掉 current / checkedAt 之后的各个状态 */
type Body = UpdateState extends infer S ? (S extends unknown ? Omit<S, 'current' | 'checkedAt'> : never) : never

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function sha512(file: string): Promise<string> {
  const h = createHash('sha512')
  for await (const chunk of createReadStream(file)) h.update(chunk as Buffer)
  return h.digest('base64')
}

async function matches(file: string, expect: ManifestFile): Promise<boolean> {
  if (!existsSync(file) || statSync(file).size !== expect.size) return false
  return (await sha512(file)) === expect.sha512
}

export class Updater {
  private readonly current = app.getVersion()
  private state: UpdateState = { status: 'idle', current: this.current }
  private file?: ManifestFile
  private abort?: AbortController
  /** 本次运行里已经弹窗提示过的版本，后台定时检查不再重复弹 */
  private prompted = ''
  private lastEmit = 0
  private timer?: NodeJS.Timeout

  constructor(
    /** 安装包下载和解压的目录 */
    private readonly dir: string,
    /** 记录跳过的版本 */
    private readonly prefsFile: string
  ) {}

  getState(): UpdateState {
    return this.state
  }

  /** 清掉已经装过的旧安装包，然后按设置定时检查 */
  start(enabled: () => boolean): void {
    // 比当前版本新的安装包（包括下载到一半的）留着，下次可以直接用
    this.cleanup((name) => {
      const v = /^bili-downloader-(.+)-\w+\.(?:zip|AppImage)(\.part)?$/.exec(name)?.[1]
      try {
        return !!v && compareVersions(v, this.current) > 0
      } catch {
        return false
      }
    })
    const tick = (): void => {
      if (enabled()) void this.check(false)
    }
    tick()
    this.timer = setInterval(tick, RECHECK_MS)
  }

  stop(): void {
    clearInterval(this.timer)
    this.abort?.abort()
  }

  async check(manual: boolean): Promise<UpdateState> {
    // 下载、安装中，或者已经下载好了，都不需要再查
    if (['checking', 'downloading', 'ready', 'installing'].includes(this.state.status)) return this.state
    const prev = this.state
    // 后台定时检查时保留已发现的新版本，免得打开着的更新弹窗闪一下
    if (manual || !('info' in prev && prev.info)) this.set({ status: 'checking' })
    try {
      const res = await fetch(FEED, { signal: AbortSignal.timeout(20_000), headers: { 'Cache-Control': 'no-cache' } })
      if (res.status === 404) throw new Error('服务器上还没有发布任何版本')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const m = parseManifest(await res.json(), Boolean(TEST_FEED))
      const checkedAt = Date.now()
      if (compareVersions(m.version, this.current) <= 0) {
        this.set({ status: 'latest' }, checkedAt)
        return this.state
      }
      const key = assetKey(process.platform, process.arch)
      const file = m.files[key]
      if (!file) throw new Error(`新版本 ${m.version} 没有 ${key} 的安装包`)
      this.file = file
      const info: UpdateInfo = {
        version: m.version,
        date: m.date,
        notes: notesSince(m.notes, this.current, m.version),
        page: m.page,
        size: file.size,
        blocker: installBlocker(),
        skipped: readJson<{ skipVersion?: string }>(this.prefsFile)?.skipVersion === m.version
      }
      // 之前已经下载并校验过同一个安装包，直接可以安装
      const cached = !info.blocker && (await matches(this.packagePath(info.version), file).catch(() => false))
      this.set({ status: cached ? 'ready' : 'available', info }, checkedAt)
      console.info(`更新：发现新版本 ${m.version}${info.skipped ? '（已跳过）' : ''}`)
      if (!manual && !info.skipped && this.prompted !== m.version) {
        this.prompted = m.version
        send('update:prompt')
      }
    } catch (e) {
      console.warn('检查更新失败', e)
      // 自动检查失败时不打扰：之前发现的新版本照样保留
      if (!manual && 'info' in prev && prev.info) this.set(prev, prev.checkedAt)
      else this.set({ status: 'error', error: `检查更新失败：${message(e)}` }, Date.now())
    }
    return this.state
  }

  /** 在后台下载，进度通过 update:state 推送 */
  download(): void {
    const s = this.state
    if ((s.status !== 'available' && s.status !== 'error') || !s.info || !this.file) return
    if (s.info.blocker) throw new Error(s.info.blocker)
    void this.runDownload(s.info, this.file)
  }

  cancel(): void {
    this.abort?.abort()
  }

  async install(): Promise<void> {
    const s = this.state
    if (s.status !== 'ready' || !this.file) throw new Error('更新还没有下载完成')
    const blocker = installBlocker()
    if (blocker) throw new Error(blocker)
    const { info } = s
    this.set({ status: 'installing', info })
    try {
      const pkg = this.packagePath(info.version)
      if (!(await matches(pkg, this.file))) throw new Error('安装包已损坏，请重新下载')
      const next = await prepare(pkg, join(this.dir, 'stage'), info.version)
      replaceAfterExit(next, this.dir, join(logDir(), 'update.log'))
      console.info(`更新：退出并安装 ${info.version}`)
      // 更新弹窗里已经提醒过未完成的任务；安装脚本已经在等进程退出，不能再被取消
      quitConfirmed()
    } catch (e) {
      console.error('安装更新失败', e)
      this.set({ status: 'error', error: `安装更新失败：${message(e)}`, info })
    }
  }

  skip(): void {
    const s = this.state
    if (!('info' in s) || !s.info) return
    writeJson(this.prefsFile, { skipVersion: s.info.version })
    this.set({ ...s, info: { ...s.info, skipped: true } } as Body)
  }

  openPage(): void {
    const s = this.state
    void shell.openExternal('info' in s && s.info ? s.info.page : `https://github.com/${REPO}/releases/latest`)
  }

  private packagePath(version: string): string {
    return join(this.dir, `bili-downloader-${version}-${process.arch}.${PACKAGE_EXT}`)
  }

  private set(body: Body, checkedAt = this.state.checkedAt): void {
    this.state = { ...body, current: this.current, checkedAt } as UpdateState
    this.lastEmit = Date.now()
    send('update:state', this.state)
  }

  /** 进度最多每 200ms 推送一次 */
  private progress(info: UpdateInfo, done: number, total: number): void {
    this.state = { status: 'downloading', info, done, total, current: this.current, checkedAt: this.state.checkedAt }
    if (Date.now() - this.lastEmit >= 200) this.set(this.state)
  }

  private async runDownload(info: UpdateInfo, file: ManifestFile): Promise<void> {
    const dest = this.packagePath(info.version)
    const part = `${dest}.part`
    const abort = (this.abort = new AbortController())
    this.set({ status: 'downloading', info, done: 0, total: file.size })
    try {
      mkdirSync(this.dir, { recursive: true })
      if (!(await matches(dest, file))) {
        for (let attempt = 1; ; attempt++) {
          try {
            await this.fetchTo(file, part, info, abort.signal)
            break
          } catch (e) {
            if (abort.signal.aborted || attempt >= RETRIES) throw e
            console.warn(`下载更新出错，第 ${attempt} 次重试`, e)
            await sleep(2000 * attempt)
          }
        }
        if (!(await matches(part, file))) {
          rmSync(part, { force: true })
          throw new Error('安装包校验不通过（文件损坏或被篡改），请重试')
        }
        renameSync(part, dest)
      }
      this.cleanup((name) => name === basename(dest))
      this.set({ status: 'ready', info })
    } catch (e) {
      if (abort.signal.aborted) this.set({ status: 'available', info })
      else {
        console.error('下载更新失败', e)
        this.set({ status: 'error', error: `下载更新失败：${message(e)}`, info })
      }
    } finally {
      if (this.abort === abort) this.abort = undefined
    }
  }

  /** 下载到 .part，已有一部分时从断开的地方接着下 */
  private async fetchTo(file: ManifestFile, part: string, info: UpdateInfo, signal: AbortSignal): Promise<void> {
    let have = existsSync(part) ? statSync(part).size : 0
    if (have >= file.size) {
      rmSync(part)
      have = 0
    }
    const stall = new AbortController()
    let last = Date.now()
    const watch = setInterval(() => {
      if (Date.now() - last > STALL_MS) stall.abort(new Error('连接超时'))
    }, 5000)
    try {
      const both = AbortSignal.any([signal, stall.signal])
      const res = await fetch(file.url, { headers: have ? { Range: `bytes=${have}-` } : {}, signal: both })
      if ((res.status !== 200 && res.status !== 206) || !res.body) throw new Error(`HTTP ${res.status}`)
      // 服务器不支持断点续传时从头下
      const append = res.status === 206
      let done = append ? have : 0
      const report = (n: number): void => this.progress(info, n, file.size)
      report(done)
      await pipeline(
        Readable.fromWeb(res.body as ReadableStream),
        async function* (source: AsyncIterable<Buffer>) {
          for await (const chunk of source) {
            last = Date.now()
            done += chunk.length
            report(done)
            yield chunk
          }
        },
        createWriteStream(part, { flags: append ? 'a' : 'w' }),
        { signal: both }
      )
    } finally {
      clearInterval(watch)
    }
  }

  /** 删掉更新目录里 keep 以外的东西（解压目录、替换脚本、旧安装包） */
  private cleanup(keep: (name: string) => boolean): void {
    try {
      for (const name of existsSync(this.dir) ? readdirSync(this.dir) : []) {
        if (!keep(name)) rmSync(join(this.dir, name), { recursive: true, force: true })
      }
    } catch (e) {
      console.warn('清理更新文件失败', e)
    }
  }
}
