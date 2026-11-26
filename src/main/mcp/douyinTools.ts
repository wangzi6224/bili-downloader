// MCP 的抖音工具（douyin_*）：解析、批量下载、搜索、详情、评论、画质对比、登录和账号、安全验证。
// 批次、任务、设置、历史这些不分平台的工具在 tools.ts 里共用。抖音没有字幕，也没有 AI 总结
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { downloadedMatcher } from '@shared/downloaded'
import { dyVideoUrl, parseDyInput } from '@shared/douyinUrl'
import { joinList, t, translate } from '@shared/i18n'
import { DEFAULT_DY_OPTIONS, DY_ORIGINAL_QN, normalizeDyOptions, normalizeOptions } from '@shared/options'
import { siteOf } from '@shared/site'
import type { BrowserProfile, DownloadOptions, DyAccount, DyAccountsSnapshot, DyAccountState, DyOptions, MediaItem, ParseResult, Settings, TaskInfo } from '@shared/types'
import { loadAllPages } from '../bili/lists'
import type { DouyinApi } from '../douyin/api'
import { DyError, DyLoginError, DyVerifyError } from '../douyin/errors'
import { chapterPoints } from '../douyin/extras'
import { dyStreamInfo } from '../douyin/pick'
import { awemeCover, awemeItem, awemeSeconds, awemeTitle } from '../douyin/resolve'
import type { DouyinService } from '../douyin/service'
import type { DyAweme, DyComment, DyUser } from '../douyin/types'
import { optionalBool, optionalEnum, optionalInt, optionalString, optionalStrings, optionalSubdir, requireString, type Args } from './args'
import { countStatuses, invalid, joinHints, ToolError } from './format'
import { TtlCache } from './lane'
import type { ToolDefinition } from './tools'
import type { BatchHooks } from './youtubeTools'

const READ_ONLY = { readOnlyHint: true, openWorldHint: true }
const CACHE_TTL = 10 * 60_000
const MAX_ITEMS = 2000
const DEFAULT_ITEMS = 100
const MAX_INFO = 10
/** 逐个查详情，太多会超时也容易触发验证 */
const MAX_VIDEOS = 50
const MAX_TITLE = 100
/** 一次最多给这么多条评论拉回复 */
const MAX_REPLY_THREADS = 10
const MAX_WAIT = 60

export interface DouyinMcpDeps {
  service: () => DouyinService
  api: () => Pick<DouyinApi, 'searchVideos' | 'searchUsers' | 'comments' | 'replies'>
  accounts: {
    snapshot(): DyAccountsSnapshot
    select(id: string | undefined): DyAccountsSnapshot
    remove(id: string): Promise<DyAccountsSnapshot>
  }
  controller: {
    status(): DyAccountState[]
    login(): Promise<DyAccountsSnapshot>
    importBrowser(profile: string): Promise<DyAccountsSnapshot>
    listBrowsers(): BrowserProfile[]
    verify(account: string | null): Promise<DyAccountState[]>
  }
  /** 由应用弹窗问用户本人要不要移除这个账号；返回 false 表示拒绝 */
  confirmRemove: (name: string) => Promise<boolean>
  queue: { list(): TaskInfo[] }
  settings: () => Settings
  downloadedKeys: () => string[]
}

const contentNotice = (): string => t('mcpDouyin.contentNotice')

type DyBase = Omit<DownloadOptions, 'qn'> & { dy: DyOptions }

const OPTION_KEYS = ['output', 'container', 'codec_order', 'hdr', 'live_photos', 'music', 'cover', 'embed_cover', 'chapters', 'danmaku', 'danmaku_format', 'nfo']

const optionsSchema = () => ({
  type: 'object',
  description: t('mcpDouyin.optionsDesc'),
  properties: {
    output: { type: 'string', enum: ['full', 'audio', 'video'] },
    container: { type: 'string', enum: ['mp4', 'mkv'] },
    codec_order: { type: 'array', items: { type: 'string', enum: ['avc', 'hevc'] } },
    hdr: { type: 'boolean' },
    live_photos: { type: 'boolean' },
    music: { type: 'boolean' },
    cover: { type: 'boolean' },
    embed_cover: { type: 'boolean' },
    chapters: { type: 'boolean' },
    danmaku: { type: 'boolean' },
    danmaku_format: { type: 'string', enum: ['ass', 'xml', 'both'] },
    nfo: { type: 'boolean' }
  },
  additionalProperties: false
})

