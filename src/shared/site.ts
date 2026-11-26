// 平台之间的差异都按 Record<Site, …> 写成表：新增平台时漏掉哪一处，类型检查就在哪一处报错
import { dyVideoUrl } from './douyinUrl'
import type { MediaItem, MediaKind, Settings, Site } from './types'

type ItemRef = Pick<MediaItem, 'kind' | 'ytId' | 'dyId'>

interface SiteInfo {
  /** 下载记录键的前缀；B站的键没有统一前缀（BV 号、ep、cheese 等） */
  keyPrefix?: string
  /** 条目的原始地址；B站返回空，由调用方按 B站规则拼 */
  itemUrl: (item: ItemRef) => string | undefined
  /** NFO 里 uniqueid 的类型和值 */
  nfo: { type: string; id: (item: MediaItem) => string }
  downloadDir: (s: Settings) => string
  /** 改这个平台下载目录用的设置补丁 */
  dirPatch: (s: Settings, dir: string) => Partial<Settings>
  /** 这个平台自己的同时下载上限（另受总上限限制） */
  concurrency: (s: Settings) => number
}

/** 抖音作品的下载记录键 */
export const dyKey = (id: string): string => `dy:${id}`

/** YouTube 视频的下载记录键：只到视频级，没有分P */
export const ytKey = (id: string): string => `yt:${id}`

export const ytWatchUrl = (id: string): string => `https://www.youtube.com/watch?v=${id}`

const INFO: Record<Site, SiteInfo> = {
  bili: {
    itemUrl: () => undefined,
    nfo: { type: 'bilibili', id: (item) => item.bvid ?? (item.epId ? `ep${item.epId}` : String(item.cid)) },
    downloadDir: (s) => s.downloadDir,
    dirPatch: (_s, downloadDir) => ({ downloadDir }),
    concurrency: (s) => s.concurrency
  },
  youtube: {
    keyPrefix: 'yt:',
    itemUrl: (item) => (item.ytId ? ytWatchUrl(item.ytId) : undefined),
    nfo: { type: 'youtube', id: (item) => item.ytId ?? item.key },
    downloadDir: (s) => s.youtube.downloadDir,
    dirPatch: (s, downloadDir) => ({ youtube: { ...s.youtube, downloadDir } }),
    concurrency: (s) => s.youtube?.concurrency ?? s.concurrency
  },
  douyin: {
    keyPrefix: 'dy:',
    itemUrl: (item) => (item.dyId ? dyVideoUrl(item.dyId) : undefined),
    nfo: { type: 'douyin', id: (item) => item.dyId ?? item.key },
    downloadDir: (s) => s.douyin.downloadDir,
    dirPatch: (s, downloadDir) => ({ douyin: { ...s.douyin, downloadDir } }),
    concurrency: (s) => s.douyin?.concurrency ?? s.concurrency
  }
}

/** 全部平台，按界面上的顺序 */
export const SITES = Object.keys(INFO) as readonly Site[]

export const isSite = (v: unknown): v is Site => typeof v === 'string' && Object.hasOwn(INFO, v)

const KIND_SITE: Record<MediaKind, Site> = { ugc: 'bili', pgc: 'bili', cheese: 'bili', audio: 'bili', youtube: 'youtube', douyin: 'douyin' }

/** 条目类型属于哪个平台；认不出的（损坏的旧数据）按 B站 */
export const siteOfKind = (kind: MediaKind): Site => KIND_SITE[kind] ?? 'bili'

/** 条目（或带 item 的任务、下载记录）属于哪个平台 */
export const siteOf = (x: { kind: MediaKind } | { item: { kind: MediaKind } }): Site =>
  siteOfKind('item' in x ? x.item.kind : x.kind)

/** 下载记录键属于哪个平台 */
export const siteOfKey = (key: string): Site =>
  SITES.find((site) => INFO[site].keyPrefix !== undefined && key.startsWith(INFO[site].keyPrefix!)) ?? 'bili'

export const siteItemUrl = (item: ItemRef): string | undefined => INFO[siteOfKind(item.kind)].itemUrl(item)

export function siteNfoId(item: MediaItem): { type: string; id: string } {
  const { type, id } = INFO[siteOfKind(item.kind)].nfo
  return { type, id: id(item) }
}

export const downloadDirOf = (s: Settings, site: Site): string => INFO[site].downloadDir(s)

export const downloadDirPatch = (s: Settings, site: Site, dir: string): Partial<Settings> => INFO[site].dirPatch(s, dir)

export const siteConcurrency = (s: Settings, site: Site): number => INFO[site].concurrency(s)
