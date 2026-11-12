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

/**
 * 来源明细里的下载状态。还没展开分P的视频按 BV 号数下载过的分P：
 * 列表给了分P数（收藏夹、稍后再看）就和它比，少了算部分下载；
 * 合集、系列的列表不给分P数，下载过就算已下载，和订阅检查的判断一致。
 */
export function downloadStatusMatcher(keys: Iterable<string>): (item: MediaItem) => 'downloaded' | 'parts' | 'missing' {
  const exact = new Set(keys)
  const parts = new Map<string, Set<string>>()
  for (const key of exact) {
    const [kind, bvid, cid] = key.split(':')
    if (kind !== 'ugc' || !cid) continue
    const cids = parts.get(bvid) ?? new Set<string>()
    cids.add(cid)
    parts.set(bvid, cids)
  }
  return (item) => {
    if (item.kind === 'ugc' && item.lazy) {
      const got = item.bvid ? parts.get(item.bvid)?.size ?? 0 : 0
      if (!got) return 'missing'
      return item.pages && got < item.pages ? 'parts' : 'downloaded'
    }
    return exact.has(item.key) ? 'downloaded' : 'missing'
  }
}
