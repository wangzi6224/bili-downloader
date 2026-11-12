import { createHash } from 'node:crypto'
import { accessSync, constants, mkdirSync } from 'node:fs'
import { statfs } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, normalize } from 'node:path'
import { downloadedMatcher } from '@shared/downloaded'
import { joinList, t, translate, type Key } from '@shared/i18n'
import { normalizeOptions } from '@shared/options'
import type { AuthState, HistoryEntry, MediaItem, ParseRecord, ParseResult, Settings, TaskInfo } from '@shared/types'
import { AuthExpiredError } from '../bili/http'
import { lazyVideo } from '../bili/lists'
import type { BiliLookup } from '../bili/lookup'
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
  accountDefinitions, accountFilter, accountMid as requestedMid, accountOut, compareQuality, findAccount,
  historyPage, matchesAccount, usesBiliAccount, withAccountInput, type AccountRegistry, type QualityProbe
} from './accountTools'
import {
  ACTIVE,
  batchNotFound,
  countStatuses,
  describeError,
  invalid,
  joinHints,
  loginHint,
  loginThenRetry,
  mcpStatus,
  STATUSES,
  summarizeTask,
  ToolError,
  totalSpeed,
  type McpStatus,
  type TaskSummary
} from './format'
import type { LoginFlow } from './loginFlow'
import { activeScope, authScope, inAuthScope, isRetired } from '../auth/scope'
import { loginDefinitions, LoginTools } from './loginTools'
import { lookupDefinitions, LookupTools } from './lookupTools'
import { ParseCache } from './parseCache'
import { batchWatermark, METHODS, plannedWatermark, removeTargets, removeWatermark, watermarkStatus, type WatermarkDeps } from './watermark'

export interface McpDeps {
  /** 解析链接并翻页，最多 maxItems 条（含登录检查和解析记录） */
  parseAll: (input: string, maxItems: number) => Promise<{ result: ParseResult; complete: boolean; error?: string }>
  /** 列表里的视频查出分P；风控、登录失效（stopsBatch）时直接抛出 */
  expandLazy: (items: MediaItem[]) => Promise<MediaItem[]>
  queue: TaskQueue
  /** 批次记录保存在这个文件里 */
  batchFile: string
  downloadedKeys: () => string[]
  downloadRecords: () => HistoryEntry[]
  parseRecords: () => ParseRecord[]
  probeQuality: QualityProbe
  settings: () => Settings
  updateSettings: (patch: Partial<Settings>) => Settings
  authState: () => Promise<AuthState>
  accounts?: AccountRegistry
  /** 退出账号：由应用弹窗问用户本人，并按用户的选择处理它名下的任务和订阅；返回 false 表示用户拒绝 */
  logoutAccount?: (mid: number) => Promise<boolean>
  /** 搜索、视频详情、评论这些检索接口 */
  lookup: BiliLookup
  login: LoginFlow
  /** 去水印：估算耗时、AI 模型状态、识别已下载视频的水印 */
  watermark: WatermarkDeps
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
  /** 按当前语言生成，每次 tools/list 时调用 */
  definitions(): ToolDefinition[]
  call(name: string, args: Args): Promise<ToolResult>
}

/** 一次最多处理的条目数；默认只翻到 1000 条，免得一次调用等太久 */
const MAX_ITEMS = 5000
const DEFAULT_ITEMS = 1000
/** 展开分P要逐个请求接口，一次最多展开这么多 */
const MAX_EXPAND = 100
/** 一次提交多个视频时最多这么多个 */
const MAX_VIDEOS = 200
const MAX_TITLE = 100
/** 剩余空间低于这个值时提醒 */
const LOW_SPACE = 5 * 1024 ** 3

const ACTIONS = ['pause', 'resume', 'retry', 'redownload', 'remove', 'cancel_watermark'] as const
type Action = (typeof ACTIONS)[number]

/** 每种操作能作用的任务状态 */
const ELIGIBLE: Record<Action, McpStatus[]> = {
  pause: ['queued', 'running', 'retrying', 'waiting_auth'],
  resume: ['paused'],
  retry: ['failed', 'retrying'],
  // 已完成的重新下载会多出一份文件，无法下载的重下也没用
  redownload: ['queued', 'running', 'paused', 'retrying', 'failed', 'waiting_auth'],
  remove: STATUSES,
  // 去水印时任务仍是 done，另外要看是不是正在去水印
  cancel_watermark: ['done']
}

