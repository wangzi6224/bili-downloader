import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { EnqueueRequest, Settings, TaskInfo } from '@shared/types'
import { AuthExpiredError, UnsupportedError } from '../bili/http'
import { getPlayInfo, isDolbyVision, isHevc, pickStreams, streamUrls, type DashStream } from '../bili/playurl'
import { readJson, writeJson } from '../store'
import { writeExtras } from './extras'
import { fetchFile } from './fetchFile'
import { buildRelBase, uniquePath } from './filename'
import { muxVideo, remuxAudio } from './mux'

const RUNNING = new Set(['fetching', 'downloading', 'merging', 'extras'])
const SETTLED = new Set(['done', 'unsupported'])

function speedMeter(): (bytes: number) => number {
  let lastT = 0
  let lastB = 0
  let speed = 0
  return (bytes) => {
    const now = Date.now()
    if (!lastT) {
      lastT = now
      lastB = bytes
      return 0
    }
    const dt = now - lastT
    if (dt >= 1000) {
      const inst = ((bytes - lastB) * 1000) / dt
      speed = speed ? speed * 0.6 + inst * 0.4 : inst
      lastT = now
      lastB = bytes
    }
    return speed
  }
}

/**
 * 下载队列。事件：
 * - update(tasks)：任务列表变化（节流）
 * - active(boolean)：是否有任务在运行，用于防休眠
 */
export class DownloadManager extends EventEmitter {
  private tasks: TaskInfo[]
  private running = new Map<string, AbortController>()
  private canceled = new Set<string>()
  private authBlocked = false
  private wasActive = false
  private emitTimer?: NodeJS.Timeout
  private saveTimer?: NodeJS.Timeout

  constructor(
    private tmpRoot: string,
    private stateFile: string,
    private settings: () => Settings
  ) {
    super()
    // 重启后不自动开跑，未完成的任务一律改为暂停，由用户点“全部继续”
    this.tasks = (readJson<TaskInfo[]>(stateFile) ?? []).map((t) => ({
      ...t,
      speed: 0,
      status: RUNNING.has(t.status) || t.status === 'queued' || t.status === 'waitingAuth' ? 'paused' : t.status
    }))
  }

  list(): TaskInfo[] {
    return this.tasks
  }

  enqueue(req: EnqueueRequest): void {
    const multi = req.items.length > 1
    const maxIndex = Math.max(...req.items.map((i) => i.index))
    for (const item of req.items) {
      const dup = this.tasks.find((t) => t.item.key === item.key && t.status !== 'done')
      if (dup) continue
      this.tasks.push({
        id: randomUUID(),
        title: item.title,
        groupTitle: req.title,
        item,
        options: req.options,
        relBase: buildRelBase(req.title, item, multi, maxIndex),
        status: 'queued',
        downloaded: 0,
        total: 0,
        speed: 0,
        createdAt: Date.now()
      })
    }
    this.changed()
    this.schedule()
  }

  pause(id: string): void {
    const t = this.find(id)
    if (!t || SETTLED.has(t.status)) return
    this.running.get(id)?.abort()
    this.patch(t, { status: 'paused', speed: 0 })
  }

  resume(id: string): void {
    const t = this.find(id)
    if (!t || t.status === 'done' || RUNNING.has(t.status)) return
    this.patch(t, { status: 'queued', error: undefined })
    this.schedule()
  }

  resumeAll(): void {
    for (const t of this.tasks) {
      if (t.status === 'paused' || t.status === 'error') this.patch(t, { status: 'queued', error: undefined })
    }
    this.schedule()
  }

  cancel(id: string): void {
    const ac = this.running.get(id)
    if (ac) {
      this.canceled.add(id)
      ac.abort()
    } else {
      rmSync(join(this.tmpRoot, id), { recursive: true, force: true })
    }
    this.tasks = this.tasks.filter((t) => t.id !== id)
    this.changed()
  }

  clearFinished(): void {
    this.tasks = this.tasks.filter((t) => !SETTLED.has(t.status))
    this.changed()
  }

  /** 登录失效：不再开始新的取流，等待重新登录 */
  blockForAuth(): void {
    this.authBlocked = true
  }

  unblockAuth(): void {
    this.authBlocked = false
    for (const t of this.tasks) if (t.status === 'waitingAuth') this.patch(t, { status: 'queued' })
    this.schedule()
  }

  schedule(): void {
    if (!this.authBlocked) {
      const limit = this.settings().concurrency
      for (const t of this.tasks) {
        if (this.running.size >= limit) break
        if (t.status === 'queued') void this.run(t)
      }
    }
    this.emitActive()
  }

  private find(id: string): TaskInfo | undefined {
    return this.tasks.find((t) => t.id === id)
  }

  private patch(t: TaskInfo, fields: Partial<TaskInfo>): void {
    Object.assign(t, fields)
    this.changed()
  }

