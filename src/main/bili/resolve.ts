import type { ParseResult } from '@shared/types'
import { BASE_HEADERS } from './http'
import { parseInput, type Target } from '@shared/parseUrl'
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
  const target = parsed?.type === 'short' ? await expandShort(parsed.url) : parsed
  if (!target) throw new Error('没有识别出 B站视频、番剧或电影链接')
  return target.type === 'ugc' ? parseUgc(target) : parsePgc(target)
}