const TASK_FIELDS = [
  'id',
  'batch_id',
  'account_mid',
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
  'path',
  'watermark'
] as const satisfies readonly (keyof TaskSummary)[]

const STATUS_FILTER = [...STATUSES, 'active', 'all'] as const
const REPORT_PARTS: ReportPart[] = ['failed', 'files', 'running']

const statusSchema = (description: string) => ({
  description,
  anyOf: [
    { type: 'string', enum: STATUS_FILTER },
    { type: 'array', items: { type: 'string', enum: STATUS_FILTER } }
  ]
})

/** 下载、批次、设置类工具的定义。按当前语言现算，每次 tools/list 时调用 */
const definitions = (): ToolDefinition[] => [
  {
    name: 'get_status',
    title: t('mcpTools.getStatusTitle'),
    description: t('mcpTools.getStatusDesc'),
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'parse_link',
    title: t('mcpTools.parseLinkTitle'),
    description: t('mcpTools.parseLinkDesc'),
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: t('mcpTools.parseLinkUrl') },
        max_items: { type: 'integer', minimum: 1, maximum: MAX_ITEMS, description: t('mcpTools.parseLinkMaxItems', { n: DEFAULT_ITEMS }) },
        offset: { type: 'integer', minimum: 0, description: t('mcpTools.parseLinkOffset') },
        limit: { type: 'integer', minimum: 1, maximum: 500, description: t('mcpTools.parseLinkLimit') },
        expand_parts: { type: 'boolean', description: t('mcpTools.parseLinkExpand', { n: MAX_EXPAND }) },
        refresh: { type: 'boolean', description: t('mcpTools.parseLinkRefresh') }
      },
      required: ['url']
    },
    annotations: { readOnlyHint: true, openWorldHint: true }
  },
  {
    name: 'download_batch',
    title: t('mcpTools.downloadTitle'),
    description: t('mcpTools.downloadDesc'),
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: t('mcpTools.downloadUrl') },
        videos: {
          type: 'array',
          items: { type: 'string' },
          maxItems: MAX_VIDEOS,
          description: t('mcpTools.downloadVideos', { max: MAX_VIDEOS })
        },
        title: { type: 'string', maxLength: MAX_TITLE, description: t('mcpTools.downloadBatchTitle') },
        ids: { type: 'array', items: { type: 'string' }, description: t('mcpTools.downloadIds') },
        all: { type: 'boolean', description: t('mcpTools.downloadAll') },
        max_items: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_ITEMS,
          description: t('mcpTools.downloadMaxItems', { n: DEFAULT_ITEMS })
        },
        qn: { type: 'integer', description: t('mcpTools.downloadQn', { qn: t('mcpTools.qn') }) },
        options: optionsSchema(t('mcpTools.downloadOptions')),
        subdir: { type: 'string', description: t('mcpTools.downloadSubdir') },
        skip_downloaded: { type: 'boolean', description: t('mcpTools.downloadSkip') },
        request_id: { type: 'string', description: t('mcpTools.downloadRequestId') }
      }
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'get_batch_status',
    title: t('mcpTools.batchStatusTitle'),
    description: t('mcpTools.batchStatusDesc'),
    inputSchema: {
      type: 'object',
      properties: {
        batch_id: { type: 'string' },
        wait_seconds: { type: 'integer', minimum: 0, maximum: 50, description: t('mcpTools.batchStatusWait') },
        include: {
          type: 'array',
          items: { type: 'string', enum: REPORT_PARTS },
          description: t('mcpTools.batchStatusInclude')
        }
      },
      required: ['batch_id']
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'list_batches',
    title: t('mcpTools.listBatchesTitle'),
    description: t('mcpTools.listBatchesDesc'),
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 50, description: t('mcpTools.listBatchesLimit') } }
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'list_tasks',
    title: t('mcpTools.listTasksTitle'),
    description: t('mcpTools.listTasksDesc'),
    inputSchema: {
      type: 'object',
      properties: {
        batch_id: { type: 'string' },
        status: statusSchema(t('mcpTools.listTasksStatus')),
        query: { type: 'string', description: t('mcpTools.listTasksQuery') },
        offset: { type: 'integer', minimum: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 500, description: t('mcpTools.listTasksLimit') },
        fields: { type: 'array', items: { type: 'string', enum: TASK_FIELDS }, description: t('mcpTools.listTasksFields') }
      }
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'control_tasks',
    title: t('mcpTools.controlTitle'),
    description: t('mcpTools.controlDesc'),
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ACTIONS },
        task_ids: { type: 'array', items: { type: 'string' } },
        batch_id: { type: 'string' },
        status: statusSchema(t('mcpTools.controlStatus')),
        include_unsupported: { type: 'boolean', description: t('mcpTools.controlUnsupported') }
      },
      required: ['action']
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  },
  {
    name: 'remove_watermark',
    title: t('mcpTools.removeWmTitle'),
    description: t('mcpTools.removeWmDesc'),
    inputSchema: {
      type: 'object',
      properties: {
        method: { type: 'string', enum: METHODS, description: t('mcpTools.removeWmMethod') },
        task_ids: { type: 'array', items: { type: 'string' }, description: t('mcpTools.removeWmTaskIds') },
        batch_id: { type: 'string', description: t('mcpTools.removeWmBatchId') },
        region: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } },
          required: ['x', 'y', 'w', 'h'],
          description: t('mcpTools.removeWmRegion')
        },
        force: { type: 'boolean', description: t('mcpTools.removeWmForce') },
        dry_run: { type: 'boolean', description: t('mcpTools.removeWmDryRun') }
      },
      required: ['method']
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
  },
  {
    name: 'get_settings',
    title: t('mcpTools.getSettingsTitle'),
    description: t('mcpTools.getSettingsDesc'),
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'update_settings',
    title: t('mcpTools.updateSettingsTitle'),
    description: t('mcpTools.updateSettingsDesc'),
    inputSchema: {
      type: 'object',
      properties: {
        download_dir: { type: 'string', description: t('mcpTools.updateDownloadDir') },
        concurrency: { type: 'integer', minimum: 1, maximum: 5, description: t('mcpTools.updateConcurrency') },
        threads: { type: 'integer', minimum: 1, maximum: 8, description: t('mcpTools.updateThreads') },
        speed_limit_kbps: { type: 'integer', minimum: 0, description: t('mcpTools.updateSpeedLimit') },
        auto_retry: { type: 'integer', minimum: 0, maximum: 20, description: t('mcpTools.updateAutoRetry') },
        default_qn: { type: 'integer', description: t('mcpTools.qn') },
        defaults: optionsSchema(t('mcpTools.updateDefaults'))
      }
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
]

const result = (data: Record<string, unknown>): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(data) }],
  structuredContent: data
})