export function definitions(): ToolDefinition[] {
  const untrusted = t('mcpDouyin.untrusted')
  const video = { type: 'string', description: t('mcpDouyin.argVideo') }
  const wait = { type: 'integer', minimum: 0, maximum: MAX_WAIT, description: t('mcpDouyin.argWait') }
  const tool = (name: string, title: string, description: string, properties: Record<string, unknown>, annotations: Record<string, unknown>, required?: string[]): ToolDefinition => ({
    name,
    title,
    description,
    inputSchema: { type: 'object', properties, ...(required ? { required } : {}) },
    annotations
  })
  const local = { readOnlyHint: true, openWorldHint: false }
  const action = (openWorldHint: boolean, destructiveHint = false) => ({ readOnlyHint: false, destructiveHint, idempotentHint: true, openWorldHint })
  return [
    tool('douyin_get_status', t('mcpDouyin.statusTitle'), t('mcpDouyin.statusDesc'), {}, local),
    tool('douyin_parse_link', t('mcpDouyin.parseTitle'), t('mcpDouyin.parseDesc', { untrusted }), {
      url: { type: 'string', description: t('mcpDouyin.argUrl') },
      offset: { type: 'integer', minimum: 0 },
      limit: { type: 'integer', minimum: 1, maximum: 200 },
      max_items: { type: 'integer', minimum: 1, maximum: MAX_ITEMS, description: t('mcpDouyin.argMaxItems', { max: MAX_ITEMS }) },
      refresh: { type: 'boolean' }
    }, READ_ONLY, ['url']),
    tool('douyin_download_batch', t('mcpDouyin.downloadTitle'), t('mcpDouyin.downloadDesc'), {
      url: { type: 'string', description: t('mcpDouyin.argUrl') },
      ids: { type: 'array', items: { type: 'string' }, description: t('mcpDouyin.argIds') },
      all: { type: 'boolean', description: t('mcpDouyin.argAll') },
      videos: { type: 'array', items: { type: 'string' }, description: t('mcpDouyin.argVideos', { max: MAX_VIDEOS }) },
      quality: { type: 'integer', minimum: 0, description: t('mcpDouyin.argQuality') },
      original: { type: 'boolean', description: t('mcpDouyin.argOriginal') },
      options: optionsSchema(),
      subdir: { type: 'string', description: t('mcpDouyin.argSubdir') },
      skip_downloaded: { type: 'boolean' },
      request_id: { type: 'string', description: t('mcpDouyin.argRequestId') },
      title: { type: 'string', maxLength: MAX_TITLE },
      max_items: { type: 'integer', minimum: 1, maximum: MAX_ITEMS }
    }, action(true)),
    tool('douyin_search_videos', t('mcpDouyin.searchTitle'), t('mcpDouyin.searchDesc', { untrusted }), {
      query: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 30 },
      sort: { type: 'string', enum: ['relevance', 'likes', 'newest'], description: t('mcpDouyin.argSort') },
      within: { type: 'string', enum: ['day', 'week', 'half_year'], description: t('mcpDouyin.argWithin') },
      duration: { type: 'string', enum: ['short', 'medium', 'long'], description: t('mcpDouyin.argDuration') }
    }, READ_ONLY, ['query']),
    tool('douyin_search_users', t('mcpDouyin.usersTitle'), t('mcpDouyin.usersDesc', { untrusted }), {
      query: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 30 }
    }, READ_ONLY, ['query']),
    tool('douyin_get_video_info', t('mcpDouyin.infoTitle'), t('mcpDouyin.infoDesc', { max: MAX_INFO, untrusted }), {
      videos: { type: 'array', items: { type: 'string' }, maxItems: MAX_INFO }
    }, READ_ONLY, ['videos']),
    tool('douyin_get_video_comments', t('mcpDouyin.commentsTitle'), t('mcpDouyin.commentsDesc', { untrusted }), {
      video,
      offset: { type: 'integer', minimum: 0 },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      replies: { type: 'integer', minimum: 0, maximum: 20, description: t('mcpDouyin.argReplies') }
    }, READ_ONLY, ['video']),
    tool('douyin_get_download_quality', t('mcpDouyin.qualityTitle'), t('mcpDouyin.qualityDesc'), { video }, READ_ONLY, ['video']),
    tool('douyin_start_login', t('mcpDouyin.loginTitle'), t('mcpDouyin.loginDesc'), {
      method: { type: 'string', enum: ['qr', 'browser'], description: t('mcpDouyin.argMethod') },
      browser_profile_id: { type: 'string', description: t('mcpDouyin.argProfile') }
    }, action(true)),
    tool('douyin_get_login_status', t('mcpDouyin.loginStatusTitle'), t('mcpDouyin.loginStatusDesc'), {
      wait_seconds: wait,
      include_browsers: { type: 'boolean' }
    }, local),
    tool('douyin_list_accounts', t('mcpDouyin.listAccountsTitle'), t('mcpDouyin.listAccountsDesc'), {}, local),
    tool('douyin_switch_account', t('mcpDouyin.switchTitle'), t('mcpDouyin.switchDesc'), {
      account_id: { type: ['string', 'null'], description: t('mcpDouyin.argAccountNull') }
    }, action(false), ['account_id']),
    tool('douyin_logout_account', t('mcpDouyin.logoutTitle'), t('mcpDouyin.logoutDesc'), { account_id: { type: 'string' } }, action(false, true), ['account_id']),
    tool('douyin_open_verification', t('mcpDouyin.verifyTitle'), t('mcpDouyin.verifyDesc'), { wait_seconds: wait }, action(true))
  ]
}

