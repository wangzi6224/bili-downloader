// 不经过页面桥的两件事：展开 v.douyin.com 短链；匿名从分享页取单个作品（页面桥被拦时的兜底，画质有限）
import { t } from '@shared/i18n'
import { isDyHost, parseDyInput } from '@shared/douyinUrl'
import { DyError, DyUnavailableError } from './errors'
import type { DyAweme, DyUrlList } from './types'

export const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const REGISTER_URL = 'https://ttwid.bytedance.com/ttwid/union/register/'
const REGISTER_BODY = {
  region: 'cn',
  aid: 1768,
  needFid: false,
  service: 'www.ixigua.com',
  migrate_info: { ticket: '', source: 'node' },
  cbUrlProtocol: 'https',
  union: true
}
const MAX_HOPS = 5
const TIMEOUT = 20_000

type Fetch = typeof fetch

const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export class DouyinShare {
  private ttwid?: string

  constructor(private fetchFn: Fetch = (...args) => fetch(...args)) {}

  private async get(url: string, headers: Record<string, string>, signal?: AbortSignal, init: RequestInit = {}): Promise<Response> {
    try {
      const timeout = AbortSignal.timeout(TIMEOUT)
      return await this.fetchFn(url, { ...init, headers, signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
    } catch (e) {
      if (signal?.aborted) throw e
      throw new DyError(t('dy.errNetwork', { reason: reason(e) }))
    }
  }

  /** 跟着短链跳转，直到认出不是短链的抖音地址；跳到别的域名就停下 */
  async expand(url: string, signal?: AbortSignal): Promise<string> {
    let current = url
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const res = await this.get(current, { 'User-Agent': MOBILE_UA }, signal, { redirect: 'manual' })
      await res.body?.cancel()
      const location = res.headers.get('location')
      if (!location) break
      const next = new URL(location, current)
      if (!/^https?:$/.test(next.protocol) || !isDyHost(next.hostname)) break
      current = next.href
      const target = parseDyInput(current)
      if (target && target.type !== 'short') return current
    }
    throw new DyUnavailableError(t('dy.errShortLink'))
  }

  private async cookie(signal?: AbortSignal): Promise<string> {
    if (this.ttwid) return this.ttwid
    const res = await this.get(REGISTER_URL, { 'Content-Type': 'application/json' }, signal, {
      method: 'POST',
      body: JSON.stringify(REGISTER_BODY)
    })
    await res.body?.cancel()
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('ttwid='))?.split(';')[0]
    if (!cookie) throw new DyError(t('dy.errRejected'))
    return (this.ttwid = cookie)
  }

  /** 匿名取单个作品 */
  async detail(id: string, signal?: AbortSignal): Promise<DyAweme> {
    const cookie = await this.cookie(signal)
    const res = await this.get(`https://www.iesdouyin.com/share/video/${id}/`, { 'User-Agent': MOBILE_UA, Cookie: cookie }, signal)
    const html = await res.text()
    const info = routerData(html)
    const item = info?.item_list?.[0]
    if (item?.aweme_id) return fromShare(item)
    const filtered = info?.filter_list?.[0]
    if (filtered) throw new DyUnavailableError(t('dy.errUnavailable', { reason: filtered.detail_msg || filtered.filter_reason || id }))
    // 拿到的页面里没有数据：匿名 cookie 可能不认了，下次重新注册
    this.ttwid = undefined
    throw new DyError(t('dy.errRejected'))
  }
}

interface VideoInfoRes {
  item_list?: DyAweme[]
  filter_list?: { filter_reason?: string; detail_msg?: string }[]
}

function routerData(html: string): VideoInfoRes | undefined {
  const json = html.match(/window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\})\s*<\/script>/)?.[1]
  if (!json) return undefined
  try {
    const data = JSON.parse(json) as { loaderData?: Record<string, { videoInfoRes?: VideoInfoRes } | null> }
    return Object.values(data.loaderData ?? {}).find((v) => v?.videoInfoRes)?.videoInfoRes
  } catch {
    return undefined
  }
}

/** 分享页给的是带水印的播放地址（playwm），换成不带水印的 play */
function fromShare(item: DyAweme): DyAweme {
  const clean = (u?: DyUrlList): DyUrlList | undefined =>
    u && { ...u, url_list: u.url_list?.map((url) => url.replace('/playwm/', '/play/').replace(/ratio=\w+/, 'ratio=1080p')) }
  const video = (v: DyAweme['video']): DyAweme['video'] => v && { ...v, play_addr: clean(v.play_addr), bit_rate: null }
  return {
    ...item,
    fromShare: true,
    video: video(item.video),
    images: item.images && item.images.map((image) => ({ ...image, video: video(image.video) }))
  }
}
