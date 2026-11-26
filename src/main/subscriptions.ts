import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { app } from 'electron'
import { downloadedMatcher, downloadStatusMatcher } from '@shared/downloaded'
import { siteOf } from '@shared/site'
import { t } from '@shared/i18n'
import { parseInput, type Target } from '@shared/parseUrl'
import { dyTargetUrl, parseDyInput } from '@shared/douyinUrl'
import { parseYtInput, ytTargetUrl } from '@shared/ytUrl'
import type {
  DownloadOptions, EnqueueRequest, MediaItem, NewSubscription, ParseResult, Site, SourceDownloadChoice, SourceDownloadResult, Subscription
} from '@shared/types'
import { getAuthState } from './auth/authGuard'
import type { accounts as accountRegistry } from './auth/accounts'
import { authScope, isRetired } from './auth/scope'
import { AuthExpiredError } from './bili/http'
import { isAscending, loadAllPages, loadHeadPages, loadTailPages } from './bili/lists'
import { resolveInput } from './bili/resolve'
import { downloadedKeys } from './history'
import { prepareEnqueueItems } from './enqueue'
import { readJsonArray, writeJson } from './store'
import { youtube } from './youtube/service'
import { douyin } from './douyin/service'

const TICK_MS = 60_000

const isAscendingTarget = (target: Target | null): boolean => target?.type === 'spaceSeason' || target?.type === 'spaceSeries'
/** 记住的已见条目上限，防止大收藏夹让文件无限变大 */
const MAX_SEEN = 5000
const DEFAULT_INTERVAL = 360
/** 同一来源的不同写法算同一个：B站按识别结果，YouTube 和抖音按规范链接 */
const sourceKey = (input: string): string => {
  const yt = parseYtInput(input)
  const dy = parseDyInput(input)
  return JSON.stringify(parseInput(input) ?? (yt ? ytTargetUrl(yt) : dy ? dyTargetUrl(dy) : input.trim()))
}
/** YouTube 播放列表一次最多读这么多项来找新内容 */
const YT_PLAYLIST_SCAN = 5000
/** 抖音合集、收藏夹一次最多读这么多项来找新内容：请求太多容易触发验证 */
const DY_SCAN = 500

interface SourceDownload {
  input: string
  subscription?: Subscription
  accountMid?: number
  defaults: DownloadOptions
  verifyAccount: () => void
  /** 用户对确认的回答；没有时内容多或有要跳过的就先返回 confirm */
  choice?: SourceDownloadChoice
}

/** 一键下载超过这么多项先问用户，免得一点就把上千条的收藏夹全加进队列 */
const CONFIRM_ABOVE = 30
/** 问用户期间留着已加载的列表，确认后不必重新翻页 */
const LOADED_TTL = 10 * 60_000

/**
 * 订阅：应用运行期间按间隔检查来源，把新出现的条目加入下载队列。
 * 事件：update(list)、found({ title, count })
 */
/**
 * 把缺失的条目分开：番剧只下正片，预告、花絮等不下；
 * 当前账号不是大会员时，会员专享的下了也会失败，跳过。
 */
/** 稍后再看是账号自己的列表，换个账号读到的是另一份 */
const isPersonal = (sub: Subscription): boolean => parseInput(sub.input)?.type === 'watchlater'

function splitMissing(result: ParseResult, missing: MediaItem[]): { wanted: MediaItem[]; vip: MediaItem[]; extras: MediaItem[] } {
  const main = result.kind === 'pgc' ? result.groups.find((group) => group.id === 'main') : undefined
  const mainKeys = main?.items.length ? new Set(main.items.map((item) => item.key)) : undefined
  const auth = getAuthState()
  const isVip = auth.loggedIn && auth.user.vipActive
  const wanted: MediaItem[] = []
  const vip: MediaItem[] = []
  const extras: MediaItem[] = []
  for (const item of missing) {
    if (mainKeys && !mainKeys.has(item.key)) extras.push(item)
    else if (item.needVip && !isVip) vip.push(item)
    else wanted.push(item)
  }
  return { wanted, vip, extras }
}

