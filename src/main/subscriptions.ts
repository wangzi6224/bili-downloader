import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { app } from 'electron'
import { downloadedMatcher } from '@shared/downloaded'
import { t } from '@shared/i18n'
import { parseInput, type Target } from '@shared/parseUrl'
import type { DownloadOptions, EnqueueRequest, MediaItem, NewSubscription, ParseResult, SourceDownloadResult, Subscription } from '@shared/types'
import { getAuthState } from './auth/authGuard'
import { AuthExpiredError } from './bili/http'
import { isAscending, loadAllPages, loadHeadPages, loadTailPages } from './bili/lists'
import { resolveInput } from './bili/resolve'
import { downloadedKeys } from './history'
import { prepareEnqueueItems } from './enqueue'
import { readJsonArray, writeJson } from './store'

const TICK_MS = 60_000

const isAscendingTarget = (target: Target | null): boolean => target?.type === 'spaceSeason' || target?.type === 'spaceSeries'
/** 记住的已见条目上限，防止大收藏夹让文件无限变大 */
const MAX_SEEN = 5000
const DEFAULT_INTERVAL = 360
const sourceKey = (input: string): string => JSON.stringify(parseInput(input) ?? input.trim())

interface SourceDownload {
  input: string
  subscription?: Subscription
  accountMid?: number
  defaults: DownloadOptions
  verifyAccount: () => void
}

/**
 * 订阅：应用运行期间按间隔检查来源，把新出现的条目加入下载队列。
 * 事件：update(list)、found({ title, count })
 */
export class SubscriptionManager extends EventEmitter {
  private subs: Subscription[]
  private timer?: NodeJS.Timeout
  private busy = false
  private checking = new Set<string>()
  private downloading = new Set<string>()

