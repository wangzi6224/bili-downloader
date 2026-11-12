import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setLanguage } from '@shared/i18n'
import { DICTS } from '@shared/i18n/locales'
import { DEFAULT_OPTIONS, normalizeOptions } from '@shared/options'
import type { AccountState, AuthState, BiliAccount, MediaItem, ParseResult, Settings } from '@shared/types'
import { fakeWatermark, FakeQueue, makeTask, mediaItem, WM_REGION } from '../../test/fakeQueue'
import { activeScope, authScope, inAuthScope, setActiveScope } from '../auth/scope'
import type { AccountRegistry } from './accountTools'

vi.mock('electron', () => ({}))
// 透传真实实现，个别用例再改返回值
vi.mock('node:fs/promises', async (orig) => {
  const real = await orig<typeof import('node:fs/promises')>()
  return { ...real, statfs: vi.fn(real.statfs) }
})
vi.mock('node:fs', async (orig) => {
  const real = await orig<typeof import('node:fs')>()
  return { ...real, mkdirSync: vi.fn(real.mkdirSync), accessSync: vi.fn(real.accessSync) }
})
const fs = await import('node:fs')
const { statfs } = await import('node:fs/promises')
const { AuthExpiredError, BiliError, LoginRequiredError } = await import('../bili/http')
const { McpTools } = await import('./tools')
type Lookup = import('../bili/lookup').BiliLookup
type LoginFlow = import('./loginFlow').LoginFlow
type LoginSnapshot = import('./loginFlow').LoginSnapshot

let dir = ''
let queue: FakeQueue
let settings: Settings
let tools: InstanceType<typeof McpTools>
let wm: ReturnType<typeof fakeWatermark>
let history: string[]
let now = 0

const lazy = (n: number, over: Partial<MediaItem> = {}): MediaItem =>
  mediaItem(`ugc:BV${n}`, { lazy: true, bvid: `BV${n}`, cid: 0, index: n, title: `视频${n}`, ...over })
const plain = (n: number, over: Partial<MediaItem> = {}): MediaItem =>
  mediaItem(`ugc:BV${n}:${n}`, { bvid: `BV${n}`, cid: n, index: n, title: `视频${n}`, ...over })

const result = (items: MediaItem[], over: Partial<ParseResult> = {}): ParseResult => ({
  kind: 'ugc',
  title: '合集',
  cover: 'c.jpg',
  groups: [{ id: 'g', title: '合集', items }],
  defaultSelected: [],
  ...over
})

const deps = {
  parseAll: vi.fn(
    async (_input: string, _max: number): Promise<{ result: ParseResult; complete: boolean; error?: string }> => ({
      result: result([plain(1), plain(2)]),
      complete: true
    })
  ),
  /** 列表视频展开成两个分P */
  expandLazy: vi.fn(async (items: MediaItem[]) =>
    items.flatMap((i) =>
      i.lazy ? [1, 2].map((p) => ({ ...i, key: `${i.key}:${p}`, lazy: false, page: p, cid: p, title: `${i.title} P${p}` })) : [i]
    )
  ),
  authState: vi.fn(async (): Promise<AuthState> => ({
    loggedIn: true,
    user: { mid: 1, uname: '用户', face: '', vipActive: true, vipLabel: '年度大会员' }
  })),
  updateSettings: vi.fn((patch: Partial<Settings>) => (settings = { ...settings, ...patch })),
  searchUsers: vi.fn(),
  fetchVideoDetail: vi.fn(),
  expandShort: vi.fn()
}

/** 登录流程：只看工具有没有接到它上面，流程本身在 loginFlow.test.ts */
const login = {
  start: vi.fn(async () => {}),
  wait: vi.fn(async () => {}),
  browsers: vi.fn(() => []),
  snapshot: vi.fn((): LoginSnapshot => ({ status: 'idle', tried: [], alsoAvailable: [], auth: { loggedIn: false } }))
} as unknown as LoginFlow

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await tools.call(name, args)
  expect(JSON.parse(r.content[0].text)).toEqual(JSON.parse(JSON.stringify(r.structuredContent)))
  return r
}
/** 成功时的结果 */
const data = async (name: string, args: Record<string, unknown> = {}): Promise<any> => {
  const r = await call(name, args)
  expect(r.isError).toBeUndefined()
  return r.structuredContent
}
/** 出错时的 error 对象 */
const error = async (name: string, args: Record<string, unknown> = {}): Promise<any> => {
  const r = await call(name, args)
  expect(r.isError).toBe(true)
  return (r.structuredContent as { error: unknown }).error
}
const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r))
}

const makeTools = (patch: Partial<import('./tools').McpDeps> = {}) => new McpTools({
  ...deps,
  queue,
  batchFile: join(dir, 'batches.json'),
  downloadedKeys: () => history,
  downloadRecords: () => [],
  parseRecords: () => [],
  probeQuality: async () => ({ item_id: plain(1).key, title: '视频1', qualities: [] }),
  settings: () => settings,
  lookup: { searchUsers: deps.searchUsers, fetchVideoDetail: deps.fetchVideoDetail, expandShort: deps.expandShort } as unknown as Lookup,
  login,
  watermark: wm,
  ...patch
}, () => now)

beforeEach(() => {
  // 恢复成最初的实现，免得上一个用例的 mockResolvedValue 留下来
  vi.resetAllMocks()
  dir = mkdtempSync(join(tmpdir(), 'mcp-tools-'))
  queue = new FakeQueue()
  wm = fakeWatermark()
  history = []
  now = 1_000_000
  settings = {
    downloadDir: join(dir, 'dl'),
    concurrency: 2,
    threads: 4,
    speedLimit: 0,
    autoRetry: 5,
    defaultQn: 80,
    defaults: { ...DEFAULT_OPTIONS, subtitle: false }
  } as Settings
  tools = makeTools()
})

afterEach(() => {
  // 先写完节流中的批次记录，免得删掉目录后定时器又把它建出来
  tools.batches.flush()
  rmSync(dir, { recursive: true, force: true })
})

describe('工具列表和通用错误', () => {
  it('没有保存账号时返回空列表，画质比较不会发请求', async () => {
    expect(await data('list_accounts')).toEqual({ active_account_mid: null, accounts: [] })
    expect(await data('get_download_quality', { url: 'x' })).toMatchObject({ accounts: [], best_qn: null })
  })
  it('每个工具都有标题、说明、参数和注解', () => {
    expect(tools.definitions().map((t) => t.name)).toEqual([
      'get_status',
      'parse_link',
      'download_batch',
      'get_batch_status',
      'list_batches',
      'list_tasks',
      'control_tasks',
      'remove_watermark',
      'get_settings',
      'update_settings',
      'start_login',
      'get_login_status',
      'search_videos',
      'search_users',
      'get_video_info',
      'get_video_transcript',
      'get_video_comments',
      'list_accounts',
      'switch_account',
      'logout_account',
      'get_download_quality',
      'list_download_history',
      'list_parse_history'
    ])
    for (const t of tools.definitions()) {
      expect(t.title && t.description).toBeTruthy()
      expect(t.inputSchema.type).toBe('object')
      expect(typeof t.annotations.readOnlyHint).toBe('boolean')
    }
    const control = tools.definitions().find((t) => t.name === 'control_tasks')!
    expect(control.annotations.destructiveHint).toBe(true)
    // 去水印会替换原文件
    const wmTool = tools.definitions().find((t) => t.name === 'remove_watermark')!
    expect(wmTool.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true })
  })

  it('工具说明按调用时的界面语言现算，工具名和参数名不翻译', () => {
    const zh = tools.definitions()
    const desc = (list: typeof zh, name: string): string => list.find((x) => x.name === name)!.description
    const saved = { mcpTools: DICTS.en.mcpTools, mcpLogin: DICTS.en.mcpLogin, mcpLookup: DICTS.en.mcpLookup }
    // 英文字典还没有这些命名空间（沿用中文），临时塞覆盖值来区分
    DICTS.en.mcpTools = { ...saved.mcpTools, getStatusDesc: 'App status', optDanmaku: 'Download danmaku' }
    DICTS.en.mcpLogin = { ...saved.mcpLogin, startDesc: 'Log in' }
    DICTS.en.mcpLookup = { ...saved.mcpLookup, searchUsersDesc: 'Find uploaders. {untrusted}', untrusted: 'Untrusted.' }
    setLanguage('en')
    try {
      const en = tools.definitions()
      expect(en.map((x) => x.name)).toEqual(zh.map((x) => x.name))
      expect(desc(en, 'get_status')).toBe('App status')
      expect(desc(en, 'start_login')).toBe(`Log in ${DICTS.en.mcpAccounts.loginDesc}`)
      expect(desc(en, 'search_users')).toBe('Find uploaders. Untrusted.')
      const opts = en.find((x) => x.name === 'download_batch')!.inputSchema.properties as Record<string, any>
      expect(opts.options.properties.danmaku).toEqual({ type: 'boolean', description: 'Download danmaku' })
      expect(Object.keys(opts)).toEqual(Object.keys(zh.find((x) => x.name === 'download_batch')!.inputSchema.properties as object))
    } finally {
      setLanguage('zh-CN')
      Object.assign(DICTS.en, saved)
    }
    expect(desc(tools.definitions(), 'get_status')).toBe(desc(zh, 'get_status'))
    expect(desc(zh, 'get_status')).toMatch(/^登录和大会员状态/)
  })

  it('没有这个工具', async () => {
    expect(await error('rm_rf')).toEqual({ code: 'NOT_FOUND', message: '没有这个工具：rm_rf', hint: '用 tools/list 查看可用的工具' })
  })

  it('未登录、风控和其他错误带上错误码', async () => {
    deps.parseAll.mockRejectedValueOnce(new LoginRequiredError('请先登录 B站账号'))
    expect(await error('parse_link', { url: 'x' })).toMatchObject({ code: 'NOT_LOGGED_IN', message: '请先登录 B站账号' })
    deps.parseAll.mockRejectedValueOnce(new BiliError('请求被拦截', -412))
    expect(await error('parse_link', { url: 'y' })).toMatchObject({ code: 'RATE_LIMITED', hint: expect.stringContaining('风控') })
    deps.parseAll.mockRejectedValueOnce(new BiliError('视频不存在', 404))
    expect(await error('parse_link', { url: 'z' })).toEqual({ code: 'FAILED', message: '视频不存在' })
    deps.parseAll.mockRejectedValueOnce('奇怪')
    expect(await error('parse_link', { url: 'w' })).toEqual({ code: 'FAILED', message: '奇怪' })
  })
})

