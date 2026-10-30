import { createHash } from 'node:crypto'
import { accessSync, constants, mkdirSync } from 'node:fs'
import { statfs } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, normalize } from 'node:path'
import { downloadedMatcher } from '@shared/downloaded'
import { normalizeOptions } from '@shared/options'
import type { AuthState, MediaItem, ParseResult, Settings } from '@shared/types'
import { toDiskError } from '../download/errors'
import {
  optionalBool,
  optionalEnums,
  optionalInt,
  optionalString,
  optionalStrings,
  optionalSubdir,
  optionsOut,
  optionsSchema,
  parseOptions,
  requireEnum,
  requireString,
  type Args
} from './args'
import { BatchManager, type Batch, type ReportPart, type TaskQueue } from './batches'
import {
  ACTIVE,
  countStatuses,
  describeError,
  invalid,
  mcpStatus,
  STATUSES,
  summarizeTask,
  ToolError,
  totalSpeed,
  type McpStatus,
  type TaskSummary
} from './format'
import { ParseCache } from './parseCache'

export interface McpDeps {
  /** 解析链接并翻页，最多 maxItems 条（含登录检查和解析记录） */
  parseAll: (input: string, maxItems: number) => Promise<{ result: ParseResult; complete: boolean; error?: string }>
  /** 列表里的视频查出分P；风控、登录失效（stopsBatch）时直接抛出 */
  expandLazy: (items: MediaItem[]) => Promise<MediaItem[]>
  queue: TaskQueue
  /** 批次记录保存在这个文件里 */
  batchFile: string
  downloadedKeys: () => string[]
  settings: () => Settings
  updateSettings: (patch: Partial<Settings>) => Settings
  authState: () => Promise<AuthState>
}

export interface ToolDefinition {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean }
}

