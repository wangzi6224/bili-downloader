import { t as tr, type Key } from '@shared/i18n'
import { clampRegion, isVideoTask } from '@shared/watermark'
import type {
  AiModelStatus,
  DownloadOptions,
  MediaItem,
  TaskInfo,
  WatermarkMethod,
  WatermarkRegion,
  WatermarkSpeed
} from '@shared/types'
import type { WatermarkInspection } from '../watermark/manual'
import type { SpeedEstimate, Work } from '../watermark/speed'
import { optionalBool, optionalStrings, requireEnum, type Args } from './args'
import { batchNotFound, invalid, joinHints, mcpStatus, processingOut } from './format'

/** MCP 去水印用到的能力（方便测试时替换） */
export interface WatermarkDeps {
  /** 估算处理一个视频要多久 */
  estimate(method: WatermarkMethod, w: Work): SpeedEstimate
  /** 两种方式大约是视频时长的几倍 */
  speed(): WatermarkSpeed
  model(): AiModelStatus
  /** 已下载的视频：找水印位置、拿尺寸和时长；任务不能处理时抛出原因 */
  inspect(t: TaskInfo): Promise<WatermarkInspection>
}

export const METHODS = ['fast', 'ai'] as const satisfies readonly WatermarkMethod[]

/** 一次调用最多现场识别这么多个（每个 1～3 秒），下载时识别过的不算 */
const MAX_INSPECT = 10
const MAX_TASKS = 200
const MAX_PROCESSING = 20

/** 一个值或一个区间：“约 5 秒”“约 2～5 分钟” */
const span = (a: number, b: number, one: Key, range: Key): string => (a === b ? tr(one, { count: a }) : tr(range, { lo: a, hi: b }))

/** 秒数区间说成“约 2～5 分钟” */
export function fmtSeconds([lo, hi]: [number, number]): string {
  if (hi < 90) return span(Math.max(1, Math.round(lo)), Math.max(1, Math.round(hi)), 'mcpWm.secOne', 'mcpWm.secRange')
  if (hi < 90 * 60) return span(Math.max(1, Math.round(lo / 60)), Math.round(hi / 60), 'mcpWm.minOne', 'mcpWm.minRange')
  const h = (s: number): number => Math.max(0.1, Math.round((s / 3600) * 10) / 10)
  return span(h(lo), h(hi), 'mcpWm.hourOne', 'mcpWm.hourRange')
}

const fmtRatio = ([lo, hi]: [number, number]): string => {
  const f = (v: number): number => Math.round(v * (v < 1 ? 100 : 10)) / (v < 1 ? 100 : 10)
  return span(f(lo), f(hi), 'mcpWm.ratioOne', 'mcpWm.ratioRange')
}

const BASIS_TEXT: Record<SpeedEstimate['basis'], Key> = {
  measured: 'mcpWm.basisMeasured',
  calibrated: 'mcpWm.basisCalibrated',
  default: 'mcpWm.basisDefault'
}
const basisText = (b: SpeedEstimate['basis']): string => tr(BASIS_TEXT[b])

/** 估算用的工作量：有识别记录时用实际尺寸，没有时按 1080p */
function workOf(t: TaskInfo): Work | undefined {
  const duration = t.item.duration
  if (!duration) return undefined
  return { duration, width: t.watermark?.width, height: t.watermark?.height }
}

/** 几个视频合起来要多久（去水印一个接一个做） */
export function sumSeconds(list: SpeedEstimate[]): { seconds: [number, number]; basis: SpeedEstimate['basis'] } | undefined {
  if (!list.length) return undefined
  const order: SpeedEstimate['basis'][] = ['default', 'calibrated', 'measured']
  return {
    seconds: [list.reduce((a, e) => a + e.seconds[0], 0), list.reduce((a, e) => a + e.seconds[1], 0)],
    // 合计的可信度按最不可信的那个
    basis: order[Math.min(...list.map((e) => order.indexOf(e.basis)))]
  }
}

