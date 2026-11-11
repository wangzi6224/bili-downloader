import { isAbsolute, normalize, sep } from 'node:path'
import { joinList, t, type Key } from '@shared/i18n'
import type { CodecPref, DownloadOptions } from '@shared/types'
import { invalid } from './format'

/** 工具参数的校验：agent 传错时给出能照着改的提示 */

export type Args = Record<string, unknown>

const missing = (v: unknown): boolean => v === undefined || v === null

export function requireString(args: Args, key: string): string {
  const v = args[key]
  if (typeof v !== 'string' || !v.trim()) throw invalid(t('mcp.argMissing', { key }))
  return v.trim()
}

export function optionalString(args: Args, key: string): string | undefined {
  const v = args[key]
  if (missing(v)) return undefined
  if (typeof v !== 'string') throw invalid(t('mcp.argString', { key }))
  return v.trim() || undefined
}

export function optionalInt(args: Args, key: string, min: number, max: number, fallback: number): number {
  const v = args[key]
  if (missing(v)) return fallback
  // 有的客户端会把数字当字符串传
  const n = typeof v === 'string' && v.trim() ? Number(v) : v
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) throw invalid(t('mcp.argInt', { key, min, max }))
  return n
}

export function optionalBool(args: Args, key: string, fallback: boolean): boolean {
  const v = args[key]
  if (missing(v)) return fallback
  if (typeof v !== 'boolean') throw invalid(t('mcp.argBool', { key }))
  return v
}

/** 字符串数组；只传一个字符串时当作只有一项 */
export function optionalStrings(args: Args, key: string): string[] | undefined {
  const v = args[key]
  if (missing(v)) return undefined
  const list = typeof v === 'string' ? [v] : v
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string' || !x)) throw invalid(t('mcp.argStrings', { key }))
  return list as string[]
}

export function requireEnum<T extends string>(args: Args, key: string, allowed: readonly T[]): T {
  const v = args[key]
  if (typeof v !== 'string' || !allowed.includes(v as T)) throw invalid(t('mcp.argEnum', { key, values: joinList(allowed) }))
  return v as T
}

export function optionalEnum<T extends string>(args: Args, key: string, allowed: readonly T[], fallback: T): T {
  return missing(args[key]) ? fallback : requireEnum(args, key, allowed)
}

/** YYYY-MM-DD 按北京时间解析，返回这一天开始时的秒级时间戳 */
export function optionalDay(args: Args, key: string): number | undefined {
  const v = optionalString(args, key)
  if (v === undefined) return undefined
  const ms = Date.parse(`${v}T00:00:00+08:00`)
  // 转回日期再比较：2 月 31 日这样的日期有时不会报错，而是顺延到下个月
  const same = !Number.isNaN(ms) && new Date(ms + 8 * 3600_000).toISOString().slice(0, 10) === v
  if (!same) throw invalid(t('mcp.argDay', { key }))
  return ms / 1000
}

export function optionalEnums<T extends string>(args: Args, key: string, allowed: readonly T[]): T[] | undefined {
  const list = optionalStrings(args, key)
  const bad = list?.find((x) => !allowed.includes(x as T))
  if (bad !== undefined) throw invalid(t('mcp.argEnumsUnknown', { key, value: bad, values: joinList(allowed) }))
  return list as T[] | undefined
}

/** 下载目录下的相对子目录：不能是绝对路径，也不能用 .. 跳到下载目录外面 */
export function optionalSubdir(args: Args, key: string): string | undefined {
  const v = optionalString(args, key)
  if (!v) return undefined
  const n = normalize(v)
  if (isAbsolute(v) || n === '..' || n.startsWith(`..${sep}`)) throw invalid(t('mcp.argSubdir', { key }))
  return n
}

// ---------------- 下载选项 ----------------

type OptionKey = Exclude<keyof DownloadOptions, 'qn'>

type OptionField =
  | { key: OptionKey; type: 'boolean'; description: Key }
  | { key: OptionKey; type: 'enum'; values: readonly string[]; description: Key }
  | { key: OptionKey; type: 'codecs'; description: Key }

const CODECS: CodecPref[] = ['avc', 'hevc', 'av1']

/** 工具参数里的字段名（snake_case）→ DownloadOptions */
const OPTION_FIELDS: Record<string, OptionField> = {
  output: { key: 'output', type: 'enum', values: ['full', 'audio', 'video'], description: 'mcpTools.optOutput' },
  container: { key: 'container', type: 'enum', values: ['mp4', 'mkv'], description: 'mcpTools.optContainer' },
  audio: { key: 'audio', type: 'enum', values: ['best', 'flac', 'dolby', '192k', '132k', '64k'], description: 'mcpTools.optAudio' },
  codec_order: { key: 'codecOrder', type: 'codecs', description: 'mcpTools.optCodecOrder' },
  subtitle: { key: 'subtitle', type: 'boolean', description: 'mcpTools.optSubtitle' },
  embed_subtitle: { key: 'embedSubtitle', type: 'boolean', description: 'mcpTools.optEmbedSubtitle' },
  danmaku: { key: 'danmaku', type: 'boolean', description: 'mcpTools.optDanmaku' },
  danmaku_format: { key: 'danmakuFormat', type: 'enum', values: ['ass', 'xml', 'both'], description: 'mcpTools.optDanmakuFormat' },
  cover: { key: 'cover', type: 'boolean', description: 'mcpTools.optCover' },
  embed_cover: { key: 'embedCover', type: 'boolean', description: 'mcpTools.optEmbedCover' },
  chapters: { key: 'chapters', type: 'boolean', description: 'mcpTools.optChapters' },
  nfo: { key: 'nfo', type: 'boolean', description: 'mcpTools.optNfo' },
  watermark: { key: 'watermark', type: 'enum', values: ['off', 'auto', 'ai'], description: 'mcpTools.optWatermark' }
}

/** 按当前语言生成，每次 tools/list 时调用 */
export const optionsSchema = (description: string) => ({
  type: 'object',
  description,
  additionalProperties: false,
  properties: Object.fromEntries(
    Object.entries(OPTION_FIELDS).map(([name, f]) => [
      name,
      f.type === 'boolean'
        ? { type: 'boolean', description: t(f.description) }
        : f.type === 'enum'
          ? { type: 'string', enum: f.values, description: t(f.description) }
          : { type: 'array', items: { type: 'string', enum: CODECS }, description: t(f.description) }
    ])
  )
})

export function parseOptions(raw: unknown, key: string): Partial<DownloadOptions> {
  if (missing(raw)) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) throw invalid(t('mcp.argObject', { key }))
  const out: Partial<Record<OptionKey, unknown>> = {}
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    const f = OPTION_FIELDS[name]
    if (!f) throw invalid(t('mcp.optionUnknown', { key, name, names: joinList(Object.keys(OPTION_FIELDS)) }))
    if (f.type === 'boolean' && typeof v !== 'boolean') throw invalid(t('mcp.optionBool', { key, name }))
    if (f.type === 'enum' && !f.values.includes(v as string)) throw invalid(t('mcp.optionValues', { key, name, values: joinList(f.values) }))
    if (f.type === 'codecs' && (!Array.isArray(v) || !v.length || v.some((c) => !CODECS.includes(c)))) {
      throw invalid(t('mcp.optionCodecs', { key, name, codecs: joinList(CODECS) }))
    }
    out[f.key] = v
  }
  return out as Partial<DownloadOptions>
}

/** 下载选项转成工具参数用的字段名 */
export const optionsOut = (o: Omit<DownloadOptions, 'qn'>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(OPTION_FIELDS).map(([name, f]) => [name, o[f.key]]))
