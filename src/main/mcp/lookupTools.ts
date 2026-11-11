import { t } from '@shared/i18n'
import { parseInput, type Target } from '@shared/parseUrl'
import type { AuthState } from '@shared/types'
import type { BiliLookup, Comment, VideoDetail } from '../bili/lookup'
import type { SubtitleLine, SubtitleTrack, ViewPoint } from '../bili/subtitle'
import {
  optionalBool,
  optionalDay,
  optionalEnum,
  optionalEnums,
  optionalInt,
  optionalString,
  optionalStrings,
  requireEnum,
  requireString,
  type Args
} from './args'
import { describeError, invalid, joinHints, loginHint, stopsBatch, ToolError } from './format'
import { Lane, TtlCache } from './lane'
import type { ToolDefinition } from './tools'

/** 放在每个结果最前面：有的客户端不展示 instructions，写在响应里才可靠 */
const contentNotice = (): string => t('mcpLookup.contentNotice')

const CACHE_TTL = 10 * 60_000
const MAX_DETAILS = 100
const MAX_SUBTITLES = 20

/** numResults 到这个数就是 B站的上限，不是真实总数 */
const RESULT_CAP = 1000
const MAX_PAGE = 50
const MAX_KEYWORD = 100
const MAX_INFO = 20

const SEARCH_TAGS = 8
const INFO_TAGS = 10
const SEARCH_DESC = 120
const SIGN_LEN = 80
const SINGLE_DESC = 2000
const BATCH_DESC = 300
const BATCH_RELATED = 5
const COMMENT_LEN = 300
const SUMMARY_LEN = 2000
/** 下载时一次最多解析这么多短链和 av 号，每个都要请求接口 */
const MAX_RESOLVE = 20
const OUTLINE_MAX = 20
const CHAPTERS_MAX = 50

const ORDERS = ['totalrank', 'click', 'pubdate', 'dm', 'stow'] as const
/** 工具参数 → 搜索接口的 duration */
const DURATIONS = { under_10m: 1, '10_30m': 2, '30_60m': 3, over_60m: 4 } as const
const DURATION_NAMES = Object.keys(DURATIONS) as (keyof typeof DURATIONS)[]
const TRANSCRIPT_PARTS = ['summary', 'chapters', 'subtitle'] as const
const SORTS = ['hot', 'time'] as const

const videoUrl = (bvid: string): string => `https://www.bilibili.com/video/${bvid}`

/** 秒级时间戳 → 东八区时间，和日期筛选按北京时间理解保持一致 */
const beijing = (sec: number | undefined): string | undefined =>
  sec === undefined ? undefined : new Date((sec + 8 * 3600) * 1000).toISOString().replace(/\.\d+Z$/, '+08:00')

/** 按字符截断，不把 emoji 切成两半 */
function cut(s: string, max: number): { text: string; truncated?: true } {
  if (s.length <= max) return { text: s }
  const chars = Array.from(s)
  return chars.length <= max ? { text: s } : { text: chars.slice(0, max).join(''), truncated: true }
}

const brief = (s: string, max: number): string => {
  const c = cut(s, max)
  return c.truncated ? `${c.text}…` : c.text
}

/** 65 → 01:05，3665 → 1:01:05 */
function clock(sec: number): string {
  const t = Math.floor(sec)
  const pad = (n: number): string => String(n).padStart(2, '0')
  const h = Math.floor(t / 3600)
  const m = pad(Math.floor((t % 3600) / 60))
  return `${h ? `${h}:` : ''}${m}:${pad(t % 60)}`
}

/** 没指定语言时：人工中文、AI 中文、第一条 */
const pickTrack = (tracks: SubtitleTrack[]): SubtitleTrack =>
  tracks.find((t) => /^zh/i.test(t.lan)) ?? tracks.find((t) => /^ai-zh/i.test(t.lan)) ?? tracks[0]

const READ_ONLY = { readOnlyHint: true, openWorldHint: true }
const videoInput = (): string => t('mcpLookup.videoInput')

