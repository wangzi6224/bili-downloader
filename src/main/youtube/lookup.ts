// YouTube 的检索：搜索视频 / 频道、评论、字幕全文。都通过 yt-dlp 完成，给 MCP 工具用
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ExecOptions, YoutubeService } from './service'
import type { YtFlatEntry, YtPlaylistInfo } from './types'

export type SearchSort = 'relevance' | 'date' | 'views' | 'rating'
export type UploadDate = 'hour' | 'today' | 'week' | 'month' | 'year'
export type DurationFilter = 'short' | 'medium' | 'long'
export type SearchType = 'video' | 'channel' | 'playlist'

const SORT: Record<SearchSort, number> = { relevance: 0, rating: 1, date: 2, views: 3 }
const UPLOAD: Record<UploadDate, number> = { hour: 1, today: 2, week: 3, month: 4, year: 5 }
const TYPE: Record<SearchType, number> = { video: 1, channel: 2, playlist: 3 }
// YouTube 的时长筛选：1 是 4 分钟以内，2 是 20 分钟以上，3 是 4–20 分钟
const DURATION: Record<DurationFilter, number> = { short: 1, long: 2, medium: 3 }

const varint = (n: number): number[] => {
  const out: number[] = []
  do {
    let b = n & 0x7f
    n >>>= 7
    if (n) b |= 0x80
    out.push(b)
  } while (n)
  return out
}
const field = (no: number, value: number): number[] => [...varint((no << 3) | 0), ...varint(value)]

/**
 * 搜索结果页的 sp 参数：一段 protobuf（字段 1 排序；字段 2 是筛选：1 上传时间、2 类型、3 时长），再 base64。
 * 例如只按频道筛是 EgIQAg==，按上传日期排是 CAI=
 */
export function searchParams(o: { sort?: SearchSort; uploadDate?: UploadDate; type?: SearchType; duration?: DurationFilter }): string | undefined {
  const filters = [
    ...(o.uploadDate ? field(1, UPLOAD[o.uploadDate]) : []),
    ...(o.type ? field(2, TYPE[o.type]) : []),
    ...(o.duration ? field(3, DURATION[o.duration]) : [])
  ]
  const bytes = [...(o.sort && o.sort !== 'relevance' ? field(1, SORT[o.sort]) : []), ...(filters.length ? [0x12, filters.length, ...filters] : [])]
  return bytes.length ? Buffer.from(bytes).toString('base64') : undefined
}

export function searchUrl(query: string, o: Parameters<typeof searchParams>[0]): string {
  const sp = searchParams(o)
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}${sp ? `&sp=${encodeURIComponent(sp)}` : ''}`
}

/** 搜索：返回结果页上的条目（视频、频道或播放列表） */
export async function search(
  svc: Pick<YoutubeService, 'exec'>,
  query: string,
  o: Parameters<typeof searchParams>[0] & { limit: number },
  exec: ExecOptions = {}
): Promise<YtFlatEntry[]> {
  const { stdout } = await svc.exec(['--flat-playlist', '-J', '--playlist-items', `1:${o.limit}`, searchUrl(query, o)], exec)
  const pl = JSON.parse(stdout.trim().split(/\r?\n/).at(-1)!) as YtPlaylistInfo
  return pl.entries ?? []
}

export interface YtComment {
  id: string
  parent: string
  text: string
  author?: string
  author_id?: string
  like_count?: number
  timestamp?: number
  is_pinned?: boolean
  author_is_uploader?: boolean
  is_favorited?: boolean
}

/** 取评论：top 是热门、new 是最新；count 条顶层评论，每条最多 replies 条回复 */
export async function fetchComments(
  svc: Pick<YoutubeService, 'exec'>,
  videoUrl: string,
  o: { sort: 'top' | 'new'; count: number; replies: number },
  exec: ExecOptions = {}
): Promise<{ comments: YtComment[]; total?: number }> {
  // max_comments 的四个数：总数、顶层条数、回复总数、每条顶层的回复数
  const limits = `${o.count * (o.replies + 1)},${o.count},${o.count * o.replies},${o.replies}`
  const { stdout } = await svc.exec([
    '--skip-download', '--write-comments', '-J', '--no-playlist',
    '--extractor-args', `youtube:max_comments=${limits};comment_sort=${o.sort}`,
    videoUrl
  ], exec)
  const info = JSON.parse(stdout.trim().split(/\r?\n/).at(-1)!) as { comments?: YtComment[]; comment_count?: number }
  return { comments: info.comments ?? [], total: info.comment_count ?? undefined }
}

export interface CueLine {
  from: number
  to: number
  text: string
}

const vttTime = (s: string): number => {
  const parts = s.trim().replace(',', '.').split(':').map(Number)
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

/**
 * 解析 WebVTT：去掉样式标签，一条字幕在画面上分几行显示的合成一行。
 * 自动字幕是滚动显示的，每条的第一行常是上一条的内容，这样的行去掉
 */
export function parseVtt(text: string): CueLine[] {
  const out: CueLine[] = []
  /** 上一条里出现过的行 */
  let previous = new Set<string>()
  for (const block of text.replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.split('\n')
    const i = lines.findIndex((l) => l.includes('-->'))
    if (i < 0) continue
    const [a, b] = lines[i].split('-->')
    const from = vttTime(a)
    const to = vttTime(b.split(' ').filter(Boolean)[0])
    const body = lines
      .slice(i + 1)
      .map((l) => l.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim())
      .filter(Boolean)
    const fresh = body.filter((l) => !previous.has(l))
    previous = new Set(body)
    if (!fresh.length) {
      // 整条都是上一条的内容：只是延长显示时间
      if (out.length) out[out.length - 1].to = to
      continue
    }
    out.push({ from, to, text: fresh.join(' ') })
  }
  return out
}

/** 下载某个语言的字幕（auto 为 true 时用自动生成的）并解析成行 */
export async function fetchTranscript(
  svc: Pick<YoutubeService, 'exec'>,
  videoUrl: string,
  lang: string,
  auto: boolean,
  exec: ExecOptions = {},
  tmp: () => Promise<string> = () => mkdtemp(join(tmpdir(), 'yt-sub-'))
): Promise<CueLine[] | undefined> {
  const dir = await tmp()
  try {
    await svc.exec([
      '--skip-download', '--no-playlist',
      auto ? '--write-auto-subs' : '--write-subs',
      '--sub-langs', lang,
      '--sub-format', 'vtt',
      '-P', dir,
      '-o', 'sub.%(ext)s',
      videoUrl
    ], exec)
    const file = (await readdir(dir)).find((n) => n.endsWith('.vtt'))
    return file ? parseVtt(await readFile(join(dir, file), 'utf8')) : undefined
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
