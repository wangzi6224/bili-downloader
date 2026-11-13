import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser'
import { writeTextAtomic } from '../store'

/**
 * 改 agent 的 MCP 配置文件：只动我们自己那一项（SERVER_NAME），其他内容、注释和格式原样保留。
 * 文件解析不了时拒绝写入，免得把用户手写的配置弄坏。
 */

export const SERVER_NAME = 'bili-downloader'

/** 写进配置的 stdio 启动方式 */
export interface StdioEntry {
  command: string
  args: string[]
  env: Record<string, string>
}

export type ConfigFormat = 'json' | 'toml'

export interface ConfigTarget {
  file: string
  format: ConfigFormat
  /** 放 MCP 服务的键：JSON 里是对象路径（如 ['mcpServers']），TOML 里是表名前缀（如 'mcp_servers'） */
  key: string[]
  /** 条目里除了 command/args/env 还要带的字段，例如 { type: 'stdio' } */
  extra?: Record<string, unknown>
  /** 只在文件已经存在时才写（例如 CodeBuddy CLI 的 .mcp.json：有它时就不再读 mcp.json） */
  optional?: boolean
}

export class ConfigParseError extends Error {
  constructor(public file: string) {
    super(file)
  }
}

const BACKUP_SUFFIX = '.bili-backup'

function read(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}

/** 第一次改之前留一份备份 */
function write(file: string, text: string): void {
  if (existsSync(file) && !existsSync(file + BACKUP_SUFFIX)) copyFileSync(file, file + BACKUP_SUFFIX)
  writeTextAtomic(file, text)
}

// ---------- JSON（含注释和尾逗号） ----------

function parseJson(file: string, text: string): Record<string, unknown> {
  if (!text.trim()) return {}
  const errors: ParseError[] = []
  const data = parse(text, errors, { allowTrailingComma: true, disallowComments: false })
  if (errors.length || !data || typeof data !== 'object' || Array.isArray(data)) throw new ConfigParseError(file)
  return data as Record<string, unknown>
}

function getPath(data: unknown, path: string[]): unknown {
  return path.reduce<unknown>((cur, k) => (cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[k] : undefined), data)
}

/** 跟随文件原来的缩进 */
function indentOf(text: string): { tabSize: number; insertSpaces: boolean } {
  const m = /\n([ \t]+)\S/.exec(text)
  if (m?.[1].startsWith('\t')) return { tabSize: 1, insertSpaces: false }
  return { tabSize: m ? m[1].length : 2, insertSpaces: true }
}

function editJson(file: string, path: string[], value: unknown): void {
  const text = read(file) ?? ''
  parseJson(file, text)
  const base = text.trim() ? text : '{}\n'
  const edits = modify(base, path, value, { formattingOptions: { ...indentOf(base), eol: '\n' } })
  if (!edits.length) return
  write(file, applyEdits(base, edits))
}

// ---------- TOML（只处理我们自己的表） ----------

const tomlString = (s: string): string => JSON.stringify(s)

function tomlBlock(prefix: string, entry: StdioEntry, extra: Record<string, unknown> = {}): string {
  const lines = [`[${prefix}.${SERVER_NAME}]`, `command = ${tomlString(entry.command)}`, `args = [${entry.args.map(tomlString).join(', ')}]`]
  for (const [k, v] of Object.entries(extra)) lines.push(`${k} = ${JSON.stringify(v)}`)
  lines.push('', `[${prefix}.${SERVER_NAME}.env]`)
  for (const [k, v] of Object.entries(entry.env)) lines.push(`${k} = ${tomlString(v)}`)
  return lines.join('\n') + '\n'
}

/** 表头（[a.b] 或 [[a.b]]）的名字，表名部分允许加引号 */
function tableName(line: string): string | undefined {
  const m = /^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/.exec(line)
  return m?.[1].replace(/\s*\.\s*/g, '.').replace(/"([^"]*)"/g, '$1')
}

const isOwn = (name: string, own: string): boolean => name === own || name.startsWith(`${own}.`)

/** 键名去掉引号和点号两边的空格，例如 mcp_servers . "bili-downloader" → mcp_servers.bili-downloader */
const normalizeKey = (key: string): string => key.replace(/\s*\.\s*/g, '.').replace(/"([^"]*)"|'([^']*)'/g, '$1$2').trim()

/**
 * 找出属于我们这张表（和它的子表）的行，返回 [起, 止) 的若干段。
 * 段尾的空行和注释不算我们的：它们通常是写给下一张表的
 */
function ownRanges(lines: string[], prefix: string): [number, number][] {
  const own = `${prefix}.${SERVER_NAME}`
  const ranges: [number, number][] = []
  let start = -1
  const close = (end: number): void => {
    while (end - 1 > start && (!lines[end - 1].trim() || lines[end - 1].trim().startsWith('#'))) end--
    ranges.push([start, end])
    start = -1
  }
  lines.forEach((line, i) => {
    const name = tableName(line)
    if (name === undefined) return
    const mine = isOwn(name, own)
    if (mine && start < 0) start = i
    if (!mine && start >= 0) close(i)
  })
  if (start >= 0) close(lines.length)
  return ranges
}