/** 检索类工具的定义。按当前语言现算，每次 tools/list 时调用 */
export const lookupDefinitions = (): ToolDefinition[] => {
  const untrusted = t('mcpLookup.untrusted')
  return [
    {
      name: 'search_videos',
      title: t('mcpLookup.searchVideosTitle'),
      description: t('mcpLookup.searchVideosDesc', { cap: RESULT_CAP, untrusted }),
      inputSchema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', maxLength: MAX_KEYWORD, description: t('mcpLookup.searchKeyword') },
          page: { type: 'integer', minimum: 1, maximum: MAX_PAGE, description: t('mcpLookup.searchPage') },
          limit: { type: 'integer', minimum: 1, maximum: 30, description: t('mcpLookup.searchVideosLimit') },
          order: { type: 'string', enum: ORDERS, description: t('mcpLookup.searchOrder') },
          duration: { type: 'string', enum: DURATION_NAMES, description: t('mcpLookup.searchDuration') },
          published_after: { type: 'string', description: t('mcpLookup.searchAfter') },
          published_before: { type: 'string', description: t('mcpLookup.searchBefore') }
        },
        required: ['keyword']
      },
      annotations: READ_ONLY
    },
    {
      name: 'search_users',
      title: t('mcpLookup.searchUsersTitle'),
      description: t('mcpLookup.searchUsersDesc', { untrusted }),
      inputSchema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', maxLength: MAX_KEYWORD, description: t('mcpLookup.searchUsersKeyword') },
          page: { type: 'integer', minimum: 1, maximum: MAX_PAGE, description: t('mcpLookup.searchPage') },
          limit: { type: 'integer', minimum: 1, maximum: 20, description: t('mcpLookup.searchUsersLimit') }
        },
        required: ['keyword']
      },
      annotations: READ_ONLY
    },
    {
      name: 'get_video_info',
      title: t('mcpLookup.videoInfoTitle'),
      description: t('mcpLookup.videoInfoDesc', { max: MAX_INFO, untrusted }),
      inputSchema: {
        type: 'object',
        properties: {
          videos: {
            type: 'array',
            items: { type: 'string' },
            maxItems: MAX_INFO,
            description: t('mcpLookup.videoInfoVideos', { videoInput: videoInput() })
          },
          include_related: { type: 'boolean', description: t('mcpLookup.videoInfoRelated', { n: BATCH_RELATED }) }
        },
        required: ['videos']
      },
      annotations: READ_ONLY
    },
    {
      name: 'get_video_transcript',
      title: t('mcpLookup.transcriptTitle'),
      description: t('mcpLookup.transcriptDesc', { untrusted }),
      inputSchema: {
        type: 'object',
        properties: {
          video: { type: 'string', description: videoInput() },
          page: { type: 'integer', minimum: 1, description: t('mcpLookup.transcriptPage') },
          include: { type: 'array', items: { type: 'string', enum: TRANSCRIPT_PARTS }, description: t('mcpLookup.transcriptInclude') },
          lang: { type: 'string', description: t('mcpLookup.transcriptLang') },
          offset: { type: 'integer', minimum: 0, description: t('mcpLookup.transcriptOffset') },
          max_chars: { type: 'integer', minimum: 500, maximum: 20000, description: t('mcpLookup.transcriptMaxChars') }
        },
        required: ['video']
      },
      annotations: READ_ONLY
    },
    {
      name: 'get_video_comments',
      title: t('mcpLookup.commentsTitle'),
      description: t('mcpLookup.commentsDesc', { untrusted }),
      inputSchema: {
        type: 'object',
        properties: {
          video: { type: 'string', description: videoInput() },
          sort: { type: 'string', enum: SORTS, description: t('mcpLookup.commentsSort') },
          cursor: { type: 'string', description: t('mcpLookup.commentsCursor') },
          root: { type: 'integer', minimum: 1, description: t('mcpLookup.commentsRoot') }
        },
        required: ['video']
      },
      annotations: READ_ONLY
    }
  ]
}

interface Player {
  tracks: SubtitleTrack[]
  viewPoints: ViewPoint[]
}

/** 检索类工具：结果都控制在 agent 读得下的大小，长内容分段 */
export class LookupTools {
  private lane: Lane
  private now: () => number
  private details: TtlCache<VideoDetail>
  private players: TtlCache<Player>
  private subtitles: TtlCache<SubtitleLine[]>
  private handlers: Record<string, (args: Args) => Promise<Record<string, unknown>>> = {
    search_videos: (a) => this.searchVideos(a),
    search_users: (a) => this.searchUsers(a),
    get_video_info: (a) => this.videoInfo(a),
    get_video_transcript: (a) => this.transcript(a),
    get_video_comments: (a) => this.comments(a)
  }

