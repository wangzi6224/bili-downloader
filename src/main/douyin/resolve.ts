// 抖音接口返回的作品换成应用里的条目和解析结果（纯函数）
import { t } from '@shared/i18n'
import { dyVideoUrl } from '@shared/douyinUrl'
import { dyKey } from '@shared/site'
import type { MediaItem, MediaMeta, Paging, ParseResult } from '@shared/types'
import type { DyAweme, DyImage, DyUrlList } from './types'

const TITLE_MAX = 80

/** 标题取描述的第一行；文件名要稳定，兜底名不随界面语言变 */
export function awemeTitle(a: Pick<DyAweme, 'aweme_id' | 'desc'>): string {
  const line = a.desc?.split('\n').map((s) => s.trim()).find(Boolean)
  return line ? [...line].slice(0, TITLE_MAX).join('') : `抖音_${a.aweme_id}`
}

export const firstUrl = (u?: DyUrlList): string | undefined => u?.url_list?.find(Boolean)

/** 图片地址里 jpeg 的那条兼容性最好，没有就用第一条 */
export const imageUrl = (image: DyImage): string | undefined =>
  image.url_list?.find((u) => /\.jpe?g(\?|$)/i.test(u)) ?? image.url_list?.find(Boolean)

export function awemeCover(a: DyAweme): string | undefined {
  if (a.images?.length) return imageUrl(a.images[0])
  return firstUrl(a.video?.origin_cover) ?? firstUrl(a.video?.cover)
}

export const awemeSeconds = (a: DyAweme): number => Math.round((a.video?.duration ?? a.duration ?? 0) / 1000)

/** 视频或图文至少要有一个能下的地址 */
const downloadable = (a: DyAweme): boolean =>
  a.images?.length
    ? a.images.some((i) => imageUrl(i))
    : Boolean(a.video?.bit_rate?.some((b) => firstUrl(b.play_addr)) || firstUrl(a.video?.play_addr))

export function awemeItem(a: DyAweme, index: number): MediaItem {
  const images = a.images?.length || undefined
  const unavailable = a.status?.is_delete ? t('dy.errDeleted') : downloadable(a) ? undefined : t('dy.noStream')
  return {
    key: dyKey(a.aweme_id),
    kind: 'douyin',
    dyId: a.aweme_id,
    cid: 0,
    title: awemeTitle(a),
    index,
    cover: awemeCover(a),
    duration: images ? undefined : awemeSeconds(a) || undefined,
    pubdate: a.create_time,
    desc: a.desc || undefined,
    owner: a.author?.nickname,
    secUid: a.author?.sec_uid,
    ...(images ? { images, badge: t('dy.imagesBadge') } : {}),
    ...(a.is_top === 1 ? { pinned: true } : {}),
    ...(unavailable ? { unavailable } : {})
  }
}

const metaOf = (item: MediaItem, url: string): MediaMeta => ({ owner: item.owner, desc: item.desc, pubdate: item.pubdate, url })

export function singleResult(a: DyAweme): ParseResult {
  const item = awemeItem(a, 1)
  return {
    kind: 'douyin',
    title: item.title,
    cover: item.cover ?? '',
    owner: item.owner,
    meta: metaOf(item, dyVideoUrl(a.aweme_id)),
    groups: [{ id: 'dy', title: item.title, items: [item] }],
    defaultSelected: item.unavailable ? [] : [item.key]
  }
}

export interface ListInfo {
  title: string
  url: string
  owner?: string
  cover?: string
  awemes: DyAweme[]
  paging?: Paging
  note?: string
}

export function listResult(l: ListInfo): ParseResult {
  const items = l.awemes.map((a, i) => awemeItem(a, i + 1))
  return {
    kind: 'douyin',
    title: l.title,
    cover: l.cover ?? items.find((i) => i.cover)?.cover ?? '',
    owner: l.owner,
    meta: { owner: l.owner, url: l.url },
    groups: [{ id: 'dy', title: l.title, items }],
    defaultSelected: items.filter((i) => !i.unavailable).map((i) => i.key),
    ...(l.paging ? { paging: l.paging } : {}),
    ...(l.note ? { note: l.note } : {})
  }
}