/** 作品参数：链接、分享口令或纯数字 id */
async function videoId(service: DouyinService, input: string): Promise<string> {
  const s = input.trim()
  if (/^\d{15,21}$/.test(s)) return s
  if (parseDyInput(s)) {
    const target = await service.target(s)
    if (target?.type === 'video') return target.id
  }
  throw invalid(t('mcpDouyin.badVideo', { input: s.slice(0, 100) }))
}

/** 可选的枚举参数：没传时为空，传了不认识的值报错 */
function maybeEnum<T extends string>(args: Args, key: string, allowed: readonly T[]): T | undefined {
  if (args[key] === undefined || args[key] === null || args[key] === '') return undefined
  return optionalEnum(args, key, allowed, allowed[0])
}

const iso = (sec?: number): string | undefined => (sec ? new Date(sec * 1000).toISOString() : undefined)

const cut = (s: string | undefined, max: number): string | undefined => (s && s.length > max ? `${s.slice(0, max)}…` : s || undefined)

/** 选项（agent 传的 snake_case）转成下载选项 */
export function parseDyArgs(raw: unknown, base: DyBase): DyBase {
  if (raw === undefined || raw === null) return base
  if (typeof raw !== 'object' || Array.isArray(raw)) throw invalid(t('mcpDouyin.badOptions'))
  const o = raw as Record<string, unknown>
  const extra = Object.keys(o).filter((k) => !OPTION_KEYS.includes(k))
  if (extra.length) throw invalid(t('mcpDouyin.unknownOptions', { keys: extra.join(', '), allowed: OPTION_KEYS.join(', ') }))
  const bool = (k: string, fallback: boolean): boolean => (typeof o[k] === 'boolean' ? (o[k] as boolean) : fallback)
  const pick = <T extends string>(k: string, allowed: readonly T[], fallback: T): T => {
    if (o[k] === undefined) return fallback
    if (!allowed.includes(o[k] as T)) throw invalid(t('mcpDouyin.badOption', { key: k, allowed: allowed.join(' / ') }))
    return o[k] as T
  }
  const { qn: _qn, ...rest } = normalizeOptions({
    ...base,
    ...(Array.isArray(o.codec_order) ? { codecOrder: o.codec_order as DownloadOptions['codecOrder'] } : {}),
    output: pick('output', ['full', 'audio', 'video'] as const, base.output),
    container: pick('container', ['mp4', 'mkv'] as const, base.container),
    danmakuFormat: pick('danmaku_format', ['ass', 'xml', 'both'] as const, base.danmakuFormat),
    cover: bool('cover', base.cover),
    embedCover: bool('embed_cover', base.embedCover),
    chapters: bool('chapters', base.chapters),
    danmaku: bool('danmaku', base.danmaku),
    nfo: bool('nfo', base.nfo)
  })
  return { ...rest, dy: normalizeDyOptions({ hdr: bool('hdr', base.dy.hdr), live: bool('live_photos', base.dy.live), music: bool('music', base.dy.music) }) }
}

export const dyOptionsOut = (o: Omit<DownloadOptions, 'qn'>): Record<string, unknown> => ({
  output: o.output,
  container: o.container,
  codec_order: o.codecOrder.filter((c) => c !== 'av1'),
  hdr: o.dy?.hdr,
  live_photos: o.dy?.live,
  music: o.dy?.music,
  cover: o.cover,
  embed_cover: o.embedCover,
  chapters: o.chapters,
  danmaku: o.danmaku,
  danmaku_format: o.danmakuFormat,
  nfo: o.nfo
})

const accountOut = (a: DyAccount, current: string | undefined) => ({
  account_id: a.id,
  name: a.name,
  handle: a.handle,
  status: a.status,
  current: a.id === current
})

const authorOut = (a: DyAweme) =>
  a.author && { name: a.author.nickname, sec_uid: a.author.sec_uid, url: a.author.sec_uid ? `https://www.douyin.com/user/${a.author.sec_uid}` : undefined }

function summary(a: DyAweme) {
  return {
    id: a.aweme_id,
    url: dyVideoUrl(a.aweme_id),
    title: awemeTitle(a),
    author: a.author?.nickname,
    published: iso(a.create_time),
    duration: a.images?.length ? undefined : awemeSeconds(a) || undefined,
    images: a.images?.length || undefined,
    likes: a.statistics?.digg_count,
    comments: a.statistics?.comment_count,
    favorites: a.statistics?.collect_count
  }
}

