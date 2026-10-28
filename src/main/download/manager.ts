import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { renderTemplate, type NamingValues } from '@shared/naming'
import { normalizeOptions } from '@shared/options'
import type { EnqueueRequest, Settings, TaskInfo } from '@shared/types'
import { AuthExpiredError, BASE_HEADERS, UnsupportedError } from '../bili/http'
import { getAudioStream } from '../bili/audio'
import { getPlayInfo, isDolbyVision, isHevc, pickStreams, streamUrls, type DashStream } from '../bili/playurl'
import { preferCdn } from '../net/cdn'
import { readJson, writeJson } from '../store'
import { removeTaskOutputs } from './cleanup'
import { AbortError, isRetryable, retryDelay, toDiskError } from './errors'
import { placeSidecars, prepareExtras } from './extras'
import { fetchFile } from './fetchFile'
import { uniquePath } from './filename'
import { mux, type OutFormat } from './mux'

const RUNNING = new Set(['fetching', 'downloading', 'merging', 'extras'])
const SETTLED = new Set(['done', 'unsupported'])

/** 可以暂停的：排队、运行中、等待登录、等待自动重试 */
const pausable = (t: TaskInfo): boolean =>
  t.status === 'queued' || RUNNING.has(t.status) || t.status === 'waitingAuth' || Boolean(t.retryAt)

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

const KIND_LABEL = { ugc: '视频', pgc: '番剧影视', cheese: '课程', audio: '音频' } as const

interface StreamPlan {
  parts: { name: string; urls: string[]; fingerprint: string; estimate: number }[]
  video?: DashStream
  hasAudio: boolean
  format: OutFormat
  qualityLabel: string
  quality: string
  codec: string
  notes: string[]
}

/** 决定要下载哪些流：音频区直接取音频地址，视频走 DASH 选流 */
async function planStreams(t: TaskInfo, cdn: string): Promise<StreamPlan> {
  if (t.item.kind === 'audio') {
    const s = await getAudioStream(t.item.cid, t.options.audio)
    return {
      parts: [{ name: 'audio.m4s', urls: s.urls, fingerprint: `au-${s.label}-${s.size}`, estimate: s.size }],
      hasAudio: true,
      format: s.flac ? 'flac' : 'm4a',
      qualityLabel: `音频 ${s.label}`,
      quality: s.label,
      codec: '',
      notes: []
    }
  }
  const pick = pickStreams(await getPlayInfo(t.item, t.options.qn), t.options)
  const estimate = (s: DashStream): number => Math.round((s.bandwidth * (t.item.duration ?? 0)) / 8)
  const part = (name: string, s: DashStream) => ({
    name,
    urls: preferCdn(streamUrls(s), cdn),
    fingerprint: `${s.id}-${s.codecs}-${s.bandwidth}`,
    estimate: estimate(s)
  })
  return {
    parts: [...(pick.video ? [part('video.m4s', pick.video)] : []), ...(pick.audio ? [part('audio.m4s', pick.audio)] : [])],
    video: pick.video,
    hasAudio: Boolean(pick.audio),
    format: pick.video ? pick.container : pick.audioKind === 'flac' ? 'flac' : 'm4a',
    qualityLabel: pick.qualityLabel,
    quality: pick.quality,
    codec: pick.codec,
    notes: pick.notes
  }
}

/**
 * 下载队列。事件：
 * - update(tasks)：任务列表变化（节流）
 * - active(boolean)：是否有任务在运行，用于防休眠
 * - idle({ done, failed })：队列从忙到全部结束，用于完成通知
 * - done(task)：单个任务完成，用于记录下载历史
 * - purged(tasks)：已完成的任务连同文件被删除，用于移出下载历史
 */
