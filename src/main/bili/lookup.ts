import { api, BiliError } from './http'
import { toSeconds } from './lists'
import { expandShort } from './resolve'
import { fetchPlayerMeta, fetchSubtitleLines } from './subtitle'

/**
 * 检索类接口：搜索、视频详情、评论、AI 总结。B站的字段集中在这里映射成干净的结构。
 * 都用 quietAuth：有的接口没登录就返回 -101，不能因此让下载队列进入等待登录
 */

const SEARCH_URL = 'https://api.bilibili.com/x/web-interface/wbi/search/type'
const DETAIL_URL = 'https://api.bilibili.com/x/web-interface/wbi/view/detail'
const REPLY_URL = 'https://api.bilibili.com/x/v2/reply/wbi/main'
const SUB_REPLY_URL = 'https://api.bilibili.com/x/v2/reply/reply'
const SUMMARY_URL = 'https://api.bilibili.com/x/web-interface/view/conclusion/get'

/** 不触发全局的登录失效；风控时不重试，由检索通道统一冷却 */
const QUIET = { quietAuth: true, noRiskRetry: true }
const WBI = { wbi: true, ...QUIET }

/** 网页版评论区的 web_location */
const REPLY_LOCATION = 1315875
const SUB_REPLY_PS = 20
const MAX_RELATED = 10

const ENTITIES = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' ']
])

/**
 * 去掉搜索结果里高亮关键词的 <em> 再解码 HTML 实体，顺序不能反：
 * 否则标题里本来写着的 &lt;em&gt; 会被当成标签删掉
 */
export function cleanText(s: string): string {
  return s.replace(/<\/?em\b[^>]*>/gi, '').replace(/&(?:#(\d+)|#x([\da-f]+)|(\w+));/gi, (raw, dec, hex, name) => {
    if (name) return ENTITIES.get(name.toLowerCase()) ?? raw
    const code = dec ? Number(dec) : parseInt(hex, 16)
    return code <= 0x10ffff ? String.fromCodePoint(code) : raw
  })
}

// ---------------- 搜索 ----------------

export interface SearchQuery {
  keyword: string
  page: number
  pageSize: number
  order?: string
  /** 1 十分钟以内、2 十到三十分钟、3 三十到六十分钟、4 六十分钟以上 */
  duration?: number
  pubBegin?: number
  pubEnd?: number
}

export interface SearchPage<T> {
  total: number
  pages: number
  list: T[]
}

interface SearchData<T> {
  v_voucher?: string
  numResults?: number
  numPages?: number
  result?: T[]
}

async function search<T>(searchType: string, params: Record<string, string | number | undefined>): Promise<SearchPage<T>> {
  const d = await api<SearchData<T>>(SEARCH_URL, { search_type: searchType, ...params }, WBI)
  // code 是 0，但只给一个人机验证的凭证、没有结果：过一会儿再试，这里不做任何绕过
  if (d.v_voucher && !d.result) throw new BiliError('B站要求人机验证，这次搜索没有结果', -412)
  return { total: d.numResults ?? 0, pages: d.numPages ?? 0, list: d.result ?? [] }
}

interface RawSearchVideo {
  bvid?: string
  title?: string
  author?: string
  mid?: number
  typename?: string
  tag?: string
  description?: string
  duration?: string
  pubdate?: number
  play?: number
  danmaku?: number
  favorites?: number
  like?: number
}

export interface SearchVideo {
  bvid: string
  title: string
  author?: string
  mid?: number
  category?: string
  tags: string[]
  description: string
  duration?: number
  pubdate?: number
  play?: number
  danmaku?: number
  favorites?: number
  like?: number
}

export async function searchVideos(q: SearchQuery): Promise<SearchPage<SearchVideo>> {
  const r = await search<RawSearchVideo>('video', {
    keyword: q.keyword,
    page: q.page,
    page_size: q.pageSize,
    order: q.order,
    duration: q.duration,
    pubtime_begin_s: q.pubBegin,
    pubtime_end_s: q.pubEnd
  })
  const list = r.list.flatMap((v): SearchVideo[] =>
    v.bvid
      ? [
          {
            bvid: v.bvid,
            title: cleanText(v.title ?? ''),
            author: v.author,
            mid: v.mid,
            category: v.typename || undefined,
            tags: (v.tag ?? '').split(',').filter(Boolean),
            description: cleanText(v.description ?? ''),
            duration: toSeconds(v.duration),
            pubdate: v.pubdate,
            play: v.play,
            danmaku: v.danmaku,
            favorites: v.favorites,
            like: v.like
          }
        ]
      : []
  )
  return { ...r, list }
}

