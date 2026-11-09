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
import { invalid, mcpStatus, processingOut, ToolError } from './format'

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

/** 秒数区间说成“约 2～5 分钟” */
export function fmtSeconds([lo, hi]: [number, number]): string {
  const span = (a: number, b: number, unit: string): string => (a === b ? `约 ${a} ${unit}` : `约 ${a}～${b} ${unit}`)
  if (hi < 90) return span(Math.max(1, Math.round(lo)), Math.max(1, Math.round(hi)), '秒')
  if (hi < 90 * 60) return span(Math.max(1, Math.round(lo / 60)), Math.round(hi / 60), '分钟')
  const h = (s: number): number => Math.max(0.1, Math.round((s / 3600) * 10) / 10)
  return span(h(lo), h(hi), '小时')
}

const fmtRatio = ([lo, hi]: [number, number]): string => {
  const f = (v: number): string => String(Math.round(v * (v < 1 ? 100 : 10)) / (v < 1 ? 100 : 10))
  return f(lo) === f(hi) ? `约 ${f(lo)} 倍` : `约 ${f(lo)}～${f(hi)} 倍`
}

const BASIS_TEXT: Record<SpeedEstimate['basis'], string> = {
  measured: '按这台电脑实际处理过的速度',
  calibrated: '按试跑的速度',
  default: '还没在这台电脑上处理过，是粗估'
}

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
  m.state === 'ready' ? undefined : `第一次用要先下载约 ${Math.round(m.size / 1024 ** 2)} MB 的 AI 模型`

/** 两种方式各要多久、效果怎样，给 agent 转述给用户 */
function choiceText(deps: WatermarkDeps, works: Work[]): { text: string; estimate: Record<WatermarkMethod, ReturnType<typeof sumSeconds>> } {
  const fast = sumSeconds(works.map((w) => deps.estimate('fast', w)))
  const ai = sumSeconds(works.map((w) => deps.estimate('ai', w)))
  const model = modelNote(deps.model())
  const fastText = `快速去除${fast ? fmtSeconds(fast.seconds) : ''}（用周围的画面填补，水印处会略糊）`
  const aiText = `AI 精修${ai ? fmtSeconds(ai.seconds) : ''}（逐帧补出水印下面的画面，清楚得多${model ? `；${model}` : ''}）`
  return { text: `${fastText}，${aiText}`, estimate: { fast, ai } }
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
  if (processing.some((t) => t.processing!.manual)) hints.push('正在去水印，可以带 wait_seconds 等待，处理完后任务的 watermark.removed 为 true')
  if (pending.length) {
    hints.push(
      `${pending.length} 个已下载的视频有 B站水印：先问用户要不要去掉，可选${choice!.text}。` +
        `去水印会重新编码并替换原文件；用户同意后调用 remove_watermark batch_id=${batchId} method=fast 或 method=ai`
    )
  } else if (option === 'off' && !checked.length && unfinished(videos)) {
    hints.push('下载时会识别每个视频有没有 B站水印，结果会出现在这里')
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
    estimate_basis: choice?.estimate.ai ? BASIS_TEXT[choice.estimate.ai.basis] : undefined,
    hint: hints.join('；') || undefined
  }
}

/** 还有没下完的视频 */
const unfinished = (tasks: TaskInfo[]): boolean => tasks.some((t) => mcpStatus(t) !== 'done')

/** 提交批次时告诉 agent 这批会怎么处理水印、大约多花多久 */
export function plannedWatermark(options: Pick<DownloadOptions, 'watermark' | 'output'>, items: MediaItem[], deps: WatermarkDeps) {
  const option = options.watermark ?? 'off'
  if (options.output === 'audio') return undefined
  if (option === 'off') {
    return { option, note: '下载时会识别有没有 B站水印，用 get_batch_status 查看；有的话可以问用户要不要用 remove_watermark 去掉' }
  }
  const method: WatermarkMethod = option === 'ai' ? 'ai' : 'fast'
  const works = items.flatMap((i) => (i.duration ? [{ duration: i.duration }] : []))
  const sum = sumSeconds(works.map((w) => deps.estimate(method, w)))
  const notes = ['识别到 B站水印的视频下载后会去掉水印，要重新编码']
  if (sum) notes.push(`${items.length > works.length ? '已知时长的视频' : '全部视频'}去水印合计${fmtSeconds(sum.seconds)}（${BASIS_TEXT[sum.basis]}）`)
  const model = method === 'ai' ? modelNote(deps.model()) : undefined
  if (model) notes.push(`${model}，下不下来时改用快速去除`)
  return { option, extra_seconds: sum?.seconds, note: notes.join('；') }
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
      fast: `${fmtRatio(speed.fast.ratio)}（${BASIS_TEXT[speed.fast.basis]}）`,
      ai: `${fmtRatio(speed.ai.ratio)}（${BASIS_TEXT[speed.ai.basis]}${speed.ai.backend ? `，${speed.ai.backend}` : ''}）`
    },
    processing: tasks.filter((t) => t.processing?.manual).length
  }
}

/** remove_watermark 的参数里的 region：像素坐标 */
function parseRegion(v: unknown): WatermarkRegion | undefined {
  if (v === undefined || v === null) return undefined
  const r = v as Record<string, unknown>
  if (typeof v !== 'object' || !['x', 'y', 'w', 'h'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k]))) {
    throw invalid('region 必须是 {x, y, w, h}，单位是视频的像素')
  }
  return { x: r.x as number, y: r.y as number, w: r.w as number, h: r.h as number }
}

