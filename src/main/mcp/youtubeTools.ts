// MCP 的 YouTube 工具（youtube_*）：解析、批量下载、搜索、详情、字幕、评论、画质对比、登录和账号、组件更新。
// 批次、任务、设置、历史这些不分平台的工具在 tools.ts 里共用
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { joinList, t, translate } from '@shared/i18n'
import { normalizeOptions, normalizeYtOptions } from '@shared/options'
import { siteOf, ytKey, ytWatchUrl } from '@shared/site'
import type { BrowserProfile, DownloadOptions, MediaItem, ParseResult, Settings, TaskInfo, YtAccount, YtAccountsSnapshot, YtEngineStatus, YtOptions } from '@shared/types'
import { parseYtInput, ytTargetUrl } from '@shared/ytUrl'
import { downloadedMatcher } from '@shared/downloaded'
import { loadAllPages } from '../bili/lists'
import { ytStreamInfo } from '../youtube/pick'
import { thumbOf } from '../youtube/resolve'
import { fetchComments, fetchTranscript, search, type SearchSort } from '../youtube/lookup'
import type { YoutubeService } from '../youtube/service'
import type { YtVideoInfo } from '../youtube/types'
import { optionalBool, optionalEnum, optionalInt, optionalString, optionalStrings, optionalSubdir, requireString, type Args } from './args'
import type { Batch, NewBatch } from './batches'
import { countStatuses, joinHints, ToolError, invalid } from './format'
import { Lane, TtlCache } from './lane'
import type { ToolDefinition } from './tools'

const READ_ONLY = { readOnlyHint: true, openWorldHint: true }
const CACHE_TTL = 10 * 60_000
const MAX_ITEMS = 5000
const DEFAULT_ITEMS = 200
const MAX_INFO = 20
const MAX_VIDEOS = 200
const MAX_TITLE = 100

export interface YoutubeMcpDeps {
  service: () => YoutubeService
  engine: { status(): YtEngineStatus; ensure(): Promise<string>; checkUpdate(force?: boolean): Promise<YtEngineStatus> }
  accounts: {
    snapshot(): YtAccountsSnapshot
    select(id: string | undefined): void
    check(id: string): Promise<YtAccount>
    remove(id: string): void
  }
  listBrowsers: () => BrowserProfile[]
  importBrowser: (id: string) => Promise<YtAccount>
  /** 由应用弹窗问用户本人要不要移除这个账号；返回 false 表示拒绝 */
  confirmRemove: (name: string) => Promise<boolean>
  queue: { list(): TaskInfo[] }
  settings: () => Settings
  downloadedKeys: () => string[]
  proxy: () => Promise<string>
}

/** McpTools 里的批次管理，YouTube 的批次和 B站的放在一起，查进度、暂停等工具共用 */
export interface BatchHooks {
  findDuplicate(requestId: string | undefined, fingerprint: string): Batch | undefined
  submit(n: NewBatch): Record<string, unknown>
  deduplicated(b: Batch): Record<string, unknown>
}

const contentNotice = (): string => t('mcpYoutube.contentNotice')

const optionsSchema = () => ({
  type: 'object',
  description: t('mcpYoutube.optionsDesc'),
  properties: {
    output: { type: 'string', enum: ['full', 'audio', 'video'] },
    container: { type: 'string', enum: ['mp4', 'mkv', 'webm'] },
    codec_order: { type: 'array', items: { type: 'string', enum: ['avc', 'vp9', 'av1'] } },
    audio: { type: 'string', enum: ['best', 'opus', 'aac'] },
    hdr: { type: 'boolean' },
    subtitles: { type: 'boolean', description: t('mcpYoutube.optSubtitles') },
    embed_subtitles: { type: 'boolean' },
    subtitle_langs: { type: 'array', items: { type: 'string' }, description: t('mcpYoutube.optSubtitleLangs') },
    auto_subs: { type: 'boolean', description: t('mcpYoutube.optAutoSubs') },
    cover: { type: 'boolean' },
    embed_cover: { type: 'boolean' },
    chapters: { type: 'boolean' },
    sponsorblock: { type: 'boolean', description: t('mcpYoutube.optSponsorblock') },
    nfo: { type: 'boolean' }
  },
  additionalProperties: false
})