const failure = (e: unknown, mid?: number): ToolResult => {
  const error = describeError(e)
  if (mid !== undefined && error.code === 'NOT_LOGGED_IN') error.hint = t('mcpAccounts.relogin', { mid })
  const data = { error, account_mid: mid }
  return { ...result(data), isError: true }
}

/** 状态筛选：active 展开成还没结束的几种，all 或不传表示不筛选 */
function statusSet(list: readonly string[] | undefined): Set<McpStatus> | undefined {
  if (!list || list.includes('all')) return undefined
  return new Set(list.flatMap((s) => (s === 'active' ? ACTIVE : [s as McpStatus])))
}

function countByAccount(tasks: TaskInfo[]): Map<number | undefined, TaskInfo[]> {
  const groups = new Map<number | undefined, TaskInfo[]>()
  for (const task of tasks) {
    const group = groups.get(task.accountMid)
    if (group) group.push(task)
    else groups.set(task.accountMid, [task])
  }
  return groups
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
  if (!isAbsolute(dir)) throw invalid(t('mcpTools.downloadDirAbsolute'))
  try {
    mkdirSync(dir, { recursive: true })
    accessSync(dir, constants.W_OK)
  } catch (e) {
    throw invalid(t('mcpTools.downloadDirUnusable', { reason: toDiskError(e, dir).message }))
  }
  return dir
}

const SETTING_EFFECTS: Record<string, Key> = {
  download_dir: 'mcpTools.effectDownloadDir',
  concurrency: 'mcpTools.effectConcurrency',
  threads: 'mcpTools.effectThreads',
  speed_limit_kbps: 'mcpTools.effectNow',
  auto_retry: 'mcpTools.effectNow',
  default_qn: 'mcpTools.effectLater',
  defaults: 'mcpTools.effectLater'
}

/** MCP 的工具：参数校验、调用下载队列和批次管理，结果整理成 agent 好用的 JSON */
export class McpTools implements ToolSet {
  readonly batches: BatchManager
  private cache: ParseCache
  private lookup: LookupTools
  private login: LoginTools

