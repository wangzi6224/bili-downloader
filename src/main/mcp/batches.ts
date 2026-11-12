import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type {
  DownloadOptions,
  EnqueueRequest,
  MediaItem,
  MediaKind,
  MediaMeta,
  TaskInfo,
  WatermarkMethod,
  WatermarkRegion
} from '@shared/types'
import { t } from '@shared/i18n'
import type { EnqueueResult } from '../download/manager'
import type { accounts as accountRegistry } from '../auth/accounts'
import { AuthExpiredError } from '../bili/http'
import { readJsonArray, writeJson } from '../store'
import { countStatuses, describeError, joinHints, loginHint, mcpStatus, stopsBatch, summarizeTask, totalSpeed, type McpStatus } from './format'

/** MCP 用到的下载队列操作（DownloadManager 的子集，方便测试） */
export interface TaskQueue {
  list(): TaskInfo[]
  enqueue(req: EnqueueRequest): EnqueueResult
  pauseMany(ids: string[]): void
  resume(id: string): void
  resumeMany(ids: string[]): void
  redownload(id: string): void
  remove(ids: string[], deleteFiles: boolean): void
  /** 给已下载的视频去水印（在后台进行，完成后替换原文件） */
  startWatermark(id: string, region: WatermarkRegion, method: WatermarkMethod): void
  /** 取消去水印，原视频不变 */
  cancelWatermark(id: string): void
  on(event: 'update', fn: () => void): unknown
  off(event: 'update', fn: () => void): unknown
}

export interface Batch {
  id: string
  accountMid?: number
  requestId?: string
  /** 链接、选择、选项、目录相同的请求算出同样的指纹，用来识别重复提交 */
  fingerprint: string
  url: string
  title: string
  cover: string
  kind: MediaKind
  meta?: MediaMeta
  options: DownloadOptions
  dir: string
  /** 整批是否不止一个条目（决定命名模板） */
  multi: boolean
  createdAt: number
  /** 选中要下载的条目数（列表里没展开的视频按一个算） */
  selected: number
  /** 已经处理（展开分P、加入队列）的条目数 */
  processed: number
  skipped: { downloaded: number; unavailable: number; queued: number }
  /** 展开分P后按每一P核对下载历史，下载过的跳过 */
  skipDownloaded?: boolean
  /** 已经在别的批次或界面里排队、下载的同一条目对应的任务，也算进这个批次的进度 */
  linked?: string[]
  /** 展开时因为风控、登录失效停下的原因 */
  error?: string
  /** 还没加入队列的条目，应用重启后可以接着处理 */
  pending: MediaItem[]
  /** 展开分P失败、没能加入队列的条目 */
  failed: { item: MediaItem; reason: string }[]
  /** 按批次暂停后，之后才加入队列的任务也保持暂停 */
  paused?: boolean
  waitingForAccount?: boolean
  state: 'expanding' | 'ready' | 'interrupted'
}

export type NewBatch = Pick<
  Batch,
  'requestId' | 'fingerprint' | 'url' | 'title' | 'cover' | 'kind' | 'meta' | 'options' | 'dir' | 'skipDownloaded' | 'accountMid'
> & {
  items: MediaItem[]
  skipped: { downloaded: number; unavailable: number }
}

export type BatchState =
  | 'expanding'
  | 'interrupted'
  | 'waiting_auth'
  | 'downloading'
  | 'queued'
  | 'paused'
  | 'done_with_errors'
  | 'done'

export type ReportPart = 'failed' | 'files' | 'running'

/** 这些状态下批次还会自己往前走，等待时要继续等 */
const MOVING = new Set<BatchState>(['expanding', 'downloading', 'queued'])
const FINISHED = new Set<BatchState>(['done', 'done_with_errors'])
const MAX_BATCHES = 50
/** 每次展开、加入队列的条目数：展开一部分就先开始下载 */
const CHUNK = 10
const MAX_FAILED = 50
const MAX_FILES = 500
const MAX_RUNNING = 20

/**
 * MCP 的批量下载。列表里的视频要逐个查接口才知道分P，几百个视频要好几分钟，
 * 所以提交后立即返回批次 id，在后台分段展开、加入队列。批次记录保存在磁盘上，
 * 应用重启后可以接着处理。事件：change（批次有变化）
 */
export class BatchManager extends EventEmitter {
  private batches: Batch[]
  /** 多个批次排队依次展开，免得并发请求触发风控 */
  private chain: Promise<void> = Promise.resolve()
  /** 取消时加一，正在展开的那一段回来后发现变了就不再加入队列 */
  private generation = new Map<string, number>()

  private saveTimer?: NodeJS.Timeout

