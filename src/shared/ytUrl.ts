// YouTube 链接识别：视频、Shorts、直播、播放列表、频道、YouTube Music，以及登录后才有的稍后观看、喜欢的视频、订阅、历史
export type YtTarget =
  | { type: 'video'; id: string; music?: boolean }
  | { type: 'playlist'; id: string; music?: boolean; /** 从播放列表里的某个视频点进来的 */ video?: string }
  | { type: 'channel'; url: string; tab: YtChannelTab; query?: string }
  | { type: 'feed'; feed: YtFeed }

export type YtChannelTab = 'videos' | 'shorts' | 'streams' | 'playlists' | 'search'
export type YtFeed = 'watchlater' | 'liked' | 'subscriptions' | 'history'

const ID_RE = /^[A-Za-z0-9_-]{11}$/
const LIST_RE = /^[A-Za-z0-9_-]{2,64}$/
const HOSTS = /^(?:(?:www|m|music|gaming)\.)?youtube\.com$|^youtu\.be$|^(?:www\.)?youtube-nocookie\.com$/i

const FEED_URLS: Record<YtFeed, string> = {
  watchlater: 'https://www.youtube.com/playlist?list=WL',
  liked: 'https://www.youtube.com/playlist?list=LL',
  subscriptions: 'https://www.youtube.com/feed/subscriptions',
  history: 'https://www.youtube.com/feed/history'
}

/** 用文字代替链接的快捷入口（和 B站的“稍后再看”一样） */
const FEED_WORDS: Record<string, YtFeed> = {
  稍后观看: 'watchlater',
  'watch later': 'watchlater',
  喜欢的视频: 'liked',
  'liked videos': 'liked',
  订阅内容: 'subscriptions',
  subscriptions: 'subscriptions',
  观看记录: 'history',
  history: 'history'
}

export const isYtHost = (host: string): boolean => HOSTS.test(host)

/**
 * 是否 YouTube 的分享 / 浏览器地址栏链接（不认裸的 11 位 id，它可能是任何东西）。
 * 合辑（list=RD…）是按当前视频无限生成的，只当作单个视频
 */
export function parseYtInput(input: string): YtTarget | null {
  const s = input.trim()
  const word = FEED_WORDS[s.toLowerCase()]
  if (word) return { type: 'feed', feed: word }
  let u: URL
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    return null
  }
  if (!/^https?:$/.test(u.protocol) || !isYtHost(u.hostname)) return null
  const music = /^music\./i.test(u.hostname)
  const host = u.hostname.toLowerCase()
  const parts = u.pathname.split('/').filter(Boolean)
  const v = u.searchParams.get('v') ?? ''
  const list = u.searchParams.get('list') ?? ''
  const okList = LIST_RE.test(list) && !/^(RD|UL)/.test(list)

  if (host === 'youtu.be') {
    const id = parts[0] ?? ''
    if (!ID_RE.test(id)) return null
    return okList ? { type: 'playlist', id: list, video: id } : { type: 'video', id }
  }
  const [head, second, third] = parts
  if (head === 'watch' && ID_RE.test(v)) {
    return okList ? { type: 'playlist', id: list, video: v, ...(music ? { music } : {}) } : { type: 'video', id: v, ...(music ? { music } : {}) }
  }
  if ((head === 'shorts' || head === 'live' || head === 'embed' || head === 'v') && second && ID_RE.test(second)) return { type: 'video', id: second }
  if (head === 'playlist' && LIST_RE.test(list)) {
    if (list === 'WL') return { type: 'feed', feed: 'watchlater' }
    if (list === 'LL') return { type: 'feed', feed: 'liked' }
    return { type: 'playlist', id: list, ...(music ? { music } : {}) }
  }
  // YouTube Music 的专辑、歌单页面：browse/VL<列表 id>
  if (music && head === 'browse' && second?.startsWith('VL') && LIST_RE.test(second.slice(2))) {
    return { type: 'playlist', id: second.slice(2), music }
  }
  if (head === 'feed') {
    if (second === 'subscriptions') return { type: 'feed', feed: 'subscriptions' }
    if (second === 'history') return { type: 'feed', feed: 'history' }
    if (second === 'playlists' || second === 'library') return null
  }
  let base: string | undefined
  let rest: string | undefined
  if (head?.startsWith('@') && head.length > 1) [base, rest] = [`@${decodeURIComponent(head.slice(1))}`, second]
  else if ((head === 'channel' || head === 'c' || head === 'user') && second) [base, rest] = [`${head}/${second}`, third]
  if (!base) return null
  const tab: YtChannelTab = rest === 'shorts' || rest === 'streams' || rest === 'playlists' || rest === 'search' ? rest : 'videos'
  const query = tab === 'search' ? u.searchParams.get('query')?.trim() || undefined : undefined
  if (tab === 'search' && !query) return { type: 'channel', url: `https://www.youtube.com/${base}/videos`, tab: 'videos' }
  return {
    type: 'channel',
    url: `https://www.youtube.com/${base}/${tab}${query ? `?query=${encodeURIComponent(query)}` : ''}`,
    tab,
    ...(query ? { query } : {})
  }
}

/** 识别结果对应的规范链接（交给 yt-dlp、记进订阅） */
export function ytTargetUrl(t: YtTarget): string {
  switch (t.type) {
    case 'video':
      return `https://${t.music ? 'music' : 'www'}.youtube.com/watch?v=${t.id}`
    case 'playlist':
      return `https://${t.music ? 'music' : 'www'}.youtube.com/playlist?list=${t.id}`
    case 'channel':
      return t.url
    case 'feed':
      return FEED_URLS[t.feed]
  }
}

/** 登录后才看得到的列表 */
export const needsYtLogin = (t: YtTarget): boolean =>
  t.type === 'feed' || (t.type === 'playlist' && (t.id === 'WL' || t.id === 'LL'))

/** 从一段文字（例如一次粘贴的多行、聊天记录）里找出所有 YouTube 链接，去重保持顺序 */
export function extractYtInputs(text: string): string[] {
  const found = text.match(/(?:https?:\/\/)?(?:(?:www|m|music)\.)?(?:youtube\.com|youtu\.be)\/[^\s"'<>，。、）)】]+/gi) ?? []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of found) {
    const t = parseYtInput(raw)
    if (!t) continue
    const url = ytTargetUrl(t)
    const key = t.type === 'playlist' && t.video ? `${url}#${t.video}` : url
    if (seen.has(key)) continue
    seen.add(key)
    out.push(raw)
  }
  return out
}