export class SubscriptionManager extends EventEmitter {
  private subs: Subscription[]
  private timer?: NodeJS.Timeout
  private busy = false
  private checking = new Set<string>()
  private downloading = new Set<string>()
  private loaded = new Map<string, { at: number; first: ParseResult; result: ParseResult }>()

  constructor(private enqueue: (req: EnqueueRequest) => number, private accounts?: Pick<typeof accountRegistry, 'run' | 'status'>) {
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

  assignLegacy(mid: number): void {
    let changed = false
    for (const sub of this.subs) {
      if (sub.accountMid !== undefined || siteOf(sub) !== 'bili') continue
      sub.accountMid = mid
      // 旧的「稍后再看」可能查过别的账号。绑定后用新账号的列表建立基线。
      if (parseInput(sub.input)?.type === 'watchlater') {
        sub.seen = []
        sub.pending = undefined
        sub.resetBaseline = true
      }
      changed = true
    }
    if (changed) this.save()
  }

  /** 这个账号名下的订阅，以及其中只属于这个账号、转给别人也读不到的（稍后再看） */
  accountSubscriptions(mid: number): { all: Subscription[]; personal: Subscription[] } {
    const all = this.subs.filter((sub) => sub.accountMid === mid)
    return { all, personal: all.filter(isPersonal) }
  }

  /** 退出账号时把订阅转给另一个账号；稍后再看只属于原账号，留着 */
  transferAccount(from: number, to: number): void {
    let changed = false
    for (const sub of this.subs) {
      if (sub.accountMid !== from || isPersonal(sub)) continue
      sub.accountMid = to
      sub.lastError = undefined
      changed = true
    }
    if (changed) this.save()
  }

  /** 退出账号时一起删除它名下的订阅 */
  removeAccount(mid: number): void {
    const kept = this.subs.filter((sub) => sub.accountMid !== mid)
    if (kept.length === this.subs.length) return
    this.subs = kept
    this.save()
  }

  async accountReady(mid: number): Promise<void> {
    if (this.subs.some((sub) => sub.accountMid === mid && this.due(sub))) await this.tick()
  }

  start(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS)
    setTimeout(() => void this.tick(), 10_000)
  }

  stop(): void {
    clearInterval(this.timer)
  }