export interface ToolResult {
  content: { type: 'text'; text: string }[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

export interface ToolSet {
  definitions: ToolDefinition[]
  call(name: string, args: Args): Promise<ToolResult>
}

/** 一次最多处理的条目数；默认只翻到 1000 条，免得一次调用等太久 */
const MAX_ITEMS = 5000
const DEFAULT_ITEMS = 1000
/** 展开分P要逐个请求接口，一次最多展开这么多 */
const MAX_EXPAND = 100
/** 剩余空间低于这个值时提醒 */
const LOW_SPACE = 5 * 1024 ** 3

const ACTIONS = ['pause', 'resume', 'retry', 'redownload', 'remove'] as const
type Action = (typeof ACTIONS)[number]

/** 每种操作能作用的任务状态 */
const ELIGIBLE: Record<Action, McpStatus[]> = {
  pause: ['queued', 'running', 'retrying', 'waiting_auth'],
  resume: ['paused'],
  retry: ['failed', 'retrying'],
  // 已完成的重新下载会多出一份文件，无法下载的重下也没用
  redownload: ['queued', 'running', 'paused', 'retrying', 'failed', 'waiting_auth'],
  remove: STATUSES
}

const TASK_FIELDS = [
  'id',
  'batch_id',
  'item_id',
  'title',
  'group',
  'status',
  'stage',
  'progress',
  'speed',
  'quality',
  'error',
  'retry_at',
  'note',
  'path'
] as const satisfies readonly (keyof TaskSummary)[]

const STATUS_FILTER = [...STATUSES, 'active', 'all'] as const
const REPORT_PARTS: ReportPart[] = ['failed', 'files', 'running']

const QN_DESCRIPTION =
  '清晰度代码，会取不高于它的最高可用档：127 最高可用、120 4K、116 1080P60、112 1080P+、80 1080P、64 720P、32 480P、16 360P'

const statusSchema = (description: string) => ({
  description,
  anyOf: [
    { type: 'string', enum: STATUS_FILTER },
    { type: 'array', items: { type: 'string', enum: STATUS_FILTER } }
  ]
})

const DEFINITIONS: ToolDefinition[] = [
  {
    name: 'get_status',
    title: '应用状态',
    description: '登录和大会员状态、下载队列汇总、总速度、下载目录及剩余空间、主要设置，以及需要注意的提示。建议第一个调用。',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'parse_link',
    title: '解析链接',
    description:
      '解析 B站链接（视频、合集、番剧、课程、收藏夹、UP 主空间、稍后再看等），分页的列表会自动翻页。' +
      '条目很多时用 offset / limit 分段读取，结果缓存 10 分钟。条目的 id 是稳定的，传给 download_batch 的 ids。' +
      '列表里的视频（lazy）还没展开分P：加入下载时会自动展开；想看分P或只下其中几P时传 expand_parts。' +
      'lazy 视频的 downloaded=\'partly\' 表示至少有一P下载过，加入下载时会按每一P核对。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'B站链接、BV 号，或“稍后再看”“每周必看”“排行榜”' },
        max_items: { type: 'integer', minimum: 1, maximum: MAX_ITEMS, description: `最多翻页取多少条，默认 ${DEFAULT_ITEMS}` },
        offset: { type: 'integer', minimum: 0, description: '从第几条开始返回，默认 0' },
        limit: { type: 'integer', minimum: 1, maximum: 500, description: '返回多少条，默认 100' },
        expand_parts: { type: 'boolean', description: `展开本次返回的列表视频的分P（逐个请求，较慢），此时 limit 最大 ${MAX_EXPAND}` },
        refresh: { type: 'boolean', description: '忽略缓存重新解析' }
      },
      required: ['url']
    },
    annotations: { readOnlyHint: true, openWorldHint: true }
  },
  {
    name: 'download_batch',
    title: '批量下载',
    description:
      '把链接里的条目作为一个批次加入下载队列，立即返回 batch_id，列表视频的分P在后台展开。' +
      '用 ids 选条目，或 all=true 全部下载；单个视频的链接可以都不传。已下载过的默认跳过，已在队列里的不会重复添加。' +
      '原批次还没结束时，同样的请求再提交会返回原来的批次（deduplicated=true）；传 request_id 可以明确指定幂等键。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '和 parse_link 用的同一个链接' },
        ids: { type: 'array', items: { type: 'string' }, description: 'parse_link 返回的条目 id（视频的 id 表示它的全部分P）' },
        all: { type: 'boolean', description: '下载全部条目（最多 max_items 条）' },
        max_items: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_ITEMS,
          description: `all=true 时最多取多少条，默认 ${DEFAULT_ITEMS}，和 parse_link 一样时直接用它的缓存`
        },
        qn: { type: 'integer', description: `${QN_DESCRIPTION}。默认用设置里的清晰度` },
        options: optionsSchema('下载选项，没传的用设置里的默认值'),
        subdir: { type: 'string', description: '保存到下载目录下的这个子目录' },
        skip_downloaded: { type: 'boolean', description: '跳过下载历史里已有的条目，默认 true' },
        request_id: { type: 'string', description: '幂等键：同一个 request_id 只会创建一个批次' }
      },
      required: ['url']
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'get_batch_status',
    title: '批次进度',
    description:
      '查看一个批次的进度：各状态的任务数、已下载字节、速度、预计剩余时间、实际清晰度、失败原因和下一步提示。' +
      'wait_seconds 大于 0 时会等到批次全部结束、暂停或需要处理时才返回（最多等这么久），比反复查询省事。',
    inputSchema: {
      type: 'object',
      properties: {
        batch_id: { type: 'string' },
        wait_seconds: { type: 'integer', minimum: 0, maximum: 50, description: '最多等待多少秒，默认 0' },
        include: {
          type: 'array',
          items: { type: 'string', enum: REPORT_PARTS },
          description: '附带的明细：failed 失败列表（默认）、files 已完成的文件路径、running 正在下载的任务'
        }
      },
      required: ['batch_id']
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'list_batches',
    title: '最近的批次',
    description: '最近提交的批次（新的在前），找回 batch_id 时用。',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 50, description: '默认 20' } }
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'list_tasks',
    title: '任务列表',
    description:
      '分页查看下载任务，可按批次、状态、标题筛选。状态：queued 排队、running 下载中、paused 暂停、retrying 等待自动重试、' +
      'failed 失败、unsupported 无法下载、waiting_auth 等待登录、done 完成；active 表示还没结束的。',
    inputSchema: {
      type: 'object',
      properties: {
        batch_id: { type: 'string' },
        status: statusSchema('一个或多个状态，默认 all'),
        query: { type: 'string', description: '标题里包含的文字' },
        offset: { type: 'integer', minimum: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 500, description: '默认 50' },
        fields: { type: 'array', items: { type: 'string', enum: TASK_FIELDS }, description: '只返回这些字段' }
      }
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'control_tasks',
    title: '批量控制任务',
    description:
      '批量暂停、继续、重试、重新下载或移除任务。用 task_ids、batch_id、status 指定范围（至少一个，可以组合）。' +
      '只指定 batch_id（不带 task_ids、status）时对整个批次操作：pause / resume 时之后才加入队列的任务也一起暂停 / 继续，retry 时也重试展开分P失败的条目，remove 时不再加入还没处理的条目。' +
      'redownload 删掉已下载的部分从头下载；remove 取消未完成的任务并把任务移出列表，已下载好的文件不会删除。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ACTIONS },
        task_ids: { type: 'array', items: { type: 'string' } },
        batch_id: { type: 'string' },
        status: statusSchema('只操作这些状态的任务'),
        include_unsupported: { type: 'boolean', description: 'retry 时也重试“无法下载”的任务（例如刚开通了大会员）' }
      },
      required: ['action']
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  },
  {
    name: 'get_settings',
    title: '读取设置',
    description: '读取下载相关的设置：下载目录、并发数、每个文件的线程数、限速、自动重试次数、默认清晰度和默认下载选项。',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'update_settings',
    title: '修改设置',
    description: '修改下载相关的设置，只需传要改的项。返回修改后的设置和每一项什么时候生效。',
    inputSchema: {
      type: 'object',
      properties: {
        download_dir: { type: 'string', description: '绝对路径（可以用 ~/ 开头），不存在会创建' },
        concurrency: { type: 'integer', minimum: 1, maximum: 5, description: '同时下载的任务数' },
        threads: { type: 'integer', minimum: 1, maximum: 8, description: '每个文件同时开几个连接分段下载' },
        speed_limit_kbps: { type: 'integer', minimum: 0, description: '全局限速 KB/s，0 为不限' },
        auto_retry: { type: 'integer', minimum: 0, maximum: 20, description: '网络错误自动重试次数' },
        default_qn: { type: 'integer', description: QN_DESCRIPTION },
        defaults: optionsSchema('默认下载选项，只改传了的字段')
      }
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
]

const result = (data: Record<string, unknown>): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(data) }],
  structuredContent: data
})