  constructor(
    private api: BiliLookup,
    private authState: () => Promise<AuthState>,
    opts: { now?: () => number; gapMs?: number; timeoutMs?: number } = {}
  ) {
    this.lane = new Lane(opts)
    this.now = opts.now ?? Date.now
    this.details = new TtlCache(CACHE_TTL, MAX_DETAILS, opts.now)
    this.players = new TtlCache(CACHE_TTL, MAX_DETAILS, opts.now)
    this.subtitles = new TtlCache(CACHE_TTL, MAX_SUBTITLES, opts.now)
  }

  handles(name: string): boolean {
    return Object.hasOwn(this.handlers, name)
  }

  call(name: string, args: Args): Promise<Record<string, unknown>> {
    return this.handlers[name](args)
  }

  private async videoRef(raw: string): Promise<Extract<Target, { type: 'ugc' }>> {
    const parsed = parseInput(raw)
    const target = parsed?.type === 'short' ? await this.lane.run(() => this.api.expandShort(parsed.url)) : parsed
    if (target?.type !== 'ugc') throw invalid(t('mcpLookup.notVideo', { raw, videoInput: videoInput() }))
    return target
  }

  private detail(ref: { bvid?: string; aid?: number }): Promise<VideoDetail> {
    return this.details.get(ref.bvid ?? `av${ref.aid}`, () => this.lane.run(() => this.api.fetchVideoDetail(ref)))
  }

  /** 一个 BV 号的详情，下载单个视频时取标题和封面用 */
  videoDetail(bvid: string): Promise<VideoDetail> {
    return this.detail({ bvid })
  }

  /**
   * 把下载用的视频列表换成 BV 号。带 BV 号的不用请求接口，短链和 av 号要查，排在检索通道里。
   * 查不出来的放进 rejected；风控或登录失效时接着查只会继续失败，直接抛出
   */
  async resolveBvids(list: string[]): Promise<{ bvids: string[]; rejected: string[] }> {
    const parsed = list.map((raw) => ({ raw, target: parseInput(raw) }))
    const lookups = parsed.filter(({ target: t }) => t?.type === 'short' || (t?.type === 'ugc' && !t.bvid))
    if (lookups.length > MAX_RESOLVE) throw invalid(t('mcpLookup.resolveTooMany', { max: MAX_RESOLVE }))
    const bvids: string[] = []
    const rejected: string[] = []
    for (const { raw, target } of parsed) {
      if (target?.type === 'ugc' && target.bvid) {
        bvids.push(target.bvid)
        continue
      }
      try {
        const ref = await this.videoRef(raw)
        bvids.push(ref.bvid ?? (await this.detail(ref)).bvid)
      } catch (e) {
        if (stopsBatch(e)) throw e
        rejected.push(raw)
      }
    }
    return { bvids, rejected }
  }

  private keyword(args: Args): string {
    const keyword = requireString(args, 'keyword')
    if (keyword.length > MAX_KEYWORD) throw invalid(t('mcpLookup.keywordTooLong', { max: MAX_KEYWORD }))
    return keyword
  }

