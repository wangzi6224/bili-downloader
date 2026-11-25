// 把 yt-dlp 的输出整理成界面和下载队列用的解析结果
import { t } from '@shared/i18n'
import { ytKey, ytWatchUrl } from '@shared/site'
import type { MediaItem, PageResult, ParseResult } from '@shared/types'
import type { YtTarget } from '@shared/ytUrl'
import type { YtFlatEntry, YtPlaylistInfo, YtThumbnail, YtVideoInfo } from './types'

/** 播放列表、频道每页多少项 */
export const YT_PAGE = 50

/** 播放列表项的 key 前缀：频道“播放列表”页里列出的是一个个播放列表，加入下载时再展开成视频 */
export const YT_PLAYLIST_KEY = 'ytpl:'

/** 最大的那张缩略图；都没有时用 YouTube 固定地址的封面 */
export function thumbOf(thumbs: YtThumbnail[] | null | undefined, videoId?: string): string {
  const best = [...(thumbs ?? [])].filter((x) => x.url).sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0))[0]
  if (best) return best.url
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''
}

/** 发布时间（unix 秒）：优先精确时间戳，没有时用 upload_date（YYYYMMDD，按 UTC） */
export function pubdateOf(v: Pick<YtVideoInfo, 'timestamp' | 'release_timestamp' | 'upload_date'>): number | undefined {
  if (v.timestamp) return v.timestamp
  if (v.release_timestamp) return v.release_timestamp
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v.upload_date ?? '')
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 1000 : undefined
}

const ownerOf = (v: { channel?: string | null; uploader?: string | null }): string | undefined => v.channel || v.uploader || undefined

/** 直播中、还没开始的、私享、已删除的，以及要会员 / 登录的标出来 */
function availability(
  v: { live_status?: string | null; availability?: string | null; title?: string | null }
): Pick<MediaItem, 'unavailable' | 'needVip' | 'badge'> {
  if (v.live_status === 'is_upcoming') return { unavailable: t('yt.itemUpcoming') }
  if (v.live_status === 'is_live') return { unavailable: t('yt.itemLive') }
  if (v.title === '[Private video]' || v.title === '[Deleted video]') return { unavailable: t('yt.itemPrivate') }
  if (v.availability === 'premium_only') return { unavailable: t('yt.itemPremium') }
  if (v.availability === 'subscriber_only') return { needVip: true, badge: t('yt.badgeMembers') }
  if (v.availability === 'needs_auth') return { badge: t('yt.badgeLogin') }
  if (v.live_status === 'was_live' || v.live_status === 'post_live') return { badge: t('yt.badgeReplay') }
  return {}
}

export function videoToItem(v: YtVideoInfo, index: number): MediaItem {
  return {
    key: ytKey(v.id),
    kind: 'youtube',
    title: v.title,
    index,
    cid: 0,
    ytId: v.id,
    cover: thumbOf(v.thumbnails, v.id) || v.thumbnail || undefined,
    duration: v.duration ?? undefined,
    pubdate: pubdateOf(v),
    desc: v.description ?? undefined,
    owner: ownerOf(v),
    channelId: v.channel_id ?? undefined,
    ...availability(v)
  }
}

const isPlaylistEntry = (e: YtFlatEntry): boolean => e.ie_key === 'YoutubeTab' || /[?&]list=/.test(e.url ?? '')

export function entryToItem(e: YtFlatEntry, index: number, fallbackOwner?: string): MediaItem {
  const owner = ownerOf(e) ?? fallbackOwner
  if (isPlaylistEntry(e)) {
    return {
      key: `${YT_PLAYLIST_KEY}${e.id}`,
      kind: 'youtube',
      title: e.title ?? e.id,
      index,
      cid: 0,
      cover: thumbOf(e.thumbnails) || undefined,
      // 频道播放列表页里 yt-dlp 把 channel 写成 “Playlist”，不可信
      owner: fallbackOwner,
      channelId: e.channel_id ?? undefined,
      lazy: true,
      pages: e.playlist_count ?? undefined,
      badge: t('yt.badgePlaylist')
    }
  }
  return {
    key: ytKey(e.id),
    kind: 'youtube',
    title: e.title ?? e.id,
    index,
    cid: 0,
    ytId: e.id,
    cover: thumbOf(e.thumbnails, e.id),
    duration: e.duration ?? undefined,
    pubdate: pubdateOf(e),
    desc: e.description ?? undefined,
    owner,
    channelId: e.channel_id ?? undefined,
    ...availability(e)
  }
}

/** 单个视频 */
export function videoResult(v: YtVideoInfo): ParseResult {
  const item = videoToItem(v, 1)
  return {
    kind: 'youtube',
    title: v.title,
    cover: item.cover ?? '',
    owner: item.owner,
    meta: {
      desc: v.description ?? undefined,
      owner: item.owner,
      pubdate: item.pubdate,
      genres: v.categories ?? undefined,
      url: v.webpage_url ?? ytWatchUrl(v.id)
    },
    groups: [{ id: 'video', title: t('yt.groupVideo'), items: [item] }],
    defaultSelected: [item.key]
  }
}

const GROUP_TITLE: Record<YtTarget['type'], 'yt.groupPlaylist' | 'yt.groupChannel' | 'yt.groupFeed' | 'yt.groupVideo'> = {
  video: 'yt.groupVideo',
  playlist: 'yt.groupPlaylist',
  channel: 'yt.groupChannel',
  feed: 'yt.groupFeed'
}

/** 还有没有下一页：知道总数时按总数，不知道时看这页满没满 */
export const hasMoreAfter = (count: number | null | undefined, page: number, got: number): boolean =>
  count ? page * YT_PAGE < count : got >= YT_PAGE

/** 播放列表、频道、个人列表的第一页 */
export function listResult(pl: YtPlaylistInfo, target: YtTarget, url: string): ParseResult {
  const owner = ownerOf(pl)
  const items = (pl.entries ?? []).map((e, i) => entryToItem(e, i + 1, owner))
  const video = target.type === 'playlist' ? target.video : undefined
  const selectable = items.filter((i) => !i.unavailable)
  const hasMore = hasMoreAfter(pl.playlist_count, 1, items.length)
  return {
    kind: 'youtube',
    title: pl.title || owner || url,
    cover: thumbOf(pl.thumbnails) || items.find((i) => i.cover)?.cover || '',
    owner,
    meta: { desc: pl.description || undefined, owner, url: pl.webpage_url ?? url },
    groups: [{ id: 'list', title: t(GROUP_TITLE[target.type]), items }],
    // 从播放列表里的某个视频点进来的只选它（不在第一页时全选）
    defaultSelected: video && items.some((i) => i.ytId === video) ? [ytKey(video)] : selectable.map((i) => i.key),
    paging: hasMore || pl.playlist_count
      ? { source: { type: 'yt', url }, page: 1, total: pl.playlist_count ?? 0, hasMore }
      : undefined
  }
}

/** 第 page 页 */
export function pageResult(pl: YtPlaylistInfo, page: number): PageResult {
  const owner = ownerOf(pl)
  const items = (pl.entries ?? []).map((e, i) => entryToItem(e, (page - 1) * YT_PAGE + i + 1, owner))
  return { items, page, total: pl.playlist_count ?? 0, hasMore: hasMoreAfter(pl.playlist_count, page, items.length) }
}

/** yt-dlp 的 --playlist-items 区间（从 1 开始，含两端） */
export const pageRange = (page: number): string => `${(page - 1) * YT_PAGE + 1}:${page * YT_PAGE}`
