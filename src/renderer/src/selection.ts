import { renderTemplate, type NamingTemplates } from '@shared/naming'
import type { DuplicateAction, EnqueueRequest, MediaGroup, MediaItem, Paging, ParseResult, QualityOption } from '@shared/types'
import { actualCodec, type EditableOptions } from './viewLogic'

// 取不到清晰度列表时的兜底选项
export const FALLBACK: QualityOption[] = [
  { qn: 127, label: '最高可用', needVip: false, needLogin: false, codecs: [] },
  { qn: 80, label: '1080P 高清', needVip: false, needLogin: true, codecs: [] },
  { qn: 64, label: '720P 准高清', needVip: false, needLogin: false, codecs: [] },
  { qn: 32, label: '480P 标清', needVip: false, needLogin: false, codecs: [] }
]

export const CODEC_TEXT = { avc: 'AVC', hevc: 'HEVC', av1: 'AV1' } as const

/**
 * 判断是否下载过：按条目 key 查下载历史。
 * 列表里还没展开分P的视频（key 里没有 cid），按 BV 号判断
 */
export function downloadedMatcher(keys: Set<string>): (i: MediaItem) => boolean {
  // 普通视频的 key 是 ugc:BV号:cid
  const bvids = new Set([...keys].map((k) => k.split(':')[1]))
  return (i) => keys.has(i.key) || Boolean(i.lazy && i.bvid && bvids.has(i.bvid))
}

/** 打开选择窗口时默认选中的清晰度：不超过设置里的默认清晰度、当前账号能下载的最高一档 */
export function bestQuality(qualities: QualityOption[], isVip: boolean, defaultQn: number): QualityOption | undefined {
  const usable = qualities.filter((q) => (isVip || !q.needVip) && q.codecs.length)
  return usable.find((q) => q.qn <= defaultQn) ?? usable[usable.length - 1] ?? qualities[0]
}

/** 翻页加载的条目接到第一组后面，已有的不重复加 */
export const appendToFirst = (groups: MediaGroup[], items: MediaItem[]): MediaGroup[] =>
  groups.map((g, i) => (i === 0 ? { ...g, items: [...g.items, ...items.filter((it) => !g.items.some((x) => x.key === it.key))] } : g))

/** 按标题或 UP 主筛选，筛完没有条目的组不显示 */
export function filterGroups(groups: MediaGroup[], filter: string): MediaGroup[] {
  const k = filter.trim().toLowerCase()
  if (!k) return groups
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.title.toLowerCase().includes(k) || (i.owner ?? '').toLowerCase().includes(k)) }))
    .filter((g) => g.items.length)
}

/** 失效的条目不能选 */
export const selectable = (i: MediaItem): boolean => !i.unavailable

/** 选中且能下载的条目 */
export const selectedItems = (all: MediaItem[], selected: Set<string>): MediaItem[] =>
  all.filter((i) => selected.has(i.key) && selectable(i))

/**
 * 点击一个条目。shift 且有上次点击的位置（anchor，visibleItems 里的下标）时，
 * 把区间内能选的都设成和这一项切换后相同的状态。点到失效条目返回 null，什么都不变
 */
export function toggleSelection(
  selected: Set<string>,
  visibleItems: MediaItem[],
  item: MediaItem,
  anchor: number | null,
  shift: boolean
): { selected: Set<string>; anchor: number } | null {
  if (!selectable(item)) return null
  const idx = visibleItems.indexOf(item)
  const next = new Set(selected)
  const on = !next.has(item.key)
  if (shift && anchor !== null) {
    const [a, b] = [anchor, idx].sort((x, y) => x - y)
    for (const i of visibleItems.slice(a, b + 1)) if (selectable(i)) on ? next.add(i.key) : next.delete(i.key)
  } else {
    on ? next.add(item.key) : next.delete(item.key)
  }
  return { selected: next, anchor: idx }
}