const failure = (e: unknown): ToolResult => {
  const error = describeError(e)
  return { content: [{ type: 'text', text: JSON.stringify({ error }) }], structuredContent: { error }, isError: true }
}

const batchNotFound = (id: string): ToolError =>
  new ToolError('NOT_FOUND', `没有这个批次：${id}`, '用 list_batches 查看最近的批次')

/** 状态筛选：active 展开成还没结束的几种，all 或不传表示不筛选 */
function statusSet(list: readonly string[] | undefined): Set<McpStatus> | undefined {
  if (!list || list.includes('all')) return undefined
  return new Set(list.flatMap((s) => (s === 'active' ? ACTIVE : [s as McpStatus])))
}

/** 下载目录所在磁盘的剩余空间；目录还没创建时看最近一级存在的上级目录 */
async function freeSpace(dir: string): Promise<number | undefined> {
  for (let d = dir; ; d = dirname(d)) {
    try {
      const s = await statfs(d)
      return s.bavail * s.bsize
    } catch {
      if (dirname(d) === d) return undefined
    }
  }
}

/** 检查并创建下载目录，返回规范化后的绝对路径 */
function prepareDir(raw: string): string {
  const dir = normalize(raw.startsWith('~/') ? join(homedir(), raw.slice(2)) : raw)
  if (!isAbsolute(dir)) throw invalid('download_dir 必须是绝对路径')
  try {
    mkdirSync(dir, { recursive: true })
    accessSync(dir, constants.W_OK)
  } catch (e) {
    throw invalid(`下载目录不可用：${toDiskError(e, dir).message}`)
  }
  return dir
}

