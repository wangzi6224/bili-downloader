import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { app } from 'electron'
import type { EnqueueRequest, NewSubscription, Subscription } from '@shared/types'
import { AuthExpiredError } from './bili/http'
import { resolveInput } from './bili/resolve'
import { downloadedKeys } from './history'
import { readJsonArray, writeJson } from './store'

const TICK_MS = 60_000
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
      lastCheck: req.includeExisting ? undefined : Date.now()
    }
    this.subs.push(sub)
    this.save()
    if (req.includeExisting) await this.check(sub.id)
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
    if (!sub) return this.subs
    try {
      const r = await resolveInput(sub.input)
      const items = r.groups.flatMap((g) => g.items)
      const seen = new Set(sub.seen)
      const done = new Set(downloadedKeys())
      const doneBv = new Set([...done].map((k) => k.split(':')[1]))
      const fresh = items.filter(
        (i) => !i.unavailable && !seen.has(i.key) && !done.has(i.key) && !(i.lazy && i.bvid && doneBv.has(i.bvid))
      )
      if (fresh.length) {
        const note = await this.enqueue({ title: r.title, cover: r.cover, kind: r.kind, meta: r.meta, items: fresh, options: sub.options })
        this.emit('found', { title: sub.title, count: fresh.length, note })
      }
      sub.seen = [...new Set([...items.map((i) => i.key), ...sub.seen])].slice(0, MAX_SEEN)
      sub.lastNew = fresh.length
      sub.lastError = undefined
    } catch (e) {
      sub.lastError = e instanceof AuthExpiredError ? '登录已失效，重新登录后会继续检查' : e instanceof Error ? e.message : String(e)
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