  private async searchVideos(args: Args) {
    const keyword = this.keyword(args)
    const page = optionalInt(args, 'page', 1, MAX_PAGE, 1)
    const limit = optionalInt(args, 'limit', 1, 30, 10)
    const order = optionalEnum(args, 'order', ORDERS, 'totalrank')
    const duration = args.duration === undefined || args.duration === null ? undefined : requireEnum(args, 'duration', DURATION_NAMES)
    const after = optionalDay(args, 'published_after')
    const before = optionalDay(args, 'published_before')
    if (after !== undefined && before !== undefined && after > before) throw invalid(t('mcpLookup.dateOrder'))
    // 接口要同时给起止时间，结束日包含当天；起始时间是 0 时 B站会忽略整个时间筛选，所以没给时用 1
    const ranged = after !== undefined || before !== undefined
    const r = await this.lane.run(() =>
      this.api.searchVideos({
        keyword,
        page,
        pageSize: limit,
        order,
        duration: duration && DURATIONS[duration],
        pubBegin: ranged ? (after ?? 1) : undefined,
        pubEnd: ranged ? (before === undefined ? Math.floor(this.now() / 1000) : before + 86399) : undefined
      })
    )
    const hints: string[] = []
    if (r.total >= RESULT_CAP) hints.push(t('mcpLookup.totalCapped', { cap: RESULT_CAP }))
    if (r.list.length) hints.push(t('mcpLookup.downloadTip'))
    return {
      content_notice: contentNotice(),
      total: r.total,
      total_capped: r.total >= RESULT_CAP || undefined,
      page,
      next_page: page < r.pages && page < MAX_PAGE ? page + 1 : null,
      videos: r.list.map((v) => ({
        bvid: v.bvid,
        url: videoUrl(v.bvid),
        title: v.title,
        author: v.author,
        mid: v.mid,
        category: v.category,
        tags: v.tags.slice(0, SEARCH_TAGS),
        description: brief(v.description, SEARCH_DESC),
        duration: v.duration,
        pubdate: beijing(v.pubdate),
        play: v.play,
        danmaku: v.danmaku,
        favorites: v.favorites,
        like: v.like
      })),
      hint: joinHints(hints)
    }
  }

  private async searchUsers(args: Args) {
    const keyword = this.keyword(args)
    const page = optionalInt(args, 'page', 1, MAX_PAGE, 1)
    const limit = optionalInt(args, 'limit', 1, 20, 5)
    const r = await this.lane.run(() => this.api.searchUsers(keyword, page, limit))
    return {
      content_notice: contentNotice(),
      total: r.total,
      page,
      next_page: page < r.pages && page < MAX_PAGE ? page + 1 : null,
      users: r.list.map((u) => ({
        mid: u.mid,
        name: u.name,
        sign: brief(u.sign, SIGN_LEN),
        fans: u.fans,
        videos: u.videos,
        level: u.level,
        is_live: u.isLive || undefined,
        space_url: `https://space.bilibili.com/${u.mid}`
      }))
    }
  }

  private async videoInfo(args: Args) {
    const list = [...new Set(optionalStrings(args, 'videos') ?? [])]
    if (!list.length) throw invalid(t('mcpLookup.videosMissing'))
    if (list.length > MAX_INFO) throw invalid(t('mcpLookup.infoTooMany', { max: MAX_INFO }))
    const related = optionalBool(args, 'include_related', false)
    if (list.length === 1) {
      const d = await this.detail(await this.videoRef(list[0]))
      // 接口的分区名是空的，用 BV 号搜一次；拿不到也不影响其他信息
      d.category ??= await this.lane.run(() => this.api.fetchCategory(d.bvid)).catch(() => undefined)
      return { content_notice: contentNotice(), videos: [this.videoOut(d, SINGLE_DESC, related ? undefined : 0)] }
    }
    const videos: Record<string, unknown>[] = []
    const failed: Record<string, unknown>[] = []
    let i = 0
    for (; i < list.length; i++) {
      try {
        videos.push(this.videoOut(await this.detail(await this.videoRef(list[i])), BATCH_DESC, related ? BATCH_RELATED : 0))
      } catch (e) {
        const { code, message } = describeError(e)
        failed.push({ video: list[i], code, message })
        // 风控或登录失效：接着请求只会继续失败
        if (stopsBatch(e)) {
          i++
          break
        }
      }
    }
    const rest = list.slice(i)
    const hints: string[] = []
    if (rest.length) hints.push(t('mcpLookup.notAttempted', { count: rest.length }))
    if (videos.some((v) => !v.category)) hints.push(t('mcpLookup.noCategory'))
    return {
      content_notice: contentNotice(),
      videos,
      failed: failed.length ? failed : undefined,
      not_attempted: rest.length ? rest : undefined,
      hint: joinHints(hints)
    }
  }

  private videoOut(d: VideoDetail, descLen: number, relatedMax: number | undefined) {
    const desc = cut(d.description, descLen)
    return {
      bvid: d.bvid,
      aid: d.aid,
      url: videoUrl(d.bvid),
      title: d.title,
      author: d.author,
      mid: d.mid,
      category: d.category,
      tags: d.tags.slice(0, INFO_TAGS),
      description: desc.text,
      description_truncated: desc.truncated,
      pubdate: beijing(d.pubdate),
      duration: d.duration,
      part_count: d.pages.length,
      season: d.season,
      stats: d.stats,
      related:
        relatedMax === 0
          ? undefined
          : d.related.slice(0, relatedMax).map((r) => ({
              bvid: r.bvid,
              url: videoUrl(r.bvid),
              title: r.title,
              author: r.author,
              category: r.category,
              pubdate: beijing(r.pubdate),
              duration: r.duration,
              play: r.play
            }))
    }
  }

