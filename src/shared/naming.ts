import { sanitize } from './filename'

/**
 * 命名模板：
 * - {变量} 或 {变量:格式}；数字格式是补零宽度（{index:03}），时间格式用 YYYY MM DD HH mm ss
 * - <…> 是可选段：段内任一变量为空时整段去掉，一条规则可以同时适配单个视频和合集
 * - / 分隔目录层级，空的层级自动省略
 */

export type NamingKind = 'text' | 'number' | 'date'

export interface NamingVar {
  name: string
  label: string
  kind: NamingKind
}

export const NAMING_VARS: NamingVar[] = [
  { name: 'title', label: '标题（分P / 单集标题）', kind: 'text' },
  { name: 'series', label: '合集、剧集或多P视频的总标题，单个视频时为空', kind: 'text' },
  { name: 'index', label: '序号', kind: 'number' },
  { name: 'owner', label: 'UP 主', kind: 'text' },
  { name: 'owner_mid', label: 'UP 主 UID', kind: 'number' },
  { name: 'pubdate', label: '发布时间', kind: 'date' },
  { name: 'date', label: '创建任务的时间', kind: 'date' },
  { name: 'quality', label: '画质', kind: 'text' },
  { name: 'codec', label: '编码', kind: 'text' },
  { name: 'bvid', label: 'BV 号', kind: 'text' },
  { name: 'aid', label: 'av 号', kind: 'number' },
  { name: 'cid', label: 'cid', kind: 'number' },
  { name: 'ep_id', label: '番剧单集 ID', kind: 'number' },
  { name: 'type', label: '类型（视频 / 番剧影视）', kind: 'text' }
]

const VAR_KIND = new Map(NAMING_VARS.map((v) => [v.name, v.kind]))
const VAR_RE = /\{(\w+)(?::([^}]+))?\}/g

export type NamingValues = Partial<Record<string, string | number | undefined>>

export interface NamingTemplates {
  /** 只下载一个时 */
  single: string
  /** 一次下载合集、分P里的多个 */
  multi: string
  /** 一次下载番剧、影视里的多集 */
  pgc: string
}

export const DEFAULT_TEMPLATES: NamingTemplates = {
  single: '<{series} - >{title}',
  multi: '{series}/<{index:02} - >{title}',
  pgc: '{series}/<{index:02} - >{title}'
}

/** 适合 Jellyfin / Kodi 媒体库的番剧命名 */
export const MEDIA_LIBRARY_PGC = '{series}/{series} S01E{index:02} <{title}>'

function formatDate(sec: number, fmt: string): string {
  const d = new Date(sec * 1000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return fmt
    .replace(/YYYY/g, String(d.getFullYear()))
    .replace(/MM/g, pad(d.getMonth() + 1))
    .replace(/DD/g, pad(d.getDate()))
    .replace(/HH/g, pad(d.getHours()))
    .replace(/mm/g, pad(d.getMinutes()))
    .replace(/ss/g, pad(d.getSeconds()))
}

function formatVar(name: string, value: string | number | undefined, fmt?: string): string {
  if (value === undefined || value === null || value === '') return ''
  const kind = VAR_KIND.get(name)
  if (kind === 'date') {
    const sec = Number(value)
    return sec > 0 ? formatDate(sec, fmt || 'YYYY-MM-DD') : ''
  }
  if (kind === 'number' && fmt && /^\d+$/.test(fmt)) return String(value).padStart(Number(fmt), '0')
  return String(value)
}

/** 返回错误说明，模板合法时返回 null */
export function validateTemplate(tpl: string): string | null {
  if (!tpl.trim()) return '模板不能为空'
  let depth = 0
  for (const ch of tpl) {
    if (ch === '<') depth++
    if (ch === '>') depth--
    if (depth > 1) return '可选段 <…> 不能嵌套'
    if (depth < 0) return '多了一个 >'
  }
  if (depth !== 0) return '可选段 <…> 没有闭合'
  for (const m of tpl.matchAll(VAR_RE)) {
    if (!VAR_KIND.has(m[1])) return `不认识的变量 {${m[1]}}`
  }
  if (/\{[^}]*$/.test(tpl) || /\{(?!\w)/.test(tpl)) return '变量的花括号没有写完整'
  return null
}

/** 渲染成相对下载目录、不含扩展名的路径；每一级都会去掉非法字符 */
export function renderTemplate(tpl: string, values: NamingValues): string {
  const fill = (s: string, onEmpty?: () => void): string =>
    s.replace(VAR_RE, (_, name: string, fmt?: string) => {
      const v = formatVar(name, values[name], fmt)
      if (!v) onEmpty?.()
      return v.replace(/\//g, '／')
    })

  const expanded = fill(
    tpl.replace(/<([^<>]*)>/g, (_, inner: string) => {
      let empty = false
      const r = fill(inner, () => (empty = true))
      // 已经展开过的片段要转义掉花括号，避免被外层再替换一次
      return empty ? '' : r.replace(/\{/g, '\u0000').replace(/\}/g, '\u0001')
    })
  )
    .replace(/\u0000/g, '{')
    .replace(/\u0001/g, '}')

  const parts = expanded
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
    .map(sanitize)
  return parts.length ? parts.join('/') : sanitize(String(values.title ?? ''))
}

export const SAMPLE_VALUES: Record<'single' | 'multi' | 'pgc', NamingValues> = {
  single: {
    title: '【官方 MV】Never Gonna Give You Up',
    series: '',
    index: 1,
    owner: '索尼音乐中国',
    owner_mid: 486906719,
    pubdate: 1577808000,
    date: Math.floor(Date.now() / 1000),
    quality: '1080P 高清',
    codec: 'AVC',
    bvid: 'BV1GJ411x7h7',
    aid: 80433022,
    cid: 137649199,
    type: '视频'
  },
  multi: {
    title: '第三课 函数',
    series: 'Python 入门合集',
    index: 3,
    owner: '某UP主',
    owner_mid: 12345,
    pubdate: 1700000000,
    date: Math.floor(Date.now() / 1000),
    quality: '1080P 60帧',
    codec: 'HEVC',
    bvid: 'BV1xx411c7mD',
    aid: 170001,
    cid: 279786,
    type: '视频'
  },
  pgc: {
    title: '第1话 任务1',
    series: '间谍过家家',
    index: 1,
    owner: '哔哩哔哩番剧',
    pubdate: 1649520000,
    date: Math.floor(Date.now() / 1000),
    quality: '1080P 高码率',
    codec: 'AVC',
    bvid: 'BV1ZY4y187fA',
    ep_id: 508404,
    type: '番剧影视'
  }
}