export class DownloadManager extends EventEmitter {
  private tasks: TaskInfo[]
  private running = new Map<string, AbortController>()
  private canceled = new Set<string>()
  private retryTimers = new Map<string, NodeJS.Timeout>()
  private authBlocked = false
  private wasActive = false
  /** 本轮（从空闲到再次空闲）完成和失败的任务数 */
  private batch = { done: 0, failed: 0 }
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
      options: normalizeOptions(t.options),
      speed: 0,
      retryAt: undefined,
      status: RUNNING.has(t.status) || t.status === 'queued' || t.status === 'waitingAuth' ? 'paused' : t.status
    }))
  }

  list(): TaskInfo[] {
    return this.tasks
  }

  /** 退出后会变成暂停的任务数：运行中、排队、等待登录 */
  pendingCount(): number {
    return this.tasks.filter((t) => RUNNING.has(t.status) || t.status === 'queued' || t.status === 'waitingAuth').length
  }

  enqueue(req: EnqueueRequest): void {
    const settings = this.settings()
    const multi = req.items.length > 1
    // 只下一个用 single 模板；一次下多个按番剧 / 普通合集区分
    const episodic = req.kind === 'pgc' || req.kind === 'cheese'
    const template = !multi ? settings.naming.single : episodic ? settings.naming.pgc : settings.naming.multi
    const now = Math.floor(Date.now() / 1000)
    for (const item of req.items) {
      const dup = this.tasks.find((t) => t.item.key === item.key && t.status !== 'done')
      if (dup) continue
      const nameValues: NamingValues = {
        title: item.title,
        // 单个视频的标题和总标题相同，series 留空，可选段会自动去掉
        series: multi || item.title !== req.title ? req.title : '',
        index: item.index,
        owner: item.owner ?? req.meta?.owner,
        owner_mid: item.ownerMid ?? req.meta?.ownerMid,
        pubdate: item.pubdate ?? req.meta?.pubdate,
        date: now,
        bvid: item.bvid,
        aid: item.aid,
        cid: item.cid,
        ep_id: item.epId,
        type: KIND_LABEL[req.kind]
      }
      this.tasks.push({
        id: randomUUID(),
        title: item.title,
        groupTitle: req.title,
        item,
        options: normalizeOptions(req.options),
        relBase: renderTemplate(template, nameValues),
        template,
        nameValues,
        meta: req.meta,
        series: episodic && multi,
        seriesCover: req.cover,
        dir: settings.downloadDir,
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
    this.pauseMany([id])
  }

  /** 先把状态都改成暂停再中断，免得中断后重新调度又启动了同一批里还没暂停的任务 */
  pauseMany(ids: string[]): void {
    const targets = this.tasks.filter((t) => ids.includes(t.id) && pausable(t))
    for (const t of targets) {
      this.clearRetry(t)
      this.patch(t, { status: 'paused', speed: 0 })
    }
    for (const t of targets) this.running.get(t.id)?.abort()
  }

  pauseAll(): void {
    this.pauseMany(this.tasks.map((t) => t.id))
  }

  /** 手动继续/重试：重置自动重试计数 */
  resume(id: string): void {
    const t = this.find(id)
    if (!t || t.status === 'done' || RUNNING.has(t.status)) return
    this.clearRetry(t)
    this.patch(t, { status: 'queued', error: undefined, retries: 0 })
    this.schedule()
  }

  resumeMany(ids: string[]): void {
    for (const t of this.tasks) {
      if (ids.includes(t.id) && (t.status === 'paused' || t.status === 'error')) {
        this.clearRetry(t)
        this.patch(t, { status: 'queued', error: undefined, retries: 0 })
      }
    }
    this.schedule()
  }

  resumeAll(): void {
    this.resumeMany(this.tasks.map((t) => t.id))
  }

  /** 删除已下载的分片，从头开始（坏分片导致合并必然失败时用） */
  redownload(id: string): void {
    const t = this.find(id)
    if (!t || t.status === 'unsupported') return
    this.clearRetry(t)
    const ac = this.running.get(id)
    if (ac) {
      this.canceled.add(id)
      ac.abort()
    } else {
      this.discardPartial(t)
    }
    this.patch(t, {
      status: 'queued',
      error: undefined,
      note: undefined,
      outputPath: undefined,
      downloaded: 0,
      total: 0,
      retries: 0
    })
    // 正在运行的那次结束后会清掉临时目录并重新调度
    if (!ac) this.schedule()
  }

  /**
   * 从列表移除。未完成的任务一并删除已下载的部分；deleteFiles 时已完成的任务
   * 也永久删除成品和封面、字幕、弹幕等附加文件。有文件删不掉时抛错列出路径。
   */
  remove(ids: string[], deleteFiles: boolean): void {
    const removed = this.tasks.filter((t) => ids.includes(t.id))
    // 先移出列表，中断运行中的任务后重新调度时就不会再启动它们
    this.tasks = this.tasks.filter((t) => !ids.includes(t.id))
    const purged: TaskInfo[] = []
    const failed: string[] = []
    for (const t of removed) {
      this.clearRetry(t)
      const ac = this.running.get(t.id)
      if (ac) {
        // 由 run 结束时清理临时文件和已经合并出的成品
        this.canceled.add(t.id)
        ac.abort()
      } else {
        this.discardPartial(t)
      }
      if (deleteFiles && t.status === 'done') {
        failed.push(...removeTaskOutputs(t, this.rootOf(t)))
        purged.push(t)
      }
    }
    this.changed()
    if (purged.length) this.emit('purged', purged)
    if (failed.length) throw new Error(`有 ${failed.length} 个文件没能删除：${failed.join('、')}`)
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

  private clearRetry(t: TaskInfo): void {
    clearTimeout(this.retryTimers.get(t.id))
    this.retryTimers.delete(t.id)
    t.retryAt = undefined
  }

  /** 网络类错误：按 30 秒起翻倍（最长 5 分钟）的间隔自动重新排队 */
  private scheduleRetry(t: TaskInfo, message: string): boolean {
    const max = this.settings().autoRetry
    const n = t.retries ?? 0
    if (n >= max) return false
    const retryAt = Date.now() + retryDelay(n)
    this.patch(t, { status: 'error', error: message, speed: 0, retryAt })
    this.retryTimers.set(
      t.id,
      setTimeout(() => {
        this.retryTimers.delete(t.id)
        if (t.status !== 'error' || t.retryAt !== retryAt) return
        this.patch(t, { status: 'queued', retries: n + 1, retryAt: undefined })
        this.schedule()
      }, retryAt - Date.now())
    )
    return true
  }

  private rootOf(t: TaskInfo): string {
    return t.dir ?? this.settings().downloadDir
  }

  /** 删除没下载完的部分：临时目录里的分片和附加内容、合并到一半的 .tmp */
  private discardPartial(t: TaskInfo): void {
    rmSync(join(this.tmpRoot, t.id), { recursive: true, force: true })
    if (t.tmpOutput) {
      removeTaskOutputs({ tmpOutput: t.tmpOutput }, this.rootOf(t))
      t.tmpOutput = undefined
    }
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
      const waiting = this.tasks.some((t) => t.status === 'queued' || (t.status === 'error' && t.retryAt))
      if (!active && !waiting && this.batch.done + this.batch.failed > 0) {
        this.emit('idle', this.batch)
        this.batch = { done: 0, failed: 0 }
      }
    }
  }

  private async run(t: TaskInfo): Promise<void> {
    const ac = new AbortController()
    this.running.set(t.id, ac)
    this.emitActive()
    const tmp = join(this.tmpRoot, t.id)
    /** 已经合并出来的成品，取消时要一起删掉 */
    let produced: string | undefined
    // 暂停/取消后不能再改写状态
    const check = (): void => {
      if (ac.signal.aborted) throw new AbortError()
    }
    try {
      this.patch(t, { status: 'fetching', error: undefined, note: undefined, speed: 0 })
      const plan = await planStreams(t, this.settings().cdn)
      check()
      this.patch(t, { status: 'downloading', qualityLabel: plan.qualityLabel })
      mkdirSync(tmp, { recursive: true })

      const parts = plan.parts
      // 拿到真实大小之前先用估算值
      const sizes = parts.map((p) => p.estimate)
      const done = parts.map(() => 0)
      const meter = speedMeter()
      const report = (): void => {
        const sum = done.reduce((a, b) => a + b, 0)
        this.patch(t, { downloaded: sum, total: sizes.reduce((a, b) => a + b, 0), speed: meter(sum) })
      }

      // 音视频两个文件同时下载，各自再分段
      const threads = this.settings().threads
      await Promise.all(
        parts.map(async (part, i) => {
          const dest = join(tmp, part.name)
          if (!existsSync(dest)) {
            await fetchFile({
              urls: part.urls,
              dest,
              fingerprint: part.fingerprint,
              threads,
              headers: BASE_HEADERS,
              signal: ac.signal,
              onProgress: (d, total) => {
                done[i] = d
                if (total) sizes[i] = total
                report()
              }
            })
          }
          done[i] = sizes[i] = statSync(dest).size
          report()
        })
      )

      check()
      this.patch(t, { status: 'extras', speed: 0 })
      const extras = await prepareExtras(t, tmp, this.settings())

      check()
      this.patch(t, { status: 'merging' })
      // 按实际拿到的画质、编码重新套一次命名模板
      const relBase = t.template
        ? renderTemplate(t.template, { ...t.nameValues, quality: plan.quality, codec: plan.codec })
        : t.relBase
      const base = join(t.dir ?? this.settings().downloadDir, relBase)
      try {
        mkdirSync(dirname(base), { recursive: true })
      } catch (e) {
        throw toDiskError(e, dirname(base))
      }
      const format = plan.format
      const out = uniquePath(base, `.${format}`)
      // 上次合并到一半退出了应用，留下的半成品先删掉
      if (t.tmpOutput) rmSync(t.tmpOutput, { force: true })
      this.patch(t, { tmpOutput: `${out}.tmp` })
      const o = t.options
      const embedded = await mux(
        {
          video: plan.video ? join(tmp, 'video.m4s') : undefined,
          audio: plan.hasAudio ? join(tmp, 'audio.m4s') : undefined,
          out: `${out}.tmp`,
          format,
          title: t.title,
          hevc: plan.video ? isHevc(plan.video) : false,
          dolbyVision: plan.video ? isDolbyVision(plan.video) : false,
          cover: o.embedCover ? extras.cover : undefined,
          subtitles: o.embedSubtitle ? extras.subtitles : undefined,
          chapters: extras.chapters,
          metadata: {
            artist: t.meta?.owner,
            album: t.series || t.groupTitle !== t.title ? t.groupTitle : undefined,
            date: t.nameValues?.pubdate ? new Date(Number(t.nameValues.pubdate) * 1000).toISOString().slice(0, 10) : undefined,
            comment: t.item.bvid ? `https://www.bilibili.com/video/${t.item.bvid}` : t.meta?.url,
            description: t.item.desc ?? t.meta?.desc
          }
        },
        ac.signal
      )
      // 先写到目标目录里的 .tmp 再改名，避免跨卷移动和半成品文件
      renameSync(`${out}.tmp`, out)
      produced = out
      this.patch(t, { tmpOutput: undefined })

      const sideNotes = await placeSidecars(t, extras, out.slice(0, -format.length - 1), embedded)
      // 保存附加内容时被删除了：不能再标记完成、记进下载历史
      if (this.canceled.has(t.id)) throw new AbortError()
      rmSync(tmp, { recursive: true, force: true })
      const size = statSync(out).size
      const note = [...plan.notes, ...extras.notes, ...sideNotes].join('；') || undefined
      this.batch.done++
      this.patch(t, { status: 'done', outputPath: out, relBase, note, speed: 0, downloaded: size, total: size, retries: 0 })
      this.emit('done', t)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (ac.signal.aborted) {
        // 暂停/取消：状态已由调用方设置
      } else if (e instanceof AuthExpiredError) {
        this.authBlocked = true
        this.patch(t, { status: 'waitingAuth', speed: 0 })
      } else if (e instanceof UnsupportedError) {
        this.batch.failed++
        this.patch(t, { status: 'unsupported', error: message, speed: 0 })
      } else if (!(isRetryable(e) && this.scheduleRetry(t, message))) {
        this.batch.failed++
        this.patch(t, { status: 'error', error: message, speed: 0 })
      }
    } finally {
      this.running.delete(t.id)
      if (this.canceled.delete(t.id)) {
        rmSync(tmp, { recursive: true, force: true })
        removeTaskOutputs({ outputPath: produced, tmpOutput: t.tmpOutput }, this.rootOf(t))
      } else if (t.tmpOutput) {
        // 合并被暂停或出错打断，半成品没用，下次重新合并
        rmSync(t.tmpOutput, { force: true })
      }
      if (t.tmpOutput) this.patch(t, { tmpOutput: undefined })
      this.schedule()
    }
  }
}
