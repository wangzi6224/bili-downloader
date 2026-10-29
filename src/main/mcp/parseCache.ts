import type { MediaItem, ParseResult } from '@shared/types'

export interface FullParse {
  result: ParseResult
  /** 各组的条目拍平 */
  items: MediaItem[]
  /** 分页来源是否已经翻到底（不超过要求的条数） */
  complete: boolean
  /** 翻到一半出错时的原因，items 是出错前拿到的部分 */
  error?: string
}

interface Entry extends FullParse {
  at: number
  maxItems: number
}

const TTL = 10 * 60_000
/** 最多记住多少个视频的分P */
const MAX_PARTS = 5000

/** 缓存里的比要求的多时只取前 maxItems 条，这时算没取全 */
const upTo = (e: FullParse, maxItems: number): FullParse =>
  e.items.length > maxItems ? { result: e.result, items: e.items.slice(0, maxItems), complete: false, error: e.error } : e

/**
 * 解析结果缓存：agent 先 parse_link 再 download_batch，或者分段读取条目时，
 * 不用每次都重新翻页。也记下列表视频展开出的分P，加入下载时不用再查一遍
 */
export class ParseCache {
  private entries = new Map<string, Entry>()
  private inflight = new Map<string, Promise<unknown>>()
  private parts = new Map<string, MediaItem[]>()

  constructor(
    private fetchAll: (input: string, maxItems: number) => Promise<{ result: ParseResult; complete: boolean; error?: string }>,
    private now: () => number = Date.now
  ) {}

  /**
   * 缓存过期、要求重新解析，或者上次没翻完而这次要的更多时重新解析。
   * 同一个链接正在解析时（例如上次调用超时后 agent 又调了一次）先等它结束，不重复翻页
   */
  async get(input: string, maxItems: number, refresh = false): Promise<FullParse> {
    const key = input.trim()
    for (let p = this.inflight.get(key); p; p = this.inflight.get(key)) await p.catch(() => {})
    const hit = this.entries.get(key)
    if (!refresh && hit && this.now() - hit.at < TTL && (hit.complete || hit.maxItems >= maxItems)) return upTo(hit, maxItems)
    const task = this.fetchAll(key, maxItems)
    this.inflight.set(key, task)
    try {
      const { result, complete, error } = await task
      const entry: Entry = { result, complete, error, items: result.groups.flatMap((g) => g.items), at: this.now(), maxItems }
      for (const [k, e] of this.entries) if (this.now() - e.at >= TTL) this.entries.delete(k)
      // 出错只拿到一部分的不缓存，下次重新翻
      if (!error) this.entries.set(key, entry)
      return upTo(entry, maxItems)
    } finally {
      this.inflight.delete(key)
    }
  }

  partsOf(videoKey: string): MediaItem[] | undefined {
    return this.parts.get(videoKey)
  }

  /** 列表里的视频展开出的分P，按视频的 key 记下 */
  setParts(videoKey: string, parts: MediaItem[]): void {
    this.parts.delete(videoKey)
    this.parts.set(videoKey, parts)
    // Map 按插入顺序遍历，超出上限时丢掉最早记下的
    if (this.parts.size > MAX_PARTS) this.parts.delete(this.parts.keys().next().value!)
  }
}