  async add(req: NewSubscription, accountMid?: number): Promise<Subscription[]> {
    // 同一来源的不同写法（例如收藏夹的 ml123 和 favlist?fid=123）也算重复
    const key = sourceKey(req.input)
    const binding = this.dyBinding(req)
    // 抖音自己的列表按账号区分：两个账号的“喜欢”是两份不同的内容
    if (this.subs.some((s) => sourceKey(s.input) === key && s.dyAccount === binding.dyAccount && (s.accountMid === accountMid || (!this.accounts && s.accountMid === undefined)))) {
      throw new Error(t('subsErr.duplicate'))
    }
    if (this.downloading.has(this.workKey(req.input, accountMid))) throw new Error(t('subs.quickBusy'))
    const sub: Subscription = {
      id: randomUUID(),
      input: req.input,
      title: req.title,
      kind: req.kind,
      intervalMin: req.intervalMin,
      enabled: true,
      options: req.options,
      ...(accountMid === undefined ? {} : { accountMid }),
      ...binding,
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
    beforeQueue: () => void,
    accountMid?: number,
    ytAccount?: string,
    dyAccount?: string
  ): Promise<{ count: number; pending: MediaItem[]; note?: string }> {
    const unique = new Map(candidates.map((item) => [item.key, item]))
    const list = [...unique.values()]
    const { items, failed, note } = await (ytAccount === undefined ? prepareEnqueueItems(list) : prepareEnqueueItems(list, ytAccount))
    beforeQueue()
    const history = new Set(downloadedKeys())
    const missing = items.filter((item) => !history.has(item.key))
    const count = missing.length ? this.enqueue({
      title: result.title,
      cover: result.cover,
      kind: result.kind,
      meta: result.meta,
      items: missing,
      options,
      accountMid,
      ytAccount,
      dyAccount
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

  async downloadSource({ input, subscription, accountMid, defaults, verifyAccount, choice }: SourceDownload): Promise<SourceDownloadResult> {
    const key = this.workKey(input, accountMid)
    const find = (): Subscription | undefined => {
      const matches = this.subs.filter((s) => sourceKey(s.input) === sourceKey(input))
      return matches.find((s) => s.accountMid === accountMid) ?? (!this.accounts ? matches.find((s) => s.accountMid === undefined) : undefined)
    }
    let existing = subscription ?? find()
    if (this.downloading.has(key) || (existing && this.checking.has(existing.id))) throw new Error(t('subs.quickBusy'))
    this.downloading.add(key)
    let episodeKey: string | undefined
    const cached = this.loaded.get(key)
    this.loaded.delete(key)
    const reuse = choice && cached && Date.now() - cached.at < LOADED_TTL ? cached : undefined
    try {
      const first = reuse?.first ?? await resolveInput(input)
      verifyAccount()
      // 旧订阅可能是从单集链接创建的，但解析结果仍包含整部番剧。
      if (!existing && first.kind === 'pgc') {
        const ids = new Set(first.groups.flatMap((group) => group.items.map((item) => item.epId)))
        existing = this.subs.find((s) => {
          const target = parseInput(s.input)
          return (!this.accounts || s.accountMid === accountMid)
            && target?.type === 'pgc' && target.epId !== undefined && ids.has(target.epId)
        })
        if (existing) {
          const alias = this.workKey(existing.input, existing.accountMid)
          if (this.checking.has(existing.id) || this.downloading.has(alias)) throw new Error(t('subs.quickBusy'))
          this.downloading.add(alias)
          episodeKey = alias
        }
      }
      const { result, complete, error } = reuse ? { result: reuse.result, complete: true, error: undefined }
        : await loadAllPages(first, { beforePage: verifyAccount })
      if (!complete) throw new Error(error ?? t('subs.sourceIncomplete'))
      verifyAccount()
      const raw = result.groups.flatMap((group) => group.items)
      const current = existing ?? find()
      if (current && !this.subs.includes(current)) throw new Error(t('subs.sourceUnavailable'))
      const options = current?.options ?? defaults
      const bindingLegacy = current !== undefined && current.accountMid === undefined && accountMid !== undefined
      // 还没展开分P的视频先按 BV 号排除已下完的，免得每个都去查一次分P
      const status = downloadStatusMatcher(downloadedKeys())
      const missing = raw.filter((item) => !item.unavailable && status(item) !== 'downloaded')
      const { wanted, vip, extras } = splitMissing(result, missing)
      const skipped = vip.length || extras.length ? { vip: vip.length, extras: extras.length } : undefined
      if (!choice && (wanted.length > CONFIRM_ABOVE || (!current && skipped))) {
        this.loaded.set(key, { at: Date.now(), first, result })
        return {
          title: result.title, subscribed: false, count: 0,
          confirm: { count: wanted.length, vip: vip.length, extras: extras.length, subscribe: !current }
        }
      }
      const candidates = choice === 'future' ? [] : wanted
      const { count, pending, note } = await this.prepareAndEnqueue(
        result, candidates, result.kind === 'audio' ? { ...options, output: 'audio' } : options,
        () => {
          verifyAccount()
          if (current && !this.subs.includes(current)) throw new Error(t('subs.sourceUnavailable'))
        },
        accountMid
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
      return { title: result.title, subscribed: !current, count, note, ...(choice !== 'future' && skipped ? { skipped } : {}) }
    } finally {
      this.downloading.delete(key)
      if (episodeKey) this.downloading.delete(episodeKey)
    }
  }

  async check(id: string): Promise<Subscription[]> {
    const sub = this.subs.find((x) => x.id === id)
    if (!sub) return this.subs
    const site = siteOf(sub)
    // B站按账号检查（往下走）；其他平台各有自己的检查方式
    if (site !== 'bili') {
      const external: Record<Exclude<Site, 'bili'>, () => Promise<Subscription[]>> = { youtube: () => this.checkYoutube(sub), douyin: () => this.checkDouyin(sub) }
      return external[site]()
    }
    if (!this.accounts) return this.checkSource(sub)
    const { accountMid } = sub
    if (accountMid === undefined || ['expired', 'removed'].includes(this.accounts.status(accountMid))) return this.subs
    try {
      return await this.accounts.run(accountMid, () => this.checkSource(sub))
    } catch (e) {
      if (!(e instanceof AuthExpiredError) && this.subs.includes(sub)) {
        sub.lastError = e instanceof Error ? e.message : String(e)
        sub.lastCheck = Date.now()
        this.save()
      }
      return this.subs
    }
  }

  private async checkSource(sub: Subscription): Promise<Subscription[]> {
    const { id } = sub
    // 同一个订阅正在检查（例如添加时的检查还没完，定时检查又到了）就不再查一遍
    if (this.checking.has(id) || this.downloading.has(this.workKey(sub.input, sub.accountMid)) || !this.subs.includes(sub)) return this.subs
    let accountMid = sub.accountMid
    if (accountMid === undefined && parseInput(sub.input)?.type === 'watchlater') {
      const auth = getAuthState()
      if (!auth.loggedIn) return this.subs
      accountMid = auth.user.mid
    }
    const matchesAccount = (): boolean => {
      if (accountMid === undefined) return true
      if (this.accounts && isRetired(authScope().partition)) return false
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
      const candidates = sub.resetBaseline ? [] : [...byKey.values()].filter((item) => !item.unavailable)
      const prepared = await this.prepareAndEnqueue(r, candidates, sub.options, () => {
        if (!matchesAccount()) throw new Error(t('subs.accountChanged'))
        if (!this.subs.includes(sub)) throw new Error(t('subs.sourceUnavailable'))
      }, accountMid)
      if (prepared.count) this.emit('found', { title: sub.title, count: prepared.count, note: prepared.note })
      if (accountMid !== undefined) sub.accountMid ??= accountMid
      this.remember(sub, [...items, ...baseline, ...byKey.values()], prepared.pending)
      sub.resetBaseline = undefined
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

  /**
   * YouTube 订阅：频道和个人列表新内容在最前，从第一页往后翻到见过的为止；
   * 播放列表新视频一般加在最后、顺序也不固定，整个读一遍（最多 5000 项）再比对
   */
  private async checkYoutube(sub: Subscription): Promise<Subscription[]> {
    const { id } = sub
    if (this.checking.has(id) || this.downloading.has(this.workKey(sub.input, undefined)) || !this.subs.includes(sub)) return this.subs
    this.checking.add(id)
    try {
      const service = youtube()
      const account = service.currentAccount()
      let r = await service.parse(sub.input)
      if (!r) throw new Error(t('yt.notYoutubeLink'))
      const seen = new Set(sub.seen)
      const wasSeen = (item: MediaItem): boolean => seen.has(item.key)
      const isDownloaded = downloadedMatcher(downloadedKeys())
      let items = r.groups.flatMap((g) => g.items)
      if (r.paging?.hasMore) {
        if (parseYtInput(sub.input)?.type === 'playlist') {
          const all = await loadAllPages(r, { maxItems: YT_PLAYLIST_SCAN })
          r = all.result
          items = r.groups.flatMap((g) => g.items)
        } else if (!items.some(wasSeen)) {
          items = [...items, ...await loadHeadPages(r.paging, wasSeen)]
        }
      }
      if (!this.subs.includes(sub)) return this.subs
      const pending = sub.pending ?? []
      const retry = new Set(pending.map((item) => item.key))
      const byKey = new Map(pending.map((item) => [item.key, item]))
      for (const item of items) if (retry.has(item.key) || !(wasSeen(item) || isDownloaded(item))) byKey.set(item.key, item)
      const candidates = sub.resetBaseline ? [] : [...byKey.values()].filter((item) => !item.unavailable)
      const prepared = await this.prepareAndEnqueue(r, candidates, sub.options, () => {
        if (!this.subs.includes(sub)) throw new Error(t('subs.sourceUnavailable'))
      }, undefined, account)
      if (prepared.count) this.emit('found', { title: sub.title, count: prepared.count, note: prepared.note })
      this.remember(sub, [...items, ...byKey.values()], prepared.pending)
      sub.resetBaseline = undefined
      sub.lastNew = prepared.count
      sub.lastError = prepared.note
    } catch (e) {
      if (!this.subs.includes(sub)) return this.subs
      sub.lastError = e instanceof Error ? e.message : String(e)
    } finally {
      this.checking.delete(id)
    }
    sub.lastCheck = Date.now()
    this.save()
    return this.subs
  }

  /** 订阅自己的列表时记下现在用的账号 */
  private dyBinding(req: NewSubscription): { dyAccount?: string } {
    if (req.kind !== 'douyin' || parseDyInput(req.input)?.type !== 'self') return {}
    return { dyAccount: douyin().currentAccount() }
  }

  /**
   * 抖音订阅：博主主页、喜欢、历史新内容在最前，从第一页翻到见过的为止（置顶的不算边界）；
   * 合集和收藏夹顺序不定，限量读一遍再比对。账号被要求验证、限流或失效时这次跳过，
   * 读到一半被拒绝时整次作废，免得把没读到的当成基线
   */
  private async checkDouyin(sub: Subscription): Promise<Subscription[]> {
    const { id } = sub
    if (this.checking.has(id) || this.downloading.has(this.workKey(sub.input, undefined)) || !this.subs.includes(sub)) return this.subs
    const service = douyin()
    const account = sub.dyAccount ?? service.currentAccount()
    if (account !== undefined && service.hold(account)) return this.subs
    this.checking.add(id)
    try {
      if (account === undefined) throw new Error(t('dy.subNeedsLogin'))
      if (!service.hasAccount(account)) throw new Error(t('dy.errAccountMissing'))
      let r = await service.parse(sub.input, { account, background: true })
      if (!r) throw new Error(t('dy.badLink'))
      const seen = new Set(sub.seen)
      const wasSeen = (item: MediaItem): boolean => seen.has(item.key)
      const boundary = (item: MediaItem): boolean => !item.pinned && wasSeen(item)
      const isDownloaded = downloadedMatcher(downloadedKeys())
      let items = r.groups.flatMap((g) => g.items)
      if (r.paging?.hasMore) {
        const target = parseDyInput(sub.input)
        // 还没有任何已见记录说明现有内容也要下载，和合集一样限量读一遍
        if (!seen.size || target?.type === 'mix' || (target?.type === 'self' && target.tab === 'collection')) {
          const all = await loadAllPages(r, { maxItems: DY_SCAN })
          if (all.error) throw new Error(all.error)
          r = all.result
          items = r.groups.flatMap((g) => g.items)
        } else if (!items.some(boundary)) {
          items = [...items, ...await loadHeadPages(r.paging, boundary)]
        }
      }
      if (!this.subs.includes(sub)) return this.subs
      const pending = sub.pending ?? []
      const retry = new Set(pending.map((item) => item.key))
      const byKey = new Map(pending.map((item) => [item.key, item]))
      for (const item of items) if (retry.has(item.key) || !(wasSeen(item) || isDownloaded(item))) byKey.set(item.key, item)
      const candidates = [...byKey.values()].filter((item) => !item.unavailable)
      const prepared = await this.prepareAndEnqueue(r, candidates, sub.options, () => {
        if (!this.subs.includes(sub)) throw new Error(t('subs.sourceUnavailable'))
      }, undefined, undefined, account)
      if (prepared.count) this.emit('found', { title: sub.title, count: prepared.count, note: prepared.note })
      this.remember(sub, [...items, ...byKey.values()], prepared.pending)
      sub.lastNew = prepared.count
      sub.lastError = prepared.note
    } catch (e) {
      if (!this.subs.includes(sub)) return this.subs
      sub.lastError = e instanceof Error ? e.message : String(e)
    } finally {
      this.checking.delete(id)
    }
    sub.lastCheck = Date.now()
    this.save()
    return this.subs
  }

  private workKey(input: string, mid: number | undefined): string {
    return this.accounts ? `${mid ?? ''}:${sourceKey(input)}` : sourceKey(input)
  }

  private due(sub: Subscription): boolean {
    if (this.accounts && siteOf(sub) === 'bili') {
      if (sub.accountMid === undefined) return false
      if (['expired', 'removed'].includes(this.accounts.status(sub.accountMid))) return false
    }
    return sub.enabled && (!sub.lastCheck || Date.now() - sub.lastCheck >= sub.intervalMin * 60_000)
  }

  private async tick(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      for (const s of this.subs) {
        if (this.due(s)) {
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