const modelNote = (m: AiModelStatus): string | undefined =>
  m.state === 'ready' ? undefined : tr('mcpWm.modelNote', { size: Math.round(m.size / 1024 ** 2) })

/** 两种方式各要多久、效果怎样，给 agent 转述给用户 */
function choiceText(deps: WatermarkDeps, works: Work[]): { text: string; estimate: Record<WatermarkMethod, ReturnType<typeof sumSeconds>> } {
  const fast = sumSeconds(works.map((w) => deps.estimate('fast', w)))
  const ai = sumSeconds(works.map((w) => deps.estimate('ai', w)))
  const model = modelNote(deps.model())
  const fastText = fast ? tr('mcpWm.fastChoice', { time: fmtSeconds(fast.seconds) }) : tr('mcpWm.fastChoiceNoTime')
  const modelText = model ? tr('mcpWm.aiChoiceModel', { note: model }) : ''
  const aiText = ai ? tr('mcpWm.aiChoice', { time: fmtSeconds(ai.seconds), model: modelText }) : tr('mcpWm.aiChoiceNoTime', { model: modelText })
  return { text: tr('mcpWm.choices', { fast: fastText, ai: aiText }), estimate: { fast, ai } }
}

/** 批次状态里的水印汇总和给 agent 的提示；音频批次没有 */
export function batchWatermark(options: Pick<DownloadOptions, 'watermark'>, tasks: TaskInfo[], batchId: string, deps: WatermarkDeps) {
  const videos = tasks.filter(isVideoTask)
  if (!videos.length) return undefined
  const option = options.watermark ?? 'off'
  const checked = videos.filter((t) => t.watermark)
  const removed = checked.filter((t) => t.watermark!.applied)
  const found = checked.filter((t) => t.watermark!.found && !t.watermark!.applied)
  const processing = videos.filter((t) => t.processing)
  // 下载完、有水印、还没去掉、没在处理的：可以问用户要不要去
  const pending = found.filter((t) => t.status === 'done' && !t.processing)
  const works = pending.flatMap((t) => workOf(t) ?? [])
  const choice = pending.length ? choiceText(deps, works) : undefined
  const hints: string[] = []
  if (processing.some((t) => t.processing!.manual)) hints.push(tr('mcpWm.processing'))
  if (pending.length) {
    hints.push(tr('mcpWm.pending', { count: pending.length, choices: choice!.text, id: batchId }))
  } else if (option === 'off' && !checked.length && unfinished(videos)) {
    hints.push(tr('mcpWm.willDetect'))
  }
  return {
    option,
    checked: checked.length,
    found: found.length + removed.length,
    removed: removed.length,
    not_found: checked.length - found.length - removed.length,
    processing: processing.length
      ? processing.slice(0, MAX_PROCESSING).map((t) => ({ task_id: t.id, title: t.title, manual: t.processing!.manual || undefined, ...processingOut(t.processing!) }))
      : undefined,
    // 有水印还没去掉的视频，两种方式各要多久（秒，[乐观, 保守]）
    estimate_seconds: choice && works.length ? { fast: choice.estimate.fast?.seconds, ai: choice.estimate.ai?.seconds } : undefined,
    estimate_basis: choice?.estimate.ai ? basisText(choice.estimate.ai.basis) : undefined,
    hint: joinHints(hints)
  }
}

/** 还有没下完的视频 */
const unfinished = (tasks: TaskInfo[]): boolean => tasks.some((t) => mcpStatus(t) !== 'done')

