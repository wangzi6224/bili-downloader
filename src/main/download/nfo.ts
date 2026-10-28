// Kodi / Jellyfin / Emby 能识别的 NFO 元数据
import type { MediaItem, MediaMeta } from '@shared/types'

const esc = (s: string): string =>
  s
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const date = (sec?: number): string | undefined => (sec ? new Date(sec * 1000).toISOString().slice(0, 10) : undefined)

function tags(fields: [string, string | number | undefined][]): string {
  return fields
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `  <${k}>${esc(String(v))}</${k}>`)
    .join('\n')
}

const xml = (root: string, body: string): string =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<${root}>\n${body}\n</${root}>\n`

/** 普通视频、电影：每个文件一份 movie 结构 */
export function movieNfo(item: MediaItem, meta: MediaMeta = {}, series?: string): string {
  const pub = item.pubdate ?? meta.pubdate
  const id = item.bvid ?? (item.epId ? `ep${item.epId}` : String(item.cid))
  return xml(
    'movie',
    [
      tags([
        ['title', item.title],
        ['originaltitle', series && series !== item.title ? series : undefined],
        ['plot', item.desc ?? meta.desc],
        ['premiered', date(pub)],
        ['year', pub ? new Date(pub * 1000).getFullYear() : undefined],
        ['runtime', item.duration ? Math.round(item.duration / 60) : undefined],
        ['studio', meta.owner],
        ['director', meta.owner]
      ]),
      ...(meta.genres ?? []).map((g) => `  <genre>${esc(g)}</genre>`),
      `  <uniqueid type="bilibili" default="true">${esc(id)}</uniqueid>`,
      tags([['website', meta.url]])
    ]
      .filter(Boolean)
      .join('\n')
  )
}

/** 番剧整季一份 tvshow.nfo */
export function tvshowNfo(title: string, meta: MediaMeta = {}): string {
  return xml(
    'tvshow',
    [
      tags([
        ['title', title],
        ['plot', meta.desc],
        ['premiered', date(meta.pubdate)],
        ['studio', meta.owner]
      ]),
      ...(meta.genres ?? []).map((g) => `  <genre>${esc(g)}</genre>`),
      tags([['website', meta.url]])
    ]
      .filter(Boolean)
      .join('\n')
  )
}

/** 番剧每集一份 */
export function episodeNfo(item: MediaItem, showTitle: string): string {
  return xml(
    'episodedetails',
    [
      tags([
        ['title', item.title],
        ['showtitle', showTitle],
        ['season', 1],
        ['episode', item.index],
        ['plot', item.desc],
        ['aired', date(item.pubdate)],
        ['runtime', item.duration ? Math.round(item.duration / 60) : undefined]
      ]),
      `  <uniqueid type="bilibili" default="true">${esc(item.epId ? `ep${item.epId}` : String(item.cid))}</uniqueid>`
    ].join('\n')
  )
}