  private async transcript(args: Args) {
    const ref = await this.videoRef(requireString(args, 'video'))
    const pageNo = optionalInt(args, 'page', 1, Number.MAX_SAFE_INTEGER, ref.page ?? 1)
    const offset = optionalInt(args, 'offset', 0, Number.MAX_SAFE_INTEGER, 0)
    const maxChars = optionalInt(args, 'max_chars', 500, 20000, 6000)
    const lang = optionalString(args, 'lang')
    // 接着读字幕时不用重复总结和章节
    const parts = new Set(offset > 0 ? ['subtitle'] : (optionalEnums(args, 'include', TRANSCRIPT_PARTS) ?? TRANSCRIPT_PARTS))
    const d = await this.detail(ref)
    const part = d.pages.find((p) => p.page === pageNo)
    if (!part) throw invalid(t('mcpLookup.noSuchPart', { count: d.pages.length, page: pageNo }))
    const summary = parts.has('summary') ? await this.summary(d, part.cid) : undefined
    const hints: string[] = []
    if (summary?.truncated || summary?.outline_total) hints.push(t('mcpLookup.summaryTruncated'))
    let player: Player | undefined
    if (parts.has('chapters') || parts.has('subtitle')) {
      try {
        player = await this.player(d.bvid, part.cid)
      } catch (e) {
        hints.push(t('mcpLookup.playerFailed', { error: describeError(e).message }))
      }
    }
    const subtitle = parts.has('subtitle') && player ? await this.subtitle(player, part.cid, lang, offset, maxChars) : undefined
    if (subtitle?.status === 'none') hints.push(await this.noSubtitleHint())
    if (subtitle?.status === 'not_found') hints.push(t('mcpLookup.noSuchLang', { lang: String(lang) }))
    if (subtitle?.next_offset) hints.push(t('mcpLookup.moreSubtitle', { next: subtitle.next_offset }))
    const chapterTotal = parts.has('chapters') ? player?.viewPoints.length : undefined
    const manyChapters = chapterTotal !== undefined && chapterTotal > CHAPTERS_MAX
    if (manyChapters) hints.push(t('mcpLookup.manyChapters', { total: chapterTotal, max: CHAPTERS_MAX }))
    return {
      content_notice: contentNotice(),
      bvid: d.bvid,
      page: pageNo,
      cid: part.cid,
      title: d.title,
      part_title: d.pages.length > 1 ? part.part : undefined,
      // 章节和字幕的时间都从这一P开始算，时长也要是这一P的
      duration: part.duration ?? d.duration,
      summary,
      chapters:
        parts.has('chapters') && player
          ? player.viewPoints.slice(0, CHAPTERS_MAX).map((v) => ({ from: v.from, to: v.to, title: v.content }))
          : undefined,
      chapters_total: manyChapters ? chapterTotal : undefined,
      subtitle,
      hint: joinHints(hints)
    }
  }

  private async player(bvid: string, cid: number): Promise<Player> {
    const key = String(cid)
    const player = await this.players.get(key, () => this.lane.run(() => this.api.fetchPlayer(bvid, cid)))
    // 没登录时字幕列表是空的，不能留着：用户登录后再查要能拿到
    if (!player.tracks.length) this.players.delete(key)
    return player
  }

  /** 总结只是可选内容：拿不到时写明原因，不影响字幕和章节 */
  private async summary(d: VideoDetail, cid: number) {
    try {
      const s = await this.lane.run(() => this.api.fetchSummary(d.bvid, cid, d.mid))
      if (!s) return { status: 'none' }
      const body = cut(s.text, SUMMARY_LEN)
      return {
        status: 'ok',
        text: body.text,
        truncated: body.truncated,
        outline: s.outline.slice(0, OUTLINE_MAX),
        outline_total: s.outline.length > OUTLINE_MAX ? s.outline.length : undefined
      }
    } catch (e) {
      const { code } = describeError(e)
      return { status: code === 'NOT_LOGGED_IN' ? 'need_login' : code === 'RATE_LIMITED' ? 'rate_limited' : 'unavailable' }
    }
  }

