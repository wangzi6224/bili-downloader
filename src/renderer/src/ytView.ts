// YouTube 界面的逻辑（组件只负责显示，逻辑放在这里测）
import { t } from '@shared/i18n'
import { KIND_TYPE_LABEL, renderTemplate, type NamingTemplates } from '@shared/naming'
import { DEFAULT_YT_OPTIONS } from '@shared/options'
import { siteOf, SITES } from '@shared/site'
import type {
  DownloadOptions,
  MediaGroup,
  MediaItem,
  ParseResult,
  ParseRecord,
  QualityOption,
  Settings,
  Site,
  StreamInfo,
  TaskInfo,
  YtAccountsSnapshot,
  YtEngineStatus,
  YtOptions
} from '@shared/types'
import { extractYtInputs, parseYtInput } from '@shared/ytUrl'
import { ACTIVE } from './taskOrder'

/** 只显示当前平台的任务（队列两边一起跑，界面各看各的） */
export const tasksOfSite = (tasks: TaskInfo[], site: Site): TaskInfo[] => tasks.filter((task) => siteOf(task) === site)

/** 解析记录按平台分开 */
export const recordsOfSite = <T extends Pick<ParseRecord, 'kind'>>(records: T[], site: Site): T[] =>
  records.filter((r) => siteOf(r) === site)


/** 各平台正在下载和排队的任务数：侧栏角标、另一个平台的提示用 */
export function activeCounts(tasks: TaskInfo[]): Record<Site, number> {
  const counts = Object.fromEntries(SITES.map((site) => [site, 0])) as Record<Site, number>
  for (const task of tasks) if (ACTIVE.has(task.status) || task.status === 'queued') counts[siteOf(task)]++
  return counts
}

/** 粘贴的内容：多个 YouTube 链接批量解析，一个就直接解析 */
export function classifyYtPaste(text: string): { type: 'batch'; inputs: string[] } | { type: 'single' } | { type: 'none' } {
  const inputs = extractYtInputs(text)
  if (inputs.length > 1) return { type: 'batch', inputs }
  return parseYtInput(text) ? { type: 'single' } : { type: 'none' }
}

const fallback = (qn: number, label: string): QualityOption => ({ qn, label, needVip: false, needLogin: false, codecs: [] })

/** 取不到画质列表时（例如整个播放列表）的选项：0 是最高 */
export function ytFallbackQualities(): QualityOption[] {
  return [
    { ...fallback(0, ''), get label() { return t('ytUi.qualityBest') } },
    fallback(2160, '2160p (4K)'),
    fallback(1440, '1440p'),
    fallback(1080, '1080p'),
    fallback(720, '720p'),
    fallback(480, '480p'),
    fallback(360, '360p')
  ]
}

/** 打开选择窗口时默认选中的画质：不超过设置里的默认画质（0 是最高）的最高一档 */
export function ytDefaultQuality(qualities: QualityOption[], defaultQn: number): QualityOption | undefined {
  if (!qualities.length) return undefined
  if (!defaultQn) return qualities.find((q) => q.qn === 0) ?? qualities[0]
  return qualities.find((q) => q.qn !== 0 && q.qn <= defaultQn) ?? qualities[qualities.length - 1]
}

/** YouTube 的默认下载选项（设置里记住的） */
export function ytDefaultOptions(s: Settings): DownloadOptions & { yt: YtOptions } {
  const { defaults, defaultQn } = s.youtube
  return { ...defaults, qn: defaultQn, yt: { ...DEFAULT_YT_OPTIONS, ...defaults.yt } }
}

/** 一个视频（或一组）的选择结果大概有多大：按选中的画质估算，只有一个视频时才知道 */
export function sizeHint(info: StreamInfo | null, qn: number): number | undefined {
  const sizes = info?.yt?.size
  if (!sizes) return undefined
  const heights = Object.keys(sizes).map(Number).sort((a, b) => b - a)
  const h = qn ? heights.find((x) => x <= qn) : heights[0]
  return h === undefined ? undefined : sizes[h] || undefined
}