  private changed(): void {
    if (!this.emitTimer) {
      this.emitTimer = setTimeout(() => {
        this.emitTimer = undefined
        this.emit('update', this.tasks)
      }, 250)
    }
    // 节流而不是防抖：下载中进度持续变化，防抖会让它一直不落盘
    if (!this.saveTimer) {
      this.saveTimer = setTimeout(() => this.flush(), 1000)
    }
  }

  /** 立即把任务列表写盘（退出应用前调用） */
  flush(): void {
    clearTimeout(this.saveTimer)
    this.saveTimer = undefined
    writeJson(this.stateFile, this.tasks)
  }

  private emitActive(): void {
    const active = this.running.size > 0
    if (active !== this.wasActive) {
      this.wasActive = active
      this.emit('active', active)
    }
  }

  private async run(t: TaskInfo): Promise<void> {
    const ac = new AbortController()
    this.running.set(t.id, ac)
    this.emitActive()
    const tmp = join(this.tmpRoot, t.id)
    // 暂停/取消后不能再改写状态
    const check = (): void => {
      if (ac.signal.aborted) throw new Error('aborted')
    }
    try {
      this.patch(t, { status: 'fetching', error: undefined, note: undefined, speed: 0 })
      const info = await getPlayInfo(t.item, t.options.qn)
      check()
      const pick = pickStreams(info, t.options.qn, t.options.codec, t.options.audioOnly)
      this.patch(t, { status: 'downloading', qualityLabel: pick.qualityLabel })
      mkdirSync(tmp, { recursive: true })

      const parts: [string, DashStream][] = []
      if (pick.video) parts.push(['video.m4s', pick.video])
      if (pick.audio) parts.push(['audio.m4s', pick.audio])
      // 拿到真实大小之前先按码率估算
      const sizes = parts.map(([, s]) => Math.round((s.bandwidth * (t.item.duration ?? 0)) / 8))
      const done = parts.map(() => 0)
      const meter = speedMeter()
      const report = (): void => {
        const sum = done.reduce((a, b) => a + b, 0)
        this.patch(t, { downloaded: sum, total: sizes.reduce((a, b) => a + b, 0), speed: meter(sum) })
      }

      for (const [i, [name, stream]] of parts.entries()) {
        const dest = join(tmp, name)
        if (existsSync(dest)) {
          done[i] = sizes[i] = statSync(dest).size
          continue
        }
        await fetchFile({
          urls: streamUrls(stream),
          dest,
          fingerprint: `${stream.id}-${stream.codecs}-${stream.bandwidth}`,
          signal: ac.signal,
          onProgress: (d, total) => {
            done[i] = d
            if (total) sizes[i] = total
            report()
          }
        })
        done[i] = sizes[i] = statSync(dest).size
        report()
      }

      check()
      this.patch(t, { status: 'merging', speed: 0 })
      const base = join(this.settings().downloadDir, t.relBase)
      mkdirSync(dirname(base), { recursive: true })
      let out: string
      if (t.options.audioOnly) {
        const flac = pick.audioKind === 'flac'
        out = uniquePath(base, flac ? '.flac' : '.m4a')
        await remuxAudio(join(tmp, 'audio.m4s'), `${out}.tmp`, t.title, flac ? 'flac' : 'ipod', ac.signal)
      } else {
        out = uniquePath(base, '.mp4')
        await muxVideo(
          {
            video: join(tmp, 'video.m4s'),
            audio: pick.audio ? join(tmp, 'audio.m4s') : undefined,
            out: `${out}.tmp`,
            title: t.title,
            hevc: isHevc(pick.video!),
            dolbyVision: isDolbyVision(pick.video!)
          },
          ac.signal
        )
      }
      // 先写到目标目录里的 .tmp 再改名，避免跨卷移动和半成品文件
      renameSync(`${out}.tmp`, out)

      check()
      this.patch(t, { status: 'extras' })
      const note = await writeExtras(t.item, t.options, out.replace(/\.[^./]+$/, ''), this.settings())
      rmSync(tmp, { recursive: true, force: true })
      const size = statSync(out).size
      this.patch(t, { status: 'done', outputPath: out, note, speed: 0, downloaded: size, total: size })
    } catch (e) {
      if (ac.signal.aborted) {
        // 暂停/取消：状态已由调用方设置
      } else if (e instanceof AuthExpiredError) {
        this.authBlocked = true
        this.patch(t, { status: 'waitingAuth', speed: 0 })
      } else if (e instanceof UnsupportedError) {
        this.patch(t, { status: 'unsupported', error: e.message, speed: 0 })
      } else {
        this.patch(t, { status: 'error', error: e instanceof Error ? e.message : String(e), speed: 0 })
      }
    } finally {
      this.running.delete(t.id)
      if (this.canceled.delete(t.id)) rmSync(tmp, { recursive: true, force: true })
      this.schedule()
    }
  }
}