interface RawSearchUser {
  mid: number
  uname?: string
  usign?: string
  fans?: number
  videos?: number
  level?: number
  is_live?: number
}

export interface SearchUser {
  mid: number
  name: string
  sign: string
  fans?: number
  videos?: number
  level?: number
  isLive: boolean
}

export async function searchUsers(keyword: string, page: number, pageSize: number): Promise<SearchPage<SearchUser>> {
  const r = await search<RawSearchUser>('bili_user', { keyword, page, page_size: pageSize })
  return {
    ...r,
    list: r.list.map((u) => ({
      mid: u.mid,
      name: cleanText(u.uname ?? ''),
      sign: cleanText(u.usign ?? ''),
      fans: u.fans,
      videos: u.videos,
      level: u.level,
      isLive: !!u.is_live
    }))
  }
}

/** 视频详情接口的分区名经常是空的，而用 BV 号能精确搜到这个视频、拿到分区 */
export async function fetchCategory(bvid: string): Promise<string | undefined> {
  const r = await searchVideos({ keyword: bvid, page: 1, pageSize: 3 })
  return r.list.find((v) => v.bvid === bvid)?.category
}

// ---------------- 视频详情 ----------------

interface Stat {
  view?: number
  danmaku?: number
  reply?: number
  favorite?: number
  coin?: number
  share?: number
  like?: number
}

interface RawRelated {
  bvid?: string
  title?: string
  tname?: string
  pubdate?: number
  duration?: number
  owner?: { name?: string }
  stat?: Stat
}

interface RawDetail {
  View: {
    bvid: string
    aid: number
    title: string
    pic?: string
    desc?: string
    pubdate?: number
    duration?: number
    tname?: string
    tname_v2?: string
    owner?: { mid?: number; name?: string }
    stat?: Stat
    pages?: { cid: number; page: number; part?: string; duration?: number }[]
    ugc_season?: { id: number; title: string }
  }
  Tags?: { tag_name?: string }[]
  Related?: RawRelated[]
}

export interface RelatedVideo {
  bvid: string
  title: string
  author?: string
  category?: string
  pubdate?: number
  duration?: number
  play?: number
}

export interface VideoDetail {
  bvid: string
  aid: number
  title: string
  cover?: string
  author?: string
  mid?: number
  category?: string
  tags: string[]
  description: string
  pubdate?: number
  duration?: number
  pages: { cid: number; page: number; part?: string; duration?: number }[]
  season?: { id: number; title: string }
  stats: Stat
  related: RelatedVideo[]
}

/** 一次请求拿到详情、标签和相关视频；只留用得到的字段，缓存不占太多内存 */
export async function fetchVideoDetail(ref: { bvid?: string; aid?: number }): Promise<VideoDetail> {
  const d = await api<RawDetail>(DETAIL_URL, ref.bvid ? { bvid: ref.bvid } : { aid: ref.aid }, WBI)
  const v = d.View
  const s = v.stat ?? {}
  return {
    bvid: v.bvid,
    aid: v.aid,
    title: v.title,
    cover: v.pic,
    author: v.owner?.name,
    mid: v.owner?.mid,
    category: v.tname_v2 || v.tname || undefined,
    tags: (d.Tags ?? []).flatMap((t) => t.tag_name ?? []),
    description: v.desc ?? '',
    pubdate: v.pubdate,
    duration: v.duration,
    pages: (v.pages ?? []).map((p) => ({ cid: p.cid, page: p.page, part: p.part, duration: p.duration })),
    season: v.ugc_season && { id: v.ugc_season.id, title: v.ugc_season.title },
    stats: { view: s.view, danmaku: s.danmaku, reply: s.reply, favorite: s.favorite, coin: s.coin, share: s.share, like: s.like },
    related: (d.Related ?? []).slice(0, MAX_RELATED).flatMap((r): RelatedVideo[] =>
      r.bvid
        ? [
            {
              bvid: r.bvid,
              title: r.title ?? '',
              author: r.owner?.name,
              category: r.tname || undefined,
              pubdate: r.pubdate,
              duration: r.duration,
              play: r.stat?.view
            }
          ]
        : []
    )
  }
}