const SETTING_EFFECTS: Record<string, string> = {
  download_dir: '只影响之后加入的任务，已在队列里的任务仍保存到原来的目录',
  concurrency: '立即生效：调高时排队的任务马上开始，调低时正在下载的任务不会被打断',
  threads: '正在下载的任务不受影响；之后开始下载、暂停后继续的任务按新值分段',
  speed_limit_kbps: '立即生效',
  auto_retry: '立即生效',
  default_qn: '只影响之后加入的任务',
  defaults: '只影响之后加入的任务'
}

/** MCP 的工具：参数校验、调用下载队列和批次管理，结果整理成 agent 好用的 JSON */
export class McpTools implements ToolSet {
  readonly definitions = DEFINITIONS
  readonly batches: BatchManager
  private cache: ParseCache

  constructor(
    private deps: McpDeps,
    now?: () => number
  ) {
    this.batches = new BatchManager(deps.batchFile, deps.queue, deps.expandLazy, deps.downloadedKeys)
    this.cache = new ParseCache(deps.parseAll, now)
  }

  async call(name: string, args: Args): Promise<ToolResult> {
    try {
      switch (name) {
        case 'get_status':
          return result(await this.getStatus())
        case 'parse_link':
          return result(await this.parseLink(args))
        case 'download_batch':
          return result(await this.downloadBatch(args))
        case 'get_batch_status':
          return result(await this.batchStatus(args))
        case 'list_batches':
          return result(this.listBatches(args))
        case 'list_tasks':
          return result(this.listTasks(args))
        case 'control_tasks':
          return result(this.controlTasks(args))
        case 'get_settings':
          return result(this.settingsOut(this.deps.settings()))
        case 'update_settings':
          return result(this.updateSettings(args))
        default:
          throw new ToolError('NOT_FOUND', `没有这个工具：${name}`, '用 tools/list 查看可用的工具')
      }
    } catch (e) {
      return failure(e)
    }
  }

  private async getStatus() {
    const s = this.deps.settings()
    const tasks = this.deps.queue.list()
    const counts = countStatuses(tasks)
    const free = await freeSpace(s.downloadDir)
    const hints: string[] = []
    let login: Record<string, unknown>
    try {
      const auth = await this.deps.authState()
      if (auth.loggedIn) {
        login = { logged_in: true, user: auth.user.uname, vip: auth.user.vipActive, vip_label: auth.user.vipLabel || undefined }
        if (!auth.user.vipActive) hints.push('不是大会员：4K、1080P 高码率等大会员清晰度拿不到，会自动降到能下载的最高档')
      } else {
        login = { logged_in: false, expired: auth.expired || undefined }
        hints.push('应用没有登录：解析链接需要登录，请让用户在 B站下载器 里登录')
      }
    } catch (e) {
      login = { logged_in: null, error: describeError(e).message }
      hints.push('暂时无法确认登录状态（可能是网络问题）')
    }
    if (counts.waiting_auth) hints.push(`${counts.waiting_auth} 个任务在等待登录，用户重新登录后会自动继续`)
    if (counts.paused) hints.push(`${counts.paused} 个任务已暂停（应用重启后未完成的任务会自动暂停），可以用 control_tasks action=resume 继续`)
    if (counts.failed) hints.push(`${counts.failed} 个任务失败，可以用 control_tasks action=retry status=failed 重试`)
    if (free !== undefined && free < LOW_SPACE) hints.push('下载目录所在磁盘剩余空间不足 5 GB')
    return {
      login,
      queue: { total: tasks.length, ...counts, speed_bps: totalSpeed(tasks) },
      download_dir: s.downloadDir,
      free_space_bytes: free,
      settings: { concurrency: s.concurrency, threads: s.threads, speed_limit_kbps: s.speedLimit, default_qn: s.defaultQn },
      hints
    }
  }