  /** expand 遇到风控、登录失效时应当直接抛出（见 stopsBatch），批次会停下等 agent 让它继续 */
  constructor(
    private file: string,
    private queue: TaskQueue,
    private expand: (items: MediaItem[]) => Promise<MediaItem[]>,
    private downloadedKeys: () => string[],
    private chunk = CHUNK,
    private accounts?: Pick<typeof accountRegistry, 'run' | 'status' | 'partition'>
  ) {
    super()
    // 上次退出时还没处理完的，等 agent 决定是否继续
    this.batches = readJsonArray<Batch>(file)
      .filter((b) => b?.id && Array.isArray(b.pending))
      .map((b) => (b.state === 'expanding' ? { ...b, state: 'interrupted' } : b))
  }

  list(): Batch[] {
    return this.batches
  }

  assignLegacy(mid: number): void {
    for (const b of this.batches) {
      if (b.accountMid === undefined && (b.pending.length || b.failed.length)) b.accountMid = mid
    }
    this.changed()
  }

  accountReady(mid: number): void {
    for (const b of this.batches) {
      if (b.accountMid === mid && b.waitingForAccount && b.pending.length) this.resume(b)
    }
  }

  find(id: string): Batch | undefined {
    return this.batches.find((b) => b.id === id)
  }

  /**
   * 重复提交：同一个 request_id；或者指纹相同、而且原批次还没结束。
   * 已经结束的不算，这样过一阵再提交同一个合集可以下到新增的视频
   */
  findDuplicate(requestId: string | undefined, fingerprint: string, accountMid?: number): Batch | undefined {
    if (requestId) return this.batches.find((b) => b.accountMid === accountMid && b.requestId === requestId)
    return this.batches.findLast((b) => b.accountMid === accountMid && b.fingerprint === fingerprint && !FINISHED.has(this.state(b)))
  }

  submit(n: NewBatch): Batch {
    const { items, skipped, ...rest } = n
    const b: Batch = {
      ...rest,
      id: randomUUID(),
      multi: items.length > 1,
      createdAt: Date.now(),
      selected: items.length,
      processed: 0,
      skipped: { ...skipped, queued: 0 },
      pending: items,
      failed: [],
      state: 'ready'
    }
    this.batches.push(b)
    if (items.some((i) => i.lazy)) {
      this.schedule(b)
    } else {
      // 不用查分P的直接加入队列
      b.pending = []
      b.processed = items.length
      this.add(b, items)
    }
    this.prune(b)
    this.changed()
    return b
  }

  /** 接着处理应用退出时没处理完的条目 */
  resume(b: Batch): boolean {
    if (b.state !== 'interrupted') return false
    this.schedule(b)
    this.changed()
    return true
  }

  /** 展开分P失败的条目重新处理，返回条数 */
  retryFailed(b: Batch): number {
    const n = b.failed.length
    if (!n) return 0
    b.pending.push(...b.failed.map((f) => f.item))
    b.processed -= n
    b.failed = []
    if (b.state !== 'expanding') this.schedule(b)
    this.changed()
    return n
  }

  /** 不再加入还没处理的条目，返回条数 */
  cancelPending(b: Batch): number {
    const n = b.pending.length
    b.pending = []
    this.generation.set(b.id, (this.generation.get(b.id) ?? 0) + 1)
    if (b.state === 'interrupted') b.state = 'ready'
    this.changed()
    return n
  }

  setPaused(b: Batch, paused: boolean): void {
    b.paused = paused || undefined
    this.changed()
  }

  tasksOf(b: Batch): TaskInfo[] {
    const linked = new Set(b.linked)
    return this.queue.list().filter((t) => t.batchId === b.id || (t.accountMid === b.accountMid && linked.has(t.id)))
  }

  state(b: Batch, counts: Record<McpStatus, number> = countStatuses(this.tasksOf(b))): BatchState {
    if (b.state !== 'ready') return b.state
    if (counts.waiting_auth) return 'waiting_auth'
    if (counts.running) return 'downloading'
    if (counts.queued || counts.retrying) return 'queued'
    if (counts.paused) return 'paused'
    if (counts.failed || counts.unsupported || b.failed.length) return 'done_with_errors'
    return 'done'
  }

  /** 等到批次不再自己往前走（全部结束、暂停、等待登录、中断）或超时；下载完了但还在去水印的也算在往前走 */
  async wait(b: Batch, ms: number): Promise<void> {
    const moving = (): boolean => MOVING.has(this.state(b)) || this.tasksOf(b).some((t) => t.processing?.manual)
    if (ms <= 0 || !moving()) return
    await new Promise<void>((resolve) => {
      const check = (): void => {
        if (!moving()) finish()
      }
      const finish = (): void => {
        clearTimeout(timer)
        this.queue.off('update', check)
        this.off('change', check)
        resolve()
      }
      const timer = setTimeout(finish, ms)
      this.queue.on('update', check)
      this.on('change', check)
    })
  }

