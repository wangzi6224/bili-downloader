import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPTIONS, normalizeOptions } from '@shared/options'
import type { AuthState, MediaItem, ParseResult, Settings } from '@shared/types'
import { FakeQueue, makeTask, mediaItem } from '../../test/fakeQueue'

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
const { BiliError, LoginRequiredError } = await import('../bili/http')
const { McpTools } = await import('./tools')

let dir = ''
let queue: FakeQueue
let settings: Settings
let tools: InstanceType<typeof McpTools>
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
  updateSettings: vi.fn((patch: Partial<Settings>) => (settings = { ...settings, ...patch }))
}

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

beforeEach(() => {
  // 恢复成最初的实现，免得上一个用例的 mockResolvedValue 留下来
  vi.resetAllMocks()
  dir = mkdtempSync(join(tmpdir(), 'mcp-tools-'))
  queue = new FakeQueue()
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
  tools = new McpTools(
    {
      ...deps,
      queue,
      batchFile: join(dir, 'batches.json'),
      downloadedKeys: () => history,
      settings: () => settings
    },
    () => now
  )
})

afterEach(() => {
  // 先写完节流中的批次记录，免得删掉目录后定时器又把它建出来
  tools.batches.flush()
  rmSync(dir, { recursive: true, force: true })
})

describe('工具列表和通用错误', () => {
  it('每个工具都有标题、说明、参数和注解', () => {
    expect(tools.definitions.map((t) => t.name)).toEqual([
      'get_status',
      'parse_link',
      'download_batch',
      'get_batch_status',
      'list_batches',
      'list_tasks',
      'control_tasks',
      'get_settings',
      'update_settings'
    ])
    for (const t of tools.definitions) {
      expect(t.title && t.description).toBeTruthy()
      expect(t.inputSchema.type).toBe('object')
      expect(typeof t.annotations.readOnlyHint).toBe('boolean')
    }
    const control = tools.definitions.find((t) => t.name === 'control_tasks')!
    expect(control.annotations.destructiveHint).toBe(true)
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
      message: 'action 必须是以下之一：pause、resume、retry、redownload、remove'
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
        nfo: false
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