  private async subtitle(player: Player, cid: number, lang: string | undefined, offset: number, maxChars: number) {
    const { tracks } = player
    const available = tracks.map((t) => ({ lang: t.lan, name: t.lan_doc, ai: t.lan.startsWith('ai-') }))
    if (!tracks.length) return { status: 'none', available }
    const track = lang ? tracks.find((t) => t.lan === lang) : pickTrack(tracks)
    if (!track) return { status: 'not_found', available }
    let lines: SubtitleLine[]
    try {
      lines = await this.subtitles.get(`${cid}:${track.lan}`, () =>
        this.lane.run(async () => {
          const body = await this.api.fetchSubtitleLines(track)
          if (!body) throw new ToolError('FAILED', t('mcpLookup.subtitleFailed'))
          return body
        })
      )
    } catch (e) {
      return { status: 'failed', available, lang: track.lan, error: describeError(e).message }
    }
    // 至少返回一行：只按字数截断的话，超长的一行会让 agent 一直读不到后面
    const out: string[] = []
    let used = 0
    let i = offset
    for (; i < lines.length; i++) {
      const row = `[${clock(lines[i].from)}] ${lines[i].content.trim()}`.slice(0, maxChars)
      if (out.length && used + row.length + 1 > maxChars) break
      out.push(row)
      used += row.length + 1
    }
    return {
      status: 'ok',
      available,
      lang: track.lan,
      text: out.join('\n'),
      total_lines: lines.length,
      total_chars: lines.reduce((n, l) => n + l.content.length, 0),
      offset,
      next_offset: i < lines.length ? i : null
    }
  }

  /** 字幕列表是空的不一定代表视频没有字幕：没登录时 B站不给 */
  private async noSubtitleHint(): Promise<string> {
    const auth = await this.authState().catch(() => undefined)
    return auth?.loggedIn === false ? t('mcpLookup.noSubtitleLogin', { loginHint: loginHint() }) : t('mcpLookup.noSubtitle')
  }

  /** 第一页就到头、总数却对不上：没登录时 B站只给几条；登录了就是有评论被隐藏或折叠 */
  private async partialHint(): Promise<string> {
    const auth = await this.authState().catch(() => undefined)
    return auth?.loggedIn === false
      ? t('mcpLookup.partialLogin', { loginHint: loginHint() })
      : t('mcpLookup.partialHidden')
  }

  private async comments(args: Args) {
    const ref = await this.videoRef(requireString(args, 'video'))
    const sort = optionalEnum(args, 'sort', SORTS, 'hot')
    const cursor = optionalString(args, 'cursor')
    const root = optionalInt(args, 'root', 1, Number.MAX_SAFE_INTEGER, 0)
    if (root && cursor && !/^\d+$/.test(cursor)) throw invalid(t('mcpLookup.badCursor'))
    const { aid } = await this.detail(ref)
    const page = await this.lane.run(() =>
      root ? this.api.fetchCommentReplies(aid, root, cursor ? Number(cursor) : 1) : this.api.fetchComments(aid, sort, cursor)
    )
    // all_count 含楼中楼，要算上回复数再比较；没登录时第一页就到头，但总数远多于拿到的
    const seen = page.comments.reduce((n, c) => n + 1 + c.replyCount, 0)
    const partial = !root && !cursor && page.isEnd && page.total > seen
    const hints: string[] = []
    if (partial) hints.push(await this.partialHint())
    if (page.comments.some((c) => c.replyCount > 0 && !root)) hints.push(t('mcpLookup.repliesTip'))
    return {
      content_notice: contentNotice(),
      total: page.total,
      partial: partial || undefined,
      next_cursor: page.next ?? null,
      comments: page.comments.map((c) => this.commentOut(c)),
      hint: joinHints(hints)
    }
  }

  private commentOut(c: Comment) {
    const body = cut(c.text, COMMENT_LEN)
    return {
      id: c.id,
      author: c.author,
      time: beijing(c.time),
      likes: c.likes,
      reply_count: c.replyCount || undefined,
      text: body.text,
      truncated: body.truncated,
      pinned: c.pinned
    }
  }
}
