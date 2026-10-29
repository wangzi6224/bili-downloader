import { isAbsolute, normalize, sep } from 'node:path'
import type { CodecPref, DownloadOptions } from '@shared/types'
import { invalid } from './format'

/** 工具参数的校验：agent 传错时给出能照着改的提示 */

export type Args = Record<string, unknown>

const missing = (v: unknown): boolean => v === undefined || v === null

export function requireString(args: Args, key: string): string {
  const v = args[key]
  if (typeof v !== 'string' || !v.trim()) throw invalid(`缺少参数 ${key}`)
  return v.trim()
}

export function optionalString(args: Args, key: string): string | undefined {
  const v = args[key]
  if (missing(v)) return undefined
  if (typeof v !== 'string') throw invalid(`${key} 必须是字符串`)
  return v.trim() || undefined
}

export function optionalInt(args: Args, key: string, min: number, max: number, fallback: number): number {
  const v = args[key]
  if (missing(v)) return fallback
  // 有的客户端会把数字当字符串传
  const n = typeof v === 'string' && v.trim() ? Number(v) : v
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) throw invalid(`${key} 必须是 ${min}～${max} 之间的整数`)
  return n
}

export function optionalBool(args: Args, key: string, fallback: boolean): boolean {
  const v = args[key]
  if (missing(v)) return fallback
  if (typeof v !== 'boolean') throw invalid(`${key} 必须是 true 或 false`)
  return v
}

/** 字符串数组；只传一个字符串时当作只有一项 */
export function optionalStrings(args: Args, key: string): string[] | undefined {
  const v = args[key]
  if (missing(v)) return undefined
  const list = typeof v === 'string' ? [v] : v
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string' || !x)) throw invalid(`${key} 必须是字符串数组`)
  return list as string[]
}

export function requireEnum<T extends string>(args: Args, key: string, allowed: readonly T[]): T {
  const v = args[key]
  if (typeof v !== 'string' || !allowed.includes(v as T)) throw invalid(`${key} 必须是以下之一：${allowed.join('、')}`)
  return v as T
}

export function optionalEnums<T extends string>(args: Args, key: string, allowed: readonly T[]): T[] | undefined {
  const list = optionalStrings(args, key)
  const bad = list?.find((x) => !allowed.includes(x as T))
  if (bad !== undefined) throw invalid(`${key} 不认识“${bad}”，可选值：${allowed.join('、')}`)
  return list as T[] | undefined
}

/** 下载目录下的相对子目录：不能是绝对路径，也不能用 .. 跳到下载目录外面 */
export function optionalSubdir(args: Args, key: string): string | undefined {
  const v = optionalString(args, key)
  if (!v) return undefined
  const n = normalize(v)
  if (isAbsolute(v) || n === '..' || n.startsWith(`..${sep}`)) throw invalid(`${key} 必须是下载目录下的相对路径，不能用绝对路径或 ..`)
  return n
}

// ---------------- 下载选项 ----------------

type OptionKey = Exclude<keyof DownloadOptions, 'qn'>

type OptionField =
  | { key: OptionKey; type: 'boolean'; description: string }
  | { key: OptionKey; type: 'enum'; values: readonly string[]; description: string }
  | { key: OptionKey; type: 'codecs'; description: string }

const CODECS: CodecPref[] = ['avc', 'hevc', 'av1']

/** 工具参数里的字段名（snake_case）→ DownloadOptions */
const OPTION_FIELDS: Record<string, OptionField> = {
  output: { key: 'output', type: 'enum', values: ['full', 'audio', 'video'], description: '完整视频 / 仅音频 / 仅视频（无声）' },
  container: { key: 'container', type: 'enum', values: ['mp4', 'mkv'], description: '视频封装格式' },
  audio: {
    key: 'audio',
    type: 'enum',
    values: ['best', 'flac', 'dolby', '192k', '132k', '64k'],
    description: '音质：best 自动选最好的，拿不到指定档位时降档'
  },
  codec_order: { key: 'codecOrder', type: 'codecs', description: '视频编码优先级，例如 ["hevc","avc","av1"]' },
  subtitle: { key: 'subtitle', type: 'boolean', description: '字幕另存为 .srt' },
  embed_subtitle: { key: 'embedSubtitle', type: 'boolean', description: '字幕写进视频文件' },
  danmaku: { key: 'danmaku', type: 'boolean', description: '下载弹幕' },
  danmaku_format: { key: 'danmakuFormat', type: 'enum', values: ['ass', 'xml', 'both'], description: '弹幕格式' },
  cover: { key: 'cover', type: 'boolean', description: '封面另存为图片' },
  embed_cover: { key: 'embedCover', type: 'boolean', description: '封面写进视频 / 音频文件' },
  chapters: { key: 'chapters', type: 'boolean', description: '把进度条上的分段写成章节' },
  nfo: { key: 'nfo', type: 'boolean', description: '生成 Kodi / Jellyfin 的 NFO 元数据' }
}

export const optionsSchema = (description: string) => ({
  type: 'object',
  description,
  additionalProperties: false,
  properties: Object.fromEntries(
    Object.entries(OPTION_FIELDS).map(([name, f]) => [
      name,
      f.type === 'boolean'
        ? { type: 'boolean', description: f.description }
        : f.type === 'enum'
          ? { type: 'string', enum: f.values, description: f.description }
          : { type: 'array', items: { type: 'string', enum: CODECS }, description: f.description }
    ])
  )
})

export function parseOptions(raw: unknown, key: string): Partial<DownloadOptions> {
  if (missing(raw)) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) throw invalid(`${key} 必须是对象`)
  const out: Partial<Record<OptionKey, unknown>> = {}
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    const f = OPTION_FIELDS[name]
    if (!f) throw invalid(`${key}.${name} 不是可设置的选项，可选：${Object.keys(OPTION_FIELDS).join('、')}`)
    if (f.type === 'boolean' && typeof v !== 'boolean') throw invalid(`${key}.${name} 必须是 true 或 false`)
    if (f.type === 'enum' && !f.values.includes(v as string)) throw invalid(`${key}.${name} 可选值：${f.values.join('、')}`)
    if (f.type === 'codecs' && (!Array.isArray(v) || !v.length || v.some((c) => !CODECS.includes(c)))) {
      throw invalid(`${key}.${name} 必须是由 avc、hevc、av1 组成的数组`)
    }
    out[f.key] = v
  }
  return out as Partial<DownloadOptions>
}

/** 下载选项转成工具参数用的字段名 */
export const optionsOut = (o: Omit<DownloadOptions, 'qn'>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(OPTION_FIELDS).map(([name, f]) => [name, o[f.key]]))