describe('登录工具', () => {
  it('接到登录流程上，参数不对时和其他工具一样报错', async () => {
    expect(await data('get_login_status')).toMatchObject({ status: 'idle', logged_in: false })
    expect(await data('start_login', { method: 'qr' })).toMatchObject({ status: 'idle' })
    expect(login.start).toHaveBeenCalledWith('qr', undefined)
    expect(await error('start_login', { method: 'x' })).toMatchObject({ code: 'INVALID_ARGS' })
  })

  it('登录成功时列出被打断的批次', async () => {
    const { batch_id } = await data('download_batch', { url: 'x', all: true })
    Object.assign(tools.batches.find(batch_id)!, { state: 'interrupted', accountMid: 1 })
    vi.mocked(login.snapshot).mockReturnValueOnce({
      status: 'logged_in',
      tried: [],
      alsoAvailable: [],
      auth: { loggedIn: true, user: { mid: 1, uname: 'u', face: '', vipActive: false, vipLabel: '' } }
    })
    expect(await data('get_login_status')).toMatchObject({ interrupted_batches: [batch_id] })
  })
})

describe('多账号 MCP', () => {
  const profile = (mid: number, status: BiliAccount['status']): BiliAccount => ({
    mid, status, uname: `账号 ${mid}`, face: '', vipActive: mid === 2, vipLabel: mid === 2 ? '大会员' : ''
  })
  let state: AccountState
  let registry: AccountRegistry
  let originalScope: ReturnType<typeof activeScope>

  beforeEach(() => {
    originalScope = activeScope()
    state = { activeMid: 1, accounts: [profile(1, 'ready'), profile(2, 'ready'), profile(3, 'expired'), profile(4, 'removed')], legacyCount: 0 }
    const partition = (mid: number) => `account-${mid}`
    const status = (mid: number) => state.accounts.find((a) => a.mid === mid)?.status ?? 'removed'
    registry = {
      snapshot: () => state,
      status,
      partition,
      midForPartition: () => undefined,
      run: async (mid, fn) => {
        if (mid === undefined || status(mid) !== 'ready') throw new AuthExpiredError()
        return inAuthScope({ mid, partition: partition(mid), background: true }, fn)
      },
      select: async (mid) => {
        if (status(mid) !== 'ready') throw new AuthExpiredError()
        state.activeMid = mid
        setActiveScope({ mid, partition: partition(mid) })
        return state
      },
      remove: async (mid) => { state.accounts.find((a) => a.mid === mid)!.status = 'removed' }
    }
    setActiveScope({ mid: 1, partition: partition(1) })
    tools = makeTools({ accounts: registry })
  })

  afterEach(() => setActiveScope(originalScope))

  it.each(['parse_link', 'download_batch', 'search_videos', 'search_users', 'get_video_info', 'get_video_transcript', 'get_video_comments'])(
    '%s 声明账号参数，指定账号过期时禁止回退到其他账号',
    async (name) => {
      const schema = tools.definitions().find((tool) => tool.name === name)?.inputSchema
      expect(schema?.properties).toMatchObject({ account_mid: { type: 'integer', minimum: 1 } })
      expect(await error(name, { account_mid: 3 })).toMatchObject({ code: 'NOT_LOGGED_IN', hint: expect.stringContaining('account_mid=3') })
      expect(activeScope().mid).toBe(1)
    }
  )

  it('搜索、解析和下载使用调用指定的账号，同一视频能分别入队且旧的跨账号链接无法暂停对方', async () => {
    const scopes: number[] = []
    deps.parseAll.mockImplementation(async () => {
      scopes.push(authScope().mid!)
      return { result: result([plain(1)]), complete: true }
    })
    deps.searchUsers.mockImplementation(async () => {
      expect(authScope().mid).toBe(2)
      return { list: [], total: 0, pages: 1 }
    })
    expect(await data('search_users', { keyword: '视频', account_mid: 2 })).toMatchObject({ account_mid: 2 })
    const url = 'test'
    expect(await data('parse_link', { url })).toMatchObject({ account_mid: 1 })
    const a = await data('download_batch', { url, request_id: 'same' })
    const b = await data('download_batch', { url, request_id: 'same', account_mid: '2' })
    expect(scopes).toEqual([1, 2])
    expect(activeScope().mid).toBe(1)
    expect(a.batch_id).not.toBe(b.batch_id)
    expect(await data('get_batch_status', { batch_id: b.batch_id, account_mid: 2 })).toMatchObject({ account_mid: 2 })
    expect(await error('get_batch_status', { batch_id: b.batch_id, account_mid: 1 })).toMatchObject({ code: 'NOT_FOUND' })
    expect((await data('list_batches', { account_mid: 2 })).batches).toMatchObject([{ account_mid: 2 }])
    const tasks = (await data('list_tasks', { account_mid: 2 })).tasks
    expect(tasks).toMatchObject([{ account_mid: 2 }])
    const other = queue.list().find((task) => task.accountMid === 1)!
    tools.batches.find(b.batch_id)!.linked = [other.id]
    expect(await data('control_tasks', { action: 'pause', batch_id: b.batch_id })).toMatchObject({ affected_by_account: [{ account_mid: 2, count: 1 }] })
    expect(other.status).toBe('queued')
    expect(await data('control_tasks', { action: 'pause', account_mid: 1 })).toMatchObject({ affected: 1 })
    expect(await error('parse_link', { url, account_mid: 3 })).toMatchObject({ code: 'NOT_LOGGED_IN', hint: expect.stringContaining('account_mid=3') })
    expect(await error('parse_link', { url, account_mid: 42 })).toMatchObject({ code: 'NOT_FOUND' })
    expect(await error('parse_link', { url, account_mid: null })).toMatchObject({ code: 'INVALID_ARGS' })
    expect(await error('update_settings', { account_mid: 2, concurrency: 8 })).toMatchObject({ code: 'INVALID_ARGS' })
    expect(deps.updateSettings).not.toHaveBeenCalled()
  })

  it('检查与管理指定账号，后台账号退出后当前账号还能解析', async () => {
    expect(await data('list_accounts')).toMatchObject({ active_account_mid: 1, accounts: [
      { account_mid: 1 }, { account_mid: 2, vip: true }, { account_mid: 3, status: 'expired' }, { account_mid: 4, status: 'removed' }
    ] })
    expect(await data('start_login', { mode: 'add', method: 'qr', wait_seconds: 0 })).toMatchObject({ active_account_mid: 1 })
    expect(login.start).toHaveBeenLastCalledWith('qr', undefined, { mode: 'add', activate: false })
    expect(await error('start_login', { mode: 'add', account_mid: 2 })).toMatchObject({ code: 'INVALID_ARGS' })
    expect(await error('start_login', { mode: 'reauth' })).toMatchObject({ code: 'INVALID_ARGS' })
    await data('start_login', { mode: 'reauth', method: 'qr', account_mid: 3 })
    expect(login.start).toHaveBeenLastCalledWith('qr', undefined, { mode: 'reauth', mid: 3, activate: false })
    expect(await data('get_login_status', { account_mid: 2 })).toMatchObject({ account_mid: 2, account_status: 'ready', logged_in: true })
    expect(await data('get_status', { account_mid: 3 })).toMatchObject({ account_mid: 3, login: { logged_in: false, status: 'expired' } })
    expect(await data('switch_account', { account_mid: 2 })).toMatchObject({ active_account_mid: 2 })
    expect(await error('switch_account', { account_mid: 3 })).toMatchObject({ code: 'NOT_LOGGED_IN', hint: expect.stringContaining('account_mid=3') })
    expect(await data('logout_account', { account_mid: 1 })).toMatchObject({ account_mid: 1, status: 'removed', active_account_mid: 2 })
    expect(await error('logout_account')).toMatchObject({ code: 'INVALID_ARGS' })
    expect(await data('parse_link', { url: 'x' })).toMatchObject({ account_mid: 2 })
  })

  it('查询指定账号时跟踪它的重新登录，并区分未验证、退出和仍在登录的账号', async () => {
    state.accounts.push(profile(5, 'unchecked'))
    const snapshot = {
      status: 'waiting_user', step: 'qr', auth: { loggedIn: false }, tried: [], alsoAvailable: [],
      target: { mode: 'reauth', mid: 3, activate: false }
    } satisfies LoginSnapshot
    vi.mocked(login.snapshot).mockReturnValue(snapshot)
    expect(await data('get_login_status', { account_mid: 3, wait_seconds: 1 })).toMatchObject({
      account_mid: 3, status: 'waiting_user', step: 'qr', logged_in: false, account_status: 'expired'
    })
    expect(login.wait).toHaveBeenCalledOnce()
    expect(await data('get_login_status', { account_mid: 4 })).toMatchObject({ account_mid: 4, status: 'idle', account_status: 'removed', logged_in: false })
    expect(await data('get_login_status', { account_mid: 5 })).toMatchObject({ account_mid: 5, account_status: 'unchecked', logged_in: null })
    expect(await data('get_login_status', { account_mid: 1 })).toMatchObject({ account_mid: 1, status: 'logged_in' })
    expect(login.wait).toHaveBeenCalledOnce()
  })

  it('状态汇总和去水印都按归属筛选，无法借别的账号操作任务', async () => {
    queue.add(makeTask('a', { accountMid: 1 }), makeTask('b', { accountMid: 2, status: 'done' }))
    const b = await data('download_batch', { url: 'x', account_mid: 2 })
    expect(await data('get_status', { account_mid: 2 })).toMatchObject({
      account_mid: 2, queue: { total: 3 }, queue_by_account: [{ account_mid: 2, total: 3 }]
    })
    expect(await error('remove_watermark', { batch_id: b.batch_id, account_mid: 1, method: 'fast' })).toMatchObject({ code: 'NOT_FOUND' })
    const wm = await data('remove_watermark', { task_ids: ['a', 'b'], account_mid: 2, method: 'fast', dry_run: true })
    expect(wm.would_start).toMatchObject([{ task_id: 'b', account_mid: 2 }])
    expect(wm.skipped).toMatchObject([{ task_id: 'a' }])
  })

  it('比较实际档位并报告过期账号，切换链接内容时不跨视频排名', async () => {
    const probeQuality = vi.fn(async (_url: string, itemId?: string) => {
      const mid = authScope().mid!
      return { item_id: itemId ?? `item-${mid}`, title: '视频', qualities: [{ qn: mid === 1 ? 80 : 120, label: '高清', codecs: ['hevc'] }] }
    })
    tools = makeTools({ accounts: registry, probeQuality })
    const r = await data('get_download_quality', { url: 'x', item_id: 'same' })
    expect(r).toMatchObject({ best_qn: 120, best_account_mids: [2], accounts: [
      { account_mid: 1, best_quality: { qn: 80 } }, { account_mid: 2, best_quality: { qn: 120 } },
      { account_mid: 3, status: 'expired', best_quality: null, error: { code: 'NOT_LOGGED_IN' } }
    ] })
    expect(await data('get_download_quality', { url: 'x', account_mid: 1 })).toMatchObject({ best_qn: 80, best_account_mids: [1] })
    expect(await data('get_download_quality', { url: 'x' })).toMatchObject({ best_qn: null, best_account_mids: [], hint: expect.any(String) })
    probeQuality.mockResolvedValueOnce({ item_id: 'x', title: '视频', qualities: [] })
    expect(await data('get_download_quality', { url: 'x', account_mid: 2 })).toMatchObject({ best_qn: null, accounts: [{ best_quality: null }] })
    expect(activeScope().mid).toBe(1)
  })

  it('画质探测触发风控后停止请求其他账号', async () => {
    const probeQuality = vi.fn(async () => { throw new BiliError('请求过于频繁', -412) })
    tools = makeTools({ accounts: registry, probeQuality })
    const r = await data('get_download_quality', { url: 'x' })
    expect(probeQuality).toHaveBeenCalledOnce()
    expect(r.best_qn).toBeNull()
    expect(r.accounts.map((a: { error: { code: string } }) => a.error.code)).toEqual(['RATE_LIMITED', 'RATE_LIMITED', 'RATE_LIMITED'])
  })

  it('画质探测返回的分 P ID 可直接用于下载，同账号并发只展开和入队一次', async () => {
    const parent = lazy(1)
    const partId = `${parent.key}:2`
    const expand = vi.fn(async (items: MediaItem[]) => {
      expect(items).toEqual([parent])
      return [{ ...parent, key: `${parent.key}:1`, lazy: false, cid: 1 }, { ...parent, key: partId, lazy: false, cid: 2 }]
    })
    tools = makeTools({
      accounts: registry,
      parseAll: async () => ({ result: result([parent, lazy(2)]), complete: true }),
      expandLazy: expand,
      probeQuality: async () => ({ item_id: partId, title: parent.title, qualities: [{ qn: 120, label: '4K', codecs: ['hevc'] }] })
    })
    await data('parse_link', { url: 'x', account_mid: 1, expand_parts: true, limit: 1 })
    const quality = await data('get_download_quality', { url: 'x', item_id: parent.key, account_mid: 2 })
    const args = { url: 'x', account_mid: 2, ids: [quality.accounts[0].item_id, 'ugc:BV999:3'], qn: quality.best_qn }
    const [a, b] = await Promise.all([data('download_batch', args), data('download_batch', args)])
    expect(a.batch_id).toBe(b.batch_id)
    expect(expand).toHaveBeenCalledTimes(2)
    expect(queue.list()).toMatchObject([{ accountMid: 2, item: { key: partId }, options: { qn: 120 } }])
    expect((a.unknown_ids ?? b.unknown_ids)).toEqual(['ugc:BV999:3'])
    expect(activeScope().mid).toBe(1)
  })

  it('下载和解析记录可按 UID 筛选，退出账号与没有归属的旧记录仍能查询', async () => {
    const a = { key: 'one', title: '视频', groupTitle: '', path: '/dl/1.mp4', at: 1, accountMid: 1 }
    const b = { ...a, at: 2, accountMid: 4, path: '/dl/2.mp4' }
    tools = makeTools({ accounts: registry, downloadRecords: () => [a, b], parseRecords: () => [
      { input: 'x', title: '视频', kind: 'ugc', cover: '', count: 1, at: 1 },
      { input: 'x', title: '视频', kind: 'ugc', cover: '', count: 1, at: 2, accountMid: 2 }
    ] })
    expect(await data('list_download_history', { limit: 1 })).toMatchObject({ total: 2, next_offset: 1, records: [{ account_mid: 4, account_name: '账号 4' }] })
    expect(await data('list_download_history', { account_mid: 1 })).toMatchObject({ total: 1, records: [{ account_mid: 1, path: '/dl/1.mp4' }] })
    expect(await data('list_parse_history', { account_mid: null })).toMatchObject({ total: 1, records: [{ input: 'x', account_mid: null }] })
    expect(await data('list_parse_history', { account_mid: 2 })).toMatchObject({ total: 1, records: [{ input: 'x', account_mid: 2 }] })
  })
})

