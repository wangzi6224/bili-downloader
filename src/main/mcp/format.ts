import { t as tr, type Key } from '@shared/i18n'
import { isVideoTask } from '@shared/watermark'
import type { ProcessingInfo, TaskInfo } from '@shared/types'
import { AuthExpiredError, BiliError, LoginRequiredError } from '../bili/http'

/** 给 agent 看的任务状态：运行中的几个阶段合成 running，等待自动重试的 error 单独算 retrying */
export type McpStatus = 'queued' | 'running' | 'paused' | 'retrying' | 'failed' | 'unsupported' | 'waiting_auth' | 'done'

export const STATUSES: McpStatus[] = ['queued', 'running', 'paused', 'retrying', 'failed', 'unsupported', 'waiting_auth', 'done']

/** 还没结束的状态 */
export const ACTIVE: McpStatus[] = ['queued', 'running', 'paused', 'retrying', 'waiting_auth']

export function mcpStatus(t: TaskInfo): McpStatus {
  switch (t.status) {
    case 'fetching':
    case 'downloading':
    case 'merging':
    case 'extras':
    case 'processing':
      return 'running'
    case 'error':
      return t.retryAt ? 'retrying' : 'failed'
    case 'waitingAuth':
      return 'waiting_auth'
    default:
      return t.status
  }
}

export function countStatuses(tasks: TaskInfo[]): Record<McpStatus, number> {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<McpStatus, number>
  for (const t of tasks) counts[mcpStatus(t)]++
  return counts
}

/** 正在下载的任务速度之和（字节/秒） */
export const totalSpeed = (tasks: TaskInfo[]): number =>
  Math.round(tasks.reduce((n, t) => n + (mcpStatus(t) === 'running' ? t.speed : 0), 0))

const STAGE_TEXT: Record<ProcessingInfo['stage'], Key> = {
  detect: 'mcp.stageDetect',
  queue: 'mcp.stageQueue',
  encode: 'mcp.stageEncode',
  model: 'mcp.stageModel',
  analyze: 'mcp.stageAnalyze',
  refine: 'mcp.stageRefine'
}

export function processingOut(p: ProcessingInfo) {
  return {
    stage: p.stage,
    stage_text: tr(STAGE_TEXT[p.stage]),
    progress: p.pct === undefined ? undefined : Math.round(p.pct),
    eta_seconds: p.eta === undefined ? undefined : Math.round(p.eta),
    backend: p.backend
  }
}

/** 任务摘要里的水印信息；没什么可说的（音频、没开也没识别过）时没有 */
export function taskWatermark(t: TaskInfo) {
  if (!isVideoTask(t)) return undefined
  const option = t.options.watermark ?? 'off'
  const wm = t.watermark
  if (!wm && !t.processing && option === 'off') return undefined
  return {
    option,
    // undefined：没识别过
    found: wm ? Boolean(wm.found) || Boolean(wm.applied) : undefined,
    removed: wm?.applied ? true : undefined,
    processing: t.processing ? processingOut(t.processing) : undefined
  }
}

export function summarizeTask(t: TaskInfo) {
  const status = mcpStatus(t)
  return {
    id: t.id,
    batch_id: t.batchId,
    item_id: t.item.key,
    title: t.title,
    group: t.groupTitle,
    status,
    // 运行中再细分：取流、下载、附加内容、合并
    stage: status === 'running' ? t.status : undefined,
    progress: status === 'done' ? 100 : t.total ? Math.round((t.downloaded / t.total) * 100) : 0,
    speed: status === 'running' ? Math.round(t.speed) : undefined,
    quality: t.qualityLabel,
    error: t.error,
    retry_at: t.retryAt ? new Date(t.retryAt).toISOString() : undefined,
    note: t.note,
    path: t.outputPath,
    watermark: taskWatermark(t)
  }
}

export type TaskSummary = ReturnType<typeof summarizeTask>

/** 未登录时告诉 agent 怎么办 */
export const loginHint = (): string => tr('mcp.loginHint')

/** 未登录的报错里给的提示：怎么登录，登录后再试 */
export const loginThenRetry = (): string => tr('mcp.loginThenRetry', { loginHint: loginHint() })

/** 多条提示连成一句；没有提示时是 undefined */
export const joinHints = (hints: string[]): string | undefined => hints.join(tr('mcp.sep')) || undefined

export type ErrorCode = 'NOT_LOGGED_IN' | 'RATE_LIMITED' | 'INVALID_ARGS' | 'NOT_FOUND' | 'FAILED'

/** 带错误码和下一步提示的工具错误 */
export class ToolError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public hint?: string
  ) {
    super(message)
  }
}

export const invalid = (message: string): ToolError => new ToolError('INVALID_ARGS', message)

export const batchNotFound = (id: string): ToolError =>
  new ToolError('NOT_FOUND', tr('mcp.batchNotFound', { id }), tr('mcp.batchNotFoundHint'))

/** B站风控：HTTP 412、接口返回的 -352（签名校验失败）、-412（请求被拦截）、-799（请求过于频繁） */
const RATE_LIMIT_CODES = new Set([412, -352, -412, -799])

/** 风控或登录失效：接着请求只会继续失败，批量处理时应当先停下 */
export const stopsBatch = (e: unknown): boolean => ['NOT_LOGGED_IN', 'RATE_LIMITED'].includes(describeError(e).code)

export function describeError(e: unknown): { code: ErrorCode; message: string; hint?: string } {
  if (e instanceof ToolError) return { code: e.code, message: e.message, hint: e.hint }
  const message = e instanceof Error ? e.message : String(e)
  if (e instanceof LoginRequiredError || e instanceof AuthExpiredError) {
    return { code: 'NOT_LOGGED_IN', message, hint: loginThenRetry() }
  }
  if (e instanceof BiliError && RATE_LIMIT_CODES.has(e.code)) {
    return { code: 'RATE_LIMITED', message, hint: tr('mcp.rateLimitedHint') }
  }
  return { code: 'FAILED', message }
}
