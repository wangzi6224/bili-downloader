// AI 精修的模型：第一次用时下载（208MB，不随安装包分发），校验 sha256 后放在用户数据目录。
// 每个视频的长条尺寸不同，用时按尺寸改写一份固定尺寸的模型放进缓存
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { AiModelStatus } from '@shared/types'
import { AbortError } from '../../download/errors'
import { fetchFile } from '../../download/fetchFile'
import { fixInputShape } from './onnxPatch'

export interface ModelSource {
  /** 显示用，例如 ModelScope */
  name: string
  url: string
}

export interface ModelSpec {
  file: string
  size: number
  sha256: string
  sources: ModelSource[]
}

/**
 * LaMa（big-lama）的 ONNX 版本，原样转存自 https://huggingface.co/Carve/LaMa-ONNX （Apache-2.0）。
 * 放在作者自己的 ModelScope 和 HuggingFace 仓库里：国内一般连得上 ModelScope，国外连 HuggingFace 更快
 */
export const MODEL: ModelSpec = {
  file: 'lama_fp32.onnx',
  size: 208_044_816,
  sha256: '1faef5301d78db7dda502fe59966957ec4b79dd64e16f03ed96913c7a4eb68d6',
  sources: [
    { name: 'ModelScope', url: 'https://www.modelscope.cn/models/wangzi6224/bili-downloader-models/resolve/master/lama_fp32.onnx' },
    { name: 'HuggingFace', url: 'https://huggingface.co/wangzi6224/bili-downloader-models/resolve/main/lama_fp32.onnx' }
  ]
}

/** 固定尺寸的模型留几个（最近用过的） */
const CACHE_KEEP = 2
/** 下载进度最多这么久报一次 */
const PROGRESS_MS = 250
/** 测速时每个源下载这么多字节 */
const PROBE_BYTES = 512 * 1024
const PROBE_TIMEOUT = 15_000

export async function sha256File(path: string, signal?: AbortSignal): Promise<string> {
  const h = createHash('sha256')
  for await (const chunk of createReadStream(path, { signal })) h.update(chunk as Buffer)
  return h.digest('hex')
}

/**
 * 同时测每个源：能连上、支持分段下载、文件大小对得上的，按实测速度从快到慢排；连不上的去掉。
 * 下载时先用最快的，某一段失败重试时会轮换到其他源
 */
export async function rankSources(
  sources: ModelSource[],
  size: number,
  headers: Record<string, string>,
  signal: AbortSignal,
  now: () => number = performance.now.bind(performance)
): Promise<ModelSource[]> {
  const want = Math.min(PROBE_BYTES, size)
  const timed = await Promise.all(
    sources.map(async (src) => {
      const t = now()
      try {
        const res = await fetch(src.url, {
          headers: { ...headers, Range: `bytes=0-${want - 1}` },
          signal: AbortSignal.any([signal, AbortSignal.timeout(PROBE_TIMEOUT)])
        })
        const ok = res.status === 206 && Boolean(res.headers.get('content-range')?.endsWith(`/${size}`))
        const got = ok ? (await res.arrayBuffer()).byteLength : (await res.body?.cancel(), 0)
        return ok && got === want ? { src, ms: now() - t } : undefined
      } catch {
        return undefined
      }
    })
  )
  return timed
    .filter((x): x is { src: ModelSource; ms: number } => x !== undefined)
    .sort((a, b) => a.ms - b.ms)
    .map((x) => x.src)
}

export class AiModel extends EventEmitter {
  private state: AiModelStatus
  private job: { ac: AbortController; done: Promise<void> } | undefined

  constructor(
    private readonly dir: string = join(app.getPath('userData'), 'models'),
    private readonly spec: ModelSpec = MODEL
  ) {
    super()
    this.state = this.ready() ? { state: 'ready', size: spec.size } : { state: 'missing', size: spec.size }
  }

  get path(): string {
    return join(this.dir, this.spec.file)
  }

  private get marker(): string {
    return `${this.path}.sha256`
  }

  private get cacheDir(): string {
    return join(this.dir, 'cache')
  }

  /** 文件在、大小对，而且下载时校验过（校验结果记在旁边的 .sha256 文件里，不用每次启动都重算） */
  ready(): boolean {
    try {
      return statSync(this.path).size === this.spec.size && readFileSync(this.marker, 'utf8').trim() === this.spec.sha256
    } catch {
      return false
    }
  }

  status(): AiModelStatus {
    return { ...this.state, disk: this.diskBytes() }
  }

  private set(s: AiModelStatus): void {
    this.state = s
    // 下载中途不用算，结束时（就绪、取消、出错）再算
    this.emit('status', s.state === 'downloading' ? s : { ...s, disk: this.diskBytes() })
  }

  /** 模型、没下完的部分和缓存一共占的磁盘空间 */
  private diskBytes(): number {
    const sum = (dir: string): number => {
      try {
        return readdirSync(dir, { withFileTypes: true }).reduce((a, d) => a + (d.isFile() ? statSync(join(dir, d.name)).size : 0), 0)
      } catch {
        return 0
      }
    }
    return sum(this.dir) + sum(this.cacheDir)
  }

