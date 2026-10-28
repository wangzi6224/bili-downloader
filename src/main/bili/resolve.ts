import { parseInput, RANK_SLUGS, type Target } from '@shared/parseUrl'
import type { MediaGroup, ParseResult } from '@shared/types'
import { parseAudio, parseAudioMenu } from './audio'
import { parseCheese } from './cheese'
import { BASE_HEADERS } from './http'
import { parseFav, parseRank, parseSpace, parseSpaceSeason, parseSpaceSeries, parseWatchLater, parseWeekly } from './lists'
import { parsePgc } from './pgc'
import { parseUgc } from './ugc'

type Resolved = Exclude<Target, { type: 'short' }>

async function expandShort(url: string): Promise<Resolved | null> {
  const res = await fetch(url, { headers: BASE_HEADERS, redirect: 'follow' })
  const target = parseInput(res.url)
  return target?.type === 'short' ? null : target
}

export async function resolveInput(input: string): Promise<ParseResult> {
  const parsed = parseInput(input)
  const t = parsed?.type === 'short' ? await expandShort(parsed.url) : parsed
  if (!t) throw new Error('没有识别出 B站视频、番剧、课程、收藏夹或 UP 主链接')
  switch (t.type) {
    case 'ugc':
      return parseUgc(t)
    case 'pgc':
      return parsePgc(t)
    case 'cheese':
      return parseCheese(t)
    case 'fav':
      return parseFav(t.mediaId)
    case 'space':
      return parseSpace(t.mid, t.keyword)
    case 'spaceSeason':
      return parseSpaceSeason(t.mid, t.seasonId)
    case 'spaceSeries':
      return parseSpaceSeries(t.mid, t.seriesId)
    case 'watchlater':
      return parseWatchLater()
    case 'audio':
      return parseAudio(t.sid)
    case 'audioMenu':
      return parseAudioMenu(t.amid)
    case 'weekly':
      return parseWeekly(t.number)
    case 'rank':
      return parseRank(t.slug, RANK_SLUGS[t.slug])
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * 多个链接逐个解析，每个来源合成一组。间隔 0.5 秒，避免短时间大量请求触发风控；
 * 单个失败不影响其他链接。
 */
export async function resolveBatch(
  inputs: string[],
  onProgress?: (done: number, total: number, title?: string) => void
): Promise<ParseResult> {
  const groups: MediaGroup[] = []
  const defaultSelected: string[] = []
  const failures: { input: string; error: string }[] = []
  const seen = new Set<string>()
  for (const [i, input] of inputs.entries()) {
    try {
      const r = await resolveInput(input)
      const items = r.groups.flatMap((g) => g.items).filter((it) => !seen.has(it.key))
      items.forEach((it) => seen.add(it.key))
      groups.push({
        id: `batch-${i}`,
        title: r.title,
        items,
        source: { title: r.title, kind: r.kind, cover: r.cover, meta: r.meta }
      })
      // 普通链接沿用各自的默认选择；收藏夹、UP 主这类列表默认全选已加载的第一页
      defaultSelected.push(...(r.defaultSelected.length ? r.defaultSelected : items.map((it) => it.key)))
      onProgress?.(i + 1, inputs.length, r.title)
    } catch (e) {
      failures.push({ input, error: e instanceof Error ? e.message : String(e) })
      onProgress?.(i + 1, inputs.length)
    }
    if (i < inputs.length - 1) await sleep(500)
  }
  if (!groups.length) throw new Error(`全部 ${inputs.length} 个链接都解析失败：${failures[0]?.error ?? ''}`)
  return {
    kind: groups[0].source!.kind,
    title: `批量解析（${groups.length} 个来源）`,
    cover: groups[0].source!.cover,
    groups,
    defaultSelected,
    batch: true,
    failures: failures.length ? failures : undefined
  }
}