  constructor(private enqueue: (req: EnqueueRequest) => number) {
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

  async add(req: NewSubscription, accountMid?: number): Promise<Subscription[]> {
    if (this.subs.some((s) => s.input === req.input && (s.accountMid === accountMid || s.accountMid === undefined))) {
      throw new Error(t('subsErr.duplicate'))
    }
    if (this.downloading.has(sourceKey(req.input))) throw new Error(t('subs.quickBusy'))
    const sub: Subscription = {
      id: randomUUID(),
      input: req.input,
      title: req.title,
      kind: req.kind,
      intervalMin: req.intervalMin,
      enabled: true,
      options: req.options,
      ...(accountMid === undefined ? {} : { accountMid }),
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

  private async prepareAndEnqueue(
    result: ParseResult,
    candidates: MediaItem[],
    options: DownloadOptions,
    beforeQueue: () => void
  ): Promise<{ count: number; pending: MediaItem[]; note?: string }> {
    const unique = new Map(candidates.map((item) => [item.key, item]))
    const { items, failed, note } = await prepareEnqueueItems([...unique.values()])
    beforeQueue()
    const history = new Set(downloadedKeys())
    const missing = items.filter((item) => !history.has(item.key))
    const count = missing.length ? this.enqueue({
      title: result.title,
      cover: result.cover,
      kind: result.kind,
      meta: result.meta,
      items: missing,
      options
    }) : 0
    const failedKeys = new Set(failed.map((item) => item.key))
    return { count, pending: [...unique.values()].filter((item) => failedKeys.has(item.key)), note }
  }

  private remember(sub: Subscription, items: MediaItem[], pending: MediaItem[]): void {
    const retry = new Set(pending.map((item) => item.key))
    sub.seen = [...new Set([...items.map((item) => item.key), ...sub.seen])]
      .filter((key) => !retry.has(key)).slice(0, MAX_SEEN)
    sub.pending = pending.length ? pending : undefined
  }

  async downloadSource({ input, subscription, accountMid, defaults, verifyAccount }: SourceDownload): Promise<SourceDownloadResult> {
    const key = sourceKey(input)
    const find = (): Subscription | undefined => {
      const matches = this.subs.filter((s) => sourceKey(s.input) === key)
      return matches.find((s) => s.accountMid === accountMid) ?? matches.find((s) => s.accountMid === undefined)
    }
    let existing = subscription ?? find()
    if (this.downloading.has(key) || (existing && this.checking.has(existing.id))) throw new Error(t('subs.quickBusy'))
    this.downloading.add(key)
    let episodeKey: string | undefined
    try {
      const first = await resolveInput(input)
      verifyAccount()
      // 旧订阅可能是从单集链接创建的，但解析结果仍包含整部番剧。
      if (!existing && first.kind === 'pgc') {
        const ids = new Set(first.groups.flatMap((group) => group.items.map((item) => item.epId)))
        existing = this.subs.find((s) => {
          const target = parseInput(s.input)
          return target?.type === 'pgc' && target.epId !== undefined && ids.has(target.epId)
        })
        if (existing) {
          const alias = sourceKey(existing.input)
          if (this.checking.has(existing.id) || this.downloading.has(alias)) throw new Error(t('subs.quickBusy'))
          this.downloading.add(alias)
          episodeKey = alias
        }
      }
      const { result, complete, error } = await loadAllPages(first, { beforePage: verifyAccount })
      if (!complete) throw new Error(error ?? t('subs.sourceIncomplete'))
      verifyAccount()
      const raw = result.groups.flatMap((group) => group.items)
      const current = existing ?? find()
      if (current && !this.subs.includes(current)) throw new Error(t('subs.sourceUnavailable'))
      const options = current?.options ?? defaults
      const bindingLegacy = current !== undefined && current.accountMid === undefined && accountMid !== undefined
      const history = new Set(downloadedKeys())
      const candidates = raw.filter((item) => !item.unavailable && !history.has(item.key))
      const { count, pending, note } = await this.prepareAndEnqueue(
        result, candidates, result.kind === 'audio' ? { ...options, output: 'audio' } : options,
        () => {
          verifyAccount()
          if (current && !this.subs.includes(current)) throw new Error(t('subs.sourceUnavailable'))
        }
      )

      const now = Date.now()
      const ascending = Boolean(result.paging && isAscending(result.paging.source))
      const baseline = ascending ? [...first.groups.flatMap((group) => group.items), ...[...raw].reverse()] : raw
      const sub: Subscription = current ?? {
        id: randomUUID(), input, title: result.title, kind: result.kind, accountMid,
        intervalMin: DEFAULT_INTERVAL, enabled: true, options, seen: [], createdAt: now
      }
      if (accountMid !== undefined) sub.accountMid ??= accountMid
      if (bindingLegacy) sub.seen = []
      this.remember(sub, baseline, pending)
      if (ascending) sub.tailBaseline = true
      sub.lastCheck = now
      sub.lastNew = count
      sub.lastError = note
      if (!current) this.subs.push(sub)
      this.save()
      return { title: result.title, subscribed: !current, count, note }
    } finally {
      this.downloading.delete(key)
      if (episodeKey) this.downloading.delete(episodeKey)
    }
  }

  async check(id: string): Promise<Subscription[]> {
    const sub = this.subs.find((x) => x.id === id)
    // 同一个订阅正在检查（例如添加时的检查还没完，定时检查又到了）就不再查一遍
    if (!sub || this.checking.has(id) || this.downloading.has(sourceKey(sub.input))) return this.subs
    let accountMid = sub.accountMid
    if (accountMid === undefined && parseInput(sub.input)?.type === 'watchlater') {
      const auth = getAuthState()
      if (!auth.loggedIn) return this.subs
      accountMid = auth.user.mid
    }
    const matchesAccount = (): boolean => {
      if (accountMid === undefined) return true
      const auth = getAuthState()
      return auth.loggedIn && auth.user.mid === accountMid
    }
    if (!matchesAccount()) return this.subs
    this.checking.add(id)
    try {
      const r = await resolveInput(sub.input)
      if (!matchesAccount() || !this.subs.includes(sub)) return this.subs
      const seen = new Set(sub.seen)
      const wasSeen = (item: MediaItem): boolean => seen.has(item.key)
      const isDownloaded = downloadedMatcher(downloadedKeys())
      const known = (i: MediaItem): boolean => wasSeen(i) || isDownloaded(i)
      // 正序的合集、系列只看第一页会漏掉排在最后的新内容
      const ascending = Boolean(r.paging && isAscending(r.paging.source))
      let items = r.groups.flatMap((g) => g.items)
      let baseline: MediaItem[] = []
      if (r.paging?.hasMore && ascending) {
        // 只记下了第一页的订阅：先把最后一页记为已见，下次检查起再往前找新内容
        if (sub.tailBaseline) items = [...items, ...await loadTailPages(r.paging, known)]
        else baseline = await loadTailPages(r.paging, () => true)
      } else if (r.paging?.hasMore && !items.some(wasSeen)) {
        items = [...items, ...await loadHeadPages(r.paging, wasSeen)]
      }
      if (!matchesAccount() || !this.subs.includes(sub)) return this.subs
      const pending = sub.pending ?? []
      const retry = new Set(pending.map((item) => item.key))
      // 首页只是部分列表时，待重试条目可能已移到后续页。
      const byKey = new Map((r.paging?.hasMore ? pending : []).map((item) => [item.key, item]))
      for (const item of items) {
        if (retry.has(item.key) || !known(item)) byKey.set(item.key, item)
      }
      const candidates = [...byKey.values()].filter((item) => !item.unavailable)
      const prepared = await this.prepareAndEnqueue(r, candidates, sub.options, () => {
        if (!matchesAccount()) throw new Error(t('subs.accountChanged'))
        if (!this.subs.includes(sub)) throw new Error(t('subs.sourceUnavailable'))
      })
      if (prepared.count) this.emit('found', { title: sub.title, count: prepared.count, note: prepared.note })
      if (accountMid !== undefined) sub.accountMid ??= accountMid
      this.remember(sub, [...items, ...baseline, ...byKey.values()], prepared.pending)
      // 和已见记录一起更新：中途出错时不能只记了标记、没记最后一页
      if (ascending) sub.tailBaseline = true
      sub.lastNew = prepared.count
      sub.lastError = prepared.note
    } catch (e) {
      if (!matchesAccount() || !this.subs.includes(sub)) return this.subs
      sub.lastError = e instanceof AuthExpiredError ? t('subsErr.authExpired') : e instanceof Error ? e.message : String(e)
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