export function definitions(): ToolDefinition[] {
  const untrusted = t('mcpYoutube.untrusted')
  const video = { type: 'string', description: t('mcpYoutube.argVideo') }
  return [
    {
      name: 'youtube_get_status',
      title: t('mcpYoutube.statusTitle'),
      description: t('mcpYoutube.statusDesc'),
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    {
      name: 'youtube_parse_link',
      title: t('mcpYoutube.parseTitle'),
      description: t('mcpYoutube.parseDesc', { untrusted }),
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: t('mcpYoutube.argUrl') },
          offset: { type: 'integer', minimum: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 500 },
          max_items: { type: 'integer', minimum: 1, maximum: MAX_ITEMS, description: t('mcpYoutube.argMaxItems', { max: MAX_ITEMS }) },
          refresh: { type: 'boolean' }
        },
        required: ['url']
      },
      annotations: READ_ONLY
    },
    {
      name: 'youtube_download_batch',
      title: t('mcpYoutube.downloadTitle'),
      description: t('mcpYoutube.downloadDesc'),
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: t('mcpYoutube.argUrl') },
          ids: { type: 'array', items: { type: 'string' }, description: t('mcpYoutube.argIds') },
          all: { type: 'boolean', description: t('mcpYoutube.argAll') },
          videos: { type: 'array', items: { type: 'string' }, description: t('mcpYoutube.argVideos', { max: MAX_VIDEOS }) },
          quality: { type: 'integer', minimum: 0, description: t('mcpYoutube.argQuality') },
          options: optionsSchema(),
          subdir: { type: 'string', description: t('mcpYoutube.argSubdir') },
          skip_downloaded: { type: 'boolean' },
          request_id: { type: 'string', description: t('mcpYoutube.argRequestId') },
          title: { type: 'string', maxLength: MAX_TITLE },
          max_items: { type: 'integer', minimum: 1, maximum: MAX_ITEMS }
        }
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    {
      name: 'youtube_search_videos',
      title: t('mcpYoutube.searchTitle'),
      description: t('mcpYoutube.searchDesc', { untrusted }),
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 50 },
          sort: { type: 'string', enum: ['relevance', 'date', 'views', 'rating', 'duration', 'duration_asc'], description: t('mcpYoutube.argSort') },
          upload_date: { type: 'string', enum: ['hour', 'today', 'week', 'month', 'year'] },
          duration: { type: 'string', enum: ['short', 'medium', 'long'], description: t('mcpYoutube.argDuration') }
        },
        required: ['query']
      },
      annotations: READ_ONLY
    },
    {
      name: 'youtube_search_channels',
      title: t('mcpYoutube.channelsTitle'),
      description: t('mcpYoutube.channelsDesc', { untrusted }),
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 50 } },
        required: ['query']
      },
      annotations: READ_ONLY
    },
    {
      name: 'youtube_get_video_info',
      title: t('mcpYoutube.infoTitle'),
      description: t('mcpYoutube.infoDesc', { max: MAX_INFO, untrusted }),
      inputSchema: {
        type: 'object',
        properties: { videos: { type: 'array', items: { type: 'string' }, maxItems: MAX_INFO } },
        required: ['videos']
      },
      annotations: READ_ONLY
    },
    {
      name: 'youtube_get_video_transcript',
      title: t('mcpYoutube.transcriptTitle'),
      description: t('mcpYoutube.transcriptDesc', { untrusted }),
      inputSchema: {
        type: 'object',
        properties: {
          video,
          lang: { type: 'string', description: t('mcpYoutube.argLang') },
          offset: { type: 'integer', minimum: 0 },
          max_chars: { type: 'integer', minimum: 500, maximum: 50000 }
        },
        required: ['video']
      },
      annotations: READ_ONLY
    },
    {
      name: 'youtube_get_video_comments',
      title: t('mcpYoutube.commentsTitle'),
      description: t('mcpYoutube.commentsDesc', { untrusted }),
      inputSchema: {
        type: 'object',
        properties: {
          video,
          sort: { type: 'string', enum: ['top', 'new'] },
          offset: { type: 'integer', minimum: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
          replies: { type: 'integer', minimum: 0, maximum: 20, description: t('mcpYoutube.argReplies') }
        },
        required: ['video']
      },
      annotations: READ_ONLY
    },
    {
      name: 'youtube_get_download_quality',
      title: t('mcpYoutube.qualityTitle'),
      description: t('mcpYoutube.qualityDesc'),
      inputSchema: { type: 'object', properties: { video }, required: ['video'] },
      annotations: READ_ONLY
    },
    {
      name: 'youtube_start_login',
      title: t('mcpYoutube.loginTitle'),
      description: t('mcpYoutube.loginDesc'),
      inputSchema: { type: 'object', properties: { browser_profile_id: { type: 'string', description: t('mcpYoutube.argProfile') } } },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    {
      name: 'youtube_get_login_status',
      title: t('mcpYoutube.loginStatusTitle'),
      description: t('mcpYoutube.loginStatusDesc'),
      inputSchema: { type: 'object', properties: { include_browsers: { type: 'boolean' } } },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    {
      name: 'youtube_list_accounts',
      title: t('mcpYoutube.listAccountsTitle'),
      description: t('mcpYoutube.listAccountsDesc'),
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    {
      name: 'youtube_switch_account',
      title: t('mcpYoutube.switchTitle'),
      description: t('mcpYoutube.switchDesc'),
      inputSchema: { type: 'object', properties: { account_id: { type: ['string', 'null'], description: t('mcpYoutube.argAccountNull') } }, required: ['account_id'] },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    {
      name: 'youtube_logout_account',
      title: t('mcpYoutube.logoutTitle'),
      description: t('mcpYoutube.logoutDesc'),
      inputSchema: { type: 'object', properties: { account_id: { type: 'string' } }, required: ['account_id'] },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
    },
    {
      name: 'youtube_update_engine',
      title: t('mcpYoutube.engineTitle'),
      description: t('mcpYoutube.engineDesc'),
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    }
  ]
}

/** 可选的枚举参数：没传时为空，传了不认识的值报错 */
function maybeEnum<T extends string>(args: Args, key: string, allowed: readonly T[]): T | undefined {
  if (args[key] === undefined || args[key] === null || args[key] === '') return undefined
  return optionalEnum(args, key, allowed, allowed[0])
}

/** 截断长文本 */
function cut(s: string | null | undefined, max: number): { text: string; truncated?: true } {
  const text = s ?? ''
  return text.length > max ? { text: text.slice(0, max), truncated: true } : { text }
}

const iso = (sec?: number | null): string | undefined => (sec ? new Date(sec * 1000).toISOString() : undefined)

/** 视频参数：链接或 11 位 id */
export function videoId(input: string): string {
  const s = input.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s
  const target = parseYtInput(s)
  if (target?.type === 'video') return target.id
  if (target?.type === 'playlist' && target.video) return target.video
  throw invalid(t('mcpYoutube.badVideo', { input: s.slice(0, 100) }))
}

const timestamp = (sec: number): string => {
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`
}

/** 选项（agent 传的 snake_case）转成下载选项 */
export function parseYtArgs(raw: unknown, base: Omit<DownloadOptions, 'qn'> & { yt: YtOptions }): Omit<DownloadOptions, 'qn'> & { yt: YtOptions } {
  if (raw === undefined || raw === null) return base
  if (typeof raw !== 'object' || Array.isArray(raw)) throw invalid(t('mcpYoutube.badOptions'))
  const o = raw as Record<string, unknown>
  const bool = (k: string): boolean | undefined => (typeof o[k] === 'boolean' ? (o[k] as boolean) : undefined)
  const pick = <T extends string>(k: string, allowed: readonly T[]): T | undefined => {
    if (o[k] === undefined) return undefined
    if (!allowed.includes(o[k] as T)) throw invalid(t('mcpYoutube.badOption', { key: k, allowed: allowed.join(' / ') }))
    return o[k] as T
  }
  const known = new Set(['output', 'container', 'codec_order', 'audio', 'hdr', 'subtitles', 'embed_subtitles', 'subtitle_langs', 'auto_subs', 'cover', 'embed_cover', 'chapters', 'sponsorblock', 'nfo'])
  const extra = Object.keys(o).filter((k) => !known.has(k))
  if (extra.length) throw invalid(t('mcpYoutube.unknownOptions', { keys: extra.join(', '), allowed: [...known].join(', ') }))
  const define = <T>(v: T | undefined, fallback: T): T => (v === undefined ? fallback : v)
  const sb = bool('sponsorblock')
  const yt = normalizeYtOptions({
    ...base.yt,
    ...(o.codec_order !== undefined ? { codecOrder: o.codec_order as YtOptions['codecOrder'] } : {}),
    container: define(pick('container', ['mp4', 'mkv', 'webm'] as const), base.yt.container),
    audio: define(pick('audio', ['best', 'opus', 'aac'] as const), base.yt.audio),
    hdr: define(bool('hdr'), base.yt.hdr),
    autoSubs: define(bool('auto_subs'), base.yt.autoSubs),
    ...(o.subtitle_langs !== undefined ? { subtitleLangs: o.subtitle_langs as string[] } : {}),
    sponsorblock: sb === undefined ? base.yt.sponsorblock : sb ? 'mark' : 'off'
  })
  return {
    ...base,
    output: define(pick('output', ['full', 'audio', 'video'] as const), base.output),
    subtitle: define(bool('subtitles'), base.subtitle),
    embedSubtitle: define(bool('embed_subtitles'), base.embedSubtitle),
    cover: define(bool('cover'), base.cover),
    embedCover: define(bool('embed_cover'), base.embedCover),
    chapters: define(bool('chapters'), base.chapters),
    nfo: define(bool('nfo'), base.nfo),
    yt
  }
}

export const ytOptionsOut = (o: Omit<DownloadOptions, 'qn'>): Record<string, unknown> => ({
  output: o.output,
  container: o.yt?.container,
  codec_order: o.yt?.codecOrder,
  audio: o.yt?.audio,
  hdr: o.yt?.hdr,
  subtitles: o.subtitle,
  embed_subtitles: o.embedSubtitle,
  subtitle_langs: o.yt?.subtitleLangs,
  auto_subs: o.yt?.autoSubs,
  cover: o.cover,
  embed_cover: o.embedCover,
  chapters: o.chapters,
  sponsorblock: o.yt?.sponsorblock === 'mark',
  nfo: o.nfo
})

const accountOut = (a: YtAccount, current: string | undefined) => ({
  account_id: a.id,
  name: a.name,
  handle: a.handle,
  status: a.status,
  current: a.id === current
})

export class YoutubeTools {
  private lane: Lane
  private lists: TtlCache<{ result: ParseResult; complete: boolean; error?: string }>
  private comments: TtlCache<Awaited<ReturnType<typeof fetchComments>>>
  private handlers: Record<string, (args: Args) => Promise<Record<string, unknown>>>

  constructor(
    private deps: YoutubeMcpDeps,
    private batches: BatchHooks,
    opts: { gapMs?: number; now?: () => number } = {}
  ) {
    this.lane = new Lane({ gapMs: opts.gapMs ?? 500, timeoutMs: 180_000 })
    this.lists = new TtlCache(CACHE_TTL, 30, opts.now)
    this.comments = new TtlCache(CACHE_TTL, 30, opts.now)
    this.handlers = {
      youtube_get_status: () => this.status(),
      youtube_parse_link: (a) => this.parseLink(a),
      youtube_download_batch: (a) => this.download(a),
      youtube_search_videos: (a) => this.searchVideos(a),
      youtube_search_channels: (a) => this.searchChannels(a),
      youtube_get_video_info: (a) => this.videoInfo(a),
      youtube_get_video_transcript: (a) => this.transcript(a),
      youtube_get_video_comments: (a) => this.videoComments(a),
      youtube_get_download_quality: (a) => this.quality(a),
      youtube_start_login: (a) => this.startLogin(a),
      youtube_get_login_status: (a) => this.loginStatus(a),
      youtube_list_accounts: async () => this.listAccounts(),
      youtube_switch_account: (a) => this.switchAccount(a),
      youtube_logout_account: (a) => this.logout(a),
      youtube_update_engine: () => this.updateEngine()
    }
  }

  handles(name: string): boolean {
    return Object.hasOwn(this.handlers, name)
  }

  call(name: string, args: Args): Promise<Record<string, unknown>> {
    return this.handlers[name](args)
  }

  private get svc(): YoutubeService {
    return this.deps.service()
  }

  private async status() {
    const s = this.deps.settings()
    const engine = this.deps.engine.status()
    const snap = this.deps.accounts.snapshot()
    const current = snap.accounts.find((a) => a.id === snap.current)
    const tasks = this.deps.queue.list().filter((task) => siteOf(task) === 'youtube')
    const counts = countStatuses(tasks)
    const hints: string[] = []
    if (engine.state !== 'ready') hints.push(t('mcpYoutube.hintEngine'))
    else if (engine.latest && engine.version && engine.latest !== engine.version) hints.push(t('mcpYoutube.hintEngineUpdate'))
    if (!current) hints.push(t('mcpYoutube.hintNoLogin'))
    else if (current.status === 'expired') hints.push(t('mcpYoutube.hintExpired'))
    if (counts.waiting_auth) hints.push(t('mcpYoutube.hintWaitingAuth', { count: counts.waiting_auth }))
    return {
      engine: { state: engine.state, version: engine.version, latest: engine.latest, updating: engine.updating, message: engine.message },
      login: current ? { logged_in: current.status !== 'expired', account_id: current.id, name: current.name, handle: current.handle } : { logged_in: false },
      proxy: (await this.deps.proxy().catch(() => '')) || null,
      queue: { total: tasks.length, ...counts },
      download_dir: s.youtube.downloadDir,
      settings: { concurrency: s.youtube.concurrency, default_quality: s.youtube.defaultQn || 'best', auto_update: s.youtube.autoUpdate },
      hint: joinHints(hints)
    }
  }

  /** 解析链接并翻页（缓存 10 分钟），最多 maxItems 条 */
  private loadList(url: string, maxItems: number, refresh: boolean) {
    const key = `${this.svc.currentAccount() ?? ''}\n${url}\n${maxItems}`
    if (refresh) this.lists.delete(key)
    return this.lists.get(key, () => this.lane.run(async () => {
      const r = await this.svc.parse(url)
      if (!r) throw invalid(t('mcpYoutube.notYoutube', { url: url.slice(0, 200) }))
      return loadAllPages({ ...r, input: url }, { maxItems, interval: 300 })
    }))
  }

  private async parseLink(args: Args) {
    const url = requireString(args, 'url')
    const maxItems = optionalInt(args, 'max_items', 1, MAX_ITEMS, DEFAULT_ITEMS)
    const offset = optionalInt(args, 'offset', 0, MAX_ITEMS, 0)
    const limit = optionalInt(args, 'limit', 1, 500, 100)
    const p = await this.loadList(url, maxItems, optionalBool(args, 'refresh', false))
    const items = p.result.groups.flatMap((g) => g.items)
    const window = items.slice(offset, offset + limit)
    const isDownloaded = downloadedMatcher(this.deps.downloadedKeys())
    const queued = new Set(this.deps.queue.list().filter((task) => task.status !== 'done').map((task) => task.item.key))
    const next = offset + limit < items.length ? offset + limit : null
    const hints: string[] = []
    if (p.error) hints.push(t('mcpTools.pageError', { error: p.error, count: items.length }))
    else if (!p.complete) hints.push(t('mcpYoutube.truncated', { count: items.length }))
    if (next !== null) hints.push(t('mcpTools.moreItems', { next }))
    if (items.some((i) => i.lazy)) hints.push(t('mcpYoutube.playlistItems'))
    return {
      content_notice: contentNotice(),
      title: p.result.title,
      owner: p.result.owner,
      total: p.result.paging?.total || items.length,
      fetched: items.length,
      complete: p.complete,
      offset,
      limit,
      next_offset: next,
      items: window.map((i) => ({
        id: i.ytId ?? i.key,
        index: i.index,
        title: i.title,
        channel: i.owner,
        duration: i.duration,
        published: iso(i.pubdate),
        playlist: i.lazy ? { videos: i.pages } : undefined,
        badge: i.badge,
        unavailable: i.unavailable,
        downloaded: isDownloaded(i) || undefined,
        queued: queued.has(i.key) || undefined
      })),
      hint: joinHints(hints)
    }
  }

  private batchArgs(args: Args) {
    const s = this.deps.settings()
    const y = s.youtube
    const quality = optionalInt(args, 'quality', 0, 10000, y.defaultQn)
    const base = { ...y.defaults, yt: normalizeYtOptions(y.defaults.yt) }
    const opts = parseYtArgs(args.options, base)
    return {
      dir: y.downloadDir,
      options: { ...normalizeOptions({ ...opts }, quality), yt: opts.yt } as DownloadOptions,
      subdir: optionalSubdir(args, 'subdir'),
      skipDownloaded: optionalBool(args, 'skip_downloaded', true),
      requestId: optionalString(args, 'request_id')
    }
  }

  private async download(args: Args) {
    const videos = optionalStrings(args, 'videos')
    const { dir, options, subdir, skipDownloaded, requestId } = this.batchArgs(args)
    const outDir = subdir ? join(dir, subdir) : dir
    const account = this.svc.currentAccount()
    const isDownloaded = downloadedMatcher(this.deps.downloadedKeys())

    let items: MediaItem[]
    let title: string
    let cover = ''
    let url = ''
    let meta: ParseResult['meta']
    let unknown: string[] = []
    let fingerprintBase: unknown
    if (videos) {
      for (const key of ['url', 'ids', 'all', 'max_items']) {
        if (args[key] !== undefined && args[key] !== null) throw invalid(t('mcpTools.videosWith', { key }))
      }
      const ids: string[] = []
      const rejected: string[] = []
      for (const v of new Set(videos)) {
        try {
          ids.push(videoId(v))
        } catch {
          rejected.push(v)
        }
      }
      const unique = [...new Set(ids)]
      if (!unique.length) throw invalid(t('mcpTools.videosNone', { examples: joinList(rejected.slice(0, 3)) }))
      if (unique.length > MAX_VIDEOS) throw invalid(t('mcpTools.videosTooMany', { max: MAX_VIDEOS }))
      unknown = rejected
      const custom = optionalString(args, 'title')
      if (custom && custom.length > MAX_TITLE) throw invalid(t('mcpTools.titleTooLong', { max: MAX_TITLE }))
      // 只有一个视频时取它的标题和封面；多个时用固定的中文标题（命名变量和去重指纹的一部分，不随界面语言变）
      const only = unique.length === 1 ? await this.lane.run(() => this.svc.info(ytWatchUrl(unique[0]))) : undefined
      title = custom ?? only?.title ?? translate('zh-CN', 'mcpTools.videosTitle', { count: unique.length })
      cover = only?.thumbnail ?? ''
      items = unique.map((id, i) => ({ key: ytKey(id), kind: 'youtube' as const, title: only?.title ?? id, index: i + 1, cid: 0, ytId: id, cover: thumbOf(undefined, id), duration: only?.duration ?? undefined }))
      fingerprintBase = ['yt-videos', [...unique].sort(), title]
    } else {
      url = requireString(args, 'url')
      const target = parseYtInput(url)
      if (!target) throw invalid(t('mcpYoutube.notYoutube', { url: url.slice(0, 200) }))
      const ids = optionalStrings(args, 'ids')
      const all = optionalBool(args, 'all', false)
      if (ids && all) throw invalid(t('mcpTools.idsAndAll'))
      const maxItems = optionalInt(args, 'max_items', 1, MAX_ITEMS, DEFAULT_ITEMS)
      const p = await this.loadList(ytTargetUrl(target), maxItems, false)
      const r = p.result
      const listed = r.groups.flatMap((g) => g.items)
      if (ids) {
        const byId = new Map(listed.flatMap((i) => [[i.key, i], ...(i.ytId ? [[i.ytId, i]] : [])] as [string, MediaItem][]))
        items = [...new Set(ids)].map((id) => byId.get(id)).filter((i): i is MediaItem => Boolean(i))
        unknown = ids.filter((id) => !byId.has(id))
        if (!items.length) throw invalid(t('mcpTools.idsNone', { examples: joinList(unknown.slice(0, 3)) }))
      } else if (all) {
        items = listed
      } else if (r.paging) {
        throw invalid(t('mcpYoutube.pagedList', { total: r.paging.total || listed.length }))
      } else {
        const def = new Set(r.defaultSelected)
        items = listed.filter((i) => def.has(i.key))
      }
      title = r.title
      cover = r.cover
      meta = r.meta
      fingerprintBase = [ytTargetUrl(target), ids ? [...ids].sort() : all]
    }
    const fingerprint = createHash('sha256').update(JSON.stringify([fingerprintBase, options, subdir, skipDownloaded, account])).digest('hex')
    const dup = this.batches.findDuplicate(requestId, fingerprint)
    if (dup) return this.batches.deduplicated(dup)

    const unavailable = items.filter((i) => i.unavailable).length
    // 播放列表项先展开成视频，批次里就都是能直接下载的条目
    let ready = items.filter((i) => !i.unavailable)
    if (ready.some((i) => i.lazy)) ready = await this.lane.run(() => this.svc.expand(ready))
    const failedExpand = ready.filter((i) => i.unavailable).length
    ready = ready.filter((i) => !i.unavailable)
    const fresh = skipDownloaded ? ready.filter((i) => !isDownloaded(i)) : ready
    const downloaded = ready.length - fresh.length
    const notes: string[] = []
    if (unknown.length) notes.push(t('mcpTools.unknownIds', { count: unknown.length }))
    if (failedExpand) notes.push(t('mcpYoutube.expandFailed', { count: failedExpand }))
    if (!fresh.length) {
      return {
        batch_id: null,
        title,
        selected: 0,
        skipped: { downloaded, unavailable: unavailable + failedExpand },
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
      kind: 'youtube',
      meta,
      options,
      dir: outDir,
      items: fresh,
      skipDownloaded,
      skipped: { downloaded, unavailable: unavailable + failedExpand },
      ytAccount: account
    })
    notes.push(t('mcpTools.checkProgress', { id: String(out.batch_id) }))
    return { ...out, unknown_ids: unknown.length ? unknown : undefined, logged_in: Boolean(account), hint: joinHints(notes) }
  }

  private async searchVideos(args: Args) {
    const query = requireString(args, 'query')
    const limit = optionalInt(args, 'limit', 1, 50, 20)
    const sort = optionalEnum(args, 'sort', ['relevance', 'date', 'views', 'rating', 'duration', 'duration_asc'] as const, 'relevance')
    const uploadDate = maybeEnum(args, 'upload_date', ['hour', 'today', 'week', 'month', 'year'] as const)
    const duration = maybeEnum(args, 'duration', ['short', 'medium', 'long'] as const)
    const local = sort === 'duration' || sort === 'duration_asc'
    const entries = await this.lane.run(() =>
      search(this.svc, query, {
        limit,
        type: 'video',
        sort: local ? 'relevance' : (sort as SearchSort),
        uploadDate,
        duration
      }))
    let videos = entries.filter((e) => e.id && /^[A-Za-z0-9_-]{11}$/.test(e.id))
    if (local) videos = [...videos].sort((a, b) => ((a.duration ?? 0) - (b.duration ?? 0)) * (sort === 'duration' ? -1 : 1))
    return {
      content_notice: contentNotice(),
      query,
      sort,
      count: videos.length,
      videos: videos.map((e) => ({
        id: e.id,
        url: ytWatchUrl(e.id),
        title: e.title,
        channel: e.channel ?? e.uploader,
        channel_id: e.channel_id,
        views: e.view_count ?? undefined,
        duration: e.duration ?? undefined,
        live: e.live_status === 'is_live' || undefined,
        description: e.description ? cut(e.description, 300).text : undefined
      })),
      hint: t('mcpYoutube.searchHint')
    }
  }

  private async searchChannels(args: Args) {
    const query = requireString(args, 'query')
    const limit = optionalInt(args, 'limit', 1, 50, 10)
    const entries = await this.lane.run(() => search(this.svc, query, { limit, type: 'channel' }))
    return {
      content_notice: contentNotice(),
      query,
      count: entries.length,
      channels: entries.map((e) => ({
        channel_id: e.channel_id ?? e.id,
        name: e.channel ?? e.title,
        handle: e.uploader_id ?? undefined,
        url: e.uploader_id?.startsWith('@') ? `https://www.youtube.com/${e.uploader_id}` : e.url,
        subscribers: e.channel_follower_count ?? undefined,
        description: e.description ? cut(e.description, 300).text : undefined
      })),
      hint: t('mcpYoutube.channelsHint')
    }
  }

  private info(id: string): Promise<YtVideoInfo> {
    return this.lane.run(() => this.svc.info(ytWatchUrl(id)))
  }

  private async videoInfo(args: Args) {
    const list = optionalStrings(args, 'videos')
    if (!list?.length) throw invalid(t('mcpYoutube.videosRequired'))
    if (list.length > MAX_INFO) throw invalid(t('mcpYoutube.tooManyVideos', { max: MAX_INFO }))
    const videos: Record<string, unknown>[] = []
    const failed: { video: string; error: string }[] = []
    for (const v of list) {
      try {
        const info = await this.info(videoId(v))
        const streams = ytStreamInfo(info)
        const single = list.length === 1
        videos.push({
          id: info.id,
          url: ytWatchUrl(info.id),
          title: info.title,
          channel: info.channel ?? info.uploader,
          channel_id: info.channel_id,
          published: iso(info.timestamp ?? info.release_timestamp),
          duration: info.duration,
          views: info.view_count,
          likes: info.like_count,
          comments: info.comment_count,
          categories: info.categories ?? undefined,
          tags: info.tags?.slice(0, 20),
          live_status: info.live_status,
          availability: info.availability,
          age_limit: info.age_limit || undefined,
          description: cut(info.description, single ? 5000 : 800),
          chapters: info.chapters?.map((c) => ({ start: timestamp(c.start_time), title: c.title })),
          qualities: streams.qualities.map((q) => q.qn),
          hdr: streams.yt?.hdr || undefined,
          subtitles: streams.yt?.subtitles.map((s) => s.lang),
          auto_caption_lang: streams.yt?.autoLang
        })
      } catch (e) {
        // 认不出的、查不到的都放进 failed，其余照常返回
        failed.push({ video: v, error: e instanceof Error ? e.message : String(e) })
      }
    }
    return { content_notice: contentNotice(), videos, failed: failed.length ? failed : undefined }
  }

  private async transcript(args: Args) {
    const id = videoId(requireString(args, 'video'))
    const offset = optionalInt(args, 'offset', 0, Number.MAX_SAFE_INTEGER, 0)
    const maxChars = optionalInt(args, 'max_chars', 500, 50000, 8000)
    const info = await this.info(id)
    const manual = Object.keys(info.subtitles ?? {}).filter((l) => l !== 'live_chat')
    const autoKeys = Object.keys(info.automatic_captions ?? {})
    const want = optionalString(args, 'lang')
    const origAuto = autoKeys.find((l) => l.endsWith('-orig'))
    let lang: string | undefined
    let auto = false
    if (want) {
      lang = manual.find((l) => l === want) ?? manual.find((l) => l.startsWith(`${want}-`))
      if (!lang) {
        lang = autoKeys.find((l) => l === want) ?? autoKeys.find((l) => l.startsWith(`${want}-`))
        auto = Boolean(lang)
      }
    } else {
      lang = manual[0] ?? origAuto
      auto = !manual.length && Boolean(origAuto)
    }
    const chapters = info.chapters?.map((c) => ({ start: timestamp(c.start_time), title: c.title }))
    const available = { subtitles: manual, auto_captions: origAuto ? [origAuto.replace(/-orig$/, '')] : [] }
    if (!lang) {
      return { content_notice: contentNotice(), id, title: info.title, chapters, available, transcript: null, hint: t('mcpYoutube.noTranscript') }
    }
    const lines = await this.lane.run(() => fetchTranscript(this.svc, ytWatchUrl(id), lang!, auto))
    if (!lines?.length) {
      return { content_notice: contentNotice(), id, title: info.title, chapters, available, transcript: null, hint: t('mcpYoutube.transcriptFailed', { lang }) }
    }
    const all = lines.map((l) => `[${timestamp(l.from)}] ${l.text}`)
    let text = ''
    let end = offset
    for (; end < all.length; end++) {
      if (text && text.length + all[end].length + 1 > maxChars) break
      text += (text ? '\n' : '') + all[end]
    }
    return {
      content_notice: contentNotice(),
      id,
      title: info.title,
      lang: lang.replace(/-orig$/, ''),
      auto_generated: auto || undefined,
      chapters: offset ? undefined : chapters,
      available,
      lines: all.length,
      offset,
      next_offset: end < all.length ? end : null,
      transcript: text
    }
  }

  private async videoComments(args: Args) {
    const id = videoId(requireString(args, 'video'))
    const sort = optionalEnum(args, 'sort', ['top', 'new'] as const, 'top')
    const offset = optionalInt(args, 'offset', 0, 1000, 0)
    const limit = optionalInt(args, 'limit', 1, 100, 20)
    const replies = optionalInt(args, 'replies', 0, 20, 3)
    // 按 50 条一档取到 offset + limit，缓存起来；往后翻到这一档之外时再多取一档
    const fetched = Math.ceil((offset + limit) / 50) * 50
    const key = `${id}\n${sort}\n${replies}\n${fetched}`
    const { comments, total } = await this.comments.get(key, () =>
      this.lane.run(() => fetchComments(this.svc, ytWatchUrl(id), { sort, count: fetched, replies })))
    const roots = comments.filter((c) => c.parent === 'root')
    const byParent = new Map<string, typeof comments>()
    for (const c of comments) if (c.parent !== 'root') byParent.set(c.parent, [...(byParent.get(c.parent) ?? []), c])
    const out = (c: (typeof comments)[number]) => ({
      id: c.id,
      author: c.author,
      text: cut(c.text, 2000).text,
      likes: c.like_count,
      time: iso(c.timestamp),
      pinned: c.is_pinned || undefined,
      by_uploader: c.author_is_uploader || undefined
    })
    const page = roots.slice(offset, offset + limit)
    return {
      content_notice: contentNotice(),
      id,
      sort,
      total,
      offset,
      // 本档取满了说明后面可能还有
      next_offset: roots.length > offset + limit || roots.length >= fetched ? offset + limit : null,
      comments: page.map((c) => ({ ...out(c), replies: byParent.get(c.id)?.map(out) }))
    }
  }

  private async quality(args: Args) {
    const id = videoId(requireString(args, 'video'))
    const snap = this.deps.accounts.snapshot()
    const targets: { account_id: string | null; name?: string }[] = [
      { account_id: null },
      ...snap.accounts.filter((a) => a.status !== 'expired').map((a) => ({ account_id: a.id, name: a.name }))
    ]
    const results = []
    for (const target of targets) {
      try {
        const info = await this.lane.run(() => this.svc.info(ytWatchUrl(id), { account: target.account_id, fresh: true }))
        const q = ytStreamInfo(info).qualities
        results.push({ ...target, max: q[0]?.qn ?? null, qualities: q.map((x) => x.qn) })
      } catch (e) {
        results.push({ ...target, error: e instanceof Error ? e.message : String(e) })
      }
    }
    return { id, results, hint: t('mcpYoutube.qualityHint') }
  }

  private async startLogin(args: Args) {
    const wanted = optionalString(args, 'browser_profile_id')
    const profiles = this.deps.listBrowsers()
    const usable = profiles.filter((p) => p.hasBiliLogin && !p.appBoundLogin && !p.blocked && !p.locked)
    const profile = wanted ? profiles.find((p) => p.id === wanted) : usable[0]
    if (!profile) {
      return {
        imported: false,
        browsers: profiles.map((p) => ({ id: p.id, browser: p.browser, profile: p.profile, has_youtube_login: p.hasBiliLogin, locked: p.locked, blocked: p.blocked })),
        hint: t(wanted ? 'mcpYoutube.profileNotFound' : 'mcpYoutube.noBrowserLogin')
      }
    }
    const account = await this.deps.importBrowser(profile.id)
    return { imported: true, account: accountOut(account, account.id), hint: t('mcpYoutube.loginDone') }
  }

  private async loginStatus(args: Args) {
    const snap = this.deps.accounts.snapshot()
    const current = snap.accounts.find((a) => a.id === snap.current)
    return {
      logged_in: Boolean(current && current.status !== 'expired'),
      account: current ? accountOut(current, snap.current) : null,
      browsers: optionalBool(args, 'include_browsers', false)
        ? this.deps.listBrowsers().map((p) => ({ id: p.id, browser: p.browser, profile: p.profile, has_youtube_login: p.hasBiliLogin }))
        : undefined
    }
  }

  private listAccounts() {
    const snap = this.deps.accounts.snapshot()
    return { current_account_id: snap.current ?? null, accounts: snap.accounts.map((a) => accountOut(a, snap.current)) }
  }

  private async switchAccount(args: Args) {
    const raw = args.account_id
    if (raw !== null && typeof raw !== 'string') throw invalid(t('mcpYoutube.accountIdRequired'))
    const id = raw ?? undefined
    if (id !== undefined && !this.deps.accounts.snapshot().accounts.some((a) => a.id === id)) {
      throw new ToolError('NOT_FOUND', t('ytLogin.accountNotFound'), t('mcpYoutube.listAccountsHint'))
    }
    this.deps.accounts.select(id)
    return this.listAccounts()
  }

  private async logout(args: Args) {
    const id = requireString(args, 'account_id')
    const account = this.deps.accounts.snapshot().accounts.find((a) => a.id === id)
    if (!account) throw new ToolError('NOT_FOUND', t('ytLogin.accountNotFound'), t('mcpYoutube.listAccountsHint'))
    // 移除会删掉这个账号的登录：只凭 AI 助手的请求不行（它读到的评论、字幕可能含有注入的指令），要用户本人确认
    if (!(await this.deps.confirmRemove(account.name))) {
      return { removed: false, hint: t('mcpYoutube.logoutDeclined') }
    }
    this.deps.accounts.remove(id)
    return { removed: true, ...this.listAccounts() }
  }

  private async updateEngine() {
    const before = this.deps.engine.status()
    if (before.state !== 'ready') {
      await this.deps.engine.ensure()
      return { installed: true, ...this.deps.engine.status() }
    }
    const after = await this.deps.engine.checkUpdate(true)
    return { updated: after.version !== before.version, ...after }
  }
}