describe('get_status', () => {
  it('登录、大会员、队列、目录和设置摘要', async () => {
    queue.add(
      makeTask('a', { status: 'downloading', speed: 1000.4 }),
      makeTask('b', { status: 'paused' }),
      makeTask('c', { status: 'error' }),
      makeTask('d', { status: 'waitingAuth' })
    )
    const r = await data('get_status')
    expect(r).toMatchObject({
      login: { logged_in: true, user: '用户', vip: true, vip_label: '年度大会员' },
      queue: { total: 4, running: 1, paused: 1, failed: 1, waiting_auth: 1, done: 0, speed_bps: 1000 },
      download_dir: settings.downloadDir,
      settings: { concurrency: 2, threads: 4, speed_limit_kbps: 0, default_qn: 80 }
    })
    // 下载目录还没创建时看上级目录
    expect(r.free_space_bytes).toBeGreaterThan(0)
    expect(r.hints.join('\n')).toMatch(/等待登录[\s\S]*已暂停[\s\S]*失败/)
  })

  it('不是大会员、没登录、登录过期、查不到登录状态时都有提示', async () => {
    deps.authState.mockResolvedValueOnce({ loggedIn: true, user: { mid: 1, uname: 'u', face: '', vipActive: false, vipLabel: '' } })
    let r = await data('get_status')
    expect(r.login).toEqual({ logged_in: true, user: 'u', vip: false })
    expect(r.hints[0]).toContain('不是大会员')

    deps.authState.mockResolvedValueOnce({ loggedIn: false })
    r = await data('get_status')
    expect(r.login).toEqual({ logged_in: false })
    expect(r.hints[0]).toContain('没有登录')
    expect(r.hints[0]).toContain('start_login')

    deps.authState.mockResolvedValueOnce({ loggedIn: false, expired: true })
    expect((await data('get_status')).login).toEqual({ logged_in: false, expired: true })

    deps.authState.mockRejectedValueOnce(new Error('网络错误'))
    r = await data('get_status')
    expect(r.login).toEqual({ logged_in: null, error: '网络错误' })
    expect(r.hints[0]).toContain('无法确认登录状态')
  })

  it('剩余空间不足 5 GB 时提醒；查不到时不提醒', async () => {
    vi.mocked(statfs).mockResolvedValueOnce({ bavail: 1, bsize: 1024 } as Awaited<ReturnType<typeof statfs>>)
    expect((await data('get_status')).hints).toContain('下载目录所在磁盘剩余空间不足 5 GB')
    vi.mocked(statfs).mockRejectedValue(new Error('ENOENT'))
    const r = await data('get_status')
    expect(r.free_space_bytes).toBeUndefined()
    expect(r.hints).toEqual([])
  })
})

describe('parse_link', () => {
  it('分段返回条目，带稳定 id、下载和排队标记、计数和提示', async () => {
    const items = [plain(1), lazy(2, { pages: 3, badge: '3P' }), plain(3, { unavailable: '已失效' }), plain(4, { needVip: true }), lazy(5)]
    deps.parseAll.mockResolvedValueOnce({ result: result(items, { owner: 'UP', paging: { total: 50 } as ParseResult['paging'] }), complete: false })
    history = ['ugc:BV1:1', 'ugc:BV5:9']
    queue.add(makeTask('q', { item: plain(4) }), makeTask('d', { item: plain(1), status: 'done' }))
    const r = await data('parse_link', { url: ' https://b23.tv/x ', limit: 2, max_items: 200 })
    expect(deps.parseAll).toHaveBeenCalledWith('https://b23.tv/x', 200)
    expect(r).toMatchObject({
      title: '合集',
      kind: 'ugc',
      owner: 'UP',
      total: 50,
      fetched: 5,
      complete: false,
      offset: 0,
      limit: 2,
      next_offset: 2,
      counts: { unavailable: 1, downloaded: 2, queued: 1, lazy: 2 }
    })
    expect(r.items).toEqual([
      { id: 'ugc:BV1:1', index: 1, title: '视频1', downloaded: true },
      { id: 'ugc:BV2', index: 2, title: '视频2', lazy: true, parts: 3, badge: '3P' }
    ])
    expect(r.hint).toMatch(/只取了前 5 条.*offset=2.*lazy/)

    // 第二段走缓存
    const r2 = await data('parse_link', { url: 'https://b23.tv/x', offset: 2, limit: 10, max_items: 100 })
    expect(deps.parseAll).toHaveBeenCalledTimes(1)
    expect(r2.next_offset).toBeNull()
    expect(r2.items).toEqual([
      { id: 'ugc:BV3:3', index: 3, title: '视频3', unavailable: '已失效' },
      { id: 'ugc:BV4:4', index: 4, title: '视频4', need_vip: true, queued: true },
      // 列表视频只知道有分P下载过
      { id: 'ugc:BV5', index: 5, title: '视频5', lazy: true, downloaded: 'partly' }
    ])
  })

  it('没有分页信息时 total 是条目数；多个分组时标出分组；owner 取元数据', async () => {
    deps.parseAll.mockResolvedValueOnce({
      result: {
        ...result([]),
        meta: { owner: '出品方' },
        groups: [
          { id: 'main', title: '正片', items: [plain(1)] },
          { id: 'pv', title: 'PV', items: [plain(2)] }
        ]
      },
      complete: true
    })
    const r = await data('parse_link', { url: 'ep1' })
    expect(r).toMatchObject({ total: 2, owner: '出品方', hint: undefined })
    expect(r.items.map((i: { group: string }) => i.group)).toEqual(['正片', 'PV'])
  })

  it('expand_parts 展开本段的列表视频并缓存，失败的保持原样；limit 最大 100', async () => {
    deps.parseAll.mockResolvedValueOnce({ result: result([lazy(1), lazy(2), plain(3)]), complete: true })
    deps.expandLazy.mockImplementationOnce(async (items) => [
      { ...items[0], key: 'ugc:BV1:7', lazy: false, page: 1, cid: 7, duration: 60, title: 'P1 开头' },
      { ...items[1], unavailable: '风控' }
    ])
    const r = await data('parse_link', { url: 'x', expand_parts: true })
    expect(deps.expandLazy).toHaveBeenCalledWith([lazy(1), lazy(2)])
    expect(r.items[0].parts).toEqual([{ id: 'ugc:BV1:7', page: 1, title: 'P1 开头', duration: 60 }])
    expect(r.items[1].parts).toBeUndefined()
    // 再展开时只查没缓存的
    await data('parse_link', { url: 'x', expand_parts: true })
    expect(deps.expandLazy).toHaveBeenLastCalledWith([lazy(2)])
    // 都展开过就不再请求
    deps.expandLazy.mockClear()
    await data('parse_link', { url: 'x', expand_parts: true, limit: 1 })
    expect(deps.expandLazy).not.toHaveBeenCalled()
    expect(await error('parse_link', { url: 'x', expand_parts: true, limit: 101 })).toMatchObject({ code: 'INVALID_ARGS' })
  })

  it('refresh 忽略缓存，缓存 10 分钟后过期，要的更多时重新翻页', async () => {
    deps.parseAll.mockResolvedValue({ result: result([plain(1)], { paging: { total: 9 } as ParseResult['paging'] }), complete: false })
    await data('parse_link', { url: 'x' })
    await data('parse_link', { url: 'x', refresh: true })
    expect(deps.parseAll).toHaveBeenCalledTimes(2)
    await data('parse_link', { url: 'x', max_items: 2000 })
    expect(deps.parseAll).toHaveBeenLastCalledWith('x', 2000)
    await data('parse_link', { url: 'x', max_items: 500 })
    expect(deps.parseAll).toHaveBeenCalledTimes(3)
    now += 10 * 60_000
    await data('parse_link', { url: 'x', max_items: 500 })
    expect(deps.parseAll).toHaveBeenCalledTimes(4)
  })

  it('参数检查', async () => {
    expect(await error('parse_link')).toEqual({ code: 'INVALID_ARGS', message: '缺少参数 url' })
    expect(await error('parse_link', { url: 'x', max_items: 0 })).toMatchObject({ message: 'max_items 必须是 1～5000 之间的整数' })
    expect(await error('parse_link', { url: 'x', limit: 'abc' })).toMatchObject({ code: 'INVALID_ARGS' })
    expect(await error('parse_link', { url: 'x', expand_parts: 'yes' })).toMatchObject({ message: 'expand_parts 必须是 true 或 false' })
    // 字符串形式的数字可以
    expect((await data('parse_link', { url: 'x', limit: '1' })).items).toHaveLength(1)
  })
})