  constructor(
    private deps: McpDeps,
    now?: () => number
  ) {
    this.batches = new BatchManager(deps.batchFile, deps.queue, deps.expandLazy, deps.downloadedKeys, undefined, deps.accounts)
    this.cache = new ParseCache(deps.parseAll, now)
    this.lookup = new LookupTools(deps.lookup, deps.authState, { now })
    this.login = new LoginTools(deps.login, (mid) => this.batches.list()
      .filter((b) => b.accountMid === mid && this.batches.state(b) === 'interrupted').map((b) => b.id), deps.accounts)
  }

  definitions(): ToolDefinition[] {
    return [...definitions(), ...loginDefinitions(), ...lookupDefinitions(), ...accountDefinitions()].map(withAccountInput)
  }

  async call(name: string, args: Args): Promise<ToolResult> {
    let mid: number | undefined
    try {
      if (this.login.handles(name)) return result(await this.login.call(name, args))
      if (usesBiliAccount(name)) {
        mid = requestedMid(args)
        if (mid !== undefined) {
          findAccount(this.deps.accounts, mid)
          return result(await this.deps.accounts!.run(mid, () => this.callInAccount(name, args)))
        }
        mid = activeScope().mid
      }
      return result(await inAuthScope({ ...activeScope(), background: true }, () => this.callInAccount(name, args)))
    } catch (e) {
      return failure(e, mid)
    }
  }

  private async callInAccount(name: string, args: Args): Promise<Record<string, unknown>> {
    if (this.lookup.handles(name)) return { ...await this.lookup.call(name, args), account_mid: this.accountMid() }
    switch (name) {
      case 'get_status': return this.getStatus(requestedMid(args))
      case 'parse_link': return this.parseLink(args)
      case 'download_batch': return this.downloadBatch(args)
      case 'get_batch_status': return this.batchStatus(args)
      case 'list_batches': return this.listBatches(args)
      case 'list_tasks': return this.listTasks(args)
      case 'control_tasks': return this.controlTasks(args)
      case 'remove_watermark': return this.removeWatermark(args)
      case 'get_settings':
      case 'update_settings':
        if (args.account_mid !== undefined) throw invalid(t('mcpAccounts.sharedSettings'))
        return name === 'get_settings' ? this.settingsOut(this.deps.settings()) : this.updateSettings(args)
      case 'list_accounts': return this.listAccounts()
      case 'switch_account':
      case 'logout_account': return this.changeAccount(name, requestedMid(args, true)!)
      case 'list_download_history': return historyPage(args, this.deps.downloadRecords(), this.deps.accounts)
      case 'list_parse_history': return historyPage(args, this.deps.parseRecords(), this.deps.accounts)
      case 'get_download_quality':
        return compareQuality(this.deps.accounts, this.deps.probeQuality, requireString(args, 'url'), optionalString(args, 'item_id'), requestedMid(args))
      default:
        throw new ToolError('NOT_FOUND', t('mcpTools.noSuchTool', { name }), t('mcpTools.noSuchToolHint'))
    }
  }

  private listAccounts() {
    const state = this.deps.accounts?.snapshot()
    return { active_account_mid: state?.activeMid ?? null, accounts: (state?.accounts ?? []).map(accountOut) }
  }

  private async changeAccount(name: 'switch_account' | 'logout_account', mid: number) {
    const account = findAccount(this.deps.accounts, mid)
    const registry = this.deps.accounts!
    // 退出会清掉这个账号的登录，不能只凭 AI 助手的请求（它读到的评论、字幕可能含有注入的指令）
    const logout = name === 'logout_account' && account.status !== 'removed' ? this.deps.logoutAccount : undefined
    try {
      if (name === 'switch_account') await registry.select(mid)
      else if (!logout) await registry.remove(mid)
      else if (!(await logout(mid))) {
        throw new ToolError('FAILED', t('mcpAccounts.logoutDeclined', { name: account.uname }), t('mcpAccounts.logoutDeclinedHint'))
      }
    } catch (e) {
      const error = describeError(e)
      if (error.code === 'NOT_LOGGED_IN') throw new ToolError(error.code, error.message, t('mcpAccounts.relogin', { mid }))
      throw e
    }
    return { account_mid: mid, name: account.uname, status: registry.status(mid), active_account_mid: registry.snapshot().activeMid ?? null }
  }

  private accountMid(): number | undefined {
    const scope = authScope()
    return scope.mid ?? this.deps.accounts?.midForPartition(scope.partition)
  }

