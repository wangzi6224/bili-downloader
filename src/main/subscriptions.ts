import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { app } from 'electron'
import { downloadedMatcher } from '@shared/downloaded'
import { parseInput, type Target } from '@shared/parseUrl'
import type { EnqueueRequest, MediaItem, NewSubscription, Subscription } from '@shared/types'
import { AuthExpiredError } from './bili/http'
import { isAscending, loadTailPages } from './bili/lists'
import { resolveInput } from './bili/resolve'
import { downloadedKeys } from './history'
import { readJsonArray, writeJson } from './store'

const TICK_MS = 60_000

const isAscendingTarget = (t: Target | null): boolean => t?.type === 'spaceSeason' || t?.type === 'spaceSeries'
/** 记住的已见条目上限，防止大收藏夹让文件无限变大 */
const MAX_SEEN = 5000

/**
 * 订阅：应用运行期间按间隔检查来源，把新出现的条目加入下载队列。
 * 事件：update(list)、found({ title, count })
 */
export class SubscriptionManager extends EventEmitter {
  private subs: Subscription[]
  private timer?: NodeJS.Timeout
  private busy = false
  private checking = new Set<string>()

  constructor(private enqueue: (req: EnqueueRequest) => Promise<string | undefined>) {
    super()
    this.subs = readJsonArray<Subscription>(this.file())
  }

  private file(): string {
    return join(app.getPath('userData'), 'subscriptions.json')
  }

  private save(): void {
    writeJson(this.file(), this.subs)
    this.emit('update', this.subs)
  }

  list(): Subscription[] {
    return this.subs
  }

  start(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS)
    setTimeout(() => void this.tick(), 10_000)
  }

  stop(): void {
    clearInterval(this.timer)
  }

  async add(req: NewSubscription): Promise<Subscription[]> {
    if (this.subs.some((s) => s.input === req.input)) throw new Error('已经订阅过这个来源')
    const sub: Subscription = {
      id: randomUUID(),
      input: req.input,
      title: req.title,
      kind: req.kind,
      intervalMin: req.intervalMin,
      enabled: true,
      options: req.options,
      // 只下载以后新增的：把现在看到的都记为已见
      seen: req.includeExisting ? [] : req.currentKeys,
      createdAt: Date.now(),
      lastCheck: req.includeExisting ? undefined : Date.now(),
      // 现有内容也下载时，第一次检查就从最后一页一直往前翻
      tailBaseline: req.includeExisting || undefined
    }
    this.subs.push(sub)
    this.save()
    if (req.includeExisting) await this.check(sub.id)
    // 正序的合集、系列马上补记最后一页，免得到第一次检查之间新增的内容被当成旧的；短链接等到第一次检查时再记
    else if (isAscendingTarget(parseInput(sub.input))) await this.check(sub.id)
    return this.subs
  }

  update(id: string, patch: Partial<Pick<Subscription, 'enabled' | 'intervalMin' | 'options'>>): Subscription[] {
    const s = this.subs.find((x) => x.id === id)
    if (s) Object.assign(s, patch)
    this.save()
    return this.subs
  }

  remove(id: string): Subscription[] {
    this.subs = this.subs.filter((x) => x.id !== id)
    this.save()
    return this.subs
  }

  /** 也可以导入配置时整体替换（保留已见记录，避免重复下载） */
  replaceAll(list: Subscription[]): void {
    this.subs = list
    this.save()
  }

  async check(id: string): Promise<Subscription[]> {
    const sub = this.subs.find((x) => x.id === id)
    // 同一个订阅正在检查（例如添加时的检查还没完，定时检查又到了）就不再查一遍
    if (!sub || this.checking.has(id)) return this.subs
    this.checking.add(id)
    try {
      const r = await resolveInput(sub.input)
      const seen = new Set(sub.seen)
      const isDownloaded = downloadedMatcher(downloadedKeys())
      const known = (i: MediaItem): boolean => seen.has(i.key) || isDownloaded(i)
      // 正序的合集、系列只看第一页会漏掉排在最后的新内容
      const ascending = Boolean(r.paging && isAscending(r.paging.source))
      let tail: MediaItem[] = []
      let baseline: MediaItem[] = []
      if (r.paging && ascending) {
        // 只记下了第一页的订阅：先把最后一页记为已见，下次检查起再往前找新内容
        if (sub.tailBaseline) tail = await loadTailPages(r.paging, known)
        else baseline = await loadTailPages(r.paging, () => true)
      }
      const items = [...r.groups.flatMap((g) => g.items), ...tail]
      const fresh = items.filter((i) => !i.unavailable && !known(i))
      if (fresh.length) {
        const note = await this.enqueue({ title: r.title, cover: r.cover, kind: r.kind, meta: r.meta, items: fresh, options: sub.options })
        this.emit('found', { title: sub.title, count: fresh.length, note })
      }
      sub.seen = [...new Set([...[...items, ...baseline].map((i) => i.key), ...sub.seen])].slice(0, MAX_SEEN)
      // 和已见记录一起更新：中途出错时不能只记了标记、没记最后一页
      if (ascending) sub.tailBaseline = true
      sub.lastNew = fresh.length
      sub.lastError = undefined
    } catch (e) {
      sub.lastError = e instanceof AuthExpiredError ? '登录已失效，重新登录后会继续检查' : e instanceof Error ? e.message : String(e)
    } finally {
      this.checking.delete(id)
    }
    sub.lastCheck = Date.now()
    this.save()
    return this.subs
  }

  private async tick(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      const now = Date.now()
      for (const s of this.subs) {
        if (s.enabled && (!s.lastCheck || now - s.lastCheck >= s.intervalMin * 60_000)) {
          await this.check(s.id)
          // 多个订阅之间隔开，避免集中请求
          await new Promise((r) => setTimeout(r, 2000))
        }
      }
    } finally {
      this.busy = false
    }
  }
}
