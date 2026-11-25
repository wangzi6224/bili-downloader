import type { MediaItem, MediaKind, Site } from './types'

export const SITES: readonly Site[] = ['bili', 'youtube']

export const isSite = (v: unknown): v is Site => v === 'bili' || v === 'youtube'

/** 条目类型属于哪个平台 */
export const siteOfKind = (kind: MediaKind): Site => (kind === 'youtube' ? 'youtube' : 'bili')

/** 条目（或带 item 的任务、下载记录）属于哪个平台 */
export const siteOf = (x: { kind: MediaKind } | { item: { kind: MediaKind } }): Site =>
  siteOfKind('item' in x ? x.item.kind : x.kind)

/** YouTube 视频的下载记录键：只到视频级，没有分P */
export const ytKey = (id: string): string => `yt:${id}`

export const ytWatchUrl = (id: string): string => `https://www.youtube.com/watch?v=${id}`

/** 条目的原始地址；B站条目返回空，由调用方按 B站规则拼 */
export const ytItemUrl = (item: Pick<MediaItem, 'kind' | 'ytId'>): string | undefined =>
  item.kind === 'youtube' && item.ytId ? ytWatchUrl(item.ytId) : undefined