  /** 列表里用的简要信息 */
  brief(b: Batch) {
    const tasks = this.tasksOf(b)
    const counts = countStatuses(tasks)
    return {
      batch_id: b.id,
      account_mid: b.accountMid,
      title: b.title,
      // 一次提交多个视频的批次没有单一链接
      url: b.url || undefined,
      request_id: b.requestId,
      created_at: new Date(b.createdAt).toISOString(),
      state: this.state(b, counts),
      tasks: tasks.length,
      done: counts.done,
      failed: counts.failed + counts.unsupported + b.failed.length
    }
  }

  report(b: Batch, include: ReadonlySet<ReportPart>) {
    const tasks = this.tasksOf(b)
    const counts = countStatuses(tasks)
    const state = this.state(b, counts)
    const done = tasks.filter((t) => t.status === 'done')
    const running = tasks.filter((t) => mcpStatus(t) === 'running')
    const speed = totalSpeed(tasks)
    // 剩余时间：正在下的按剩余字节，还没开始的按已完成任务的平均大小估
    const avg = done.length ? done.reduce((n, t) => n + t.total, 0) / done.length : undefined
    const waiting = counts.queued + counts.retrying + b.pending.length
    const remaining = running.reduce((n, t) => n + Math.max(0, t.total - t.downloaded), 0) + (avg ?? 0) * waiting
    const eta = speed > 0 && (avg !== undefined || !waiting) ? Math.round(remaining / speed) : null
    const quality: Record<string, number> = {}
    for (const t of tasks) if (t.qualityLabel) quality[t.qualityLabel] = (quality[t.qualityLabel] ?? 0) + 1
    const failed = [
      ...b.failed.map((f) => ({ item_id: f.item.key, account_mid: b.accountMid, title: f.item.title, status: 'not_added', reason: f.reason, retryable: true })),
      ...tasks
        .filter((t) => ['failed', 'unsupported', 'retrying'].includes(mcpStatus(t)))
        .map((t) => ({
          task_id: t.id,
          account_mid: t.accountMid,
          item_id: t.item.key,
          title: t.title,
          status: mcpStatus(t),
          reason: t.error,
          retryable: t.status !== 'unsupported'
        }))
    ]
    return {
      batch_id: b.id,
      account_mid: b.accountMid,
      title: b.title,
      url: b.url || undefined,
      request_id: b.requestId,
      created_at: new Date(b.createdAt).toISOString(),
      state,
      expand: { done: b.processed, total: b.selected, failed: b.failed.length },
      counts: { total: tasks.length, ...counts },
      progress: { bytes_done: tasks.reduce((n, t) => n + t.downloaded, 0), speed_bps: speed, eta_seconds: eta },
      dir: b.dir,
      quality: {
        requested_qn: b.options.qn,
        actual: quality,
        // 127 是“最高可用”，拿到的比它低是正常的
        below_requested: b.options.qn < 127 ? tasks.filter((t) => t.videoQn && t.videoQn < b.options.qn).length : undefined
      },
      skipped: b.skipped,
      paused_by_agent: b.paused,
      hint: this.hint(b, state, counts),
      failed: include.has('failed') && failed.length ? failed.slice(0, MAX_FAILED) : undefined,
      failed_more: include.has('failed') && failed.length > MAX_FAILED ? failed.length - MAX_FAILED : undefined,
      files: include.has('files') ? done.slice(0, MAX_FILES).map((t) => t.outputPath) : undefined,
      running: include.has('running') ? running.slice(0, MAX_RUNNING).map(summarizeTask) : undefined
    }
  }

  private hint(b: Batch, state: BatchState, counts: Record<McpStatus, number>): string | undefined {
    const id = b.id
    switch (state) {
      case 'expanding':
        return t('mcpBatch.expanding', { done: b.processed, total: b.selected })
      case 'interrupted':
        return b.error
          ? t('mcpBatch.interruptedError', { error: b.error, count: b.pending.length, id })
          : t('mcpBatch.interruptedQuit', { count: b.pending.length, id })
      case 'waiting_auth':
        return t('mcpBatch.waitingAuth', { loginHint: loginHint() })
      case 'downloading':
      case 'queued':
        return counts.retrying
          ? t('mcpBatch.retrying', { count: counts.retrying })
          : t('mcpBatch.downloading')
      case 'paused':
        return t('mcpBatch.paused', { count: counts.paused, id })
      case 'done_with_errors': {
        const tips = []
        if (counts.failed || b.failed.length) tips.push(t('mcpBatch.retryFailed', { id }))
        if (counts.unsupported) tips.push(t('mcpBatch.unsupported'))
        return joinHints(tips)
      }
      default:
        return !counts.done && b.skipped.downloaded ? t('mcpBatch.allDownloaded') : undefined
    }
  }

