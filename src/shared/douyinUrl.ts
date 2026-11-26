// 抖音链接识别：作品（视频、图文）、博主主页、合集和短剧、自己的喜欢 / 收藏 / 稍后再看 / 观看历史、分享短链和口令
export type DySelfTab = 'post' | 'likes' | 'collection' | 'watchlater' | 'history'

export type DyTarget =
  /** 单个作品：视频或图文 */
  | { type: 'video'; id: string }
  | { type: 'user'; secUid: string }
  /** 自己账号里的列表；folder 是收藏夹 id（收藏夹没有公开链接，只在应用里用） */
  | { type: 'self'; tab: DySelfTab; folder?: string }
  /** 合集和短剧（短剧的 series id 就是合集 id） */
  | { type: 'mix'; id: string }
  /** v.douyin.com 分享短链，要跟一次跳转才知道是什么 */
  | { type: 'short'; url: string }
  | { type: 'unsupported'; what: 'live' | 'search' | 'music' | 'topic' }

/** 网页地址里 showTab 参数的值 */
const TAB_PARAM: Record<DySelfTab, string> = {
  post: 'post',
  likes: 'like',
  collection: 'favorite_collection',
  watchlater: 'watch_later',
  history: 'record'
}

const ID_RE = /^\d{15,21}$/
const SEC_UID_RE = /^[A-Za-z0-9_-]{20,128}$/
const HOSTS = /^(?:[a-z0-9-]+\.)*(?:douyin\.com|iesdouyin\.com)$|^webcast\.amemv\.com$/i
/** 分享口令里链接后面紧跟中文、全角标点或表情，只取 URL 允许的字符 */
const URL_RE =
  /(?<![\w.@-])(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:douyin\.com|iesdouyin\.com|webcast\.amemv\.com)(?![\w-]|\.\w)(?:[/?#][A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]*)?/gi

export const isDyHost = (host: string): boolean => HOSTS.test(host)

export const dyVideoUrl = (id: string): string => `https://www.douyin.com/video/${id}`

/** 文字里出现的抖音链接，原样返回（去掉句末标点） */
export const extractDyUrls = (text: string): string[] => (text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?)\]]+$/, ''))

/** 这段输入是不是抖音的：别的平台解析器遇到它要让开 */
export const isDyText = (text: string): boolean => extractDyUrls(text).length > 0

function parseUrlTarget(raw: string): DyTarget | null {
  let u: URL
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase()
  if (!isDyHost(host)) return null
  const parts = u.pathname.split('/').filter(Boolean)
  if (host === 'v.douyin.com') return parts[0] ? { type: 'short', url: `https://v.douyin.com/${parts[0]}/` } : null
  if (host === 'live.douyin.com' || host === 'webcast.amemv.com') return { type: 'unsupported', what: 'live' }

  // 弹窗里打开的作品：地址路径是列表页，modal_id 才是正在看的作品
  const modal = [u.searchParams.get('modal_id'), u.searchParams.get('vid')].find((v) => v && ID_RE.test(v))
  if (modal) return { type: 'video', id: modal }

  const path = parts[0] === 'share' ? parts.slice(1) : parts
  const [head, second, third] = path
  const id = [third, second].find((v) => v && ID_RE.test(v))
  if ((head === 'video' || head === 'note' || head === 'slides') && second && ID_RE.test(second)) return { type: 'video', id: second }
  if (head === 'user') {
    if (second === 'self') {
      const show = u.searchParams.get('showTab')
      const tab = (Object.keys(TAB_PARAM) as DySelfTab[]).find((k) => TAB_PARAM[k] === show) ?? 'post'
      const folder = u.searchParams.get('collect_id')
      return { type: 'self', tab, ...(folder && /^\d+$/.test(folder) ? { folder } : {}) }
    }
    // 分享页的路径里是数字 uid，sec_uid 在参数里
    const secUid = [u.searchParams.get('sec_uid'), second].find((v) => v && SEC_UID_RE.test(v) && !/^\d+$/.test(v))
    return secUid ? { type: 'user', secUid } : null
  }
  if ((head === 'collection' || head === 'mix' || head === 'series' || head === 'playlet') && id) return { type: 'mix', id }
  const mixId = u.searchParams.get('mix_id') ?? ''
  if (ID_RE.test(mixId)) return { type: 'mix', id: mixId }
  if (head === 'search' || (head === 'jingxuan' && second === 'search')) return { type: 'unsupported', what: 'search' }
  if (head === 'music') return { type: 'unsupported', what: 'music' }
  if (head === 'hashtag' || head === 'challenge') return { type: 'unsupported', what: 'topic' }
  if (head === 'live' || (head === 'follow' && second === 'live') || head === 'vsdetail') return { type: 'unsupported', what: 'live' }
  return null
}

/** 识别链接或分享口令（取第一个认得的抖音链接）；裸的数字 id 不认 */
export function parseDyInput(input: string): DyTarget | null {
  for (const url of extractDyUrls(input.trim())) {
    const target = parseUrlTarget(url)
    if (target) return target
  }
  return null
}

/** 识别结果对应的规范链接（记进订阅和历史）；不支持的类型没有 */
export function dyTargetUrl(t: DyTarget): string {
  switch (t.type) {
    case 'video':
      return dyVideoUrl(t.id)
    case 'user':
      return `https://www.douyin.com/user/${t.secUid}`
    case 'self':
      return `https://www.douyin.com/user/self?showTab=${TAB_PARAM[t.tab]}${t.folder ? `&collect_id=${t.folder}` : ''}`
    case 'mix':
      return `https://www.douyin.com/collection/${t.id}`
    case 'short':
      return t.url
    case 'unsupported':
      return ''
  }
}

/** 登录后才看得到的列表 */
export const needsDyLogin = (t: DyTarget): boolean => t.type === 'self'

/** 从一段文字（多行、聊天记录）里找出所有抖音链接，同一个目标只留一个 */
export function extractDyInputs(text: string): string[] {
  const seen = new Set<string>()
  return extractDyUrls(text).filter((raw) => {
    const target = parseUrlTarget(raw)
    if (!target || target.type === 'unsupported') return false
    const key = dyTargetUrl(target)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
