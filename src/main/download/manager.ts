import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { joinList, t as tr } from '@shared/i18n'
import { renderTemplate, type NamingValues } from '@shared/naming'
import { normalizeOptions } from '@shared/options'
import type { EnqueueRequest, MediaItem, MediaMeta, ProcessingInfo, Settings, TaskInfo, WatermarkMethod, WatermarkRegion } from '@shared/types'
import { withWatermarkNote, WM_NOTE } from '@shared/watermark'
import { AuthExpiredError, BASE_HEADERS, UnsupportedError } from '../bili/http'
import { getAudioStream } from '../bili/audio'
import { getPlayInfo, isDolbyVision, isHevc, pickStreams, streamUrls, type DashStream } from '../bili/playurl'
import { preferCdn } from '../net/cdn'
import { readJsonArray, writeJson } from '../store'
import { aiModel, spawnHost } from '../watermark/ai'
import { refineVideo } from '../watermark/ai/refine'
import { autoRemove, detectOnly, ensureModel } from '../watermark/auto'
import { replaceVideo, requireVideoTask, type DoneVideoTask } from '../watermark/manual'
import { removeQuietly, removeTaskOutputs } from './cleanup'
import { AbortError, isRetryable, retryDelay, toDiskError } from './errors'
import { placeSidecars, prepareExtras } from './extras'
import type { accounts as accountRegistry } from '../auth/accounts'
import { fetchFile } from './fetchFile'
import { uniquePath } from './filename'
import { mux, type OutFormat } from './mux'

const RUNNING = new Set(['fetching', 'downloading', 'merging', 'extras', 'processing'])
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

export interface EnqueueResult {
  created: TaskInfo[]
  /** 已经在队列里的条目和对应的任务 */
  skipped: { key: string; taskId: string }[]
}

/** 文件名模板的 {type}：影响已下载文件的命名和跳过判断，保持中文，不随界面语言变 */
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
      qualityLabel: tr('bili.audioQuality', { label: s.text }),
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

/** 画质标签里的编码换成重新编码后的，例如“1080P 高清 · AV1”→“1080P 高清 · AVC” */
const swapCodec = (label: string | undefined, codec: 'h264' | 'hevc'): string | undefined =>
  label?.replace(/ · (AVC|HEVC|AV1)(?= · |$)/, ` · ${codec === 'hevc' ? 'HEVC' : 'AVC'}`)