  private schedule(b: Batch): void {
    b.state = 'expanding'
    b.error = undefined
    b.waitingForAccount = undefined
    this.chain = this.chain
      .then(() => this.process(b))
      .catch((e) => {
        console.error('MCP 批次处理失败', e)
        b.state = 'interrupted'
        this.changed()
      })
  }

  private async process(b: Batch): Promise<void> {
    while (b.pending.length) {
      const gen = this.generation.get(b.id)
      const chunk = b.pending.slice(0, this.chunk)
      const mid = b.accountMid
      const partition = mid === undefined ? undefined : this.accounts?.partition(mid)
      let items: MediaItem[]
      try {
        items = await (this.accounts ? this.accounts.run(mid, () => this.expand(chunk)) : this.expand(chunk))
      } catch (e) {
        if (gen !== this.generation.get(b.id)) continue
        if (e instanceof AuthExpiredError && this.accounts && mid !== undefined
          && this.accounts.partition(mid) !== partition && this.accounts.status(mid) === 'ready') continue
        if (stopsBatch(e) && gen === this.generation.get(b.id)) {
          // 风控或登录失效：接着请求只会继续失败，这一段留在 pending 里，等 agent 让它继续
          b.state = 'interrupted'
          b.waitingForAccount = this.accounts && e instanceof AuthExpiredError ? true : undefined
          b.error = describeError(e).message
          this.changed()
          return
        }
        const reason = e instanceof Error ? e.message : String(e)
        items = chunk.map((i) => ({ ...i, unavailable: reason }))
      }
      // 展开期间被取消了：这一段也不加，pending 已经清空，循环随之结束
      if (gen !== this.generation.get(b.id)) continue
      b.pending = b.pending.slice(chunk.length)
      b.processed += chunk.length
      this.add(b, items)
      this.changed()
    }
    b.state = 'ready'
    this.changed()
  }

  private add(b: Batch, items: MediaItem[]): void {
    for (const i of items) {
      if (!i.unavailable) continue
      const { unavailable, ...item } = i
      b.failed.push({ item, reason: unavailable })
    }
    let ok = items.filter((i) => !i.unavailable)
    // 只选了一个视频、展开后有多个分P：和一次选多个条目一样命名（放进合集目录）
    if (!b.multi && ok.length > 1) b.multi = true
    if (b.skipDownloaded) {
      // 展开后按每一P核对：多P视频只下过其中几P时，其余的照样下载
      const done = new Set(this.downloadedKeys())
      const before = ok.length
      ok = ok.filter((i) => !done.has(i.key))
      b.skipped.downloaded += before - ok.length
    }
    if (!ok.length) return
    const r = this.queue.enqueue({
      title: b.title,
      cover: b.cover,
      kind: b.kind,
      meta: b.meta,
      items: ok,
      options: b.options,
      batchId: b.id,
      accountMid: b.accountMid,
      dir: b.dir,
      multi: b.multi,
      // 按批次暂停后加入的任务直接是暂停状态，不会先启动再被打断
      paused: b.paused
    })
    // 已经在队列里的：属于这个批次的（例如重启后接着处理）不算跳过；别的批次或界面里的记下来，一起算进度
    const mine = new Set(this.tasksOf(b).map((t) => t.id))
    const others = r.skipped.filter((x) => !mine.has(x.taskId)).map((x) => x.taskId)
    b.skipped.queued += others.length
    if (others.length) b.linked = [...new Set([...(b.linked ?? []), ...others])]
  }

  /** 超过上限时删掉最早的、已经结束的批次；没结束的（包括中断的）再多也保留 */
  private prune(keep: Batch): void {
    const extra = this.batches.length - MAX_BATCHES
    if (extra <= 0) return
    const drop = new Set<Batch>()
    for (const b of this.batches) {
      if (drop.size >= extra) break
      if (b !== keep && b.state === 'ready' && FINISHED.has(this.state(b))) drop.add(b)
    }
    this.batches = this.batches.filter((b) => !drop.has(b))
  }

  private changed(): void {
    this.emit('change')
    // 节流：每展开一段都会变化，最多每秒写一次盘
    this.saveTimer ??= setTimeout(() => this.flush(), 1000)
  }

  /** 立即把批次写盘（退出应用前调用） */
  flush(): void {
    clearTimeout(this.saveTimer)
    this.saveTimer = undefined
    writeJson(this.file, this.batches)
  }
}