  private async parseLink(args: Args) {
    const url = requireString(args, 'url')
    const maxItems = optionalInt(args, 'max_items', 1, MAX_ITEMS, DEFAULT_ITEMS)
    const offset = optionalInt(args, 'offset', 0, MAX_ITEMS, 0)
    const expand = optionalBool(args, 'expand_parts', false)
    const limit = optionalInt(args, 'limit', 1, expand ? MAX_EXPAND : 500, 100)
    const p = await this.cache.get(url, maxItems, optionalBool(args, 'refresh', false))
    const window = p.items.slice(offset, offset + limit)
    if (expand) await this.expandParts(window)
    const r = p.result
    const isDownloaded = downloadedMatcher(this.deps.downloadedKeys())
    const isQueued = this.queuedMatcher()
    // 番剧有正片、花絮等多个分组时，告诉 agent 每条属于哪组
    const groupOf = new Map(r.groups.length > 1 ? r.groups.flatMap((g) => g.items.map((i) => [i.key, g.title] as const)) : [])
    const next = offset + limit < p.items.length ? offset + limit : null
    const hints: string[] = []
    if (p.error) hints.push(`翻页时出错（${p.error}），只拿到前 ${p.items.length} 条，过一会儿可以带 refresh=true 重试`)
    else if (!p.complete) hints.push(`只取了前 ${p.items.length} 条，需要更多请调大 max_items（最多 ${MAX_ITEMS}）`)
    if (next !== null) hints.push(`还有条目没返回，用 offset=${next} 继续读取`)
    if (p.items.some((i) => i.lazy)) hints.push('lazy 的条目是还没展开分P的视频，加入下载时会自动展开')
    return {
      title: r.title,
      kind: r.kind,
      owner: r.owner ?? r.meta?.owner,
      total: r.paging?.total ?? p.items.length,
      fetched: p.items.length,
      complete: p.complete,
      offset,
      limit,
      next_offset: next,
      counts: {
        unavailable: p.items.filter((i) => i.unavailable).length,
        downloaded: p.items.filter(isDownloaded).length,
        queued: p.items.filter(isQueued).length,
        lazy: p.items.filter((i) => i.lazy).length
      },
      items: window.map((i) => {
        const parts = i.lazy ? this.cache.partsOf(i.key) : undefined
        return {
          id: i.key,
          index: i.index,
          title: i.title,
          group: groupOf.get(i.key),
          duration: i.duration,
          lazy: i.lazy || undefined,
          // 展开过的列出分P，没展开的只知道分P数（知道的话）
          parts: parts ? parts.map((x) => ({ id: x.key, page: x.page, title: x.title, duration: x.duration })) : i.lazy ? i.pages : undefined,
          badge: i.badge,
          need_vip: i.needVip || undefined,
          unavailable: i.unavailable,
          // 列表视频只能按 BV 号判断，说明有分P下载过，不一定全部下载过
          downloaded: isDownloaded(i) ? (i.lazy ? 'partly' : true) : undefined,
          queued: isQueued(i) || undefined
        }
      }),
      hint: hints.join('；') || undefined
    }
  }

  /** 队列里还没完成的条目 */
  private queuedMatcher(): (i: MediaItem) => boolean {
    return downloadedMatcher(this.deps.queue.list().flatMap((t) => (t.status === 'done' ? [] : [t.item.key])))
  }

  private async expandParts(items: MediaItem[]): Promise<void> {
    const todo = items.filter((i) => i.lazy && !i.unavailable && !this.cache.partsOf(i.key))
    if (!todo.length) return
    const out = await this.deps.expandLazy(todo)
    for (const v of todo) {
      const parts = out.filter((p) => p.bvid === v.bvid && !p.unavailable)
      if (parts.length) this.cache.setParts(v.key, parts)
    }
  }

  private async downloadBatch(args: Args) {
    const url = requireString(args, 'url')
    const ids = optionalStrings(args, 'ids')
    const all = optionalBool(args, 'all', false)
    if (ids && all) throw invalid('ids 和 all 只能用一个')
    const s = this.deps.settings()
    const qn = optionalInt(args, 'qn', 1, 1000, s.defaultQn)
    const options = normalizeOptions({ ...s.defaults, ...parseOptions(args.options, 'options') }, qn)
    const subdir = optionalSubdir(args, 'subdir')
    const skipDownloaded = optionalBool(args, 'skip_downloaded', true)
    const requestId = optionalString(args, 'request_id')
    const maxItems = optionalInt(args, 'max_items', 1, MAX_ITEMS, DEFAULT_ITEMS)
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([url, ids ? [...ids].sort() : all, options, subdir, skipDownloaded]))
      .digest('hex')