describe('download_batch', () => {
  it('单个视频的链接不传 ids 时用默认选中的，选项合并设置里的默认值', async () => {
    deps.parseAll.mockResolvedValueOnce({ result: result([plain(1), plain(2)], { defaultSelected: ['ugc:BV2:2'] }), complete: true })
    const r = await data('download_batch', { url: 'BV2', qn: 120, options: { output: 'audio', danmaku: true, codec_order: ['hevc'] } })
    expect(r).toMatchObject({ title: '合集', state: 'queued', selected: 1, skipped: { downloaded: 0, unavailable: 0, queued: 0 }, dir: settings.downloadDir })
    expect(r.hint).toContain(`get_batch_status batch_id=${r.batch_id}`)
    expect(deps.parseAll).toHaveBeenCalledWith('BV2', 1000)
    const req = queue.enqueue.mock.calls[0][0]
    expect(req.items.map((i) => i.key)).toEqual(['ugc:BV2:2'])
    expect(req.options).toEqual({
      ...normalizeOptions({ ...settings.defaults, output: 'audio', danmaku: true }, 120),
      codecOrder: ['hevc', 'avc', 'av1']
    })
    expect(req).toMatchObject({ batchId: r.batch_id, multi: false })
  })

  it('没有默认选中时下载全部；分页的列表必须明确选择', async () => {
    await data('download_batch', { url: 'weekly' })
    expect(queue.enqueue.mock.calls[0][0].items).toHaveLength(2)
    deps.parseAll.mockResolvedValueOnce({ result: result([plain(3)], { paging: { total: 300 } as ParseResult['paging'] }), complete: false })
    expect(await error('download_batch', { url: 'fav' })).toMatchObject({ code: 'INVALID_ARGS', message: expect.stringContaining('300 条的列表') })
  })

  it('all 下载全部，跳过失效和已下载的，列表视频在后台展开，子目录', async () => {
    deps.parseAll.mockResolvedValueOnce({
      result: result([plain(1), lazy(2), plain(3, { unavailable: '已失效' }), lazy(4)], { paging: { total: 9 } as ParseResult['paging'] }),
      complete: false
    })
    history = ['ugc:BV1:1', 'ugc:BV4:8']
    const r = await data('download_batch', { url: 'fav', all: true, subdir: '收藏/动画', max_items: 4 })
    expect(deps.parseAll).toHaveBeenCalledWith('fav', 4)
    // 列表视频要展开后才按每一P核对，BV4 下过的是另一P
    expect(r).toMatchObject({
      state: 'expanding',
      complete: false,
      selected: 2,
      skipped: { downloaded: 1, unavailable: 1 },
      dir: join(settings.downloadDir, '收藏/动画')
    })
    expect(r.hint).toContain('只取了前 4 条')
    await settle()
    expect(queue.list().map((t) => [t.item.key, t.dir])).toEqual([
      ['ugc:BV2:1', join(settings.downloadDir, '收藏/动画')],
      ['ugc:BV2:2', join(settings.downloadDir, '收藏/动画')],
      ['ugc:BV4:1', join(settings.downloadDir, '收藏/动画')],
      ['ugc:BV4:2', join(settings.downloadDir, '收藏/动画')]
    ])
  })

  it('缓存里的比 max_items 多时只取前 max_items 条', async () => {
    await data('parse_link', { url: 'x' })
    const r = await data('download_batch', { url: 'x', all: true, max_items: 1 })
    expect(deps.parseAll).toHaveBeenCalledTimes(1)
    expect(r).toMatchObject({ selected: 1, complete: false })
    expect(queue.list()).toHaveLength(1)
  })

  it('翻页中途出错时用已经拿到的部分，并说明原因', async () => {
    deps.parseAll.mockResolvedValue({ result: result([plain(1)], { paging: { total: 99 } as ParseResult['paging'] }), complete: false, error: '请求过于频繁' })
    const p = await data('parse_link', { url: 'fav' })
    expect(p.hint).toContain('翻页时出错（请求过于频繁），只拿到前 1 条')
    const r = await data('download_batch', { url: 'fav', all: true })
    expect(r).toMatchObject({ selected: 1, complete: false })
    expect(r.hint).toContain('翻页时出错（请求过于频繁），只加入了前 1 条')
    // 出错的不缓存，每次都重新翻
    expect(deps.parseAll).toHaveBeenCalledTimes(2)
  })

  it('skip_downloaded=false 时已下载的也下载；全都下载过时不建批次', async () => {
    history = ['ugc:BV1:1', 'ugc:BV2:2']
    const none = await data('download_batch', { url: 'x', all: true })
    expect(none).toEqual({ batch_id: null, title: '合集', selected: 0, skipped: { downloaded: 2, unavailable: 0 }, hint: expect.stringContaining('skip_downloaded=false') })
    const r = await data('download_batch', { url: 'x', all: true, skip_downloaded: false })
    expect(r.selected).toBe(2)
    deps.parseAll.mockResolvedValueOnce({ result: result([plain(3, { unavailable: '已失效' })]), complete: true })
    expect((await data('download_batch', { url: 'y', all: true })).hint).toBe('没有可以下载的条目')
  })

  it('按 id 选：视频、展开过的分P；同时选了视频和它的分P只算一次；不认识的 id 列出来', async () => {
    deps.parseAll.mockResolvedValue({ result: result([lazy(1), lazy(2), plain(3)]), complete: true })
    await data('parse_link', { url: 'x', expand_parts: true })
    const r = await data('download_batch', { url: 'x', ids: ['ugc:BV1', 'ugc:BV1:1', 'ugc:BV2:2', 'ugc:BV3:3', 'nope', 'nope'] })
    expect(r.unknown_ids).toEqual(['nope'])
    expect(r.hint).toContain('1 个 id 不在这个链接里')
    expect(r.state).toBe('queued')
    expect(queue.list().map((t) => t.item.key)).toEqual(['ugc:BV1:1', 'ugc:BV1:2', 'ugc:BV2:2', 'ugc:BV3:3'])
    expect(await error('download_batch', { url: 'x', ids: ['a', 'b'] })).toMatchObject({ message: expect.stringContaining('例如 a、b') })
    expect(await error('download_batch', { url: 'x', ids: 'ugc:BV3:3', all: true })).toMatchObject({ message: 'ids 和 all 只能用一个' })
  })

  it('重复提交返回原批次；request_id 明确指定；中断的批次接着处理', async () => {
    const a = await data('download_batch', { url: 'x', all: true })
    const again = await data('download_batch', { url: 'x', all: true })
    expect(again).toMatchObject({ batch_id: a.batch_id, deduplicated: true, hint: expect.stringContaining('没有重复添加') })
    expect(deps.parseAll).toHaveBeenCalledTimes(1)
    expect(queue.enqueue).toHaveBeenCalledTimes(1)

    const b = await data('download_batch', { url: 'x', all: true, request_id: 'job-1', subdir: 'a' })
    expect(b.batch_id).not.toBe(a.batch_id)
    expect((await data('download_batch', { url: 'other', request_id: 'job-1' })).batch_id).toBe(b.batch_id)

    const batch = tools.batches.find(b.batch_id)!
    batch.state = 'interrupted'
    batch.pending = [lazy(9)]
    const resumed = await data('download_batch', { url: 'x', all: true, request_id: 'job-1' })
    expect(resumed.hint).toContain('接着处理')
    await settle()
    expect(batch.state).toBe('ready')
  })

  it('批次的任务包括已经在别处下载的同一条目', async () => {
    queue.add(makeTask('ui', { item: plain(1), status: 'downloading' }))
    const { batch_id } = await data('download_batch', { url: 'x', all: true })
    expect((await data('get_batch_status', { batch_id })).counts).toMatchObject({ total: 2, running: 1, queued: 1 })
    const listed = await data('list_tasks', { batch_id })
    expect(listed.tasks.map((t: { id: string }) => t.id)).toEqual(['ui', 't1'])
    expect((await data('control_tasks', { action: 'pause', batch_id })).affected).toBe(2)
  })

  it('参数检查', async () => {
    expect(await error('download_batch', { url: 'x', subdir: '../外面' })).toMatchObject({ code: 'INVALID_ARGS' })
    expect(await error('download_batch', { url: 'x', subdir: '/abs' })).toMatchObject({ code: 'INVALID_ARGS' })
    expect(await error('download_batch', { url: 'x', options: { foo: 1 } })).toMatchObject({ message: expect.stringContaining('options.foo 不是可设置的选项') })
    expect(await error('download_batch', { url: 'x', options: [] })).toMatchObject({ message: 'options 必须是对象' })
    expect(await error('download_batch', { url: 'x', options: { output: 'mp3' } })).toMatchObject({ message: expect.stringContaining('full、audio、video') })
    expect(await error('download_batch', { url: 'x', options: { nfo: 'yes' } })).toMatchObject({ message: 'options.nfo 必须是 true 或 false' })
    expect(await error('download_batch', { url: 'x', options: { codec_order: ['h264'] } })).toMatchObject({ code: 'INVALID_ARGS' })
    expect(await error('download_batch', { url: 'x', ids: [1] })).toMatchObject({ message: 'ids 必须是字符串数组' })
    expect(await error('download_batch', { url: 'x', request_id: 5 })).toMatchObject({ message: 'request_id 必须是字符串' })
    // 子目录 . 等于下载目录本身
    expect((await data('download_batch', { url: 'x', all: true, subdir: '.' })).dir).toBe(settings.downloadDir)
  })
})