/** 提交批次时告诉 agent 这批会怎么处理水印、大约多花多久 */
export function plannedWatermark(options: Pick<DownloadOptions, 'watermark' | 'output'>, items: MediaItem[], deps: WatermarkDeps) {
  const option = options.watermark ?? 'off'
  if (options.output === 'audio') return undefined
  if (option === 'off') {
    return { option, note: tr('mcpWm.plannedOff') }
  }
  const method: WatermarkMethod = option === 'ai' ? 'ai' : 'fast'
  const works = items.flatMap((i) => (i.duration ? [{ duration: i.duration }] : []))
  const sum = sumSeconds(works.map((w) => deps.estimate(method, w)))
  const notes = [tr('mcpWm.plannedOn')]
  if (sum) {
    const key = items.length > works.length ? 'mcpWm.plannedKnown' : 'mcpWm.plannedAll'
    notes.push(tr(key, { time: fmtSeconds(sum.seconds), basis: basisText(sum.basis) }))
  }
  const model = method === 'ai' ? modelNote(deps.model()) : undefined
  if (model) notes.push(tr('mcpWm.plannedModel', { model }))
  return { option, extra_seconds: sum?.seconds, note: joinHints(notes) }
}

/** get_status 里的去水印信息 */
export function watermarkStatus(defaults: Pick<DownloadOptions, 'watermark'>, tasks: TaskInfo[], deps: WatermarkDeps) {
  const m = deps.model()
  const speed = deps.speed()
  return {
    default_option: defaults.watermark ?? 'off',
    ai_model: {
      state: m.state,
      size_mb: Math.round(m.size / 1024 ** 2),
      progress: m.state === 'downloading' && m.size ? Math.round(((m.done ?? 0) / m.size) * 100) : undefined,
      error: m.state === 'error' ? m.message : undefined
    },
    // 处理耗时约为视频时长的几倍
    speed: {
      fast: tr('mcpWm.speed', { ratio: fmtRatio(speed.fast.ratio), basis: basisText(speed.fast.basis) }),
      ai: speed.ai.backend
        ? tr('mcpWm.speedBackend', { ratio: fmtRatio(speed.ai.ratio), basis: basisText(speed.ai.basis), backend: speed.ai.backend })
        : tr('mcpWm.speed', { ratio: fmtRatio(speed.ai.ratio), basis: basisText(speed.ai.basis) })
    },
    processing: tasks.filter((t) => t.processing?.manual).length
  }
}

/** remove_watermark 的参数里的 region：像素坐标 */
function parseRegion(v: unknown): WatermarkRegion | undefined {
  if (v === undefined || v === null) return undefined
  const r = v as Record<string, unknown>
  if (typeof v !== 'object' || !['x', 'y', 'w', 'h'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k]))) {
    throw invalid(tr('mcpWm.regionInvalid'))
  }
  return { x: r.x as number, y: r.y as number, w: r.w as number, h: r.h as number }
}

export interface RemoveQueue {
  list(): TaskInfo[]
  startWatermark(id: string, region: WatermarkRegion, method: WatermarkMethod): void
}

type Skip = { task_id: string; account_mid?: number; title?: string; reason: string; suggested_region?: WatermarkRegion; size?: string }