export interface RemoveQueue {
  list(): TaskInfo[]
  startWatermark(id: string, region: WatermarkRegion, method: WatermarkMethod): void
}

type Skip = { task_id: string; title?: string; reason: string; suggested_region?: WatermarkRegion; size?: string }

/** remove_watermark：给已下载的视频去水印 */
export async function removeWatermark(args: Args, taskIds: string[], queue: RemoveQueue, deps: WatermarkDeps) {
  const method = requireEnum(args, 'method', METHODS)
  const dryRun = optionalBool(args, 'dry_run', false)
  const force = optionalBool(args, 'force', false)
  const region = parseRegion(args.region)
  if (region && taskIds.length !== 1) throw invalid('region 只能和一个任务一起用：不同视频的水印位置和尺寸可能不一样')
  if (taskIds.length > MAX_TASKS) throw invalid(`一次最多处理 ${MAX_TASKS} 个任务`)
  const all = new Map(queue.list().map((t) => [t.id, t]))
  const ok: { t: TaskInfo; region: WatermarkRegion; source: string; found: boolean; estimate: SpeedEstimate }[] = []
  const skipped: Skip[] = []
  let inspected = 0
  for (const id of taskIds) {
    const t = all.get(id)
    if (!t) {
      skipped.push({ task_id: id, reason: '没有这个任务' })
      continue
    }
    const skip = (reason: string, extra: Partial<Skip> = {}): void => void skipped.push({ task_id: id, title: t.title, reason, ...extra })
    if (t.processing) {
      skip('正在处理，等它结束')
      continue
    }
    // 下载时没识别过的要现场识别，每个要几秒，一次只做几个
    if (!t.watermark && inspected >= MAX_INSPECT) {
      skip(`这次要识别的视频太多（每次最多 ${MAX_INSPECT} 个），剩下的再调用一次`)
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
      skip('已经去过水印；想换一种方式重新处理（例如快速去除后换成 AI 精修），传 force=true')
      continue
    }
    const size = `${info.width}×${info.height}`
    let use = region
    let source = 'given'
    if (use) {
      const r = clampRegion(use, info.width, info.height)
      if (!r) {
        skip(`region 不在画面里或太小（视频尺寸 ${size}）`, { size })
        continue
      }
      use = r
    } else if (info.region && (info.found || info.applied)) {
      use = info.region
      source = info.applied ? 'applied' : info.known ? 'download' : 'detected'
    } else {
      skip(
        info.region
          ? '不确定有没有 B站水印；确认有的话，用 region 指定位置（可以用 suggested_region）'
          : '没认出水印的位置；确认有水印的话，用 region 指定位置（像素坐标）',
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
        skipped.push({ task_id: x.t.id, title: x.t.title, reason: e instanceof Error ? e.message : String(e) })
      }
    }
  }
  const list = dryRun ? ok : started
  const total = sumSeconds(list.map((x) => x.estimate))
  const notes: string[] = []
  if (total) notes.push(`合计${fmtSeconds(total.seconds)}（${BASIS_TEXT[total.basis]}）`)
  const model = method === 'ai' ? modelNote(deps.model()) : undefined
  if (model && list.length) notes.push(`${model}，下不下来或精修失败时这次改用快速去除，任务的 note 里会说明`)
  if (dryRun && list.length) notes.push('这是预估，没有开始处理；用户同意后去掉 dry_run 再调用一次')
  if (!dryRun && list.length) notes.push('处理期间原视频不变，完成后替换；用 get_batch_status 或 list_tasks 查看 watermark.processing，可以用 control_tasks action=cancel_watermark 取消')
  return {
    method,
    dry_run: dryRun || undefined,
    [dryRun ? 'would_start' : 'started']: list.map((x) => ({
      task_id: x.t.id,
      title: x.t.title,
      region: x.region,
      region_source: x.source,
      estimate_seconds: x.estimate.seconds
    })),
    skipped: skipped.length ? skipped : undefined,
    total_estimate_seconds: total?.seconds,
    hint:
      notes.join('；') ||
      (skipped.length ? '没有可以处理的视频，原因见 skipped' : '没有要处理的视频：用 batch_id 时只处理下载完、识别到水印、还没去掉的视频，别的用 task_ids 指定')
  }
}

/** remove_watermark 的目标：task_ids 或 batch_id 里的已完成视频 */
export function removeTargets(args: Args, batchTasks: ((id: string) => TaskInfo[] | undefined) | undefined): string[] {
  const ids = optionalStrings(args, 'task_ids')
  const batchId = typeof args.batch_id === 'string' && args.batch_id ? args.batch_id : undefined
  if (!ids && !batchId) throw invalid('需要用 task_ids 或 batch_id 指定要处理的视频')
  if (ids) return [...new Set(ids)]
  const tasks = batchTasks?.(batchId!)
  if (!tasks) throw new ToolError('NOT_FOUND', `没有这个批次：${batchId}`, '用 list_batches 查看最近的批次')
  // 整个批次：只挑下载完、有水印、还没去掉、没在处理的；force 时也包括已经去过的
  const force = args.force === true
  return tasks
    .filter((t) => t.status === 'done' && !t.processing && isVideoTask(t) && (t.watermark?.applied ? force : t.watermark?.found))
    .map((t) => t.id)
}