  /** 开始下载；已经在下载时返回同一个任务。出错时状态里带原因，不抛出 */
  download(o: { threads?: number; userAgent?: string } = {}): Promise<void> {
    if (this.ready()) {
      this.set({ state: 'ready', size: this.spec.size })
      return Promise.resolve()
    }
    if (this.job) return this.job.done
    const ac = new AbortController()
    const tmp = `${this.path}.download`
    const headers = { 'User-Agent': o.userAgent ?? 'bili-downloader' }
    const run = async (): Promise<void> => {
      mkdirSync(this.dir, { recursive: true })
      this.set({ state: 'downloading', size: this.spec.size, done: 0 })
      const ranked = await rankSources(this.spec.sources, this.spec.size, headers, ac.signal)
      if (ac.signal.aborted) throw new AbortError()
      if (!ranked.length) {
        const names = this.spec.sources.map((x) => x.name).join('、')
        throw new Error(`连不上模型的下载地址（${names}），请检查网络或在设置里配置代理`)
      }
      const source = ranked[0].name
      const urls = ranked.map((x) => x.url)
      this.set({ state: 'downloading', size: this.spec.size, done: 0, source })
      // 每收到一块数据都会回调，界面不用刷那么勤；开始时已经报过 0
      let last = Date.now()
      await fetchFile({
        urls,
        dest: tmp,
        fingerprint: this.spec.sha256,
        threads: Math.max(1, Math.min(8, o.threads ?? 4)),
        headers,
        signal: ac.signal,
        onProgress: (done) => {
          const now = Date.now()
          if (now - last < PROGRESS_MS && done < this.spec.size) return
          last = now
          this.set({ state: 'downloading', size: this.spec.size, done, source })
        }
      })
      this.set({ state: 'downloading', size: this.spec.size, done: this.spec.size, source, verifying: true })
      const sum = await sha256File(tmp, ac.signal)
      if (sum !== this.spec.sha256) {
        rmSync(tmp, { force: true })
        throw new Error('下载的模型文件校验不通过，请重试')
      }
      renameSync(tmp, this.path)
      writeFileSync(this.marker, this.spec.sha256)
    }
    // 先登记再开始：刚开始就点取消也能找到它
    const job: { ac: AbortController; done: Promise<void> } = { ac, done: Promise.resolve() }
    this.job = job
    job.done = run()
      .then(
        () => this.set({ state: 'ready', size: this.spec.size }),
        (e: unknown) => {
          if (ac.signal.aborted || e instanceof AbortError) this.set({ state: 'missing', size: this.spec.size })
          else this.set({ state: 'error', size: this.spec.size, message: e instanceof Error ? e.message : String(e) })
        }
      )
      .finally(() => {
        if (this.job === job) this.job = undefined
      })
    return job.done
  }

  /** 取消下载；已下的部分留着，下次接着下 */
  cancel(): void {
    this.job?.ac.abort()
  }

  /** 删掉模型和缓存，释放磁盘空间 */
  async remove(): Promise<void> {
    if (this.job) {
      this.job.ac.abort()
      await this.job.done
    }
    for (const f of [this.path, this.marker, `${this.path}.download`, `${this.path}.download.part`, `${this.path}.download.meta.json`]) {
      rmSync(f, { force: true })
    }
    rmSync(this.cacheDir, { recursive: true, force: true })
    this.set({ state: 'missing', size: this.spec.size })
  }

  /** 改写成固定输入尺寸的模型路径；同一尺寸用过就直接用缓存 */
  async fixed(height: number, width: number): Promise<string> {
    if (!this.ready()) throw new Error('还没有下载 AI 模型')
    mkdirSync(this.cacheDir, { recursive: true })
    const name = `lama-${height}x${width}.onnx`
    const dest = join(this.cacheDir, name)
    if (existsSync(dest)) {
      // 更新修改时间，清理时按它判断最近用过的
      writeFileSync(join(this.cacheDir, `${name}.used`), String(Date.now()))
      return dest
    }
    const src = await readFile(this.path)
    const tmp = `${dest}.tmp`
    await writeFile(tmp, fixInputShape(src, { batch: 1, height, width }))
    renameSync(tmp, dest)
    writeFileSync(join(this.cacheDir, `${name}.used`), String(Date.now()))
    this.prune()
    return dest
  }

  /** 缓存里只留最近用过的几个尺寸 */
  private prune(): void {
    const used = (f: string): number => {
      try {
        return Number(readFileSync(join(this.cacheDir, `${f}.used`), 'utf8')) || 0
      } catch {
        return 0
      }
    }
    const models = readdirSync(this.cacheDir)
      .filter((f) => f.endsWith('.onnx'))
      .sort((a, b) => used(b) - used(a))
    for (const f of models.slice(CACHE_KEEP)) {
      rmSync(join(this.cacheDir, f), { force: true })
      rmSync(join(this.cacheDir, `${f}.used`), { force: true })
    }
  }
}