/** remove_watermark：给已下载的视频去水印 */
export async function removeWatermark(args: Args, taskIds: string[], queue: RemoveQueue, deps: WatermarkDeps) {
  const method = requireEnum(args, 'method', METHODS)
  const dryRun = optionalBool(args, 'dry_run', false)
  const force = optionalBool(args, 'force', false)
  const region = parseRegion(args.region)
  if (region && taskIds.length !== 1) throw invalid(tr('mcpWm.regionOneTask'))
  if (taskIds.length > MAX_TASKS) throw invalid(tr('mcpWm.tooManyTasks', { max: MAX_TASKS }))
  const all = new Map(queue.list().map((t) => [t.id, t]))
  const ok: { t: TaskInfo; region: WatermarkRegion; source: string; found: boolean; estimate: SpeedEstimate }[] = []
  const skipped: Skip[] = []
  let inspected = 0
  for (const id of taskIds) {
    const t = all.get(id)
    if (!t) {
      skipped.push({ task_id: id, reason: tr('mcp.noSuchTask') })
      continue
    }
    const skip = (reason: string, extra: Partial<Skip> = {}): void =>
      void skipped.push({ task_id: id, account_mid: t.accountMid, title: t.title, reason, ...extra })
    if (t.processing) {
      skip(tr('mcpWm.busy'))
      continue
    }
    // 下载时没识别过的要现场识别，每个要几秒，一次只做几个
    if (!t.watermark && inspected >= MAX_INSPECT) {
      skip(tr('mcpWm.tooManyInspect', { max: MAX_INSPECT }))
      continue
    }
    let info: WatermarkInspection
    try {
      if (!t.watermark) inspected++
      info = await deps.inspect(t)
    } catch (e) {
      skip(e instanceof Error ? e.message : String(e))
      continue
    }
    if (info.blocker) {
      skip(info.blocker)
      continue
    }
    if (info.applied && !force) {
      skip(tr('mcpWm.alreadyRemoved'))
      continue
    }
    const size = `${info.width}×${info.height}`
    let use = region
    let source = 'given'
    if (use) {
      const r = clampRegion(use, info.width, info.height)
      if (!r) {
        skip(tr('mcpWm.regionOutside', { size }), { size })
        continue
      }
      use = r
    } else if (info.region && (info.found || info.applied)) {
      use = info.region
      source = info.applied ? 'applied' : info.known ? 'download' : 'detected'
    } else {
      skip(
        info.region
          ? tr('mcpWm.unsure')
          : tr('mcpWm.noRegion'),
        { suggested_region: info.region, size }
      )
      continue
    }
    ok.push({ t, region: use, source, found: info.found, estimate: deps.estimate(method, info) })
  }
  const started: typeof ok = []
  if (!dryRun) {
    for (const x of ok) {
      try {
        queue.startWatermark(x.t.id, x.region, method)
        started.push(x)
      } catch (e) {
        skipped.push({ task_id: x.t.id, account_mid: x.t.accountMid, title: x.t.title, reason: e instanceof Error ? e.message : String(e) })
      }
    }
  }
  const list = dryRun ? ok : started
  const total = sumSeconds(list.map((x) => x.estimate))
  const notes: string[] = []
  if (total) notes.push(tr('mcpWm.total', { time: fmtSeconds(total.seconds), basis: basisText(total.basis) }))
  const model = method === 'ai' ? modelNote(deps.model()) : undefined
  if (model && list.length) notes.push(tr('mcpWm.aiFallback', { model }))
  if (dryRun && list.length) notes.push(tr('mcpWm.dryRun'))
  if (!dryRun && list.length) notes.push(tr('mcpWm.started'))
  return {
    method,
    dry_run: dryRun || undefined,
    [dryRun ? 'would_start' : 'started']: list.map((x) => ({
      task_id: x.t.id,
      account_mid: x.t.accountMid,
      title: x.t.title,
      region: x.region,
      region_source: x.source,
      estimate_seconds: x.estimate.seconds
    })),
    skipped: skipped.length ? skipped : undefined,
    total_estimate_seconds: total?.seconds,
    hint:
      joinHints(notes) ?? (skipped.length ? tr('mcpWm.noneSkipped') : tr('mcpWm.noneEligible'))
  }
}

/** remove_watermark 的目标：task_ids 或 batch_id 里的已完成视频 */
export function removeTargets(args: Args, batchTasks: ((id: string) => TaskInfo[] | undefined) | undefined): string[] {
  const ids = optionalStrings(args, 'task_ids')
  const batchId = typeof args.batch_id === 'string' && args.batch_id ? args.batch_id : undefined
  if (!ids && !batchId) throw invalid(tr('mcpWm.targetsMissing'))
  if (ids) return [...new Set(ids)]
  const tasks = batchTasks?.(batchId!)
  if (!tasks) throw batchNotFound(batchId!)
  // 整个批次：只挑下载完、有水印、还没去掉、没在处理的；force 时也包括已经去过的
  const force = args.force === true
  return tasks
    .filter((t) => t.status === 'done' && !t.processing && isVideoTask(t) && (t.watermark?.applied ? force : t.watermark?.found))
    .map((t) => t.id)
}
