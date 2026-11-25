// YouTube 的解析、分页、取流选项：主进程里唯一一个实例，界面、下载队列、订阅和 MCP 共用
import { t } from '@shared/i18n'
import type { MediaItem, PageResult, ParseResult, StreamInfo } from '@shared/types'
import { needsYtLogin, parseYtInput, ytTargetUrl, type YtTarget } from '@shared/ytUrl'
import { AbortError } from '../download/errors'
import { YtEngineError, YtLoginRequiredError } from './errors'
import { ytStreamInfo } from './pick'
import { listResult, pageRange, pageResult, videoResult, YT_PLAYLIST_KEY } from './resolve'
import { runYtdlp, type RunOptions, type YtEnv } from './run'
import type { YtPlaylistInfo, YtVideoInfo } from './types'

/** 解析结果缓存多久：下载、选画质时直接用，不用再请求一次（流地址大约 6 小时过期，这里远小于它） */
const INFO_TTL = 5 * 60_000
const INFO_CACHE_MAX = 50

export interface CookieFile {
  file: string
  /** 用完后调用：把 yt-dlp 写回的新 cookie 收回来，删掉临时文件 */
  done: () => Promise<void>
}

export interface YoutubeDeps {
  /** 拿到 yt-dlp（没装就先装）并在用完前不让它被删 */
  useEngine: <T>(fn: (exe: string) => Promise<T>) => Promise<T>
  /** 除可执行文件和 cookie 外的运行环境：JS 运行时、ffmpeg、代理、缓存目录 */
  env: () => Promise<Omit<YtEnv, 'exe' | 'cookies'>>
  /** 某个 YouTube 账号的 cookie 文件；没有账号或不登录时返回空 */
  cookies: (account: string | undefined) => Promise<CookieFile | undefined>
  /** 当前选中的 YouTube 账号 */
  currentAccount: () => string | undefined
  run?: typeof runYtdlp
  now?: () => number
  /** yt-dlp 解不开 YouTube 的校验（多半是版本太旧）：触发一次更新检查 */
  onEngineError?: () => void
}

export interface ExecOptions extends Pick<RunOptions, 'signal' | 'onLine'> {
  /** 用哪个账号；缺省当前账号，null 表示不登录 */
  account?: string | null
}

export class YoutubeService {
  private cache = new Map<string, { at: number; info: Promise<YtVideoInfo> }>()