/** 全选、全不选、整组勾选等：失效的条目跳过 */
export function setMany(selected: Set<string>, items: MediaItem[], on: boolean): Set<string> {
  const next = new Set(selected)
  for (const i of items) if (selectable(i)) on ? next.add(i.key) : next.delete(i.key)
  return next
}

/** 入队请求（不含下载选项）：批量解析时每个来源单独入队，命名各用各的标题 */
export function enqueueBatches(result: ParseResult, groups: MediaGroup[], items: MediaItem[]): Omit<EnqueueRequest, 'options'>[] {
  if (!result.batch) return [{ title: result.title, cover: result.cover, kind: result.kind, meta: result.meta, items }]
  const keys = new Set(items.map((i) => i.key))
  return groups
    .map((g) => ({ g, items: g.items.filter((i) => keys.has(i.key)) }))
    .filter((b) => b.items.length && b.g.source)
    .map(({ g, items: its }) => ({ ...g.source!, items: its }))
}

/** 选中的里有下载过的：按设置直接下载、跳过它们，或者询问 */
export function resolveDuplicates(
  items: MediaItem[],
  isDownloaded: (i: MediaItem) => boolean,
  action: DuplicateAction
): { enqueue: MediaItem[] } | { ask: MediaItem[] } {
  const dups = items.filter(isDownloaded)
  if (!dups.length || action === 'download') return { enqueue: items }
  if (action === 'skip') return { enqueue: items.filter((i) => !isDownloaded(i)) }
  return { ask: dups }
}

const TYPE_TEXT = { ugc: '视频', pgc: '番剧影视', cheese: '课程', audio: '音频' } as const

export interface PreviewInput {
  result: ParseResult
  groups: MediaGroup[]
  all: MediaItem[]
  selected: Set<string>
  naming: NamingTemplates
  opts: Pick<EditableOptions, 'output' | 'audio' | 'container' | 'codecOrder'>
  /** 音频区内容，只下载音频 */
  audioKind: boolean
  chosen?: QualityOption
  /** 当前时间（毫秒），用于 {date} */
  now: number
}

/** 保存路径预览（相对下载目录）：和主进程用同一套模板；没有选中任何条目时为空 */
export function pathPreview({ result, groups, all, selected, naming, opts, audioKind, chosen, now }: PreviewInput): string {
  const first = all.find((i) => selected.has(i.key))
  if (!first) return ''
  const group = groups.find((g) => g.items.includes(first))
  const src = result.batch && group?.source ? group.source : { title: result.title, kind: result.kind, meta: result.meta }
  const count = result.batch ? (group?.items.filter((i) => selected.has(i.key)).length ?? 0) : selectedItems(all, selected).length
  const multi = count > 1
  const episodic = src.kind === 'pgc' || src.kind === 'cheese'
  const tpl = !multi ? naming.single : episodic ? naming.pgc : naming.multi
  const output = audioKind ? 'audio' : opts.output
  const ext = output === 'audio' ? (opts.audio === 'flac' ? 'flac' : 'm4a') : opts.container
  const codec = actualCodec(opts.codecOrder, chosen?.codecs) ?? opts.codecOrder[0]
  return `${renderTemplate(tpl, {
    title: first.title,
    series: multi || first.title !== src.title ? src.title : '',
    index: first.index,
    owner: first.owner ?? src.meta?.owner,
    owner_mid: first.ownerMid ?? src.meta?.ownerMid,
    pubdate: first.pubdate ?? src.meta?.pubdate,
    date: Math.floor(now / 1000),
    quality: output === 'audio' ? '' : chosen?.label,
    codec: output === 'audio' ? '' : CODEC_TEXT[codec],
    bvid: first.bvid,
    aid: first.aid,
    cid: first.cid,
    ep_id: first.epId,
    type: TYPE_TEXT[src.kind]
  })}.${ext}`
}

/** 列表类来源（收藏夹、合集、番剧、UP 主等）可以订阅更新 */
export const subscribable = (result: ParseResult, paging: Paging | undefined, count: number): boolean =>
  Boolean(result.input && !result.batch && (paging || count > 1 || result.kind === 'pgc' || result.kind === 'cheese'))