    const dup = this.batches.findDuplicate(requestId, fingerprint)
    if (dup) {
      const resumed = this.batches.resume(dup)
      return {
        ...this.submitted(dup),
        deduplicated: true,
        hint: resumed
          ? '同样的请求之前提交过，已经接着处理上次没加入队列的条目'
          : `同样的请求之前提交过，没有重复添加；用 get_batch_status batch_id=${dup.id} 查看进度，要重新提交请换一个 request_id`
      }
    }

    const p = await this.cache.get(url, maxItems)
    const r = p.result
    let chosen: MediaItem[]
    let unknown: string[] = []
    if (ids) {
      ;({ chosen, unknown } = this.pick(p.items, ids))
      if (!chosen.length) throw invalid(`ids 都不在这个链接里（例如 ${unknown.slice(0, 3).join('、')}），先用 parse_link 查看条目 id`)
    } else if (all) {
      chosen = p.items
    } else if (r.paging) {
      // 收藏夹、UP 主投稿可能有成千上万条，必须明确选择
      throw invalid(`这是一个有 ${r.paging.total} 条的列表，请传 all=true 下载全部，或用 ids 选择条目`)
    } else {
      const def = new Set(r.defaultSelected)
      chosen = def.size ? p.items.filter((i) => def.has(i.key)) : p.items
    }
    const unavailable = chosen.filter((i) => i.unavailable).length
    // 展开过分P的列表视频直接用缓存的分P，不用再查；同时选了视频和它的某一P时只算一次
    const unique = new Map<string, MediaItem>()
    for (const i of chosen.filter((x) => !x.unavailable).flatMap((x) => (x.lazy && this.cache.partsOf(x.key)) || [x])) {
      if (!unique.has(i.key)) unique.set(i.key, i)
    }
    chosen = [...unique.values()]
    // 列表视频要展开后才能按每一P核对，交给批次处理
    const isDownloaded = downloadedMatcher(this.deps.downloadedKeys())
    const fresh = skipDownloaded ? chosen.filter((i) => i.lazy || !isDownloaded(i)) : chosen
    const downloaded = chosen.length - fresh.length
    const notes: string[] = []
    if (unknown.length) notes.push(`${unknown.length} 个 id 不在这个链接里，已忽略`)
    const truncated = all && !p.complete
    if (truncated && p.error) notes.push(`翻页时出错（${p.error}），只加入了前 ${p.items.length} 条；过一会儿再提交一次可以补上后面的`)
    else if (truncated) notes.push(`只取了前 ${p.items.length} 条，后面的没有加入；需要更多请调大 max_items（最多 ${MAX_ITEMS}）`)