  constructor(private readonly deps: YoutubeDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  /** 当前选中的 YouTube 账号 */
  currentAccount(): string | undefined {
    return this.deps.currentAccount()
  }

  private accountOf(o: ExecOptions): string | undefined {
    return o.account === null ? undefined : (o.account ?? this.deps.currentAccount())
  }

  /** 运行一次 yt-dlp（带上账号的 cookie） */
  async exec(args: string[], o: ExecOptions = {}): Promise<{ stdout: string; stderr: string }> {
    const run = this.deps.run ?? runYtdlp
    return this.deps.useEngine(async (exe) => {
      const env = await this.deps.env()
      const cookie = await this.deps.cookies(this.accountOf(o))
      try {
        return await run({ ...env, exe, cookies: cookie?.file }, args, { signal: o.signal, onLine: o.onLine })
      } catch (e) {
        if (e instanceof YtEngineError) this.deps.onEngineError?.()
        throw e
      } finally {
        await cookie?.done()
      }
    })
  }

  private async json<T>(args: string[], o: ExecOptions): Promise<T> {
    const { stdout } = await this.exec(args, o)
    if (o.signal?.aborted) throw new AbortError()
    const text = stdout.trim().split(/\r?\n/).at(-1) ?? ''
    try {
      return JSON.parse(text) as T
    } catch {
      throw new Error(t('yt.errOther', { reason: text.slice(0, 200) || 'empty output' }))
    }
  }

  /** 单个视频的完整信息（含格式），短时间内同一个视频、同一个账号只请求一次 */
  info(url: string, o: ExecOptions & { fresh?: boolean } = {}): Promise<YtVideoInfo> {
    const key = `${this.accountOf(o) ?? ''}\n${url}`
    const hit = this.cache.get(key)
    if (hit && !o.fresh && this.now() - hit.at < INFO_TTL) return hit.info
    const info = this.json<YtVideoInfo>(['-J', '--no-playlist', url], o)
    this.cache.set(key, { at: this.now(), info })
    // 失败的不缓存
    info.catch(() => {
      if (this.cache.get(key)?.info === info) this.cache.delete(key)
    })
    while (this.cache.size > INFO_CACHE_MAX) this.cache.delete(this.cache.keys().next().value!)
    return info
  }

  /** 播放列表、频道的某一段（只有列表信息，没有格式） */
  flat(url: string, page: number, o: ExecOptions = {}): Promise<YtPlaylistInfo> {
    return this.json<YtPlaylistInfo>(['--flat-playlist', '-J', '--playlist-items', pageRange(page), url], o)
  }

  /** 识别并解析用户输入；不是 YouTube 链接时返回空 */
  async parse(input: string, o: ExecOptions = {}): Promise<ParseResult | undefined> {
    const target = parseYtInput(input)
    if (!target) return undefined
    return this.parseTarget(target, o)
  }

  async parseTarget(target: YtTarget, o: ExecOptions = {}): Promise<ParseResult> {
    if (needsYtLogin(target) && !this.accountOf(o)) throw new YtLoginRequiredError(t('yt.listNeedsLogin'))
    const url = ytTargetUrl(target)
    if (target.type === 'video') return videoResult(await this.info(url, o))
    return listResult(await this.flat(url, 1, o), target, url)
  }

  loadPage(url: string, page: number, o: ExecOptions = {}): Promise<PageResult> {
    return this.flat(url, page, o).then((pl) => pageResult(pl, page))
  }

  /** 画质、音频、字幕选项；列表里的播放列表项取它的第一个视频 */
  async streamInfo(item: MediaItem, o: ExecOptions = {}): Promise<StreamInfo> {
    let id = item.ytId
    if (!id && item.key.startsWith(YT_PLAYLIST_KEY)) {
      const first = (await this.expand([item], o)).find((i) => i.ytId && !i.unavailable)
      if (!first) throw new Error(t('yt.playlistEmpty'))
      id = first.ytId
    }
    if (!id) throw new Error(t('yt.noFormats'))
    return ytStreamInfo(await this.info(`https://www.youtube.com/watch?v=${id}`, o))
  }

  /**
   * 列表里的播放列表项展开成里面的全部视频（加入下载队列前），其余原样保留。
   * 展开失败的以 unavailable 返回，不影响其他项
   */
  async expand(items: MediaItem[], o: ExecOptions = {}): Promise<MediaItem[]> {
    const out: MediaItem[] = []
    for (const item of items) {
      if (!(item.lazy && item.key.startsWith(YT_PLAYLIST_KEY))) {
        out.push(item)
        continue
      }
      const listId = item.key.slice(YT_PLAYLIST_KEY.length)
      const url = `https://www.youtube.com/playlist?list=${listId}`
      try {
        for (let page = 1; ; page++) {
          const pl = await this.flat(url, page, o)
          const got = pageResult(pl, page)
          out.push(...got.items.filter((i) => i.ytId).map((i) => ({ ...i, owner: i.owner ?? item.owner })))
          if (!got.hasMore || !got.items.length) break
        }
      } catch (e) {
        if (e instanceof AbortError) throw e
        out.push({ ...item, lazy: false, unavailable: e instanceof Error ? e.message : String(e) })
      }
    }
    return out
  }
}

let instance: YoutubeService | undefined

export function setYoutube(s: YoutubeService | undefined): void {
  instance = s
}

/** 主进程里的 YouTube 服务（启动时创建） */
export function youtube(): YoutubeService {
  if (!instance) throw new Error('YouTube service not ready')
  return instance
}