/** 多个视频合成的批次没有共同的元数据，作者、简介这些用视频自己的 */
function videoMeta(item: MediaItem): MediaMeta | undefined {
  if (!item.owner) return undefined
  const { owner, ownerMid, pubdate, desc, bvid } = item
  return { owner, ownerMid, pubdate, desc, url: bvid && `https://www.bilibili.com/video/${bvid}` }
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
  /** 正在合并的任务已经选定的成品路径：文件要等合并完才出现，同名的任务同时合并时不能挑到同一个名字 */
  private claimed = new Set<string>()
  private retryTimers = new Map<string, NodeJS.Timeout>()
  /** 手动去水印期间被彻底删除的任务：等 ffmpeg 退出、不再占用文件后再删成品 */
  private purgeAfter = new Map<string, TaskInfo>()
  /** 应用正在退出，不再启动新任务 */
  private stopped = false
  private authBlocked = false
  private wasActive = false
  /** 本轮（从空闲到再次空闲）完成和失败的任务数 */
  private batch = { done: 0, failed: 0 }
  private emitTimer?: NodeJS.Timeout
  private saveTimer?: NodeJS.Timeout

  constructor(
    private tmpRoot: string,
    private stateFile: string,
    private settings: () => Settings,
    private accounts?: Pick<typeof accountRegistry, 'run' | 'status' | 'partition'>
  ) {
    super()
    // 重启后不自动开跑，未完成的任务一律改为暂停，由用户点“全部继续”
    this.tasks = readJsonArray<TaskInfo>(stateFile)
      // 缺了 id、item 的条目没法恢复，跳过
      .filter((t) => t?.id && t.item)
      .map((t) => {
        const restored: TaskInfo = {
          ...t,
          options: normalizeOptions(t.options),
          speed: 0,
          retryAt: undefined,
          processing: undefined,
          status: RUNNING.has(t.status) || t.status === 'queued' || ((!this.accounts || t.accountMid === undefined) && t.status === 'waitingAuth')
            ? 'paused' : t.status
        }
        // 手动去水印做到一半退出了：原视频没动过，删掉半成品
        if (t.processing?.manual) {
          if (t.tmpOutput) removeQuietly(t.tmpOutput)
          removeQuietly(join(tmpRoot, t.id))
          return { ...restored, tmpOutput: undefined, note: withWatermarkNote(t.note, WM_NOTE.interrupted()) }
        }
        return restored
      })
  }

  list(): TaskInfo[] {
    return this.tasks
  }

  assignLegacy(mid: number): void {
    for (const task of this.tasks) {
      if (task.accountMid === undefined && task.status !== 'done') this.patch(task, { accountMid: mid })
    }
  }

  /** 这个账号名下还没下完的任务 */
  accountTasks(mid: number): string[] {
    return this.tasks.filter((t) => t.accountMid === mid && t.status !== 'done').map((t) => t.id)
  }

  /** 退出账号时把还没下完的任务转给另一个账号，等待登录的接着排队 */
  transferAccount(from: number, to: number): void {
    for (const task of this.tasks) {
      if (task.accountMid !== from || task.status === 'done') continue
      this.patch(task, task.status === 'waitingAuth' ? { accountMid: to, status: 'queued' } : { accountMid: to })
    }
    this.schedule()
  }

  accountChanged(mid: number, status: 'ready' | 'unchecked' | 'expired' | 'removed'): void {
    for (const task of this.tasks) {
      if (task.accountMid !== mid) continue
      if (status === 'ready' && task.status === 'waitingAuth') {
        this.patch(task, { status: 'queued' })
      } else if (status === 'removed' || status === 'expired') {
        const running = status === 'removed' && RUNNING.has(task.status)
        if (running || task.status === 'queued' || task.retryAt) {
          this.clearRetry(task)
          this.patch(task, { status: 'waitingAuth', speed: 0 })
          if (running) this.running.get(task.id)?.abort()
        }
      }
    }
    this.schedule()
  }

  /** 退出时会被打断的任务数：运行中、排队、等待登录（之后会变成暂停），以及正在手动去水印的 */
  pendingCount(): number {
    return this.tasks.filter(
      (t) => RUNNING.has(t.status) || t.status === 'queued' || t.status === 'waitingAuth' || t.processing?.manual
    ).length
  }

  /** 有任务在运行（包括手动去水印），用于防休眠 */
  isActive(): boolean {
    return this.running.size > 0
  }

  /** 退出应用前：不再启动新任务，中断所有在跑的，让 ffmpeg 跟着结束，免得留在后台继续转码 */
  stopAll(): void {
    this.stopped = true
    for (const ac of this.running.values()) ac.abort()
  }

  /** 加入队列；已经在队列里（未完成）的同一条目不重复添加，放进 skipped */
  enqueue(req: EnqueueRequest): EnqueueResult {
    const settings = this.settings()
    const multi = req.multi ?? req.items.length > 1
    // 只下一个用 single 模板；一次下多个按番剧 / 普通合集区分
    const episodic = req.kind === 'pgc' || req.kind === 'cheese'
    const template = !multi ? settings.naming.single : episodic ? settings.naming.pgc : settings.naming.multi
    const now = Math.floor(Date.now() / 1000)
    const result: EnqueueResult = { created: [], skipped: [] }
    for (const item of req.items) {
      // 不分账号：别的账号正在下的同一个视频，下完就是同一份文件
      const dup = this.tasks.find((t) => t.item.key === item.key && t.status !== 'done')
      if (dup) {
        result.skipped.push({ key: item.key, taskId: dup.id })
        continue
      }
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
      const task: TaskInfo = {
        id: randomUUID(),
        title: item.title,
        groupTitle: req.title,
        item,
        accountMid: req.accountMid,
        options: normalizeOptions(req.options),
        relBase: renderTemplate(template, nameValues),
        template,
        nameValues,
        meta: req.meta ?? videoMeta(item),
        series: episodic && multi,
        seriesCover: req.cover,
        dir: req.dir ?? settings.downloadDir,
        batchId: req.batchId,
        status: req.paused ? 'paused' : 'queued',
        downloaded: 0,
        total: 0,
        speed: 0,
        createdAt: Date.now()
      }
      this.tasks.push(task)
      result.created.push(task)
    }
    this.changed()
    this.schedule()
    return result
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
    if (!t || t.status === 'unsupported' || t.processing?.manual) return
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
      watermark: undefined,
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
        // 正在去水印：ffmpeg 还开着原视频（Windows 上删不掉），等它结束后再删
        if (ac && t.processing?.manual) this.purgeAfter.set(t.id, t)
        else failed.push(...removeTaskOutputs(t, this.rootOf(t)))
        purged.push(t)
      }
    }
    this.changed()
    if (purged.length) this.emit('purged', purged)
    if (failed.length) throw new Error(tr('download.deleteFailed', { count: failed.length, files: joinList(failed) }))
  }

  /**
   * 对已完成的视频手动去水印：重新编码后替换原文件。任务一直保持“已完成”，进度放在 processing 上，
   * 这样暂停、继续、重新下载这些针对下载的操作都不会碰到它。会占一个同时下载的名额
   */
  startWatermark(id: string, region: WatermarkRegion, method: WatermarkMethod = 'fast'): void {
    const t = requireVideoTask(this.find(id))
    if (this.running.has(id)) throw new Error(tr('download.busy'))
    if (![region?.x, region?.y, region?.w, region?.h].every(Number.isFinite)) throw new Error(tr('download.badRegion'))
    void this.runPost(t, region, method)
  }

  /** 取消手动去水印，原视频保持不变 */
  cancelWatermark(id: string): void {
    if (this.find(id)?.processing?.manual) this.running.get(id)?.abort()
  }

  /** 清除已完成和无法下载的任务；deleteFiles 时同时永久删除已完成任务的视频和附加文件 */
  clearFinished(deleteFiles: boolean): void {
    this.remove(
      this.tasks.filter((t) => SETTLED.has(t.status)).map((t) => t.id),
      deleteFiles
    )
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
    if (!this.authBlocked && !this.stopped) {
      const limit = this.settings().concurrency
      for (const t of this.tasks) {
        if (this.running.size >= limit) break
        // 暂停后立刻继续时，上一次 run 可能还卡在取流里没结束，等它结算后再启动
        if (t.status !== 'queued' || this.running.has(t.id)) continue
        if (this.accounts && (t.accountMid === undefined || ['expired', 'removed'].includes(this.accounts.status(t.accountMid)))) {
          this.patch(t, { status: 'waitingAuth', speed: 0 })
          continue
        }
        void this.run(t)
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

  private async runPost(t: DoneVideoTask, region: WatermarkRegion, method: WatermarkMethod): Promise<void> {
    const ac = new AbortController()
    this.running.set(t.id, ac)
    this.emitActive()
    const out = t.outputPath
    const tmpOut = `${out}.wm.tmp`
    const work = join(this.tmpRoot, t.id)
    this.patch(t, { processing: { manual: true, stage: 'queue' }, tmpOutput: tmpOut })
    // 马上落盘：ffmpeg 还没开始写半成品，之后应用崩溃了，下次启动也知道该删哪个文件
    this.flush()
    // 先删掉上次崩溃留下的同名半成品：没退出的旧 ffmpeg 可能还在写它，不能和这次写进同一个文件
    removeQuietly(tmpOut)
    try {
      const job = {
        input: out,
        output: tmpOut,
        workDir: work,
        region,
        format: /\.mkv$/i.test(out) ? ('mkv' as const) : ('mp4' as const),
        durationHint: t.item.duration,
        signal: ac.signal,
        onStage: (p: ProcessingInfo) => this.patch(t, { processing: p })
      }
      // AI 精修：模型没下载就先下（AI 助手发起的时候可能还没下）；下不下来或精修失败，这次改用快速去除并说明原因
      let wmNote: string | undefined
      const fastJob = (): ReturnType<typeof replaceVideo> => replaceVideo(job)
      let r: Awaited<ReturnType<typeof replaceVideo>>
      if (method === 'ai') {
        const model = aiModel()
        const ai = { model, spawn: spawnHost, threads: this.settings().threads }
        const missing = model.ready() ? undefined : await ensureModel(ai, ac.signal, (p) => this.patch(t, { processing: { ...p, manual: true } }))
        if (missing) {
          wmNote = WM_NOTE.aiFallback(missing)
          r = await fastJob()
        } else {
          try {
            r = await refineVideo({ ...job, model, spawn: spawnHost })
          } catch (e) {
            if (e instanceof AbortError || ac.signal.aborted) throw e
            wmNote = WM_NOTE.aiFailed(e instanceof Error ? e.message : String(e))
            removeQuietly(tmpOut)
            r = await fastJob()
          }
        }
      } else {
        r = await fastJob()
      }
      if (ac.signal.aborted) throw new AbortError()
      // 处理期间原视频被删掉或移走了：不能再在原位置把它“变”回来
      if (!existsSync(out)) {
        this.patch(t, { note: withWatermarkNote(t.note, WM_NOTE.moved()) })
        return
      }
      try {
        renameSync(tmpOut, out)
      } catch (e) {
        const code = (e as { code?: string }).code
        throw code === 'EPERM' || code === 'EBUSY' ? new Error(tr('download.fileLocked')) : toDiskError(e, out)
      }
      const size = statSync(out).size
      this.patch(t, {
        downloaded: size,
        total: size,
        note: withWatermarkNote(t.note, wmNote),
        qualityLabel: swapCodec(t.qualityLabel, r.codec),
        watermark: { ...t.watermark, width: r.width, height: r.height, applied: r.region }
      })
    } catch (e) {
      // 用户取消、删除任务、退出应用：原视频没动过，不用提示
      if (!ac.signal.aborted) {
        this.patch(t, { note: withWatermarkNote(t.note, WM_NOTE.failed(e instanceof Error ? e.message : String(e))) })
      }
    } finally {
      // startWatermark 不允许同一个任务同时跑两个作业，这里直接删
      this.running.delete(t.id)
      this.canceled.delete(t.id)
      removeQuietly(tmpOut)
      removeQuietly(work)
      this.patch(t, { processing: undefined, tmpOutput: undefined })
      this.flush()
      const purge = this.purgeAfter.get(t.id)
      if (purge) {
        this.purgeAfter.delete(t.id)
        const failed = removeTaskOutputs(purge, this.rootOf(purge))
        if (failed.length) console.warn('删除文件失败：', failed.join('、'))
      }
      this.schedule()
    }
  }

  private async run(t: TaskInfo): Promise<void> {
    const ac = new AbortController()
    this.running.set(t.id, ac)
    this.emitActive()
    const tmp = join(this.tmpRoot, t.id)
    /** 已经合并出来的成品，取消时要一起删掉 */
    let produced: string | undefined
    let claimed: string | undefined
    // 暂停/取消后不能再改写状态
    const check = (): void => {
      if (ac.signal.aborted) throw new AbortError()
    }
    const mid = t.accountMid
    let partition: string | undefined
    const withAccount = <T>(fn: () => Promise<T>): Promise<T> => {
      if (!this.accounts) return fn()
      partition = mid === undefined ? undefined : this.accounts.partition(mid)
      return this.accounts.run(mid, fn)
    }
    try {
      this.patch(t, { status: 'fetching', error: undefined, note: undefined, speed: 0, watermark: undefined })
      const plan = await withAccount(() => planStreams(t, this.settings().cdn))
      check()
      this.patch(t, { status: 'downloading', qualityLabel: plan.qualityLabel, videoQn: plan.video?.id })
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
      const audioOnly = t.options.output === 'audio' || t.item.kind === 'audio'
      const needsAuth = !audioOnly && (t.options.subtitle || t.options.embedSubtitle || t.options.chapters)
      const extras = await (needsAuth
        ? withAccount(() => prepareExtras(t, tmp, this.settings()))
        : prepareExtras(t, tmp, this.settings()))

      // 去水印：在合并前单独处理视频流，处理好的文件也放在临时目录，暂停后继续可以直接用
      let video = plan.video ? join(tmp, 'video.m4s') : undefined
      let codec = plan.codec
      let hevc = plan.video ? isHevc(plan.video) : false
      let dolbyVision = plan.video ? isDolbyVision(plan.video) : false
      let wmNote: string | undefined
      // 旧任务的选项里可能没有 watermark，只认这两种
      const wm = t.options.watermark
      if (plan.video && video && (wm === 'auto' || wm === 'ai')) {
        check()
        this.patch(t, { status: 'processing', processing: { stage: 'detect' } })
        const method = wm === 'ai' ? 'ai' : 'fast'
        const r = await autoRemove({
          tmp,
          source: video,
          stream: plan.video,
          durationHint: t.item.duration,
          method,
          ai: method === 'ai' ? { model: aiModel(), spawn: spawnHost, threads: this.settings().threads } : undefined,
          signal: ac.signal,
          onStage: (p) => this.patch(t, { processing: p })
        })
        if (r.video && r.codec) {
          video = r.video
          hevc = r.codec === 'hevc'
          dolbyVision = false
          codec = r.codec === 'hevc' ? 'HEVC' : 'AVC'
          this.patch(t, { qualityLabel: swapCodec(plan.qualityLabel, r.codec) })
        }
        wmNote = r.note
        this.patch(t, { watermark: r.state, processing: undefined })
      } else if (plan.video && video && t.batchId) {
        // AI 助手（MCP）提交的下载没选去水印：顺便识别有没有 B站水印，让它知道要不要提醒用户
        check()
        this.patch(t, { status: 'processing', processing: { stage: 'detect' } })
        const state = await detectOnly({ source: video, stream: plan.video, durationHint: t.item.duration, signal: ac.signal })
        this.patch(t, { watermark: state, processing: undefined })
      }

      check()
      this.patch(t, { status: 'merging' })
      // 按实际拿到的画质、编码重新套一次命名模板
      const relBase = t.template ? renderTemplate(t.template, { ...t.nameValues, quality: plan.quality, codec }) : t.relBase
      const base = join(t.dir ?? this.settings().downloadDir, relBase)
      try {
        mkdirSync(dirname(base), { recursive: true })
      } catch (e) {
        throw toDiskError(e, dirname(base))
      }
      const format = plan.format
      const out = uniquePath(base, `.${format}`, (p) => this.claimed.has(p))
      this.claimed.add((claimed = out))
      // 上次合并到一半退出了应用，留下的半成品先删掉
      if (t.tmpOutput) rmSync(t.tmpOutput, { force: true })
      this.patch(t, { tmpOutput: `${out}.tmp` })
      const o = t.options
      const embedded = await mux(
        {
          video,
          audio: plan.hasAudio ? join(tmp, 'audio.m4s') : undefined,
          out: `${out}.tmp`,
          format,
          title: t.title,
          hevc,
          dolbyVision,
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
      // 成品已经好了，临时目录删不掉也不算失败
      removeQuietly(tmp)
      const size = statSync(out).size
      const note = [...plan.notes, ...extras.notes, ...sideNotes, ...(wmNote ? [wmNote] : [])].join('；') || undefined
      this.batch.done++
      this.patch(t, { status: 'done', outputPath: out, relBase, note, speed: 0, downloaded: size, total: size, retries: 0 })
      this.emit('done', t)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (ac.signal.aborted) {
        // 暂停/取消：状态已由调用方设置
      } else if (e instanceof AuthExpiredError) {
        if (!this.accounts) this.authBlocked = true
        const refreshed = this.accounts && mid !== undefined
          && this.accounts.partition(mid) !== partition && this.accounts.status(mid) === 'ready'
        this.patch(t, { status: refreshed ? 'queued' : 'waitingAuth', speed: 0 })
      } else if (e instanceof UnsupportedError) {
        this.batch.failed++
        this.patch(t, { status: 'unsupported', error: message, speed: 0 })
      } else if (!(isRetryable(e) && this.scheduleRetry(t, message))) {
        this.batch.failed++
        this.patch(t, { status: 'error', error: message, speed: 0 })
      }
    } finally {
      if (claimed) this.claimed.delete(claimed)
      // 同一任务被暂停又继续时，不能删掉之后那次 run 的控制器
      if (this.running.get(t.id) === ac) this.running.delete(t.id)
      if (this.canceled.delete(t.id)) {
        removeQuietly(tmp)
        removeTaskOutputs({ outputPath: produced, tmpOutput: t.tmpOutput }, this.rootOf(t))
      } else if (t.tmpOutput) {
        // 合并被暂停或出错打断，半成品没用，下次重新合并
        removeQuietly(t.tmpOutput)
      }
      if (t.tmpOutput) this.patch(t, { tmpOutput: undefined })
      // 去水印时被暂停、出错
      if (t.processing) this.patch(t, { processing: undefined })
      this.schedule()
    }
  }
}