/**
 * 用户用别的写法定义了同名服务（[mcp_servers] 下的内联表、点号键）：我们认不出它的内容，
 * 再追加一张表会让同一个键定义两次，整个文件都读不了，所以拒绝改动
 */
function checkForeign(file: string, lines: string[], prefix: string): void {
  const own = `${prefix}.${SERVER_NAME}`
  let table = ''
  for (const line of lines) {
    const name = tableName(line)
    if (name !== undefined) {
      table = name
      continue
    }
    const key = /^\s*([A-Za-z0-9_\-."' ]+?)\s*=/.exec(line)?.[1]
    if (!key || isOwn(table, own)) continue
    const full = normalizeKey(table ? `${table}.${key}` : key)
    if (isOwn(full, own) || (full === prefix && line.includes(SERVER_NAME))) throw new ConfigParseError(file)
  }
}

/** 去掉我们的表，返回剩下的行和原来的位置（没有时为 -1） */
function stripToml(text: string, prefix: string): { lines: string[]; at: number } {
  const lines = text.split('\n')
  const ranges = ownRanges(lines, prefix)
  // 从后往前删，第一段的位置不受影响
  for (const [s, e] of [...ranges].reverse()) lines.splice(s, e - s)
  return { lines, at: ranges.length ? ranges[0][0] : -1 }
}

function editToml(file: string, prefix: string, entry: StdioEntry | undefined, extra?: Record<string, unknown>): boolean {
  const text = read(file) ?? ''
  checkForeign(file, text.split('\n'), prefix)
  const { lines, at } = stripToml(text, prefix)
  if (!entry) {
    if (at < 0) return false
    // 只收拾删除处多出来的空行，文件别处（例如多行字符串里）的空行不动
    while (at > 0 && at < lines.length && !lines[at - 1].trim() && !lines[at].trim()) lines.splice(at, 1)
    write(file, lines.join('\n').replace(/\n+$/, '\n'))
    return true
  }
  const block = tomlBlock(prefix, entry, extra).replace(/\n$/, '').split('\n')
  let next: string
  if (at >= 0) {
    lines.splice(at, 0, ...block)
    next = lines.join('\n')
  } else {
    const body = text.replace(/\s*$/, '')
    next = body ? `${body}\n\n${block.join('\n')}\n` : `${block.join('\n')}\n`
  }
  if (next !== text) write(file, next)
  return true
}

function readTomlEntry(text: string, prefix: string): Partial<StdioEntry> | undefined {
  const lines = text.split('\n')
  const ranges = ownRanges(lines, prefix)
  if (!ranges.length) return undefined
  const out: Partial<StdioEntry> = {}
  for (const [s, e] of ranges) {
    for (const line of lines.slice(s, e)) {
      const m = /^\s*(command|args)\s*=\s*(.+?)\s*$/.exec(line)
      if (!m) continue
      try {
        if (m[1] === 'command') out.command = JSON.parse(m[2])
        else out.args = JSON.parse(m[2])
      } catch {
        // 不是我们写的格式（例如单引号字符串），当作不一致，下次同步会重写
      }
    }
  }
  return out
}

// ---------- 对外 ----------

/** 写入或更新我们的条目 */
export function writeEntry(target: ConfigTarget, entry: StdioEntry): void {
  if (target.format === 'toml') {
    editToml(target.file, target.key.join('.'), entry, target.extra)
    return
  }
  editJson(target.file, [...target.key, SERVER_NAME], { ...target.extra, command: entry.command, args: entry.args, env: entry.env })
}

/** 删掉我们的条目；本来就没有时返回 false */
export function removeEntry(target: ConfigTarget): boolean {
  const text = read(target.file)
  if (text === undefined) return false
  if (target.format === 'toml') return editToml(target.file, target.key.join('.'), undefined)
  if (getPath(parseJson(target.file, text), [...target.key, SERVER_NAME]) === undefined) return false
  editJson(target.file, [...target.key, SERVER_NAME], undefined)
  return true
}

/** 读出现有条目的 command 和 args，用来判断要不要更新；没有返回 undefined，文件坏了抛 ConfigParseError */
export function readEntry(target: ConfigTarget): Partial<StdioEntry> | undefined {
  const text = read(target.file)
  if (text === undefined) return undefined
  if (target.format === 'toml') {
    checkForeign(target.file, text.split('\n'), target.key.join('.'))
    return readTomlEntry(text, target.key.join('.'))
  }
  const v = getPath(parseJson(target.file, text), [...target.key, SERVER_NAME])
  return v && typeof v === 'object' ? (v as Partial<StdioEntry>) : undefined
}

export const sameEntry = (a: Partial<StdioEntry> | undefined, b: StdioEntry): boolean =>
  !!a && a.command === b.command && JSON.stringify(a.args) === JSON.stringify(b.args)
