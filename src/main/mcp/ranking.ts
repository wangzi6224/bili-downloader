import { joinList, t } from '@shared/i18n'
import type { SearchVideo } from '../bili/lookup'
import { invalid } from './format'

/**
 * 搜索结果的客户端排序。B站的搜索接口不能按时长排，也没有综合质量分，
 * 这两种在候选池（B站综合排序的前若干条）里自己排。都是纯函数，不碰网络
 */

export const CLIENT_ORDERS = ['duration', 'duration_asc', 'quality'] as const
export type ClientOrder = (typeof CLIENT_ORDERS)[number]

export const WEIGHT_KEYS = ['relevance', 'play', 'like', 'favorite', 'comment', 'danmaku', 'recency', 'duration'] as const
export type WeightKey = (typeof WEIGHT_KEYS)[number]
export type Weights = Record<WeightKey, number>

/**
 * 默认权重（均衡）：相关度 30%、播放热度 20%、时效 15%、互动率 35%。
 * 时长因需求而异（要讲得全还是要短平快），默认不计，由调用方按需要打开
 */
export const DEFAULT_WEIGHTS: Weights = {
  relevance: 0.3,
  play: 0.2,
  like: 0.12,
  favorite: 0.12,
  comment: 0.06,
  danmaku: 0.05,
  recency: 0.15,
  duration: 0
}

/** 互动率平滑用的“虚拟播放量”：播放量只有几百几千的视频，比率向池内平均靠拢，不能靠几个点赞冲到前面（真实搜索里实测 500 太弱） */
const SMOOTHING_PLAYS = 3000
/** 发布时间的衰减半衰期：一年前发布的得分减半 */
const HALF_LIFE_DAYS = 365
export const MAX_WEIGHT = 100

/** 工具参数 weights 的 schema：一层、键固定，各客户端都读得懂 */
export const weightsSchema = (description: string) => ({
  type: 'object',
  description,
  additionalProperties: false,
  properties: Object.fromEntries(WEIGHT_KEYS.map((k) => [k, { type: 'number', minimum: 0, maximum: MAX_WEIGHT }]))
})

/** 工具参数 `weights` → 合并默认值后的完整权重（还没归一化） */
export function parseWeights(raw: unknown, key: string): Weights {
  if (raw === undefined || raw === null) return { ...DEFAULT_WEIGHTS }
  if (typeof raw !== 'object' || Array.isArray(raw)) throw invalid(t('mcp.argObject', { key }))
  const out = { ...DEFAULT_WEIGHTS }
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!WEIGHT_KEYS.includes(name as WeightKey)) throw invalid(t('mcpLookup.weightUnknown', { key, name, names: joinList(WEIGHT_KEYS) }))
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX_WEIGHT) {
      throw invalid(t('mcpLookup.weightValue', { key, name, max: MAX_WEIGHT }))
    }
    out[name as WeightKey] = v
  }
  if (!WEIGHT_KEYS.some((k) => out[k] > 0)) throw invalid(t('mcpLookup.weightsZero', { key }))
  return out
}

/** 总和归一成 1，保留三位小数给调用方看 */
export function normalizeWeights(w: Weights): Weights {
  const sum = WEIGHT_KEYS.reduce((n, k) => n + w[k], 0)
  return Object.fromEntries(WEIGHT_KEYS.map((k) => [k, Math.round((w[k] / sum) * 1000) / 1000])) as Weights
}

/**
 * 每个值在整批里的百分位（0 到 1，大的靠近 1）。并列的取平均名次，全部相同时都是 0.5
 */
function percentiles(values: number[]): number[] {
  const n = values.length
  if (n <= 1) return values.map(() => 0.5)
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b])
  const out = new Array<number>(n)
  for (let start = 0; start < n; ) {
    let end = start
    while (end + 1 < n && values[order[end + 1]] === values[order[start]]) end++
    for (let i = start; i <= end; i++) out[order[i]] = (start + end) / 2 / (n - 1)
    start = end + 1
  }
  return out
}

/** 每次播放对应的互动数，平滑后再比较 */
function rates(list: SearchVideo[], count: (v: SearchVideo) => number | undefined): number[] {
  const plays = list.reduce((n, v) => n + (v.play ?? 0), 0)
  const total = list.reduce((n, v) => n + (count(v) ?? 0), 0)
  const prior = plays > 0 ? total / plays : 0
  return list.map((v) => ((count(v) ?? 0) + SMOOTHING_PLAYS * prior) / ((v.play ?? 0) + SMOOTHING_PLAYS))
}

export interface Ranked {
  video: SearchVideo
  /** 只有 quality 有，0 到 100 */
  score?: number
}

/** 按时长排：缺时长的排在最后，时长相同的保持原来的先后 */
function byDuration(list: SearchVideo[], sign: 1 | -1): Ranked[] {
  return list
    .map((video, i) => ({ video, i }))
    .sort((a, b) => {
      const x = a.video.duration
      const y = b.video.duration
      if (x === undefined || y === undefined) return (x === undefined ? 1 : 0) - (y === undefined ? 1 : 0) || a.i - b.i
      return sign * (y - x) || a.i - b.i
    })
    .map(({ video }) => ({ video }))
}

function byQuality(list: SearchVideo[], weights: Weights, nowSec: number): Ranked[] {
  const n = list.length
  const sum = WEIGHT_KEYS.reduce((acc, k) => acc + weights[k], 0)
  // list 本身就是 B站综合排序的顺序：第一名 1，最后一名 0
  const features: Record<WeightKey, number[]> = {
    relevance: list.map((_, i) => (n === 1 ? 1 : 1 - i / (n - 1))),
    play: percentiles(list.map((v) => v.play ?? 0)),
    like: percentiles(rates(list, (v) => v.like)),
    favorite: percentiles(rates(list, (v) => v.favorites)),
    comment: percentiles(rates(list, (v) => v.comments)),
    danmaku: percentiles(rates(list, (v) => v.danmaku)),
    recency: list.map((v) =>
      v.pubdate === undefined ? 0 : Math.pow(0.5, Math.max(0, nowSec - v.pubdate) / 86400 / HALF_LIFE_DAYS)
    ),
    duration: percentiles(list.map((v) => v.duration ?? 0))
  }
  return list
    .map((video, i) => {
      const total = WEIGHT_KEYS.reduce((acc, k) => acc + weights[k] * features[k][i], 0) / sum
      return { video, score: Math.round(total * 1000) / 10, i }
    })
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ video, score }) => ({ video, score }))
}

/** 对候选池重新排序。list 要保持 B站综合排序的原始顺序（quality 要用名次当相关度） */
export function rankVideos(list: SearchVideo[], order: ClientOrder, weights: Weights, nowSec: number): Ranked[] {
  if (order === 'quality') return byQuality(list, weights, nowSec)
  return byDuration(list, order === 'duration' ? 1 : -1)
}