/** 组件状态的一行说明；ready 且没在更新时不用显示 */
export function engineLine(s: YtEngineStatus | null): { text: string; busy: boolean; error: boolean; percent?: number } | null {
  if (!s) return null
  if (s.state === 'error') return { text: s.message ?? t('ytUi.engineError'), busy: false, error: true }
  if (s.state === 'missing') return { text: t('ytUi.engineMissing'), busy: false, error: false }
  if (s.state === 'ready' && !s.updating) return null
  const percent = s.stage === 'download' && s.size ? Math.min(100, Math.round(((s.done ?? 0) / s.size) * 100)) : undefined
  const key = s.updating ? 'ytUi.engineUpdating' : 'ytUi.enginePreparing'
  const stage = t(`ytUi.stage_${s.stage ?? 'download'}` as 'ytUi.stage_download')
  return { text: t(key, { stage: percent === undefined ? stage : `${stage} ${percent}%` }), busy: true, error: false, percent }
}

/** 当前 YouTube 账号；没登录时为空 */
export function currentYtAccount(s: YtAccountsSnapshot | null) {
  return s?.current ? s.accounts.find((a) => a.id === s.current) : undefined
}

/** 选集弹窗里条目的副标题：作者 · 时长 · 播放列表视频数 */
export function ytItemMeta(item: MediaItem, formatDuration: (sec: number) => string): string {
  return [
    item.owner,
    item.duration ? formatDuration(item.duration) : undefined,
    item.pages ? t('ytUi.videoCount', { count: item.pages }) : undefined
  ].filter(Boolean).join(' · ')
}

/** 字幕语言输入框：逗号或空格分隔 */
export const parseLangList = (text: string): string[] =>
  [...new Set(text.split(/[\s,，、]+/).map((x) => x.trim()).filter((x) => /^[A-Za-z0-9-]{1,20}$/.test(x)))]

export interface YtPreviewInput {
  result: ParseResult
  groups: MediaGroup[]
  all: MediaItem[]
  selected: Set<string>
  naming: NamingTemplates
  opts: { output: DownloadOptions['output']; yt: Pick<YtOptions, 'container' | 'audio' | 'codecOrder'> }
  chosen?: QualityOption
  now: number
}

const YT_CODEC_TEXT = { avc: 'AVC', vp9: 'VP9', av1: 'AV1' } as const

/** 保存路径预览（相对 YouTube 下载目录）：和主进程同一套模板；没选中时为空 */
export function ytPathPreview({ result, groups, all, selected, naming, opts, chosen, now }: YtPreviewInput): string {
  const first = all.find((i) => selected.has(i.key))
  if (!first) return ''
  const group = groups.find((g) => g.items.includes(first))
  const src = result.batch && group?.source ? group.source : { title: result.title, kind: result.kind, meta: result.meta }
  const count = result.batch ? (group?.items.filter((i) => selected.has(i.key)).length ?? 0) : all.filter((i) => selected.has(i.key)).length
  const multi = count > 1 || Boolean(first.lazy)
  const audio = opts.output === 'audio'
  const ext = audio ? (opts.yt.audio === 'opus' ? 'opus' : 'm4a') : opts.yt.container
  const codec = opts.yt.codecOrder.find((c) => !chosen?.codecs.length || chosen.codecs.includes(c)) ?? opts.yt.codecOrder[0]
  return `${renderTemplate(multi ? naming.multi : naming.single, {
    title: first.title,
    series: multi || first.title !== src.title ? src.title : '',
    index: first.index,
    owner: first.owner ?? src.meta?.owner,
    pubdate: first.pubdate ?? src.meta?.pubdate,
    date: Math.floor(now / 1000),
    quality: audio ? '' : chosen && chosen.qn ? `${chosen.qn}p` : '',
    codec: audio ? '' : YT_CODEC_TEXT[codec],
    type: KIND_TYPE_LABEL.youtube
  })}.${ext}`
}