// ---------------- 评论 ----------------

interface RawReply {
  rpid: number
  ctime?: number
  like?: number
  rcount?: number
  member?: { uname?: string }
  content?: { message?: string }
}

export interface Comment {
  id: number
  author?: string
  time?: number
  likes?: number
  replyCount: number
  text: string
  pinned?: boolean
}

export interface CommentPage {
  total: number
  isEnd: boolean
  /** 下一页的游标，翻到头时没有 */
  next?: string
  comments: Comment[]
}

const toComment = (r: RawReply, pinned?: boolean): Comment => ({
  id: r.rpid,
  author: r.member?.uname,
  time: r.ctime,
  likes: r.like,
  replyCount: r.rcount ?? 0,
  text: r.content?.message ?? '',
  pinned
})

interface RawReplyMain {
  cursor?: { is_end?: boolean; all_count?: number; pagination_reply?: { next_offset?: string } }
  top_replies?: RawReply[] | null
  replies?: RawReply[] | null
}

export async function fetchComments(aid: number, sort: 'hot' | 'time', cursor?: string): Promise<CommentPage> {
  const d = await api<RawReplyMain>(
    REPLY_URL,
    {
      oid: aid,
      type: 1,
      mode: sort === 'hot' ? 3 : 2,
      plat: 1,
      web_location: REPLY_LOCATION,
      pagination_str: JSON.stringify({ offset: cursor ?? '' })
    },
    WBI
  )
  const pinned = cursor ? [] : (d.top_replies ?? []).map((r) => toComment(r, true))
  const ids = new Set(pinned.map((c) => c.id))
  const rest = (d.replies ?? []).filter((r) => !ids.has(r.rpid)).map((r) => toComment(r))
  const c = d.cursor
  return {
    total: c?.all_count ?? 0,
    isEnd: c?.is_end ?? true,
    next: c?.is_end ? undefined : c?.pagination_reply?.next_offset || undefined,
    comments: [...pinned, ...rest]
  }
}

interface RawSubReplies {
  page?: { count?: number }
  replies?: RawReply[] | null
}

/** 楼中楼按页码翻，游标就是下一页的页码，用起来和主评论一样 */
export async function fetchCommentReplies(aid: number, root: number, page: number): Promise<CommentPage> {
  const d = await api<RawSubReplies>(SUB_REPLY_URL, { oid: aid, type: 1, root, pn: page, ps: SUB_REPLY_PS }, QUIET)
  const total = d.page?.count ?? 0
  const more = page * SUB_REPLY_PS < total
  return { total, isEnd: !more, next: more ? String(page + 1) : undefined, comments: (d.replies ?? []).map((r) => toComment(r)) }
}

// ---------------- AI 总结 ----------------

interface RawSummary {
  code?: number
  model_result?: {
    summary?: string
    outline?: { title?: string; timestamp?: number; part_outline?: { timestamp?: number; content?: string }[] }[]
  }
}

export interface VideoSummary {
  text: string
  outline: { title: string; start?: number; points: { start?: number; text: string }[] }[]
}

/** B站生成的 AI 总结，要登录才能看；这个视频没有总结时返回 undefined */
export async function fetchSummary(bvid: string, cid: number, upMid: number | undefined): Promise<VideoSummary | undefined> {
  const d = await api<RawSummary>(SUMMARY_URL, { bvid, cid, up_mid: upMid }, WBI)
  const m = d.model_result
  if (d.code !== 0 || !m?.summary) return undefined
  return {
    text: m.summary,
    outline: (m.outline ?? []).map((o) => ({
      title: o.title ?? '',
      start: o.timestamp,
      points: (o.part_outline ?? []).map((p) => ({ start: p.timestamp, text: p.content ?? '' }))
    }))
  }
}

/** 工具层用到的接口，测试时整个换掉 */
export const biliLookup = {
  searchVideos,
  searchUsers,
  fetchCategory,
  fetchVideoDetail,
  fetchComments,
  fetchCommentReplies,
  fetchSummary,
  fetchPlayer: (bvid: string, cid: number) => fetchPlayerMeta({ kind: 'ugc', bvid, cid }, QUIET),
  fetchSubtitleLines,
  expandShort
}

export type BiliLookup = typeof biliLookup