describe('download_batch 的 videos', () => {
  const VIDEOS = ['BV1000000000', 'https://www.bilibili.com/video/BV2000000000?p=3']

  it('多个视频合成一个批次，在后台展开，不解析链接', async () => {
    const r = await data('download_batch', { videos: VIDEOS, title: '猫视频', subdir: '搜索', options: { danmaku: true } })
    expect(r).toMatchObject({ title: '猫视频', selected: 2, dir: join(settings.downloadDir, '搜索'), rejected: undefined })
    expect(r.hint).toContain(`get_batch_status batch_id=${r.batch_id}`)
    expect(deps.parseAll).not.toHaveBeenCalled()
    await settle()
    expect(deps.expandLazy.mock.calls[0][0].map((i) => [i.key, i.bvid, i.lazy, i.index])).toEqual([
      ['ugc:BV1000000000', 'BV1000000000', true, 1],
      ['ugc:BV2000000000', 'BV2000000000', true, 2]
    ])
    const req = queue.enqueue.mock.calls[0][0]
    expect(req).toMatchObject({ title: '猫视频', kind: 'ugc', multi: true, batchId: r.batch_id })
    expect(req.items).toHaveLength(4)
    expect(req.options).toMatchObject({ danmaku: true })
  })

  it('默认标题和目录；批次的 url 留空', async () => {
    const r = await data('download_batch', { videos: VIDEOS })
    expect(r).toMatchObject({ title: '2 个视频', dir: settings.downloadDir })
    await settle()
    expect((await data('get_batch_status', { batch_id: r.batch_id })).url).toBeUndefined()
    expect((await data('list_batches')).batches[0].url).toBeUndefined()
  })

  it('去重，无法识别的放进 rejected', async () => {
    const r = await data('download_batch', { videos: ['BV1000000000', 'https://www.bilibili.com/video/BV1000000000', 'BV2000000000', 'av9', 'ep1', '随便'] })
    expect(r.selected).toBe(2)
    expect(r.rejected).toEqual(['av9', 'ep1', '随便'])
    expect(r.hint).toContain('3 项')
  })

  it('按每一P跳过下载过的', async () => {
    history = ['ugc:BV1000000000:1']
    const r = await data('download_batch', { videos: VIDEOS })
    await settle()
    expect((await data('get_batch_status', { batch_id: r.batch_id })).skipped.downloaded).toBe(1)
    expect(queue.enqueue.mock.calls[0][0].items.map((i) => i.key)).toEqual(['ugc:BV1000000000:2', 'ugc:BV2000000000:1', 'ugc:BV2000000000:2'])
  })

  it('批次没结束时重复提交返回原批次，顺序和重复项不影响', async () => {
    deps.expandLazy.mockImplementation(() => new Promise(() => {}))
    const a = await data('download_batch', { videos: ['BV1000000000', 'BV2000000000'] })
    const b = await data('download_batch', { videos: ['BV2000000000', 'BV1000000000', 'BV1000000000'] })
    expect(b).toMatchObject({ batch_id: a.batch_id, deduplicated: true })
    const c = await data('download_batch', { videos: ['BV1000000000', 'BV2000000000'], title: '别的' })
    expect(c.batch_id).not.toBe(a.batch_id)
    expect((await data('download_batch', { videos: ['BV1000000000', 'BV3000000000'], request_id: 'r' })).deduplicated).toBeUndefined()
    expect(await data('download_batch', { videos: ['BV4000000000', 'BV5000000000'], request_id: 'r' })).toMatchObject({ deduplicated: true })
  })

  const detail = { bvid: 'BV1000000000', title: '单个视频', cover: 'c.jpg' }

  it('只有一个视频时用它的标题和封面，下载全部分P，不走链接解析', async () => {
    deps.fetchVideoDetail.mockResolvedValue(detail)
    const r = await data('download_batch', { videos: ['https://www.bilibili.com/video/BV1000000000?p=2'] })
    expect(deps.parseAll).not.toHaveBeenCalled()
    expect(r).toMatchObject({ title: '单个视频', selected: 1 })
    await settle()
    expect(deps.expandLazy.mock.calls[0][0][0]).toMatchObject({ title: '单个视频', cover: 'c.jpg', lazy: true })
    expect(queue.enqueue.mock.calls[0][0]).toMatchObject({ title: '单个视频', cover: 'c.jpg' })
    expect(queue.enqueue.mock.calls[0][0].items).toHaveLength(2)
  })

  it('只有一个视频时 title 也生效；视频不存在时直接报错', async () => {
    deps.fetchVideoDetail.mockResolvedValueOnce(detail)
    expect(await data('download_batch', { videos: ['BV1000000000'], title: '自定义' })).toMatchObject({ title: '自定义' })
    deps.fetchVideoDetail.mockRejectedValueOnce(new BiliError('啥都木有', -404))
    expect(await error('download_batch', { videos: ['BV2000000000'] })).toMatchObject({ code: 'FAILED', message: '啥都木有' })
    expect((await data('list_batches')).total).toBe(1)
  })

  it('短链和 av 号先换成 BV 号', async () => {
    deps.expandShort.mockResolvedValue({ type: 'ugc', bvid: 'BV2000000000' })
    deps.fetchVideoDetail.mockResolvedValue({ bvid: 'BV3000000000' })
    const r = await data('download_batch', { videos: ['BV1000000000', 'https://b23.tv/abc', 'av9'] })
    expect(r).toMatchObject({ selected: 3, title: '3 个视频', rejected: undefined })
    await settle()
    expect(deps.expandLazy.mock.calls[0][0].map((i) => i.bvid)).toEqual(['BV1000000000', 'BV2000000000', 'BV3000000000'])
  })

  it('列表链接放不进 videos，提示用 url', async () => {
    expect(await error('download_batch', { videos: ['https://space.bilibili.com/1'] })).toMatchObject({
      code: 'INVALID_ARGS',
      message: expect.stringContaining('用 url')
    })
  })

  it('重复提交时也报告 rejected', async () => {
    deps.expandLazy.mockImplementation(() => new Promise(() => {}))
    const list = [...VIDEOS, 'ep1']
    const a = await data('download_batch', { videos: list })
    const b = await data('download_batch', { videos: list })
    expect(b).toMatchObject({ batch_id: a.batch_id, deduplicated: true, rejected: ['ep1'] })
  })

  it('并行提交同样的请求只建一个批次', async () => {
    deps.expandLazy.mockImplementation(() => new Promise(() => {}))
    const [a, b] = await Promise.all([
      data('download_batch', { videos: VIDEOS, request_id: 'r' }),
      data('download_batch', { videos: VIDEOS, request_id: 'r' })
    ])
    expect(a.batch_id).toBe(b.batch_id)
    expect((await data('list_batches')).total).toBe(1)
  })

  it('没登录时不提交', async () => {
    deps.authState.mockResolvedValueOnce({ loggedIn: false })
    expect(await error('download_batch', { videos: VIDEOS })).toMatchObject({ code: 'NOT_LOGGED_IN', hint: expect.stringContaining('登录') })
    expect((await data('list_batches')).total).toBe(0)
  })

  it('参数校验', async () => {
    for (const extra of [{ url: 'BV1000000000' }, { ids: ['a'] }, { all: true }, { max_items: 5 }]) {
      expect(await error('download_batch', { videos: VIDEOS, ...extra })).toMatchObject({ code: 'INVALID_ARGS' })
    }
    expect(await error('download_batch', { videos: [] })).toMatchObject({ message: 'videos 不能是空的' })
    expect(await error('download_batch', { videos: Array.from({ length: 201 }, (_, i) => `BV${i}`) })).toMatchObject({ code: 'INVALID_ARGS' })
    expect(await error('download_batch', { videos: ['ep1', 'ss2'] })).toMatchObject({ message: expect.stringContaining('ep1') })
    expect(await error('download_batch', { videos: VIDEOS, title: '长'.repeat(101) })).toMatchObject({ code: 'INVALID_ARGS' })
    expect(await error('download_batch', {})).toMatchObject({ message: '缺少参数 url' })
  })
})

describe('检索工具的接入', () => {
  it('转给 LookupTools，结果和错误都用统一的格式', async () => {
    deps.searchUsers.mockResolvedValueOnce({ total: 0, pages: 0, list: [] })
    expect(await data('search_users', { keyword: '猫' })).toMatchObject({ total: 0, users: [] })
    expect(await error('search_users')).toMatchObject({ code: 'INVALID_ARGS', message: '缺少参数 keyword' })
  })
})

describe('download_batch 的并行提交', () => {
  it('等解析时相同的请求先提交了，不再建新批次', async () => {
    const [a, b] = await Promise.all([
      data('download_batch', { url: 'BV2', request_id: 'r' }),
      data('download_batch', { url: 'BV2', request_id: 'r' })
    ])
    expect(a.batch_id).toBe(b.batch_id)
    expect((await data('list_batches')).total).toBe(1)
  })

  it('分 P 展开失败后可重试，超过单次展开上限时不发请求', async () => {
    const videos = Array.from({ length: 101 }, (_, i) => lazy(i + 1))
    deps.parseAll.mockResolvedValue({ result: result(videos), complete: true })
    expect(await error('download_batch', { url: 'x', ids: videos.map((video) => `${video.key}:1`) }))
      .toMatchObject({ code: 'INVALID_ARGS', message: expect.stringContaining('100') })
    expect(deps.expandLazy).not.toHaveBeenCalled()
    deps.expandLazy.mockRejectedValueOnce(new BiliError('请求过于频繁', -412))
    const args = { url: 'x', ids: [`${videos[0].key}:1`] }
    expect(await error('download_batch', args)).toMatchObject({ code: 'RATE_LIMITED' })
    expect(queue.list()).toEqual([])
    expect(await data('download_batch', args)).toMatchObject({ selected: 1 })
  })
})