  private async getStatus(mid?: number) {
    const registry = this.deps.accounts
    const target = mid === undefined ? undefined : findAccount(registry, mid)
    const s = this.deps.settings()
    const tasks = this.deps.queue.list().filter((task) => matchesAccount(task.accountMid, mid))
    const counts = countStatuses(tasks)
    const free = await freeSpace(s.downloadDir)
    const hints: string[] = []
    let login: Record<string, unknown>
    try {
      const auth = target ? await registry!.run(target.mid, this.deps.authState) : await this.deps.authState()
      if (auth.loggedIn) {
        login = { logged_in: true, user: auth.user.uname, vip: auth.user.vipActive, vip_label: auth.user.vipLabel || undefined }
        if (!auth.user.vipActive) hints.push(t('mcpTools.notVip'))
      } else {
        login = { logged_in: false, expired: auth.expired || undefined }
        hints.push(t('mcpTools.appNotLoggedIn', { loginHint: loginHint() }))
      }
    } catch (e) {
      const error = describeError(e)
      if (target && error.code === 'NOT_LOGGED_IN') {
        login = { logged_in: false, user: target.uname, status: registry!.status(target.mid) }
        hints.push(t('mcpAccounts.relogin', { mid: target.mid }))
      } else {
        login = { logged_in: null, error: error.message }
        hints.push(t('mcpTools.loginUnknown'))
      }
    }
    if (counts.waiting_auth) hints.push(t('mcpTools.waitingAuth', { count: counts.waiting_auth, loginHint: loginHint() }))
    if (counts.paused) hints.push(t('mcpTools.paused', { count: counts.paused }))
    if (counts.failed) hints.push(t('mcpTools.failed', { count: counts.failed }))
    if (free !== undefined && free < LOW_SPACE) hints.push(t('mcpTools.lowSpace'))
    return {
      account_mid: mid ?? this.accountMid(),
      active_account_mid: registry?.snapshot().activeMid ?? null,
      login,
      queue: { total: tasks.length, ...counts, speed_bps: totalSpeed(tasks) },
      queue_by_account: registry ? Array.from(countByAccount(tasks), ([account_mid, group]) => ({
        account_mid: account_mid ?? null, total: group.length, ...countStatuses(group)
      })) : undefined,
      download_dir: s.downloadDir,
      free_space_bytes: free,
      settings: { concurrency: s.concurrency, threads: s.threads, speed_limit_kbps: s.speedLimit, default_qn: s.defaultQn },
      watermark: watermarkStatus(s.defaults, tasks, this.deps.watermark),
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
    if (expand) await this.cache.expandParts(window, this.deps.expandLazy)
    const r = p.result
    const isDownloaded = downloadedMatcher(this.deps.downloadedKeys())
    const isQueued = this.queuedMatcher()
    // 番剧有正片、花絮等多个分组时，告诉 agent 每条属于哪组
    const groupOf = new Map(r.groups.length > 1 ? r.groups.flatMap((g) => g.items.map((i) => [i.key, g.title] as const)) : [])
    const next = offset + limit < p.items.length ? offset + limit : null
    const hints: string[] = []
    if (p.error) hints.push(t('mcpTools.pageError', { error: p.error, count: p.items.length }))
    else if (!p.complete) hints.push(t('mcpTools.truncated', { count: p.items.length, max: MAX_ITEMS }))
    if (next !== null) hints.push(t('mcpTools.moreItems', { next }))
    if (p.items.some((i) => i.lazy)) hints.push(t('mcpTools.lazyItems'))
    return {
      account_mid: this.accountMid(),
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
      hint: joinHints(hints)
    }
  }

  /** 队列里还没完成的条目，不分账号：别的账号已经在下的，提交后也会跳过 */
  private queuedMatcher(): (i: MediaItem) => boolean {
    return downloadedMatcher(this.deps.queue.list().filter((task) => task.status !== 'done').map((task) => task.item.key))
  }

  /** url 和 videos 两种提交方式共用的参数 */
  private batchArgs(args: Args) {
    const s = this.deps.settings()
    const qn = optionalInt(args, 'qn', 1, 1000, s.defaultQn)
    return {
      downloadDir: s.downloadDir,
      options: normalizeOptions({ ...s.defaults, ...parseOptions(args.options, 'options') }, qn),
      subdir: optionalSubdir(args, 'subdir'),
      skipDownloaded: optionalBool(args, 'skip_downloaded', true),
      requestId: optionalString(args, 'request_id')
    }
  }

  private deduplicated(dup: Batch) {
    const resumed = this.batches.resume(dup)
    return {
      ...this.submitted(dup),
      deduplicated: true,
      hint: resumed
        ? t('mcpTools.dupResumed')
        : t('mcpTools.dupSame', { id: dup.id })
    }
  }

  private async downloadBatch(args: Args) {
    const videos = optionalStrings(args, 'videos')
    if (videos) {
      for (const key of ['url', 'ids', 'all', 'max_items']) {
        if (args[key] !== undefined && args[key] !== null) throw invalid(t('mcpTools.videosWith', { key }))
      }
      const list = [...new Set(videos)]
      if (!list.length) throw invalid(t('mcpTools.videosEmpty'))
      if (list.length > MAX_VIDEOS) throw invalid(t('mcpTools.videosTooMany', { max: MAX_VIDEOS }))
      return this.downloadVideos(list, args)
    }
    return this.downloadUrl(requireString(args, 'url'), args)
  }

  /**
   * 视频合成一个批次：当成列表里还没展开分P的视频，
   * 后台展开、风控时中断续传、按每一P跳过下载过的，都和收藏夹一样处理
   */
  private async downloadVideos(list: string[], args: Args) {
    const { downloadDir, options, subdir, skipDownloaded, requestId } = this.batchArgs(args)
    const custom = optionalString(args, 'title')
    if (custom && custom.length > MAX_TITLE) throw invalid(t('mcpTools.titleTooLong', { max: MAX_TITLE }))
    const { bvids, rejected } = await this.lookup.resolveBvids(list)
    const unique = [...new Set(bvids)]
    if (!unique.length) {
      throw invalid(t('mcpTools.videosNone', { examples: joinList(rejected.slice(0, 3)) }))
    }
    // 只有一个视频时和直接传链接一样，用它的标题和封面；多个时后台展开才知道
    const only = unique.length === 1 ? await this.lookup.videoDetail(unique[0]) : undefined
    // 标题是命名变量 {series}（文件夹名）和去重指纹的一部分，和其他自动生成的标题一样固定用中文，不随界面语言变
    const title = custom ?? only?.title ?? translate('zh-CN', 'mcpTools.videosTitle', { count: unique.length })
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(['videos', [...unique].sort(), title, options, subdir, skipDownloaded]))
      .digest('hex')

    // 这条路径不解析链接，要自己确认登录：没登录时清晰度和可下载的内容都不对
    const auth = await this.deps.authState()
    if (!auth.loggedIn) throw new ToolError('NOT_LOGGED_IN', t('mcp.notLoggedIn'), loginThenRetry())

    const rejectedOut = rejected.length ? rejected : undefined
    // 查重和提交之间不能有 await：并行的相同请求才不会都建出批次
    const accountMid = this.accountMid()
    const dup = this.batches.findDuplicate(requestId, fingerprint, accountMid)
    if (dup) return { ...this.deduplicated(dup), rejected: rejectedOut }
    const b = this.batches.submit({
      accountMid,
      requestId,
      fingerprint,
      url: '',
      title,
      cover: only?.cover ?? '',
      kind: 'ugc',
      options,
      dir: subdir ? join(downloadDir, subdir) : downloadDir,
      items: unique.map((bvid, i) => lazyVideo({ bvid, title: only?.title ?? bvid, pic: only?.cover }, i + 1)),
      skipDownloaded,
      skipped: { downloaded: 0, unavailable: 0 }
    })
    const notes = [t('mcpTools.checkProgress', { id: b.id })]
    if (rejected.length) notes.unshift(t('mcpTools.rejected', { count: rejected.length }))
    // 只有一个视频时知道时长，多个时要展开后才知道
    const items = only?.duration ? [{ duration: only.duration } as MediaItem] : []
    return {
      ...this.submitted(b),
      rejected: rejectedOut,
      watermark: plannedWatermark(options, items, this.deps.watermark),
      hint: joinHints(notes)
    }
  }

