import type { MediaItem } from './types'

/**
 * 判断是否下载过：按条目 key 查下载历史。
 * 列表里还没展开分P的视频（key 里没有 cid），按 BV 号判断
 */
export function downloadedMatcher(keys: Iterable<string>): (i: MediaItem) => boolean {
  const set = new Set(keys)
  // 普通视频的 key 是 ugc:BV号:cid
  const bvids = new Set([...set].map((k) => k.split(':')[1]))
  return (i) => set.has(i.key) || Boolean(i.lazy && i.bvid && bvids.has(i.bvid))
}