describe('get_batch_status / list_batches', () => {
  it('查看进度，默认附带失败明细，可以选别的明细', async () => {
    const { batch_id } = await data('download_batch', { url: 'x', all: true })
    queue.patch('t1', { status: 'done', total: 10, downloaded: 10, outputPath: '/dl/1.mp4' })
    queue.patch('t2', { status: 'error', error: '网络错误' })
    const r = await data('get_batch_status', { batch_id })
    expect(r).toMatchObject({ batch_id, state: 'done_with_errors', counts: { total: 2, done: 1, failed: 1 } })
    expect(r.failed).toEqual([expect.objectContaining({ task_id: 't2', reason: '网络错误' })])
    expect(r.files).toBeUndefined()
    const f = await data('get_batch_status', { batch_id, include: ['files'], wait_seconds: 5 })
    expect(f.files).toEqual(['/dl/1.mp4'])
    expect(f.failed).toBeUndefined()
  })

  it('wait_seconds 等到批次停下', async () => {
    const { batch_id } = await data('download_batch', { url: 'x', all: true })
    const p = data('get_batch_status', { batch_id, wait_seconds: 50 })
    await settle()
    queue.patch('t1', { status: 'done' })
    queue.patch('t2', { status: 'done' })
    expect((await p).state).toBe('done')
  })

  it('批次不存在、参数不对', async () => {
    expect(await error('get_batch_status', { batch_id: 'nope' })).toEqual({
      code: 'NOT_FOUND',
      message: '没有这个批次：nope',
      hint: '用 list_batches 查看最近的批次'
    })
    expect(await error('get_batch_status')).toMatchObject({ message: '缺少参数 batch_id' })
    const { batch_id } = await data('download_batch', { url: 'x', all: true })
    expect(await error('get_batch_status', { batch_id, wait_seconds: 51 })).toMatchObject({ code: 'INVALID_ARGS' })
    expect(await error('get_batch_status', { batch_id, include: ['logs'] })).toMatchObject({
      message: 'include 不认识“logs”，可选值：failed、files、running'
    })
  })

  it('最近的批次，新的在前', async () => {
    for (const url of ['a', 'b', 'c']) await data('download_batch', { url, all: true })
    const r = await data('list_batches', { limit: 2 })
    expect(r.total).toBe(3)
    expect(r.batches.map((b: { url: string }) => b.url)).toEqual(['c', 'b'])
    expect((await data('list_batches')).batches).toHaveLength(3)
  })
})

describe('list_tasks', () => {
  beforeEach(() => {
    queue.add(
      makeTask('q', { batchId: 'b1', title: '第一集' }),
      makeTask('r', { batchId: 'b1', status: 'downloading', downloaded: 1, total: 3, speed: 9.6, qualityLabel: '1080P' }),
      makeTask('p', { status: 'paused', groupTitle: '某合集' }),
      makeTask('e', { status: 'error', error: '网络错误' }),
      makeTask('t', { status: 'error', error: '超时', retryAt: 1_700_000_000_000 }),
      makeTask('u', { status: 'unsupported', error: '需要大会员' }),
      makeTask('w', { status: 'waitingAuth' }),
      makeTask('d', { status: 'done', outputPath: '/dl/d.mp4' })
    )
  })
  const ids = async (args: Record<string, unknown> = {}): Promise<string[]> =>
    (await data('list_tasks', args)).tasks.map((t: { id: string }) => t.id)

  it('按状态、批次、标题筛选', async () => {
    expect(await ids()).toEqual(['q', 'r', 'p', 'e', 't', 'u', 'w', 'd'])
    expect(await ids({ status: 'all' })).toHaveLength(8)
    expect(await ids({ status: 'active' })).toEqual(['q', 'r', 'p', 't', 'w'])
    expect(await ids({ status: ['failed', 'unsupported'] })).toEqual(['e', 'u'])
    expect(await ids({ status: 'retrying' })).toEqual(['t'])
    // 批次记录不在了（例如被清理），按任务上记的批次 id 找
    expect(await ids({ batch_id: 'b1' })).toEqual(['q', 'r'])
    expect(await ids({ query: '第一' })).toEqual(['q'])
    expect(await ids({ query: '某合集' })).toEqual(['p'])
    expect(await error('list_tasks', { status: 'broken' })).toMatchObject({ code: 'INVALID_ARGS' })
  })

  it('分页和字段', async () => {
    const r = await data('list_tasks', { offset: 2, limit: 3 })
    expect(r).toMatchObject({ total: 8, offset: 2, next_offset: 5 })
    expect(r.tasks.map((t: { id: string }) => t.id)).toEqual(['p', 'e', 't'])
    expect((await data('list_tasks', { offset: 5, limit: 3 })).next_offset).toBeNull()
    const f = await data('list_tasks', { fields: ['id', 'status'], status: 'running' })
    expect(f.tasks).toEqual([{ id: 'r', status: 'running' }])
  })

  it('任务摘要', async () => {
    const all = (await data('list_tasks')).tasks
    expect(all[1]).toEqual({
      id: 'r',
      batch_id: 'b1',
      item_id: 'ugc:r:1',
      title: 'r',
      group: 'g',
      status: 'running',
      stage: 'downloading',
      progress: 33,
      speed: 10,
      quality: '1080P'
    })
    expect(all[4]).toMatchObject({ status: 'retrying', error: '超时', retry_at: new Date(1_700_000_000_000).toISOString() })
    expect(all[7]).toMatchObject({ status: 'done', progress: 100, path: '/dl/d.mp4' })
    expect(all[0].progress).toBe(0)
  })
})