  private async downloadUrl(url: string, args: Args) {
    const ids = optionalStrings(args, 'ids')
    const all = optionalBool(args, 'all', false)
    if (ids && all) throw invalid(t('mcpTools.idsAndAll'))
    const { downloadDir, options, subdir, skipDownloaded, requestId } = this.batchArgs(args)
    const maxItems = optionalInt(args, 'max_items', 1, MAX_ITEMS, DEFAULT_ITEMS)
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([url, ids ? [...ids].sort() : all, options, subdir, skipDownloaded]))
      .digest('hex')

    const dup = this.batches.findDuplicate(requestId, fingerprint, this.accountMid())
    if (dup) return this.deduplicated(dup)

    const p = await this.cache.get(url, maxItems)
    const r = p.result
    let chosen: MediaItem[]
    let unknown: string[] = []
    if (ids) {
      ;({ chosen, unknown } = await this.pick(p.items, ids))
      if (!chosen.length) throw invalid(t('mcpTools.idsNone', { examples: joinList(unknown.slice(0, 3)) }))
    } else if (all) {
      chosen = p.items
    } else if (r.paging) {
      // 收藏夹、UP 主投稿可能有成千上万条，必须明确选择
      throw invalid(t('mcpTools.pagedList', { total: r.paging.total }))
    } else {
      const def = new Set(r.defaultSelected)
      chosen = def.size ? p.items.filter((i) => def.has(i.key)) : p.items
    }
    // 解析或展开期间可能已经退出账号，或有相同的请求先完成了入队。
    if (isRetired(authScope().partition)) throw new AuthExpiredError()
    const accountMid = this.accountMid()
    const earlier = this.batches.findDuplicate(requestId, fingerprint, accountMid)
    if (earlier) return this.deduplicated(earlier)
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
    if (unknown.length) notes.push(t('mcpTools.unknownIds', { count: unknown.length }))
    const truncated = all && !p.complete
    if (truncated && p.error) notes.push(t('mcpTools.addPageError', { error: p.error, count: p.items.length }))
    else if (truncated) notes.push(t('mcpTools.addTruncated', { count: p.items.length, max: MAX_ITEMS }))