    if (!fresh.length) {
      return {
        batch_id: null,
        title: r.title,
        selected: 0,
        skipped: { downloaded, unavailable },
        unknown_ids: unknown.length ? unknown : undefined,
        hint: downloaded ? '选中的条目都已经下载过；要重新下载请传 skip_downloaded=false' : '没有可以下载的条目'
      }
    }
    const b = this.batches.submit({
      requestId,
      fingerprint,
      url,
      title: r.title,
      cover: r.cover,
      kind: r.kind,
      meta: r.meta,
      options,
      dir: subdir ? join(s.downloadDir, subdir) : s.downloadDir,
      items: fresh,
      skipDownloaded,
      skipped: { downloaded, unavailable }
    })
    notes.push(`用 get_batch_status batch_id=${b.id} wait_seconds=30 查看进度`)
    return {
      ...this.submitted(b),
      complete: truncated ? false : undefined,
      unknown_ids: unknown.length ? unknown : undefined,
      hint: notes.join('；')
    }
  }

  /** 按 id 选条目；分P的 id 要 parse_link 的 expand_parts 展开过才认识 */
  private pick(items: MediaItem[], ids: string[]): { chosen: MediaItem[]; unknown: string[] } {
    const byKey = new Map(items.map((i) => [i.key, i]))
    for (const i of items) if (i.lazy) for (const part of this.cache.partsOf(i.key) ?? []) byKey.set(part.key, part)
    const chosen: MediaItem[] = []
    const unknown: string[] = []
    for (const id of new Set(ids)) {
      const it = byKey.get(id)
      if (it) chosen.push(it)
      else unknown.push(id)
    }
    return { chosen, unknown }
  }

  private submitted(b: Batch) {
    return {
      batch_id: b.id,
      title: b.title,
      state: this.batches.state(b),
      selected: b.selected,
      skipped: b.skipped,
      dir: b.dir
    }
  }

  private findBatch(args: Args): Batch {
    const id = requireString(args, 'batch_id')
    const b = this.batches.find(id)
    if (!b) throw batchNotFound(id)
    return b
  }

  private async batchStatus(args: Args) {
    const b = this.findBatch(args)
    const wait = optionalInt(args, 'wait_seconds', 0, 50, 0)
    const include = new Set<ReportPart>(optionalEnums(args, 'include', REPORT_PARTS) ?? ['failed'])
    await this.batches.wait(b, wait * 1000)
    return this.batches.report(b, include)
  }

  private listBatches(args: Args) {
    const limit = optionalInt(args, 'limit', 1, 50, 20)
    const list = this.batches.list()
    return { total: list.length, batches: list.slice(-limit).reverse().map((b) => this.batches.brief(b)) }
  }

  private listTasks(args: Args) {
    const batchId = optionalString(args, 'batch_id')
    const want = statusSet(optionalEnums(args, 'status', STATUS_FILTER))
    const query = optionalString(args, 'query')?.toLowerCase()
    const offset = optionalInt(args, 'offset', 0, Number.MAX_SAFE_INTEGER, 0)
    const limit = optionalInt(args, 'limit', 1, 500, 50)
    const fields = optionalEnums(args, 'fields', TASK_FIELDS)
    const inBatch = this.batchTaskIds(batchId)
    const tasks = this.deps.queue
      .list()
      .filter(
        (t) =>
          (!inBatch || inBatch.has(t.id)) &&
          (!want || want.has(mcpStatus(t))) &&
          (!query || t.title.toLowerCase().includes(query) || t.groupTitle.toLowerCase().includes(query))
      )
    const next = offset + limit < tasks.length ? offset + limit : null
    return {
      total: tasks.length,
      offset,
      next_offset: next,
      tasks: tasks.slice(offset, offset + limit).map((t) => {
        const sum = summarizeTask(t)
        return fields ? Object.fromEntries(fields.map((f) => [f, sum[f]])) : sum
      })
    }
  }

  private controlTasks(args: Args) {
    const action = requireEnum(args, 'action', ACTIONS)
    const taskIds = optionalStrings(args, 'task_ids')
    const batchId = optionalString(args, 'batch_id')
    const statuses = optionalEnums(args, 'status', STATUS_FILTER)
    if (!taskIds && !batchId && !statuses) throw invalid('需要用 task_ids、batch_id 或 status 指定要操作的任务')
    const batch = batchId ? this.batches.find(batchId) : undefined
    if (batchId && !batch) throw batchNotFound(batchId)
    const want = statusSet(statuses)
    const idSet = taskIds && new Set(taskIds)
    const inBatch = this.batchTaskIds(batchId)
    const all = this.deps.queue.list()
    const matched = all.filter(
      (t) => (!idSet || idSet.has(t.id)) && (!inBatch || inBatch.has(t.id)) && (!want || want.has(mcpStatus(t)))
    )
    const allowed = new Set<McpStatus>(ELIGIBLE[action])
    if (action === 'retry' && optionalBool(args, 'include_unsupported', false)) allowed.add('unsupported')
    const eligible = matched.filter((t) => allowed.has(mcpStatus(t)))
    const ids = eligible.map((t) => t.id)
    const skipped = [
      ...(taskIds ?? []).filter((id) => !all.some((t) => t.id === id)).map((id) => ({ id, reason: '没有这个任务' })),
      ...matched
        .filter((t) => !allowed.has(mcpStatus(t)))
        .map((t) => ({ id: t.id, status: mcpStatus(t), reason: `${mcpStatus(t)} 状态的任务不能 ${action}` }))
    ]
    // 只指定了批次（没有点名任务、没有按状态筛选），就是对整个批次操作
    const wholeBatch = batch && !taskIds && !statuses ? batch : undefined
    const batchResult: Record<string, unknown> = {}
    const q = this.deps.queue
    switch (action) {
      case 'pause':
        q.pauseMany(ids)
        if (wholeBatch) this.batches.setPaused(wholeBatch, true)
        break
      case 'resume':
        q.resumeMany(ids)
        if (wholeBatch) {
          this.batches.setPaused(wholeBatch, false)
          batchResult.expand_resumed = this.batches.resume(wholeBatch)
        }
        break
      case 'retry':
        // resumeMany 不管无法下载的任务，要逐个 resume
        for (const t of eligible) if (t.status === 'unsupported') q.resume(t.id)
        q.resumeMany(eligible.filter((t) => t.status !== 'unsupported').map((t) => t.id))
        if (wholeBatch) batchResult.items_retried = this.batches.retryFailed(wholeBatch)
        break
      case 'redownload':
        for (const id of ids) q.redownload(id)
        break
      case 'remove':
        if (wholeBatch) batchResult.items_canceled = this.batches.cancelPending(wholeBatch)
        // 已下载好的文件一律保留
        q.remove(ids, false)
        break
    }
    return {
      action,
      matched: matched.length,
      affected: ids.length,
      skipped: skipped.length ? skipped.slice(0, 50) : undefined,
      skipped_total: skipped.length > 50 ? skipped.length : undefined,
      batch: wholeBatch ? batchResult : undefined
    }
  }

  /** 批次里的任务（包括算进这个批次的、别处已在下载的同一条目）；没指定批次时不筛选 */
  private batchTaskIds(batchId: string | undefined): Set<string> | undefined {
    if (!batchId) return undefined
    const b = this.batches.find(batchId)
    // 批次记录已经清理掉时，按任务上记的批次 id 找
    const tasks = b ? this.batches.tasksOf(b) : this.deps.queue.list().filter((t) => t.batchId === batchId)
    return new Set(tasks.map((t) => t.id))
  }

  private settingsOut(s: Settings) {
    return {
      download_dir: s.downloadDir,
      concurrency: s.concurrency,
      threads: s.threads,
      speed_limit_kbps: s.speedLimit,
      auto_retry: s.autoRetry,
      default_qn: s.defaultQn,
      defaults: optionsOut(s.defaults)
    }
  }

  private updateSettings(args: Args) {
    const cur = this.deps.settings()
    const patch: Partial<Settings> = {}
    const changed: string[] = []
    const set = <K extends keyof Settings>(name: string, key: K, value: Settings[K] | undefined): void => {
      if (value === undefined) return
      patch[key] = value
      changed.push(name)
    }
    const int = (name: string, min: number, max: number): number | undefined =>
      args[name] === undefined || args[name] === null ? undefined : optionalInt(args, name, min, max, 0)
    const dir = optionalString(args, 'download_dir')
    set('download_dir', 'downloadDir', dir === undefined ? undefined : prepareDir(dir))
    set('concurrency', 'concurrency', int('concurrency', 1, 5))
    set('threads', 'threads', int('threads', 1, 8))
    set('speed_limit_kbps', 'speedLimit', int('speed_limit_kbps', 0, 10_000_000))
    set('auto_retry', 'autoRetry', int('auto_retry', 0, 20))
    set('default_qn', 'defaultQn', int('default_qn', 1, 1000))
    if (args.defaults !== undefined) {
      // 先合并当前值：只传了部分字段时，其他字段不能被重置成出厂默认
      const { qn: _qn, ...opts } = normalizeOptions({ ...cur.defaults, ...parseOptions(args.defaults, 'defaults') })
      set('defaults', 'defaults', opts)
    }
    if (!changed.length) throw invalid('没有要修改的设置，可以改：' + Object.keys(SETTING_EFFECTS).join('、'))
    const next = this.deps.updateSettings(patch)
    return { settings: this.settingsOut(next), effects: Object.fromEntries(changed.map((k) => [k, SETTING_EFFECTS[k]])) }
  }
}