describe('control_tasks', () => {
  beforeEach(() => {
    queue.add(
      makeTask('q', { batchId: 'b1' }),
      makeTask('r', { batchId: 'b1', status: 'downloading' }),
      makeTask('p', { status: 'paused' }),
      makeTask('e', { status: 'error' }),
      makeTask('t', { status: 'error', retryAt: 1 }),
      makeTask('u', { status: 'unsupported' }),
      makeTask('d', { status: 'done' })
    )
  })

  it('必须指定范围和合法的 action', async () => {
    expect(await error('control_tasks', { action: 'pause' })).toMatchObject({ message: '需要用 task_ids、batch_id 或 status 指定要操作的任务' })
    expect(await error('control_tasks', { action: 'delete', status: 'done' })).toMatchObject({
      message: 'action 必须是以下之一：pause、resume、retry、redownload、remove、cancel_watermark'
    })
    expect(await error('control_tasks', { action: 'pause', batch_id: 'nope' })).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('pause 只暂停能暂停的，其余的列出原因；不存在的 id 也列出来', async () => {
    const r = await data('control_tasks', { action: 'pause', task_ids: ['q', 'r', 'p', 't', 'x'] })
    expect(queue.pauseMany).toHaveBeenCalledWith(['q', 'r', 't'])
    expect(r).toEqual({
      action: 'pause',
      matched: 4,
      affected: 3,
      affected_by_account: [{ account_mid: null, count: 3 }],
      skipped: [
        { id: 'x', reason: '没有这个任务' },
        { id: 'p', status: 'paused', reason: 'paused 状态的任务不能 pause' }
      ]
    })
  })

  it('resume 和 retry；retry 可以带上无法下载的', async () => {
    await data('control_tasks', { action: 'resume', status: 'paused' })
    expect(queue.resumeMany).toHaveBeenLastCalledWith(['p'])
    const r = await data('control_tasks', { action: 'retry', status: ['failed', 'retrying', 'unsupported'] })
    expect(queue.resumeMany).toHaveBeenLastCalledWith(['e', 't'])
    expect(r).toMatchObject({ affected: 2, skipped: [{ id: 'u' }] })
    expect(queue.resume).not.toHaveBeenCalled()
    await data('control_tasks', { action: 'retry', task_ids: ['u'], include_unsupported: true })
    expect(queue.resume).toHaveBeenCalledWith('u')
  })

  it('redownload 不动已完成和无法下载的', async () => {
    const r = await data('control_tasks', { action: 'redownload', task_ids: ['e', 'd', 'u'] })
    expect(queue.redownload.mock.calls).toEqual([['e']])
    expect(r.affected).toBe(1)
  })

  it('remove 移出列表，从不删除已下载的文件', async () => {
    const r = await data('control_tasks', { action: 'remove', status: ['done', 'unsupported'] })
    expect(queue.remove).toHaveBeenCalledWith(['u', 'd'], false)
    expect(r).toMatchObject({ matched: 2, affected: 2 })
  })

  it('跳过的超过 50 条时只列 50 条', async () => {
    const r = await data('control_tasks', { action: 'pause', task_ids: Array.from({ length: 60 }, (_, i) => `x${i}`) })
    expect(r.skipped).toHaveLength(50)
    expect(r.skipped_total).toBe(60)
  })

  describe('对整个批次', () => {
    it('pause / resume 记住批次的暂停状态，继续中断的展开', async () => {
      const { batch_id } = await data('download_batch', { url: 'x', all: true })
      const b = tools.batches.find(batch_id)!
      let r = await data('control_tasks', { action: 'pause', batch_id })
      expect(b.paused).toBe(true)
      expect(r.batch).toEqual({})
      b.state = 'interrupted'
      b.pending = [lazy(7)]
      r = await data('control_tasks', { action: 'resume', batch_id })
      expect(b.paused).toBeUndefined()
      expect(r.batch).toEqual({ expand_resumed: true })
      // 点名具体任务、按状态筛选时不算对整个批次操作
      r = await data('control_tasks', { action: 'pause', batch_id, task_ids: ['t1'] })
      expect(r.batch).toBeUndefined()
      r = await data('control_tasks', { action: 'pause', batch_id, status: 'running' })
      expect(r.batch).toBeUndefined()
      expect(b.paused).toBeUndefined()
      await settle()
    })

    it('retry 也重试展开失败的条目；remove 不再加入还没处理的条目', async () => {
      const { batch_id } = await data('download_batch', { url: 'x', all: true })
      const b = tools.batches.find(batch_id)!
      b.failed = [{ item: lazy(8), reason: '风控' }]
      b.processed = 3
      expect((await data('control_tasks', { action: 'retry', batch_id })).batch).toEqual({ items_retried: 1 })
      await settle()
      // 重试的视频展开成了两个分P
      expect(tools.batches.tasksOf(b).map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4'])
      b.state = 'interrupted'
      b.pending = [lazy(9)]
      // 带了状态筛选时只是移除那些任务，不算对整个批次操作
      expect((await data('control_tasks', { action: 'remove', batch_id, status: 'done' })).batch).toBeUndefined()
      const r = await data('control_tasks', { action: 'remove', batch_id })
      expect(r.batch).toEqual({ items_canceled: 1 })
      expect(queue.remove).toHaveBeenLastCalledWith(['t1', 't2', 't3', 't4'], false)
      expect(b).toMatchObject({ state: 'ready', pending: [] })
    })
  })
})

describe('设置', () => {
  it('get_settings', async () => {
    expect(await data('get_settings')).toEqual({
      download_dir: settings.downloadDir,
      concurrency: 2,
      threads: 4,
      speed_limit_kbps: 0,
      auto_retry: 5,
      default_qn: 80,
      defaults: {
        output: 'full',
        container: 'mp4',
        audio: 'best',
        codec_order: ['avc', 'hevc', 'av1'],
        subtitle: false,
        embed_subtitle: false,
        danmaku: false,
        danmaku_format: 'ass',
        cover: false,
        embed_cover: true,
        chapters: true,
        nfo: false,
        watermark: 'off'
      }
    })
  })

  it('只改传了的项，返回生效说明；defaults 只改传了的字段', async () => {
    const r = await data('update_settings', { concurrency: 4, threads: '8', speed_limit_kbps: 2048, auto_retry: 0, default_qn: 116, defaults: { nfo: true } })
    expect(deps.updateSettings).toHaveBeenCalledWith({
      concurrency: 4,
      threads: 8,
      speedLimit: 2048,
      autoRetry: 0,
      defaultQn: 116,
      defaults: { ...DEFAULT_OPTIONS, subtitle: false, nfo: true }
    })
    expect(r.settings).toMatchObject({ concurrency: 4, threads: 8, speed_limit_kbps: 2048, default_qn: 116 })
    expect(r.settings.defaults).toMatchObject({ nfo: true, subtitle: false })
    expect(Object.keys(r.effects)).toEqual(['concurrency', 'threads', 'speed_limit_kbps', 'auto_retry', 'default_qn', 'defaults'])
    expect(r.effects.concurrency).toContain('立即生效')
  })

  it('下载目录：创建、展开 ~/、必须是绝对路径、要能写入', async () => {
    const target = join(dir, 'new', 'deep')
    const r = await data('update_settings', { download_dir: target })
    expect(statSync(target).isDirectory()).toBe(true)
    expect(r.settings.download_dir).toBe(target)
    expect(r.effects).toEqual({ download_dir: expect.stringContaining('之后加入的任务') })

    expect(await error('update_settings', { download_dir: 'relative/dir' })).toMatchObject({ message: 'download_dir 必须是绝对路径' })
    const file = join(dir, 'a-file')
    writeFileSync(file, '')
    expect(await error('update_settings', { download_dir: join(file, 'sub') })).toMatchObject({
      code: 'INVALID_ARGS',
      message: expect.stringContaining('下载目录不可用')
    })

    // 不真的在用户目录里建文件夹
    vi.mocked(fs.mkdirSync).mockReturnValueOnce(undefined)
    vi.mocked(fs.accessSync).mockReturnValueOnce(undefined)
    await data('update_settings', { download_dir: '~/Movies/B站' })
    expect(fs.mkdirSync).toHaveBeenLastCalledWith(join(homedir(), 'Movies/B站'), { recursive: true })
    expect(deps.updateSettings).toHaveBeenLastCalledWith({ downloadDir: join(homedir(), 'Movies/B站') })
  })

  it('没传任何设置、超出范围时报错', async () => {
    expect(await error('update_settings', {})).toMatchObject({ message: expect.stringContaining('没有要修改的设置') })
    expect(await error('update_settings', { concurrency: 9 })).toMatchObject({ message: 'concurrency 必须是 1～5 之间的整数' })
    expect(await error('update_settings', { defaults: { foo: true } })).toMatchObject({ code: 'INVALID_ARGS' })
    expect(deps.updateSettings).not.toHaveBeenCalled()
  })
})

describe('去水印', () => {
  const R = WM_REGION
  const found = { width: 1920, height: 1080, detected: R, found: true }
  /** 三个视频的合集，时长 100、200 秒和未知 */
  const submit = async (args: Record<string, unknown> = {}) => {
    deps.parseAll.mockResolvedValueOnce({
      result: result([plain(1, { duration: 100 }), plain(2, { duration: 200 }), plain(3)]),
      complete: true
    })
    return data('download_batch', { url: 'x', all: true, ...args })
  }

  it('get_status：默认方式、AI 模型、两种方式的速度、正在去水印的数量', async () => {
    queue.add(makeTask('a', { status: 'done', processing: { manual: true, stage: 'refine', pct: 10 } }), makeTask('b'))
    const r = await data('get_status')
    expect(r.watermark).toEqual({
      default_option: 'off',
      ai_model: { state: 'missing', size_mb: 198 },
      speed: { fast: '约 0.05～0.4 倍（还没在这台电脑上处理过，是粗估）', ai: '约 2～3 倍（按这台电脑实际处理过的速度，GPU）' },
      processing: 1
    })
    wm.model.mockReturnValueOnce({ state: 'downloading', size: 200, done: 50 })
    expect((await data('get_status')).watermark.ai_model).toEqual({ state: 'downloading', size_mb: 0, progress: 25 })
    wm.model.mockReturnValueOnce({ state: 'downloading', size: 0 })
    expect((await data('get_status')).watermark.ai_model.progress).toBeUndefined()
    wm.model.mockReturnValueOnce({ state: 'error', size: 200, message: '连不上' })
    expect((await data('get_status')).watermark.ai_model).toMatchObject({ state: 'error', error: '连不上' })
    wm.speed.mockReturnValueOnce({ fast: { ratio: [0.2, 0.2], basis: 'measured' }, ai: { ratio: [1.5, 2.6], basis: 'calibrated' } })
    expect((await data('get_status')).watermark.speed).toEqual({
      fast: '约 0.2 倍（按这台电脑实际处理过的速度）',
      ai: '约 1.5～2.6 倍（按试跑的速度）'
    })
  })

  it('download_batch：说明这批怎么处理水印，选了去水印时按已知时长估算额外耗时', async () => {
    const off = await submit()
    expect(off.watermark).toEqual({ option: 'off', note: expect.stringContaining('下载时会识别有没有 B站水印') })

    const fast = await submit({ options: { watermark: 'auto' }, request_id: 'a' })
    expect(fast.watermark).toEqual({
      option: 'auto',
      // 100 秒：15～25 秒；200 秒：25～45 秒
      extra_seconds: [40, 70],
      note: '识别到 B站水印的视频下载后会去掉水印，要重新编码；已知时长的视频去水印合计约 40～70 秒（还没在这台电脑上处理过，是粗估）'
    })
    const ai = await submit({ options: { watermark: 'ai' }, request_id: 'b' })
    expect(ai.watermark.note).toContain('第一次用要先下载约 198 MB 的 AI 模型，下不下来时改用快速去除')
    wm.model.mockReturnValue({ state: 'ready', size: 1 })
    expect((await submit({ options: { watermark: 'ai' }, request_id: 'c' })).watermark.note).not.toContain('模型')

    expect((await submit({ options: { output: 'audio' }, request_id: 'd' })).watermark).toBeUndefined()
  })

  it('download_batch 的 videos：只有一个视频时按它的时长估，多个时不估', async () => {
    deps.fetchVideoDetail.mockResolvedValue({ bvid: 'BV1000000000', title: '单个视频', cover: 'c.jpg', duration: 100 })
    const one = await data('download_batch', { videos: ['BV1000000000'], options: { watermark: 'auto' } })
    expect(one.watermark).toMatchObject({ option: 'auto', extra_seconds: [15, 25], note: expect.stringContaining('全部视频去水印合计约 15～25 秒') })
    const many = await data('download_batch', { videos: ['BV1000000000', 'BV2000000000'], options: { watermark: 'auto' } })
    expect(many.watermark).toEqual({ option: 'auto', extra_seconds: undefined, note: '识别到 B站水印的视频下载后会去掉水印，要重新编码' })
  })

  it('get_batch_status：识别结果、有水印没去掉时两种方式各要多久，以及给用户的说法', async () => {
    const { batch_id } = await submit()
    let r = await data('get_batch_status', { batch_id })
    expect(r.watermark).toMatchObject({ option: 'off', checked: 0, hint: '下载时会识别每个视频有没有 B站水印，结果会出现在这里' })

    queue.patch('t1', { status: 'done', watermark: found })
    queue.patch('t2', { status: 'done', watermark: { width: 1920, height: 1080 } })
    queue.patch('t3', { status: 'done', watermark: found })
    r = await data('get_batch_status', { batch_id })
    expect(r.watermark).toEqual({
      option: 'off',
      checked: 3,
      found: 2,
      removed: 0,
      not_found: 1,
      // 时长未知的 t3 不算
      estimate_seconds: { fast: [15, 25], ai: [215, 315] },
      estimate_basis: '还没在这台电脑上处理过，是粗估',
      hint:
        '2 个已下载的视频有 B站水印：先问用户要不要去掉，可选快速去除约 15～25 秒（用周围的画面填补，水印处会略糊），' +
        'AI 精修约 4～5 分钟（逐帧补出水印下面的画面，清楚得多；第一次用要先下载约 198 MB 的 AI 模型）。' +
        `去水印会重新编码并替换原文件；用户同意后调用 remove_watermark batch_id=${batch_id} method=fast 或 method=ai`
    })

    // 一个在处理、一个处理完了
    queue.patch('t1', { processing: { manual: true, stage: 'refine', pct: 40.4, eta: 99.6, backend: 'GPU' } })
    queue.patch('t3', { watermark: { ...found, applied: R } })
    r = await data('get_batch_status', { batch_id })
    expect(r.watermark).toMatchObject({ found: 2, removed: 1, not_found: 1, estimate_seconds: undefined })
    expect(r.watermark.processing).toEqual([
      { task_id: 't1', title: '视频1', manual: true, stage: 'refine', stage_text: 'AI 逐帧修补', progress: 40, eta_seconds: 100, backend: 'GPU' }
    ])
    expect(r.watermark.hint).toBe('正在去水印，可以带 wait_seconds 等待，处理完后任务的 watermark.removed 为 true')
  })

  it('get_batch_status：时长都不知道时只给提示不给估算；只下音频的批次没有 watermark', async () => {
    const { batch_id } = await data('download_batch', { url: 'x', all: true })
    queue.patch('t1', { status: 'done', watermark: found })
    const r = await data('get_batch_status', { batch_id })
    expect(r.watermark.estimate_seconds).toBeUndefined()
    expect(r.watermark.hint).toContain('可选快速去除（用周围的画面填补')

    deps.parseAll.mockResolvedValueOnce({ result: result([plain(5)]), complete: true })
    const audio = await data('download_batch', { url: 'y', all: true, options: { output: 'audio' } })
    expect((await data('get_batch_status', { batch_id: audio.batch_id })).watermark).toBeUndefined()
  })

  it('get_batch_status 的 wait_seconds：下载完了还在去水印时继续等', async () => {
    const { batch_id } = await submit()
    for (const id of ['t1', 't2', 't3']) queue.patch(id, { status: 'done' })
    queue.patch('t1', { processing: { manual: true, stage: 'encode', pct: 50 } })
    let resolved = false
    const p = data('get_batch_status', { batch_id, wait_seconds: 50 }).then((r) => {
      resolved = true
      return r
    })
    await settle()
    expect(resolved).toBe(false)
    queue.patch('t1', { processing: undefined, watermark: { ...found, applied: R } })
    expect((await p).watermark.removed).toBe(1)
  })

  it('list_tasks：任务摘要里的 watermark', async () => {
    queue.add(
      makeTask('a', { status: 'done', watermark: found, processing: { manual: true, stage: 'model', pct: 10 } }),
      makeTask('b', { options: normalizeOptions({ watermark: 'auto' }) }),
      makeTask('c', { status: 'done', options: normalizeOptions({ output: 'audio' }) }),
      makeTask('d'),
      makeTask('e', { status: 'done', watermark: { width: 1, height: 1, applied: R } }),
      makeTask('f', { status: 'processing', processing: { stage: 'detect' } })
    )
    const tasks = (await data('list_tasks', { fields: ['id', 'watermark'] })).tasks
    expect(tasks).toEqual([
      { id: 'a', watermark: { option: 'off', found: true, processing: { stage: 'model', stage_text: '下载 AI 模型', progress: 10 } } },
      { id: 'b', watermark: { option: 'auto' } },
      { id: 'c' },
      { id: 'd' },
      { id: 'e', watermark: { option: 'off', found: true, removed: true } },
      { id: 'f', watermark: { option: 'off', processing: { stage: 'detect', stage_text: '识别水印' } } }
    ])
  })

  describe('remove_watermark', () => {
    const done = (id: string, over: Parameters<typeof makeTask>[1] = {}) =>
      makeTask(id, { status: 'done', outputPath: `/dl/${id}.mp4`, item: mediaItem(`ugc:${id}:1`, { duration: 100 }), ...over })

    it('batch_id：只挑下载完、识别到水印、还没去掉的；dry_run 只估算不开始', async () => {
      const { batch_id } = await submit()
      queue.patch('t1', { status: 'done', watermark: found })
      queue.patch('t2', { status: 'done', watermark: { width: 1920, height: 1080 } })
      queue.patch('t3', { status: 'downloading' })
      wm.inspect.mockResolvedValue({ width: 1920, height: 1080, duration: 100, region: R, found: true, known: true })
      const dry = await data('remove_watermark', { batch_id, method: 'ai', dry_run: true })
      expect(dry).toEqual({
        method: 'ai',
        dry_run: true,
        would_start: [{ task_id: 't1', title: '视频1', region: R, region_source: 'download', estimate_seconds: [215, 315] }],
        total_estimate_seconds: [215, 315],
        hint:
          '合计约 4～5 分钟（还没在这台电脑上处理过，是粗估）；第一次用要先下载约 198 MB 的 AI 模型，下不下来或精修失败时这次改用快速去除，任务的 note 里会说明；' +
          '这是预估，没有开始处理；用户同意后去掉 dry_run 再调用一次'
      })
      expect(queue.startWatermark).not.toHaveBeenCalled()

      const r = await data('remove_watermark', { batch_id, method: 'fast' })
      expect(r.started).toEqual([{ task_id: 't1', title: '视频1', region: R, region_source: 'download', estimate_seconds: [15, 25] }])
      expect(r.hint).toContain('control_tasks action=cancel_watermark')
      expect(r.hint).not.toContain('模型')
      expect(queue.startWatermark).toHaveBeenCalledWith('t1', R, 'fast')
      // 已经在处理的不再选中
      expect((await data('remove_watermark', { batch_id, method: 'fast' })).hint).toContain('没有要处理的视频')
    })

    it('batch_id：force 时已经去过的也处理；批次记录没了按任务上的批次 id 找；找不到批次时报错', async () => {
      queue.add(done('a', { batchId: 'old', watermark: { ...found, applied: R } }), done('b', { batchId: 'old', watermark: found }))
      wm.inspect.mockImplementation(async (t) => ({
        width: 1920,
        height: 1080,
        duration: 100,
        region: R,
        found: !t.watermark?.applied,
        known: true,
        applied: Boolean(t.watermark?.applied)
      }))
      const pick = (list: { task_id: string; region_source: string }[]) => list.map((x) => [x.task_id, x.region_source])
      const dry = await data('remove_watermark', { batch_id: 'old', method: 'ai', force: true, dry_run: true })
      expect(pick(dry.would_start)).toEqual([
        ['a', 'applied'],
        ['b', 'download']
      ])
      expect(pick((await data('remove_watermark', { batch_id: 'old', method: 'ai' })).started)).toEqual([['b', 'download']])
      expect(await error('remove_watermark', { batch_id: 'nope', method: 'ai' })).toMatchObject({ code: 'NOT_FOUND' })
    })

    it('task_ids：各种不能处理的情况放进 skipped', async () => {
      queue.add(
        done('ok'),
        done('busy', { processing: { manual: true, stage: 'encode' } }),
        done('bad'),
        done('odd'),
        done('hdr'),
        done('again', { watermark: { ...found, applied: R } }),
        done('maybe'),
        done('none'),
        done('boom')
      )
      wm.inspect.mockImplementation(async (t) => {
        const base = { width: 1920, height: 1080, duration: 100, found: false, known: false }
        switch (t.id) {
          case 'bad':
            throw new Error('找不到视频文件，可能已被移动或删除')
          case 'odd':
            throw '读不了'
          case 'hdr':
            return { ...base, blocker: '暂不支持 HDR 和杜比视界视频' }
          case 'again':
            return { ...base, region: R, known: true, applied: true }
          case 'maybe':
            return { ...base, region: R }
          case 'none':
            return base
          default:
            return { ...base, region: R, found: true }
        }
      })
      queue.startWatermark.mockImplementation((id) => {
        if (id === 'boom') throw new Error('这个视频正在处理，请等它结束')
      })
      const r = await data('remove_watermark', {
        task_ids: ['ok', 'nope', 'busy', 'bad', 'odd', 'hdr', 'again', 'maybe', 'none', 'boom', 'ok'],
        method: 'fast'
      })
      expect(r.started.map((x: { task_id: string; region_source: string }) => [x.task_id, x.region_source])).toEqual([['ok', 'detected']])
      expect(r.skipped).toEqual([
        { task_id: 'nope', reason: '没有这个任务' },
        { task_id: 'busy', title: 'busy', reason: '正在处理，等它结束' },
        { task_id: 'bad', title: 'bad', reason: '找不到视频文件，可能已被移动或删除' },
        { task_id: 'odd', title: 'odd', reason: '读不了' },
        { task_id: 'hdr', title: 'hdr', reason: '暂不支持 HDR 和杜比视界视频' },
        { task_id: 'again', title: 'again', reason: '已经去过水印；想换一种方式重新处理（例如快速去除后换成 AI 精修），传 force=true' },
        {
          task_id: 'maybe',
          title: 'maybe',
          reason: '不确定有没有 B站水印；确认有的话，用 region 指定位置（可以用 suggested_region）',
          suggested_region: R,
          size: '1920×1080'
        },
        { task_id: 'none', title: 'none', reason: '没认出水印的位置；确认有水印的话，用 region 指定位置（像素坐标）', size: '1920×1080' },
        { task_id: 'boom', title: 'boom', reason: '这个视频正在处理，请等它结束' }
      ])
    })

    it('region：只能配一个任务，收进画面；不在画面里时跳过', async () => {
      queue.add(done('a'), done('b'))
      wm.inspect.mockResolvedValue({ width: 1920, height: 1080, duration: 100, found: false, known: false })
      const r = await data('remove_watermark', { task_ids: ['a'], method: 'fast', region: { x: 1800, y: 0, w: 300, h: 60 } })
      expect(r.started).toEqual([{ task_id: 'a', title: 'a', region: { x: 1800, y: 1, w: 119, h: 59 }, region_source: 'given', estimate_seconds: [15, 25] }])
      const out = await data('remove_watermark', { task_ids: ['b'], method: 'fast', region: { x: 5000, y: 0, w: 10, h: 10 } })
      expect(out.skipped).toEqual([{ task_id: 'b', title: 'b', reason: 'region 不在画面里或太小（视频尺寸 1920×1080）', size: '1920×1080' }])
      expect(out.hint).toBe('没有可以处理的视频，原因见 skipped')
      expect(await error('remove_watermark', { task_ids: ['a', 'b'], method: 'fast', region: R })).toMatchObject({
        code: 'INVALID_ARGS',
        message: expect.stringContaining('region 只能和一个任务一起用')
      })
      expect(await error('remove_watermark', { task_ids: ['a'], method: 'fast', region: { x: 1 } })).toMatchObject({
        message: 'region 必须是 {x, y, w, h}，单位是视频的像素'
      })
      expect(await error('remove_watermark', { task_ids: ['a'], method: 'fast', region: 'top-right' })).toMatchObject({ code: 'INVALID_ARGS' })
    })

    it('下载时没识别过的每次最多现场识别 10 个；参数检查', async () => {
      queue.add(...Array.from({ length: 12 }, (_, i) => done(`n${i}`)), done('k', { watermark: found }))
      const r = await data('remove_watermark', { task_ids: [...queue.tasks.map((t) => t.id)], method: 'fast', dry_run: true })
      expect(r.would_start).toHaveLength(11)
      expect(r.would_start.at(-1).task_id).toBe('k')
      expect(r.skipped.map((x: { task_id: string }) => x.task_id)).toEqual(['n10', 'n11'])
      expect(r.skipped[0].reason).toContain('每次最多 10 个')

      expect(await error('remove_watermark', { method: 'fast' })).toMatchObject({ message: '需要用 task_ids 或 batch_id 指定要处理的视频' })
      expect(await error('remove_watermark', { task_ids: ['a'], batch_id: 'b', method: 'fast' })).toMatchObject({ message: 'task_ids 和 batch_id 只能用一个' })
      expect(await error('remove_watermark', { task_ids: ['a'] })).toMatchObject({ message: 'method 必须是以下之一：fast、ai' })
      expect(await error('remove_watermark', { task_ids: Array.from({ length: 201 }, (_, i) => `x${i}`), method: 'ai' })).toMatchObject({
        message: '一次最多处理 200 个任务'
      })
    })

    it('control_tasks cancel_watermark：只取消正在去水印的', async () => {
      queue.add(done('a', { processing: { manual: true, stage: 'refine' } }), done('b'), makeTask('c', { status: 'downloading' }))
      const r = await data('control_tasks', { action: 'cancel_watermark', task_ids: ['a', 'b', 'c'] })
      expect(r).toMatchObject({ matched: 3, affected: 1 })
      expect(r.skipped).toEqual([
        { id: 'b', status: 'done', reason: '没有在去水印' },
        { id: 'c', status: 'running', reason: '没有在去水印' }
      ])
      expect(queue.cancelWatermark).toHaveBeenCalledWith('a')
      expect(queue.tasks[0].processing).toBeUndefined()
    })
  })
})