const commentOut = (c: DyComment) => ({
  id: c.cid,
  author: c.user?.nickname,
  text: cut(c.text, 2000),
  likes: c.digg_count,
  time: iso(c.create_time),
  location: c.ip_label || undefined,
  reply_count: c.reply_comment_total || undefined
})

/** 在后台等用户完成的操作（扫码登录、安全验证） */
interface Pending {
  done: boolean
  error?: string
  promise: Promise<void>
}

function start(run: () => Promise<unknown>): Pending {
  const pending: Pending = { done: false, promise: Promise.resolve() }
  pending.promise = run().then(
    () => void (pending.done = true),
    (e: unknown) => {
      pending.done = true
      pending.error = e instanceof Error ? e.message : String(e)
    }
  )
  return pending
}

export class DouyinTools {
  private lists: TtlCache<{ result: ParseResult; complete: boolean; error?: string }>
  private commentCache: TtlCache<{ items: DyComment[]; cursor: string; hasMore: boolean; total?: number }>
  private handlers: Record<string, (args: Args) => Promise<Record<string, unknown>>>
  private loggingIn?: Pending
  private verifying?: Pending
  private sleep: (ms: number) => Promise<void>

  constructor(
    private deps: DouyinMcpDeps,
    private batches: BatchHooks,
    opts: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {}
  ) {
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms).unref?.()))
    this.lists = new TtlCache(CACHE_TTL, 30, opts.now)
    this.commentCache = new TtlCache(CACHE_TTL, 30, opts.now)
    this.handlers = {
      douyin_get_status: async () => this.status(),
      douyin_parse_link: (a) => this.parseLink(a),
      douyin_download_batch: (a) => this.download(a),
      douyin_search_videos: (a) => this.searchVideos(a),
      douyin_search_users: (a) => this.searchUsers(a),
      douyin_get_video_info: (a) => this.videoInfo(a),
      douyin_get_video_comments: (a) => this.comments(a),
      douyin_get_download_quality: (a) => this.quality(a),
      douyin_start_login: (a) => this.startLogin(a),
      douyin_get_login_status: (a) => this.loginStatus(a),
      douyin_list_accounts: async () => this.listAccounts(),
      douyin_switch_account: async (a) => this.switchAccount(a),
      douyin_logout_account: (a) => this.logout(a),
      douyin_open_verification: (a) => this.openVerification(a)
    }
  }

  handles(name: string): boolean {
    return Object.hasOwn(this.handlers, name)
  }

  call(name: string, args: Args): Promise<Record<string, unknown>> {
    return this.handlers[name](args)
  }

  private get svc(): DouyinService {
    return this.deps.service()
  }

  private account(): string | null {
    return this.deps.accounts.snapshot().current ?? null
  }

  private current(): DyAccount | undefined {
    const snap = this.deps.accounts.snapshot()
    return snap.accounts.find((a) => a.id === snap.current)
  }

  private states() {
    return this.deps.controller.status().map((s) => ({ account_id: s.account, state: s.state, until: s.until ? new Date(s.until).toISOString() : undefined }))
  }

  private status() {
    const s = this.deps.settings().douyin
    const current = this.current()
    const tasks = this.deps.queue.list().filter((task) => siteOf(task) === 'douyin')
    const counts = countStatuses(tasks)
    const states = this.states()
    const hints: string[] = []
    if (!current) hints.push(t('mcpDouyin.hintNoLogin'))
    else if (current.status === 'expired') hints.push(t('mcpDouyin.hintExpired'))
    if (states.some((x) => x.state === 'verify')) hints.push(t('mcpDouyin.hintVerify'))
    if (states.some((x) => x.state === 'cooling')) hints.push(t('mcpDouyin.hintCooling'))
    if (counts.waiting_auth) hints.push(t('mcpDouyin.hintWaitingAuth', { count: counts.waiting_auth }))
    return {
      login: current ? { logged_in: current.status !== 'expired', account_id: current.id, name: current.name, handle: current.handle } : { logged_in: false },
      account_states: states,
      queue: { total: tasks.length, ...counts },
      download_dir: s.downloadDir,
      settings: { concurrency: s.concurrency, default_quality: s.defaultQn >= DY_ORIGINAL_QN ? 'original' : s.defaultQn || 'best' },
      hint: joinHints(hints)
    }
  }

  /** 解析链接并翻页（缓存 10 分钟），最多 maxItems 条 */
  private loadList(url: string, maxItems: number, refresh: boolean) {
    const key = `${this.account() ?? ''}\n${url}\n${maxItems}`
    if (refresh) this.lists.delete(key)
    return this.lists.get(key, async () => {
      const r = await this.svc.parse(url)
      if (!r) throw invalid(t('mcpDouyin.notDouyin', { url: url.slice(0, 200) }))
      // 请求节奏由抖音的限速队列控制，这里不用再等
      return loadAllPages({ ...r, input: url }, { maxItems, interval: 0 })
    })
  }

  private async parseLink(args: Args) {
    const url = requireString(args, 'url')
    const maxItems = optionalInt(args, 'max_items', 1, MAX_ITEMS, DEFAULT_ITEMS)
    const offset = optionalInt(args, 'offset', 0, MAX_ITEMS, 0)
    const limit = optionalInt(args, 'limit', 1, 200, 50)
    const p = await this.loadList(url, maxItems, optionalBool(args, 'refresh', false))
    const items = p.result.groups.flatMap((g) => g.items)
    const isDownloaded = downloadedMatcher(this.deps.downloadedKeys())
    const queued = new Set(this.deps.queue.list().filter((task) => task.status !== 'done').map((task) => task.item.key))
    const next = offset + limit < items.length ? offset + limit : null
    const hints: string[] = []
    if (p.error) hints.push(t('mcpTools.pageError', { error: p.error, count: items.length }))
    else if (!p.complete) hints.push(t('mcpDouyin.truncated', { count: items.length }))
    if (p.result.note) hints.push(p.result.note)
    if (next !== null) hints.push(t('mcpTools.moreItems', { next }))
    return {
      content_notice: contentNotice(),
      title: p.result.title,
      author: p.result.owner,
      total: p.result.paging?.total || items.length,
      fetched: items.length,
      complete: p.complete && !p.result.note,
      offset,
      limit,
      next_offset: next,
      items: items.slice(offset, offset + limit).map((i) => ({
        id: i.dyId,
        index: i.index,
        title: i.title,
        author: i.owner,
        duration: i.duration,
        images: i.images,
        published: iso(i.pubdate),
        unavailable: i.unavailable,
        downloaded: isDownloaded(i) || undefined,
        queued: queued.has(i.key) || undefined
      })),
      hint: joinHints(hints)
    }
  }

  private batchArgs(args: Args) {
    const s = this.deps.settings().douyin
    const quality = optionalBool(args, 'original', false) ? DY_ORIGINAL_QN : optionalInt(args, 'quality', 0, 10000, s.defaultQn)
    const base: DyBase = { ...s.defaults, dy: { ...DEFAULT_DY_OPTIONS, ...s.defaults.dy } }
    const opts = parseDyArgs(args.options, base)
    return {
      dir: s.downloadDir,
      options: { ...opts, qn: quality } as DownloadOptions,
      subdir: optionalSubdir(args, 'subdir'),
      skipDownloaded: optionalBool(args, 'skip_downloaded', true),
      requestId: optionalString(args, 'request_id')
    }
  }

  private async download(args: Args) {
    const videos = optionalStrings(args, 'videos')
    const { dir, options, subdir, skipDownloaded, requestId } = this.batchArgs(args)
    const account = this.account()

    let items: MediaItem[] = []
    let title: string
    let cover = ''
    let url = ''
    let meta: ParseResult['meta']
    let unknown: string[] = []
    let lookupFailed = 0
    let fingerprintBase: unknown
    if (videos) {
      for (const key of ['url', 'ids', 'all', 'max_items']) {
        if (args[key] !== undefined && args[key] !== null) throw invalid(t('mcpTools.videosWith', { key }))
      }
      const unique = [...new Set(videos)]
      if (unique.length > MAX_VIDEOS) throw invalid(t('mcpTools.videosTooMany', { max: MAX_VIDEOS }))
      const custom = optionalString(args, 'title')
      if (custom && custom.length > MAX_TITLE) throw invalid(t('mcpTools.titleTooLong', { max: MAX_TITLE }))
      const ids: string[] = []
      let lookupError: unknown
      for (const v of unique) {
        let id: string
        try {
          id = await videoId(this.svc, v)
        } catch (e) {
          // 展开短链时断网了不是链接认不出
          if (e instanceof DyError) throw e
          unknown.push(v)
          continue
        }
        if (ids.includes(id)) continue
        ids.push(id)
        try {
          items.push(awemeItem(await this.svc.aweme(id), items.length + 1))
        } catch (e) {
          // 要登录、要验证时后面的也会失败，直接报出来
          if (e instanceof DyLoginError || e instanceof DyVerifyError) throw e
          lookupError = e
          lookupFailed++
        }
      }
      if (!ids.length) throw invalid(t('mcpTools.videosNone', { examples: joinList(unknown.slice(0, 3)) }))
      // 一个都没查到时报查询失败的原因
      if (!items.length) throw lookupError
      // 多个作品合成的批次用固定的中文标题（命名变量和去重指纹的一部分，不随界面语言变）
      title = custom ?? (items.length === 1 ? items[0].title : translate('zh-CN', 'mcpTools.videosTitle', { count: items.length }))
      cover = items[0]?.cover ?? ''
      fingerprintBase = ['dy-videos', [...ids].sort(), title]
    } else {
      url = requireString(args, 'url')
      if (!parseDyInput(url)) throw invalid(t('mcpDouyin.notDouyin', { url: url.slice(0, 200) }))
      const ids = optionalStrings(args, 'ids')
      const all = optionalBool(args, 'all', false)
      if (ids && all) throw invalid(t('mcpTools.idsAndAll'))
      const maxItems = optionalInt(args, 'max_items', 1, MAX_ITEMS, DEFAULT_ITEMS)
      const p = await this.loadList(url, maxItems, false)
      const r = p.result
      const listed = r.groups.flatMap((g) => g.items)
      if (ids) {
        const byId = new Map(listed.flatMap((i) => [[i.key, i], [i.dyId!, i]] as [string, MediaItem][]))
        items = [...new Set(ids)].map((id) => byId.get(id)).filter((i): i is MediaItem => Boolean(i))
        unknown = ids.filter((id) => !byId.has(id))
        if (!items.length) throw invalid(t('mcpTools.idsNone', { examples: joinList(unknown.slice(0, 3)) }))
      } else if (all) {
        items = listed
      } else if (r.paging) {
        throw invalid(t('mcpDouyin.pagedList', { total: r.paging.total || listed.length }))
      } else {
        const def = new Set(r.defaultSelected)
        items = listed.filter((i) => def.has(i.key))
      }
      title = r.title
      cover = r.cover
      meta = r.meta
      fingerprintBase = [url, ids ? [...ids].sort() : all]
    }
    const fingerprint = createHash('sha256').update(JSON.stringify([fingerprintBase, options, subdir, skipDownloaded, account])).digest('hex')
    const dup = this.batches.findDuplicate(requestId, fingerprint)
    if (dup) return this.batches.deduplicated(dup)

    const isDownloaded = downloadedMatcher(this.deps.downloadedKeys())
    const ready = items.filter((i) => !i.unavailable)
    const unavailable = items.length - ready.length + lookupFailed
    const fresh = skipDownloaded ? ready.filter((i) => !isDownloaded(i)) : ready
    const downloaded = ready.length - fresh.length
    const notes: string[] = []
    if (unknown.length) notes.push(t('mcpTools.unknownIds', { count: unknown.length }))
    if (lookupFailed) notes.push(t('mcpDouyin.lookupFailed', { count: lookupFailed }))
    if (!fresh.length) {
      return {
        batch_id: null,
        title,
        selected: 0,
        skipped: { downloaded, unavailable },
        unknown_ids: unknown.length ? unknown : undefined,
        hint: downloaded ? t('mcpTools.allDownloaded') : t('mcpTools.nothingToDownload')
      }
    }
    const out = this.batches.submit({
      requestId,
      fingerprint,
      url,
      title,
      cover,
      kind: 'douyin',
      meta,
      options,
      dir: subdir ? join(dir, subdir) : dir,
      items: fresh,
      skipDownloaded,
      skipped: { downloaded, unavailable },
      dyAccount: account ?? undefined
    })
    notes.push(t('mcpTools.checkProgress', { id: String(out.batch_id) }))
    return { ...out, unknown_ids: unknown.length ? unknown : undefined, logged_in: Boolean(account), hint: joinHints(notes) }
  }

  private async searchVideos(args: Args) {
    const query = requireString(args, 'query')
    const limit = optionalInt(args, 'limit', 1, 30, 10)
    const sort = optionalEnum(args, 'sort', ['relevance', 'likes', 'newest'] as const, 'relevance')
    const within = maybeEnum(args, 'within', ['day', 'week', 'half_year'] as const)
    const duration = maybeEnum(args, 'duration', ['short', 'medium', 'long'] as const)
    const filter = {
      sort: ({ relevance: 0, likes: 1, newest: 2 } as const)[sort],
      within: within && ({ day: 1, week: 7, half_year: 180 } as const)[within],
      duration: duration && ({ short: '0-1', medium: '1-5', long: '5-10000' } as const)[duration]
    }
    const account = this.account()
    const found = new Map<string, DyAweme>()
    let offset = 0
    let searchId: string | undefined
    while (found.size < limit) {
      const page = await this.deps.api().searchVideos(query, { offset, searchId }, filter, { account })
      for (const a of page.items) found.set(a.aweme_id, a)
      const next = Number(page.cursor)
      if (!page.hasMore || !(next > offset)) break
      offset = next
      searchId = page.searchId
    }
    const videos = [...found.values()].slice(0, limit)
    this.svc.remember(videos)
    return { content_notice: contentNotice(), query, sort, count: videos.length, videos: videos.map(summary), hint: t('mcpDouyin.searchHint') }
  }

  private async searchUsers(args: Args) {
    const query = requireString(args, 'query')
    const limit = optionalInt(args, 'limit', 1, 30, 10)
    const account = this.account()
    const found = new Map<string, DyUser>()
    let offset = 0
    while (found.size < limit) {
      const page = await this.deps.api().searchUsers(query, offset, { account })
      for (const u of page.items) found.set(u.sec_uid!, u)
      const next = Number(page.cursor)
      if (!page.hasMore || !(next > offset)) break
      offset = next
    }
    const users = [...found.values()].slice(0, limit)
    return {
      content_notice: contentNotice(),
      query,
      count: users.length,
      users: users.map((u) => ({
        sec_uid: u.sec_uid,
        name: u.nickname,
        handle: u.unique_id || u.short_id,
        url: `https://www.douyin.com/user/${u.sec_uid}`,
        followers: u.follower_count,
        works: u.aweme_count,
        verified: u.custom_verify || u.enterprise_verify_reason || undefined,
        description: cut(u.signature, 300)
      })),
      hint: t('mcpDouyin.usersHint')
    }
  }

  private async videoInfo(args: Args) {
    const list = optionalStrings(args, 'videos')
    if (!list?.length) throw invalid(t('mcpDouyin.videosRequired'))
    if (list.length > MAX_INFO) throw invalid(t('mcpDouyin.tooManyVideos', { max: MAX_INFO }))
    const videos: Record<string, unknown>[] = []
    const failed: { video: string; error: string }[] = []
    for (const v of list) {
      try {
        const a = await this.svc.aweme(await videoId(this.svc, v))
        videos.push({
          ...summary(a),
          author: authorOut(a),
          shares: a.statistics?.share_count,
          description: cut(a.desc, list.length === 1 ? 5000 : 800),
          tags: a.text_extra?.flatMap((x) => (x.hashtag_name ? [x.hashtag_name] : [])).slice(0, 20),
          music: a.music?.title,
          cover: awemeCover(a),
          chapters: a.images?.length ? undefined : chapterPoints(a).map((c) => ({ start: c.from, title: c.content })),
          qualities: dyStreamInfo(a).qualities.map((q) => (q.qn >= DY_ORIGINAL_QN ? 'original' : q.qn)),
          collection: a.mix_info?.mix_id
            ? { id: a.mix_info.mix_id, name: a.mix_info.mix_name, url: `https://www.douyin.com/collection/${a.mix_info.mix_id}` }
            : undefined
        })
      } catch (e) {
        // 要登录、要验证时后面的也会失败
        if (e instanceof DyLoginError || e instanceof DyVerifyError) throw e
        failed.push({ video: v, error: e instanceof Error ? e.message : String(e) })
      }
    }
    return { content_notice: contentNotice(), videos, failed: failed.length ? failed : undefined }
  }

  private async comments(args: Args) {
    const id = await videoId(this.svc, requireString(args, 'video'))
    const offset = optionalInt(args, 'offset', 0, 1000, 0)
    const limit = optionalInt(args, 'limit', 1, 100, 20)
    const replies = optionalInt(args, 'replies', 0, 20, 0)
    const account = this.account()
    const wanted = offset + limit
    const all = await this.commentCache.get(`${account ?? ''}\n${id}\n${wanted}`, async () => {
      const items: DyComment[] = []
      let cursor = ''
      let hasMore = true
      let total: number | undefined
      while (hasMore && items.length < wanted) {
        const page = await this.deps.api().comments(id, cursor, { account })
        items.push(...page.items)
        total ??= page.total
        hasMore = page.hasMore && page.items.length > 0 && page.cursor !== cursor
        cursor = page.cursor
      }
      return { items, cursor, hasMore, total }
    })
    const hints: string[] = []
    const out: Record<string, unknown>[] = []
    let threads = 0
    let stopped = false
    for (const c of all.items.slice(offset, wanted)) {
      const row: Record<string, unknown> = commentOut(c)
      if (replies && c.reply_comment_total && account !== null && !stopped && threads < MAX_REPLY_THREADS) {
        threads++
        try {
          const page = await this.deps.api().replies(id, c.cid, '', { account })
          row.replies = page.items.slice(0, replies).map(commentOut)
        } catch (e) {
          // 回复接口最容易弹验证：拿到的先返回，剩下的不再试
          stopped = true
          hints.push(t('mcpDouyin.repliesStopped', { error: e instanceof Error ? e.message : String(e) }))
        }
      }
      out.push(row)
    }
    if (replies && account === null) hints.push(t('mcpDouyin.repliesNeedLogin'))
    return {
      content_notice: contentNotice(),
      id,
      total: all.total,
      offset,
      next_offset: all.hasMore || all.items.length > wanted ? wanted : null,
      comments: out,
      hint: joinHints(hints)
    }
  }

  private async quality(args: Args) {
    const id = await videoId(this.svc, requireString(args, 'video'))
    const snap = this.deps.accounts.snapshot()
    const targets: { account_id: string | null; name?: string }[] = [
      { account_id: null },
      ...snap.accounts.filter((a) => a.status !== 'expired').map((a) => ({ account_id: a.id, name: a.name }))
    ]
    const results = []
    for (const target of targets) {
      try {
        const a = await this.svc.aweme(id, { account: target.account_id, fresh: true })
        const q = dyStreamInfo(a).qualities.filter((x) => x.qn < DY_ORIGINAL_QN)
        results.push({ ...target, max: q[0]?.qn ?? null, qualities: q.map((x) => x.qn), share_page: a.fromShare || undefined })
      } catch (e) {
        results.push({ ...target, error: e instanceof Error ? e.message : String(e) })
      }
    }
    return { id, results, hint: t('mcpDouyin.qualityHint') }
  }

  private browsers(profiles: BrowserProfile[]) {
    return profiles.map((p) => ({ id: p.id, browser: p.browser, profile: p.profile, has_douyin_login: p.hasBiliLogin, locked: p.locked, blocked: p.blocked }))
  }

  private async startLogin(args: Args) {
    const method = optionalEnum(args, 'method', ['qr', 'browser'] as const, 'qr')
    if (method === 'qr') {
      if (!this.loggingIn || this.loggingIn.done) this.loggingIn = start(() => this.deps.controller.login())
      return { started: true, hint: t('mcpDouyin.loginStarted') }
    }
    const wanted = optionalString(args, 'browser_profile_id')
    const profiles = this.deps.controller.listBrowsers()
    const usable = profiles.filter((p) => p.hasBiliLogin && !p.appBoundLogin && !p.blocked && !p.locked)
    const profile = wanted ? profiles.find((p) => p.id === wanted) : usable[0]
    if (!profile) {
      return { imported: false, browsers: this.browsers(profiles), hint: t(wanted ? 'mcpDouyin.profileNotFound' : 'mcpDouyin.noBrowserLogin') }
    }
    const snap = await this.deps.controller.importBrowser(profile.id)
    // 之前扫码失败的原因不再有意义
    if (this.loggingIn?.done) this.loggingIn = undefined
    const account = snap.accounts.find((a) => a.id === snap.current)
    return { imported: true, account: account && accountOut(account, snap.current), hint: t('mcpDouyin.loginDone') }
  }

  private async wait(pending: Pending | undefined, seconds: number): Promise<void> {
    if (pending && !pending.done && seconds) await Promise.race([pending.promise, this.sleep(seconds * 1000)])
  }

  private async loginStatus(args: Args) {
    await this.wait(this.loggingIn, optionalInt(args, 'wait_seconds', 0, MAX_WAIT, 0))
    const current = this.current()
    return {
      logged_in: Boolean(current && current.status !== 'expired'),
      account: current ? accountOut(current, current.id) : null,
      login_window_open: Boolean(this.loggingIn && !this.loggingIn.done),
      login_error: this.loggingIn?.error,
      browsers: optionalBool(args, 'include_browsers', false) ? this.browsers(this.deps.controller.listBrowsers()) : undefined
    }
  }

  private listAccounts() {
    const snap = this.deps.accounts.snapshot()
    return { current_account_id: snap.current ?? null, accounts: snap.accounts.map((a) => accountOut(a, snap.current)) }
  }

  private findAccount(id: string): DyAccount {
    const account = this.deps.accounts.snapshot().accounts.find((a) => a.id === id)
    if (!account) throw new ToolError('NOT_FOUND', t('mcpDouyin.accountNotFound'), t('mcpDouyin.listAccountsHint'))
    return account
  }

  private switchAccount(args: Args) {
    const raw = args.account_id
    if (raw !== null && typeof raw !== 'string') throw invalid(t('mcpDouyin.accountIdRequired'))
    if (raw !== null) this.findAccount(raw)
    this.deps.accounts.select(raw ?? undefined)
    return this.listAccounts()
  }

  private async logout(args: Args) {
    const account = this.findAccount(requireString(args, 'account_id'))
    // 移除会删掉这个账号的登录：只凭 AI 助手的请求不行（它读到的评论可能含有注入的指令），要用户本人确认
    if (!(await this.deps.confirmRemove(account.name))) return { removed: false, hint: t('mcpDouyin.logoutDeclined') }
    await this.deps.accounts.remove(account.id)
    return { removed: true, ...this.listAccounts() }
  }

  private async openVerification(args: Args) {
    const needed = this.deps.controller.status().find((s) => s.state === 'verify')
    if (!this.verifying || this.verifying.done) {
      if (!needed) return { needed: false, hint: t('mcpDouyin.verifyNone') }
      this.verifying = start(() => this.deps.controller.verify(needed.account))
    }
    await this.wait(this.verifying, optionalInt(args, 'wait_seconds', 0, MAX_WAIT, 0))
    const done = this.verifying.done && !this.verifying.error
    return {
      needed: true,
      completed: done,
      error: this.verifying.error,
      account_states: this.states(),
      hint: t(done ? 'mcpDouyin.verifyDone' : this.verifying.error ? 'mcpDouyin.verifyHint' : 'mcpDouyin.verifyStarted')
    }
  }
}