    if (!fresh.length) {
      return {
        batch_id: null,
        account_mid: accountMid,
        title: r.title,
        selected: 0,
        skipped: { downloaded, unavailable },
        unknown_ids: unknown.length ? unknown : undefined,
        hint: downloaded ? t('mcpTools.allDownloaded') : t('mcpTools.nothingToDownload')
      }
    }
    const b = this.batches.submit({
      accountMid,
      requestId,
      fingerprint,
      url,
      title: r.title,
      cover: r.cover,
      kind: r.kind,
      meta: r.meta,
      options,
      dir: subdir ? join(downloadDir, subdir) : downloadDir,
      items: fresh,
      skipDownloaded,
      skipped: { downloaded, unavailable }
    })
    notes.push(t('mcpTools.checkProgress', { id: b.id }))
    return {
      ...this.submitted(b),
      complete: truncated ? false : undefined,
      unknown_ids: unknown.length ? unknown : undefined,
      watermark: plannedWatermark(options, fresh, this.deps.watermark),
      hint: joinHints(notes)
    }
  }

  /** 只展开实际出现在来源里的父视频，分 P ID 可以直接用于提交。 */
  private async pick(items: MediaItem[], ids: string[]): Promise<{ chosen: MediaItem[]; unknown: string[] }> {
    const byKey = new Map(items.map((i) => [i.key, i]))
    const requested = new Set(ids)
    const parents = new Map<string, MediaItem>()
    const uncached = new Set<MediaItem>()
    for (const id of requested) {
      if (byKey.has(id)) continue
      const parentKey = /^(ugc:[^:]+):[1-9]\d*$/.exec(id)?.[1]
      const parent = parentKey ? byKey.get(parentKey) : undefined
      if (!parent?.lazy || parent.unavailable) continue
      parents.set(id, parent)
      if (!this.cache.partsOf(parent.key)) uncached.add(parent)
    }
    if (uncached.size > MAX_EXPAND) throw invalid(t('mcpAccounts.partSelectionLimit', { max: MAX_EXPAND }))
    await this.cache.expandParts([...uncached], this.deps.expandLazy)
    const chosen: MediaItem[] = []
    const unknown: string[] = []
    for (const id of requested) {
      const parent = parents.get(id)
      const it = byKey.get(id) ?? (parent && this.cache.partsOf(parent.key)?.find((part) => part.key === id))
      if (it) chosen.push(it)
      else unknown.push(id)
    }
    return { chosen, unknown }
  }

  private submitted(b: Batch) {
    return {
      batch_id: b.id,
      account_mid: b.accountMid,
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
    if (!b || !matchesAccount(b.accountMid, accountFilter(args))) throw batchNotFound(id)
    return b
  }

  private async batchStatus(args: Args) {
    const b = this.findBatch(args)
    const wait = optionalInt(args, 'wait_seconds', 0, 50, 0)
    const include = new Set<ReportPart>(optionalEnums(args, 'include', REPORT_PARTS) ?? ['failed'])
    await this.batches.wait(b, wait * 1000)
    return { ...this.batches.report(b, include), watermark: batchWatermark(b.options, this.batches.tasksOf(b), b.id, this.deps.watermark) }
  }

  private listBatches(args: Args) {
    const limit = optionalInt(args, 'limit', 1, 50, 20)
    const filter = accountFilter(args)
    const list = this.batches.list().filter((b) => matchesAccount(b.accountMid, filter))
    return { total: list.length, batches: list.slice(-limit).reverse().map((b) => this.batches.brief(b)) }
  }

  private listTasks(args: Args) {
    const batchId = optionalString(args, 'batch_id')
    const want = statusSet(optionalEnums(args, 'status', STATUS_FILTER))
    const query = optionalString(args, 'query')?.toLowerCase()
    const offset = optionalInt(args, 'offset', 0, Number.MAX_SAFE_INTEGER, 0)
    const limit = optionalInt(args, 'limit', 1, 500, 50)
    const fields = optionalEnums(args, 'fields', TASK_FIELDS)
    const filter = accountFilter(args)
    const inBatch = this.batchTaskIds(batchId)
    const tasks = this.deps.queue
      .list()
      .filter(
        (t) =>
          matchesAccount(t.accountMid, filter) &&
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
    const filter = accountFilter(args)
    if (!taskIds && !batchId && !statuses && filter === undefined) throw invalid(t('mcpTools.controlScope'))
    const batch = batchId ? this.findBatch(args) : undefined
    const want = statusSet(statuses)
    const idSet = taskIds && new Set(taskIds)
    const inBatch = this.batchTaskIds(batchId)
    const all = this.deps.queue.list().filter((task) => matchesAccount(task.accountMid, filter))
    const matched = all.filter(
      (t) => (!idSet || idSet.has(t.id)) && (!inBatch || inBatch.has(t.id)) && (!want || want.has(mcpStatus(t)))
    )
    const allowed = new Set<McpStatus>(ELIGIBLE[action])
    if (action === 'retry' && optionalBool(args, 'include_unsupported', false)) allowed.add('unsupported')
    const watermarking = (t: TaskInfo): boolean => Boolean(t.processing?.manual)
    const can = (t: TaskInfo): boolean => allowed.has(mcpStatus(t)) && (action !== 'cancel_watermark' || watermarking(t))
    const eligible = matched.filter(can)
    const ids = eligible.map((t) => t.id)
    const skipped = [
      ...(taskIds ?? []).filter((id) => !all.some((t) => t.id === id)).map((id) => ({ id, reason: t('mcp.noSuchTask') })),
      ...matched
        .filter((task) => !can(task))
        .map((task) => ({
          id: task.id,
          status: mcpStatus(task),
          reason: action === 'cancel_watermark' ? t('mcpTools.notWatermarking') : t('mcpTools.wrongStatus', { status: mcpStatus(task), action })
        }))
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
      case 'cancel_watermark':
        for (const id of ids) q.cancelWatermark(id)
        break
    }
    return {
      action,
      account_mid: filter,
      affected_by_account: Array.from(countByAccount(eligible), ([mid, group]) => ({ account_mid: mid ?? null, count: group.length })),
      matched: matched.length,
      affected: ids.length,
      skipped: skipped.length ? skipped.slice(0, 50) : undefined,
      skipped_total: skipped.length > 50 ? skipped.length : undefined,
      batch: wholeBatch ? batchResult : undefined
    }
  }

  private removeWatermark(args: Args) {
    if (args.task_ids !== undefined && args.task_ids !== null && args.batch_id !== undefined && args.batch_id !== null) {
      throw invalid(t('mcpTools.taskIdsAndBatch'))
    }
    const filter = accountFilter(args)
    const queue = this.deps.queue
    const ids = removeTargets(args, (id) => {
      const b = this.batches.find(id)
      if (b) return matchesAccount(b.accountMid, filter) ? this.batches.tasksOf(b) : undefined
      // 批次记录已经清理掉时，按任务上记的批次 id 找
      const tasks = queue.list().filter((t) => t.batchId === id && matchesAccount(t.accountMid, filter))
      return tasks.length ? tasks : undefined
    })
    return removeWatermark(args, ids, {
      list: () => queue.list().filter((task) => matchesAccount(task.accountMid, filter)),
      startWatermark: (id, region, method) => queue.startWatermark(id, region, method)
    }, this.deps.watermark)
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
    if (!changed.length) throw invalid(t('mcpTools.nothingToUpdate', { names: joinList(Object.keys(SETTING_EFFECTS)) }))
    const next = this.deps.updateSettings(patch)
    return { settings: this.settingsOut(next), effects: Object.fromEntries(changed.map((k) => [k, t(SETTING_EFFECTS[k])])) }
  }
}
