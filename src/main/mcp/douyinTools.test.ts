import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { dyVideoUrl, parseDyInput } from '@shared/douyinUrl'
import { setLanguage, t, translate } from '@shared/i18n'
import { DEFAULT_DY_OPTIONS, DEFAULT_OPTIONS, DY_ORIGINAL_QN } from '@shared/options'
import { dyKey } from '@shared/site'
import type { BrowserProfile, DownloadOptions, DyAccount, DyAccountsSnapshot, DyAccountState, DyOptions, ParseResult, Settings, TaskStatus } from '@shared/types'
import { makeTask, mediaItem } from '../../test/fakeQueue'
import { DyCooldownError, DyError, DyLoginError, DyVerifyError } from '../douyin/errors'
import { listResult, singleResult } from '../douyin/resolve'
import type { DouyinService } from '../douyin/service'
import type { DyAweme, DyBitRate, DyComment, DyUser } from '../douyin/types'
import type { Batch, NewBatch } from './batches'
import { ToolError } from './format'

// 翻页本身在 lists.test.ts 里测；这里只关心工具怎么用翻页结果
vi.mock('../bili/lists', () => ({ loadAllPages: vi.fn() }))
const { loadAllPages } = await import('../bili/lists')
const { definitions, dyOptionsOut, parseDyArgs, DouyinTools } = await import('./douyinTools')
type Deps = import('./douyinTools').DouyinMcpDeps
type Fn = Mock<(...args: any[]) => any>

// 全部是手工编造的数据
const ID1 = '7000000000000000001'
const ID2 = '7000000000000000002'
const ID3 = '7000000000000000003'
const MIX = '7100000000000000001'
const SEC = 'fake_sec_uid_abcdefghij_0001'
const VIDEO_URL = dyVideoUrl(ID1)
const USER_URL = `https://www.douyin.com/user/${SEC}`
const SHORT = 'https://v.douyin.com/AbCd123/'
const SHARE_TEXT = `1.23 复制打开抖音，看看示例作品 ${SHORT} abc:/`
const OTHER_URL = 'https://www.bilibili.com/video/BV1xx411c7mD'

const rate = (side: number, over: Partial<DyBitRate> = {}): DyBitRate => ({
  gear_name: `normal_${side}`,
  bit_rate: side * 1000,
  FPS: 30,
  format: 'mp4',
  play_addr: { uri: 'uri', url_list: [`https://cdn.example.com/${side}.mp4`], width: side, height: side * 2, data_size: 100 },
  ...over
})

const aweme = (id: string, over: Partial<DyAweme> = {}): DyAweme => ({
  aweme_id: id,
  desc: `示例作品 ${id.slice(-1)}`,
  create_time: 1_700_000_000,
  author: { nickname: '示例博主', sec_uid: SEC },
  video: {
    duration: 15_000,
    play_addr: { uri: 'uri', url_list: ['https://cdn.example.com/play.mp4'], width: 1080, height: 1920 },
    bit_rate: [rate(1080), rate(720)],
    origin_cover: { url_list: [`https://img.example.com/${id}.jpg`] }
  },
  statistics: { digg_count: 10, comment_count: 2, collect_count: 3, share_count: 4 },
  ...over
})

const imagePost = (id: string, over: Partial<DyAweme> = {}): DyAweme =>
  aweme(id, { video: undefined, images: [{ url_list: ['https://img.example.com/1.jpg'] }, { url_list: ['https://img.example.com/2.jpg'] }], ...over })

const comment = (cid: string, over: Partial<DyComment> = {}): DyComment => ({ cid, text: `评论${cid}`, create_time: 1_700_000_000, digg_count: 1, user: { nickname: `路人${cid}` }, ...over })

const pageOf = <T>(items: T[], over: { cursor?: string; hasMore?: boolean; total?: number; searchId?: string } = {}) => ({
  items,
  cursor: '0',
  hasMore: false,
  searchId: 'sid',
  ...over
})

/** 列表链接给出带分页的结果，和真实的 DouyinService.parse 一样：不是抖音链接时返回 null */
const listFake = (url: string, awemes: DyAweme[] = [aweme(ID1), aweme(ID2), aweme(ID3)], total = 40, note?: string): ParseResult =>
  listResult({
    title: '示例博主的作品',
    url: USER_URL,
    owner: '示例博主',
    awemes,
    paging: { source: { type: 'dy', url, cursor: `${awemes.length}|${total}|c1`, account: null }, page: 1, total, hasMore: true },
    note
  })

const parseFake = async (url: string): Promise<ParseResult | null> => {
  const target = parseDyInput(url)
  if (!target) return null
  if (target.type === 'video') return singleResult(aweme(target.id))
  if (target.type === 'short') return singleResult(aweme(ID1))
  return listFake(url)
}

let svc: { parse: Fn; target: Fn; aweme: Fn; remember: Fn }
let api: { searchVideos: Fn; searchUsers: Fn; comments: Fn; replies: Fn }
let snap: DyAccountsSnapshot
let states: DyAccountState[]
let browsers: BrowserProfile[]
let history: string[]
let tasks: ReturnType<typeof makeTask>[]
let settings: Settings
let clock: number
let sleep: Fn
let deps: Deps & {
  accounts: { snapshot: Fn; select: Fn; remove: Fn }
  controller: { status: Fn; login: Fn; importBrowser: Fn; listBrowsers: Fn; verify: Fn }
  confirmRemove: Fn
}
let hooks: { findDuplicate: Fn; submit: Fn; deduplicated: Fn }
let tools: InstanceType<typeof DouyinTools>

const account = (id: string, over: Partial<DyAccount> = {}): DyAccount => ({ id, name: `名字${id}`, handle: `dy_${id}`, addedAt: 1, status: 'ready', ...over })
const profile = (id: string, over: Partial<BrowserProfile> = {}): BrowserProfile => ({ id, browser: 'Chrome', profile: id, hasBiliLogin: true, ...over })
const dyTask = (id: string, key: string, status: TaskStatus = 'queued') => makeTask(id, { item: mediaItem(key, { kind: 'douyin', cid: 0 }), status })

const call = (name: string, args: Record<string, unknown> = {}): Promise<any> => tools.call(name, args)
const fails = async (name: string, args: Record<string, unknown>, code = 'INVALID_ARGS'): Promise<ToolError> => {
  const e = await call(name, args).then(() => undefined, (err: unknown) => err)
  expect(e).toBeInstanceOf(ToolError)
  expect((e as ToolError).code).toBe(code)
  return e as ToolError
}
const submitted = (): NewBatch => hooks.submit.mock.calls.at(-1)![0] as NewBatch
const deferred = () => {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((a, b) => {
    resolve = a
    reject = b
  })
  return { promise, resolve, reject }
}
/** 等后台操作的回调跑完 */
const settle = (): Promise<void> => new Promise((r) => setImmediate(r))

beforeEach(() => {
  vi.mocked(loadAllPages).mockReset()
  vi.mocked(loadAllPages).mockImplementation(async (r) => ({ result: r, complete: !r.paging?.hasMore }))
  svc = {
    parse: vi.fn(parseFake),
    target: vi.fn(async (input: string) => {
      let target = parseDyInput(input)
      // 短链展开成第一个作品
      if (target?.type === 'short') target = { type: 'video', id: ID1 }
      return target
    }),
    aweme: vi.fn(async (id: string) => aweme(id)),
    remember: vi.fn()
  }
  api = {
    searchVideos: vi.fn(async () => pageOf([aweme(ID1)])),
    searchUsers: vi.fn(async () => pageOf<DyUser>([])),
    comments: vi.fn(async () => pageOf([comment('c1')], { total: 1 })),
    replies: vi.fn(async () => pageOf<DyComment>([]))
  }
  snap = { current: 'acc1', accounts: [account('acc1'), account('acc2', { status: 'expired' }), account('acc3')] }
  states = []
  browsers = [profile('p1', { hasBiliLogin: false }), profile('p2', { appBoundLogin: true }), profile('p3', { locked: true }), profile('p4', { blocked: true }), profile('p5')]
  history = []
  tasks = []
  clock = 1_000_000
  settings = {
    douyin: {
      downloadDir: '/dl/dy',
      defaultQn: 0,
      concurrency: 2,
      defaults: { ...DEFAULT_OPTIONS, subtitle: false, dy: { ...DEFAULT_DY_OPTIONS } }
    }
  } as Settings
  sleep = vi.fn(async () => {})
  deps = {
    service: () => svc as unknown as DouyinService,
    api: () => api as unknown as ReturnType<Deps['api']>,
    accounts: {
      snapshot: vi.fn(() => snap),
      select: vi.fn((id: string | undefined) => {
        snap = { ...snap, current: id }
        return snap
      }),
      remove: vi.fn(async (id: string) => {
        snap = { ...snap, accounts: snap.accounts.filter((a) => a.id !== id) }
        return snap
      })
    },
    controller: {
      status: vi.fn(() => states),
      login: vi.fn(async () => snap),
      importBrowser: vi.fn(async (id: string) => ({ current: `from-${id}`, accounts: [account(`from-${id}`)] })),
      listBrowsers: vi.fn(() => browsers),
      verify: vi.fn(async () => [])
    },
    confirmRemove: vi.fn(async () => true),
    queue: { list: () => tasks },
    settings: () => settings,
    downloadedKeys: () => history
  }
  hooks = {
    findDuplicate: vi.fn((): Batch | undefined => undefined),
    submit: vi.fn((n: NewBatch) => ({ batch_id: 'b1', selected: n.items.length })),
    deduplicated: vi.fn((b: Batch) => ({ batch_id: b.id, deduplicated: true }))
  }
  tools = new DouyinTools(deps, hooks, { now: () => clock, sleep })
})

afterEach(() => {
  vi.useRealTimers()
  setLanguage('zh-CN')
})

describe('definitions', () => {
  it('14 个 douyin_ 工具，顺序固定，都有标题、说明、参数和注解', () => {
    const defs = definitions()
    expect(defs.map((d) => d.name)).toEqual([
      'douyin_get_status',
      'douyin_parse_link',
      'douyin_download_batch',
      'douyin_search_videos',
      'douyin_search_users',
      'douyin_get_video_info',
      'douyin_get_video_comments',
      'douyin_get_download_quality',
      'douyin_start_login',
      'douyin_get_login_status',
      'douyin_list_accounts',
      'douyin_switch_account',
      'douyin_logout_account',
      'douyin_open_verification'
    ])
    for (const d of defs) {
      expect(d.title).toBeTruthy()
      expect(d.description).toBeTruthy()
      expect(d.description).not.toMatch(/\{\w+\}/)
      expect(typeof d.annotations.readOnlyHint).toBe('boolean')
      expect(d.inputSchema.type).toBe('object')
      expect(tools.handles(d.name)).toBe(true)
    }
  })

  it('必填参数、注解和下载选项的字段', () => {
    const by = Object.fromEntries(definitions().map((d) => [d.name, d]))
    expect(Object.fromEntries(Object.values(by).filter((d) => d.inputSchema.required).map((d) => [d.name, d.inputSchema.required]))).toEqual({
      douyin_parse_link: ['url'],
      douyin_search_videos: ['query'],
      douyin_search_users: ['query'],
      douyin_get_video_info: ['videos'],
      douyin_get_video_comments: ['video'],
      douyin_get_download_quality: ['video'],
      douyin_switch_account: ['account_id'],
      douyin_logout_account: ['account_id']
    })
    expect(by.douyin_get_status.annotations).toEqual({ readOnlyHint: true, openWorldHint: false })
    expect(by.douyin_search_videos.annotations).toEqual({ readOnlyHint: true, openWorldHint: true })
    expect(by.douyin_download_batch.annotations).toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true })
    expect(by.douyin_switch_account.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, openWorldHint: false })
    expect(by.douyin_logout_account.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true })
    const options = (by.douyin_download_batch.inputSchema.properties as Record<string, any>).options
    expect(options.additionalProperties).toBe(false)
    expect(Object.keys(options.properties)).toEqual([
      'output', 'container', 'codec_order', 'hdr', 'live_photos', 'music', 'cover', 'embed_cover', 'chapters', 'danmaku', 'danmaku_format', 'nfo'
    ])
  })

  it('标题和说明按当前界面语言现算', () => {
    const zh = definitions()
    setLanguage('en')
    const en = definitions()
    expect(en.map((d) => d.name)).toEqual(zh.map((d) => d.name))
    en.forEach((d, i) => expect(d.title).not.toBe(zh[i].title))
    expect(zh[0].title).toBe(translate('zh-CN', 'mcpDouyin.statusTitle'))
    expect(en[0].title).toBe(translate('en', 'mcpDouyin.statusTitle'))
    expect(en[1].description).toBe(translate('en', 'mcpDouyin.parseDesc', { untrusted: translate('en', 'mcpDouyin.untrusted') }))
    const props = en[2].inputSchema.properties as Record<string, any>
    expect(props.options.description).toBe(translate('en', 'mcpDouyin.optionsDesc'))
    expect(props.videos.description).toBe(translate('en', 'mcpDouyin.argVideos', { max: 50 }))
  })

  it('handles 只认自己的工具，不认原型链上的名字', () => {
    expect(tools.handles('get_status')).toBe(false)
    expect(tools.handles('youtube_get_status')).toBe(false)
    expect(tools.handles('toString')).toBe(false)
    expect(tools.handles('constructor')).toBe(false)
  })

  it('调用结果里的提示和说明也跟着界面语言走', async () => {
    snap = { accounts: [] }
    expect((await call('douyin_get_status')).hint).toBe(translate('zh-CN', 'mcpDouyin.hintNoLogin'))
    setLanguage('en')
    expect((await call('douyin_get_status')).hint).toBe(translate('en', 'mcpDouyin.hintNoLogin'))
    expect((await call('douyin_search_videos', { query: 'x' })).content_notice).toBe(translate('en', 'mcpDouyin.contentNotice'))
    expect((await fails('douyin_switch_account', { account_id: 'zz' }, 'NOT_FOUND')).message).toBe(translate('en', 'mcpDouyin.accountNotFound'))
  })
})

describe('parseDyArgs', () => {
  const base = (dy: Partial<DyOptions> = {}): Omit<DownloadOptions, 'qn'> & { dy: DyOptions } => ({ ...DEFAULT_OPTIONS, dy: { ...DEFAULT_DY_OPTIONS, ...dy } })

  it('没传时原样返回', () => {
    const b = base()
    expect(parseDyArgs(undefined, b)).toBe(b)
    expect(parseDyArgs(null, b)).toBe(b)
  })

  it('不是对象时报错', () => {
    for (const raw of ['x', 1, [], true]) expect(() => parseDyArgs(raw, base())).toThrow(t('mcpDouyin.badOptions'))
  })

  it('不认识的字段报错，并列出可用字段', () => {
    expect(() => parseDyArgs({ subtitle: true, audio: 'flac', hdr: true }, base())).toThrow(/subtitle, audio.*live_photos/)
  })

  it('枚举值不对时报错', () => {
    expect(() => parseDyArgs({ output: 'all' }, base())).toThrow(t('mcpDouyin.badOption', { key: 'output', allowed: 'full / audio / video' }))
    expect(() => parseDyArgs({ container: 'webm' }, base())).toThrow(t('mcpDouyin.badOption', { key: 'container', allowed: 'mp4 / mkv' }))
    expect(() => parseDyArgs({ danmaku_format: 'srt' }, base())).toThrow(/danmaku_format/)
    expect(() => parseDyArgs({ container: null }, base())).toThrow(ToolError)
  })

  it('各字段换成下载选项，编码列表补齐，结果不带画质', () => {
    const o = parseDyArgs(
      {
        output: 'video',
        container: 'mkv',
        codec_order: ['hevc', 'vp9'],
        hdr: true,
        live_photos: false,
        music: false,
        cover: true,
        embed_cover: false,
        chapters: false,
        danmaku: true,
        danmaku_format: 'both',
        nfo: true
      },
      base()
    )
    expect(o).toMatchObject({ output: 'video', container: 'mkv', cover: true, embedCover: false, chapters: false, danmaku: true, danmakuFormat: 'both', nfo: true })
    expect(o.codecOrder).toEqual(['hevc', 'avc', 'av1'])
    expect(o.dy).toEqual({ hdr: true, live: false, music: false })
    expect('qn' in o).toBe(false)
  })

  it('没传的字段、类型不对的布尔值和编码列表沿用默认', () => {
    const b = { ...base({ hdr: true, live: false }), nfo: true, codecOrder: ['hevc', 'avc', 'av1'] as DownloadOptions['codecOrder'] }
    const o = parseDyArgs({ hdr: 'no', live_photos: 1, nfo: 'false', codec_order: 'avc' }, b)
    expect(o.dy).toEqual({ hdr: true, live: false, music: true })
    expect(o.nfo).toBe(true)
    expect(o.codecOrder).toEqual(['hevc', 'avc', 'av1'])
    expect(o.output).toBe(b.output)
    expect(o.container).toBe(b.container)
  })
})

describe('dyOptionsOut', () => {
  it('下载选项换回 agent 用的字段，编码里不列 av1', () => {
    const o = { ...DEFAULT_OPTIONS, danmaku: true, dy: { hdr: true, live: false, music: true } }
    expect(dyOptionsOut(o)).toEqual({
      output: 'full',
      container: 'mp4',
      codec_order: ['avc', 'hevc'],
      hdr: true,
      live_photos: false,
      music: true,
      cover: DEFAULT_OPTIONS.cover,
      embed_cover: DEFAULT_OPTIONS.embedCover,
      chapters: DEFAULT_OPTIONS.chapters,
      danmaku: true,
      danmaku_format: DEFAULT_OPTIONS.danmakuFormat,
      nfo: DEFAULT_OPTIONS.nfo
    })
  })

  it('没有抖音选项时对应字段为空', () => {
    const out = dyOptionsOut({ ...DEFAULT_OPTIONS })
    expect([out.hdr, out.live_photos, out.music]).toEqual([undefined, undefined, undefined])
  })
})

describe('douyin_get_status', () => {
  it('一切正常时没有提示，只数抖音的任务', async () => {
    tasks = [dyTask('t1', dyKey(ID1)), makeTask('t2'), dyTask('t3', dyKey(ID2), 'done')]
    const r = await call('douyin_get_status')
    expect(r).toMatchObject({
      login: { logged_in: true, account_id: 'acc1', name: '名字acc1', handle: 'dy_acc1' },
      account_states: [],
      queue: { total: 2, queued: 1, done: 1 },
      download_dir: '/dl/dy',
      settings: { concurrency: 2, default_quality: 'best' }
    })
    expect(r.hint).toBeUndefined()
  })

  it('没登录、要验证、限流、有等待中的任务时都给提示', async () => {
    snap = { accounts: [] }
    states = [
      { account: null, state: 'verify' },
      { account: 'acc9', state: 'cooling', until: 1_700_000_000_000 }
    ]
    tasks = [dyTask('t1', dyKey(ID1), 'waitingAuth')]
    settings.douyin.defaultQn = 1080
    const r = await call('douyin_get_status')
    expect(r.login).toEqual({ logged_in: false })
    expect(r.account_states).toEqual([
      { account_id: null, state: 'verify', until: undefined },
      { account_id: 'acc9', state: 'cooling', until: new Date(1_700_000_000_000).toISOString() }
    ])
    expect(r.settings.default_quality).toBe(1080)
    expect(r.hint).toBe(
      [t('mcpDouyin.hintNoLogin'), t('mcpDouyin.hintVerify'), t('mcpDouyin.hintCooling'), t('mcpDouyin.hintWaitingAuth', { count: 1 })].join(t('mcp.sep'))
    )
  })

  it('当前登录失效时提示重新登录；默认画质是原画时说成 original', async () => {
    snap = { current: 'acc2', accounts: snap.accounts }
    states = [{ account: 'acc2', state: 'expired' }]
    settings.douyin.defaultQn = DY_ORIGINAL_QN
    const r = await call('douyin_get_status')
    expect(r.login).toMatchObject({ logged_in: false, account_id: 'acc2' })
    expect(r.settings.default_quality).toBe('original')
    expect(r.hint).toBe(t('mcpDouyin.hintExpired'))
  })
})

describe('douyin_parse_link', () => {
  it('分段返回条目，标出下载过和排队中的，没读完时提示', async () => {
    history = [dyKey(ID1)]
    tasks = [dyTask('t1', dyKey(ID2)), dyTask('t2', dyKey(ID3), 'done')]
    const r = await call('douyin_parse_link', { url: USER_URL, limit: 2 })
    expect(r).toMatchObject({ title: '示例博主的作品', author: '示例博主', total: 40, fetched: 3, complete: false, offset: 0, limit: 2, next_offset: 2 })
    expect(r.content_notice).toBe(t('mcpDouyin.contentNotice'))
    expect(r.items.map((i: any) => i.id)).toEqual([ID1, ID2])
    expect(r.items[0]).toMatchObject({ index: 1, title: '示例作品 1', author: '示例博主', duration: 15, published: new Date(1_700_000_000_000).toISOString(), downloaded: true })
    expect(r.items[0].queued).toBeUndefined()
    expect(r.items[1].queued).toBe(true)
    expect(r.items[1].downloaded).toBeUndefined()
    expect(r.hint).toBe([t('mcpDouyin.truncated', { count: 3 }), t('mcpTools.moreItems', { next: 2 })].join(t('mcp.sep')))
    expect(loadAllPages).toHaveBeenCalledWith(expect.objectContaining({ input: USER_URL }), { maxItems: 100, interval: 0 })

    const rest = await call('douyin_parse_link', { url: USER_URL, offset: 2, limit: 2 })
    expect(rest.items.map((i: any) => i.id)).toEqual([ID3])
    // 已完成的任务不算排队中
    expect(rest.items[0].queued).toBeUndefined()
    expect(rest.next_offset).toBeNull()
  })

  it('单个视频：总数就是条数，读完时没有提示', async () => {
    const r = await call('douyin_parse_link', { url: VIDEO_URL })
    expect(r).toMatchObject({ total: 1, fetched: 1, complete: true, offset: 0, limit: 50, next_offset: null })
    expect(r.items[0]).toMatchObject({ id: ID1 })
    expect(r.hint).toBeUndefined()
  })

  it('图文带张数，删掉的作品说明下不了，没有发布时间时为空', async () => {
    svc.parse.mockResolvedValueOnce(listFake(USER_URL, [imagePost(ID1), aweme(ID2, { status: { is_delete: true }, create_time: undefined })], 0))
    const r = await call('douyin_parse_link', { url: USER_URL })
    // 接口没给总数时用读到的条数
    expect(r.total).toBe(2)
    expect(r.items[0]).toMatchObject({ images: 2 })
    expect(r.items[0].duration).toBeUndefined()
    expect(r.items[0].unavailable).toBeUndefined()
    expect(r.items[1]).toMatchObject({ unavailable: t('dy.errDeleted') })
    expect(r.items[1].published).toBeUndefined()
  })

  it('翻页出错时提示错误和已拿到的条数', async () => {
    vi.mocked(loadAllPages).mockImplementationOnce(async (r) => ({ result: r, complete: false, error: '网络错误' }))
    const r = await call('douyin_parse_link', { url: USER_URL, max_items: 10 })
    expect(r.hint).toBe(t('mcpTools.pageError', { error: '网络错误', count: 3 }))
    expect(loadAllPages).toHaveBeenCalledWith(expect.anything(), { maxItems: 10, interval: 0 })
  })

  it('结果里带限制说明时算没读全', async () => {
    svc.parse.mockResolvedValueOnce(listFake(USER_URL, [aweme(ID1)], 40, '未登录只能看第一页'))
    vi.mocked(loadAllPages).mockImplementationOnce(async (r) => ({ result: r, complete: true }))
    const r = await call('douyin_parse_link', { url: USER_URL })
    expect(r.complete).toBe(false)
    expect(r.hint).toBe('未登录只能看第一页')
  })

  it('结果缓存 10 分钟；refresh、换账号、换 max_items 时重新解析', async () => {
    await call('douyin_parse_link', { url: USER_URL })
    await call('douyin_parse_link', { url: USER_URL, offset: 2 })
    expect(svc.parse).toHaveBeenCalledTimes(1)
    await call('douyin_parse_link', { url: USER_URL, refresh: true })
    expect(svc.parse).toHaveBeenCalledTimes(2)
    await call('douyin_parse_link', { url: USER_URL, max_items: 5 })
    expect(svc.parse).toHaveBeenCalledTimes(3)
    snap = { accounts: [] }
    await call('douyin_parse_link', { url: USER_URL })
    expect(svc.parse).toHaveBeenCalledTimes(4)
    clock += 10 * 60_000 - 1
    await call('douyin_parse_link', { url: USER_URL })
    expect(svc.parse).toHaveBeenCalledTimes(4)
    clock += 1
    await call('douyin_parse_link', { url: USER_URL })
    expect(svc.parse).toHaveBeenCalledTimes(5)
  })

  it('不是抖音链接时报参数错误，链接截到 200 字，失败的不缓存', async () => {
    const long = `${OTHER_URL}?x=${'y'.repeat(300)}`
    const e = await fails('douyin_parse_link', { url: long })
    expect(e.message).toBe(t('mcpDouyin.notDouyin', { url: long.slice(0, 200) }))
    await fails('douyin_parse_link', { url: long })
    expect(svc.parse).toHaveBeenCalledTimes(2)
  })

  it('参数不对时报错', async () => {
    await fails('douyin_parse_link', {})
    for (const bad of [{ max_items: 0 }, { max_items: 2001 }, { offset: -1 }, { limit: 0 }, { limit: 201 }, { refresh: 'yes' }]) {
      await fails('douyin_parse_link', { url: USER_URL, ...bad })
    }
    expect(svc.parse).not.toHaveBeenCalled()
  })
})

describe('douyin_download_batch：url', () => {
  it('单个视频直接下载，带上当前账号、抖音下载目录和选项', async () => {
    const r = await call('douyin_download_batch', { url: VIDEO_URL, quality: 720, subdir: 'music', options: { container: 'mkv' }, request_id: 'r1' })
    expect(r).toEqual({ batch_id: 'b1', selected: 1, unknown_ids: undefined, logged_in: true, hint: t('mcpTools.checkProgress', { id: 'b1' }) })
    const n = submitted()
    expect(n).toMatchObject({
      requestId: 'r1',
      url: VIDEO_URL,
      title: '示例作品 1',
      cover: `https://img.example.com/${ID1}.jpg`,
      kind: 'douyin',
      dir: join('/dl/dy', 'music'),
      skipDownloaded: true,
      skipped: { downloaded: 0, unavailable: 0 },
      dyAccount: 'acc1'
    })
    expect(n.options.qn).toBe(720)
    expect(n.options.container).toBe('mkv')
    expect(n.items.map((i) => i.key)).toEqual([dyKey(ID1)])
    expect(n.meta?.url).toBe(VIDEO_URL)
    expect(hooks.findDuplicate).toHaveBeenCalledWith('r1', expect.stringMatching(/^[0-9a-f]{64}$/))
    expect(n.fingerprint).toBe(hooks.findDuplicate.mock.calls[0][1])
  })

  it('没登录时 dyAccount 为空，画质默认用设置里的', async () => {
    snap = { accounts: [] }
    settings.douyin.defaultQn = 1080
    const r = await call('douyin_download_batch', { url: VIDEO_URL })
    expect(r.logged_in).toBe(false)
    expect(submitted().dyAccount).toBeUndefined()
    expect(submitted().options.qn).toBe(1080)
    expect(submitted().dir).toBe('/dl/dy')
  })

  it('original=true 下原画；默认画质是原画时不传也下原画', async () => {
    await call('douyin_download_batch', { url: VIDEO_URL, original: true, quality: 720 })
    expect(submitted().options.qn).toBe(DY_ORIGINAL_QN)
    settings.douyin.defaultQn = DY_ORIGINAL_QN
    await call('douyin_download_batch', { url: VIDEO_URL })
    expect(submitted().options.qn).toBe(DY_ORIGINAL_QN)
    await call('douyin_download_batch', { url: VIDEO_URL, quality: 0 })
    expect(submitted().options.qn).toBe(0)
  })

  it('设置里没有抖音专有选项时按默认补齐', async () => {
    // 旧版设置可能没有 dy，类型上要强转
    settings.douyin.defaults = { ...DEFAULT_OPTIONS } as Settings['douyin']['defaults']
    await call('douyin_download_batch', { url: VIDEO_URL })
    expect(submitted().options.dy).toEqual(DEFAULT_DY_OPTIONS)
    settings.douyin.defaults = { ...DEFAULT_OPTIONS, dy: { live: false } as DyOptions }
    await call('douyin_download_batch', { url: VIDEO_URL, options: { hdr: true } })
    expect(submitted().options.dy).toEqual({ live: false, music: true, hdr: true })
  })

  it('画质、选项、子目录等参数不对时报错，不提交', async () => {
    for (const bad of [{ quality: -1 }, { quality: 10001 }, { original: 'yes' }, { options: 'x' }, { options: { foo: 1 } }, { subdir: '../x' }, { skip_downloaded: 1 }, { request_id: 1 }]) {
      await fails('douyin_download_batch', { url: VIDEO_URL, ...bad })
    }
    expect(hooks.submit).not.toHaveBeenCalled()
  })

  it('分页的列表要传 ids 或 all', async () => {
    const e = await fails('douyin_download_batch', { url: USER_URL })
    expect(e.message).toBe(t('mcpDouyin.pagedList', { total: 40 }))
    svc.parse.mockResolvedValueOnce(listFake(USER_URL, [aweme(ID1), aweme(ID2)], 0))
    const none = await fails('douyin_download_batch', { url: `${USER_URL}?from=1` })
    expect(none.message).toBe(t('mcpDouyin.pagedList', { total: 2 }))
    expect(hooks.submit).not.toHaveBeenCalled()
  })

  it('链接参数不对：缺少、不是抖音的、ids 和 all 一起传、max_items 超范围', async () => {
    await fails('douyin_download_batch', {})
    const e = await fails('douyin_download_batch', { url: OTHER_URL })
    expect(e.message).toBe(t('mcpDouyin.notDouyin', { url: OTHER_URL }))
    expect(svc.parse).not.toHaveBeenCalled()
    expect((await fails('douyin_download_batch', { url: USER_URL, ids: [ID1], all: true })).message).toBe(t('mcpTools.idsAndAll'))
    await fails('douyin_download_batch', { url: USER_URL, all: true, max_items: 2001 })
  })

  it('ids 按作品 id 或条目 key 选，重复的只算一次，不认识的忽略并提示', async () => {
    const r = await call('douyin_download_batch', { url: USER_URL, ids: [ID2, dyKey(ID1), ID2, 'nope'] })
    expect(r.unknown_ids).toEqual(['nope'])
    expect(r.hint).toBe([t('mcpTools.unknownIds', { count: 1 }), t('mcpTools.checkProgress', { id: 'b1' })].join(t('mcp.sep')))
    expect(submitted().items.map((i) => i.dyId)).toEqual([ID2, ID1])
    expect(submitted().title).toBe('示例博主的作品')
    const e = await fails('douyin_download_batch', { url: USER_URL, ids: ['a', 'b', 'c', 'd'] })
    expect(e.message).toBe(t('mcpTools.idsNone', { examples: 'a、b、c' }))
  })

  it('all 下载已读到的全部，默认跳过下载过的', async () => {
    history = [dyKey(ID1)]
    const r = await call('douyin_download_batch', { url: USER_URL, all: true, max_items: 50 })
    expect(r.selected).toBe(2)
    expect(submitted().skipped).toEqual({ downloaded: 1, unavailable: 0 })
    expect(loadAllPages).toHaveBeenCalledWith(expect.anything(), { maxItems: 50, interval: 0 })
    await call('douyin_download_batch', { url: USER_URL, all: true, skip_downloaded: false })
    expect(submitted().items).toHaveLength(3)
    expect(submitted().skipDownloaded).toBe(false)
  })

  it('全部下载过时不提交，batch_id 为空', async () => {
    history = [dyKey(ID1), dyKey(ID2), dyKey(ID3)]
    const r = await call('douyin_download_batch', { url: USER_URL, ids: [ID1, ID2, 'nope'] })
    expect(r).toEqual({
      batch_id: null,
      title: '示例博主的作品',
      selected: 0,
      skipped: { downloaded: 2, unavailable: 0 },
      unknown_ids: ['nope'],
      hint: t('mcpTools.allDownloaded')
    })
    expect(hooks.submit).not.toHaveBeenCalled()
  })

  it('下不了的作品不提交并计数；都下不了时提示没有可下载的', async () => {
    const dead = aweme(ID2, { status: { is_delete: true } })
    svc.parse.mockResolvedValue(listFake(USER_URL, [aweme(ID1), dead]))
    await call('douyin_download_batch', { url: USER_URL, all: true })
    expect(submitted().items.map((i) => i.dyId)).toEqual([ID1])
    expect(submitted().skipped).toEqual({ downloaded: 0, unavailable: 1 })
    const r = await call('douyin_download_batch', { url: USER_URL, ids: [ID2] })
    expect(r).toMatchObject({ batch_id: null, selected: 0, skipped: { downloaded: 0, unavailable: 1 }, hint: t('mcpTools.nothingToDownload') })
    expect(r.unknown_ids).toBeUndefined()
  })

  it('不分页的结果按默认选择下载，默认不选的不下', async () => {
    svc.parse.mockResolvedValueOnce(singleResult(aweme(ID1, { status: { is_delete: true } })))
    const r = await call('douyin_download_batch', { url: VIDEO_URL })
    expect(r).toMatchObject({ batch_id: null, selected: 0, skipped: { downloaded: 0, unavailable: 0 }, hint: t('mcpTools.nothingToDownload') })
    expect(hooks.submit).not.toHaveBeenCalled()
  })

  it('和 douyin_parse_link 共用解析缓存', async () => {
    await call('douyin_parse_link', { url: USER_URL })
    await call('douyin_download_batch', { url: USER_URL, all: true })
    expect(svc.parse).toHaveBeenCalledTimes(1)
  })

  it('分享口令可以直接当链接用', async () => {
    await call('douyin_download_batch', { url: SHARE_TEXT })
    expect(svc.parse).toHaveBeenCalledWith(SHARE_TEXT)
    expect(submitted().items.map((i) => i.dyId)).toEqual([ID1])
  })

  it('重复提交时返回原来的批次', async () => {
    hooks.findDuplicate.mockReturnValue({ id: 'old' } as Batch)
    const r = await call('douyin_download_batch', { url: VIDEO_URL })
    expect(r).toEqual({ batch_id: 'old', deduplicated: true })
    expect(hooks.submit).not.toHaveBeenCalled()
  })

  it('同样的请求指纹相同；选项、子目录、跳过方式、账号、选择不同时指纹不同', async () => {
    const args = [
      { url: USER_URL, ids: [ID1, ID2] },
      { url: USER_URL, ids: [ID2, ID1] },
      { url: USER_URL, ids: [ID1] },
      { url: USER_URL, all: true },
      { url: USER_URL, all: true, options: { hdr: true } },
      { url: USER_URL, all: true, subdir: 'a' },
      { url: USER_URL, all: true, skip_downloaded: false }
    ]
    for (const a of args) await call('douyin_download_batch', a)
    snap = { ...snap, current: 'acc3' }
    await call('douyin_download_batch', { url: USER_URL, all: true })
    const prints = hooks.findDuplicate.mock.calls.map((x) => x[1])
    expect(prints[0]).toBe(prints[1])
    expect(new Set(prints).size).toBe(prints.length - 1)
  })
})

describe('douyin_download_batch：videos', () => {
  it('多个作品：按作品去重，认不出的放进 unknown_ids，用固定的中文标题', async () => {
    setLanguage('en')
    const r = await call('douyin_download_batch', { videos: [ID1, VIDEO_URL, 'bad', dyVideoUrl(ID2), 'bad', USER_URL], quality: 720 })
    expect(r.unknown_ids).toEqual(['bad', USER_URL])
    expect(r.logged_in).toBe(true)
    expect(r.hint).toContain(t('mcpTools.unknownIds', { count: 2 }))
    expect(svc.aweme.mock.calls.map((c) => c[0])).toEqual([ID1, ID2])
    const n = submitted()
    expect(n.title).toBe(translate('zh-CN', 'mcpTools.videosTitle', { count: 2 }))
    expect(n.url).toBe('')
    expect(n.cover).toBe(`https://img.example.com/${ID1}.jpg`)
    expect(n.meta).toBeUndefined()
    expect(n.items.map((i) => [i.dyId, i.index])).toEqual([[ID1, 1], [ID2, 2]])
    expect(n.options.qn).toBe(720)
    expect(n.dyAccount).toBe('acc1')
  })

  it('分享短链经解析服务认出作品；只传一个字符串也行，标题取作品标题', async () => {
    await call('douyin_download_batch', { videos: SHARE_TEXT })
    expect(svc.target).toHaveBeenCalledWith(SHARE_TEXT)
    expect(submitted().title).toBe('示例作品 1')
    expect(submitted().items.map((i) => i.dyId)).toEqual([ID1])
  })

  it('纯数字 id 不查链接；可以自定义标题；没有封面时为空', async () => {
    svc.aweme.mockResolvedValueOnce(aweme(ID1, { video: { play_addr: { url_list: ['https://cdn.example.com/v.mp4'] } } }))
    await call('douyin_download_batch', { videos: [` ${ID1} `], title: ' 我的标题 ' })
    expect(svc.target).not.toHaveBeenCalled()
    expect(submitted()).toMatchObject({ title: '我的标题', cover: '' })
  })

  it('和 url 等一起传时报错，值为 null 的忽略', async () => {
    for (const [key, value] of [['url', VIDEO_URL], ['ids', [ID1]], ['all', true], ['max_items', 5]] as const) {
      const e = await fails('douyin_download_batch', { videos: [ID1], [key]: value })
      expect(e.message).toBe(t('mcpTools.videosWith', { key }))
    }
    expect((await call('douyin_download_batch', { videos: [ID1], url: null, ids: null })).batch_id).toBe('b1')
  })

  it('一个都认不出时报错并举例', async () => {
    const e = await fails('douyin_download_batch', { videos: ['a', 'b', OTHER_URL, 'd'] })
    expect(e.message).toBe(t('mcpTools.videosNone', { examples: `a、b、${OTHER_URL}` }))
    await fails('douyin_download_batch', { videos: [] })
    expect(svc.aweme).not.toHaveBeenCalled()
  })

  it('最多 50 个（按去重后算），标题最长 100 字', async () => {
    const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `70000000000000${String(i).padStart(5, '0')}`)
    const e = await fails('douyin_download_batch', { videos: ids(51) })
    expect(e.message).toBe(t('mcpTools.videosTooMany', { max: 50 }))
    expect((await call('douyin_download_batch', { videos: [...ids(50), ids(1)[0]] })).selected).toBe(50)
    const long = await fails('douyin_download_batch', { videos: [ID1], title: 'x'.repeat(101) })
    expect(long.message).toBe(t('mcpTools.titleTooLong', { max: 100 }))
  })

  it('部分作品查不到详情时跳过并提示，计入 unavailable', async () => {
    svc.aweme.mockImplementation(async (id: string) => {
      if (id === ID2) throw new DyError('网络错误')
      return aweme(id)
    })
    const r = await call('douyin_download_batch', { videos: [ID1, ID2, ID3] })
    expect(r.hint).toContain(t('mcpDouyin.lookupFailed', { count: 1 }))
    expect(submitted().items.map((i) => [i.dyId, i.index])).toEqual([[ID1, 1], [ID3, 2]])
    expect(submitted().skipped).toEqual({ downloaded: 0, unavailable: 1 })
  })

  it('第一个查不到、后面的查得到时照样提交', async () => {
    svc.aweme.mockImplementation(async (id: string) => {
      if (id === ID1) throw new DyError('网络错误')
      return aweme(id)
    })
    await call('douyin_download_batch', { videos: [ID1, ID2] })
    expect(submitted().items.map((i) => i.dyId)).toEqual([ID2])
    expect(submitted().title).toBe('示例作品 2')
  })

  it('途中被限流时已经查到的照样提交，其余算查不到', async () => {
    svc.aweme.mockImplementation(async (id: string) => {
      if (id !== ID1) throw new DyCooldownError(1000, 0)
      return aweme(id)
    })
    const r = await call('douyin_download_batch', { videos: [ID1, ID2, ID3] })
    expect(r.hint).toContain(t('mcpDouyin.lookupFailed', { count: 2 }))
    expect(submitted().items).toHaveLength(1)
  })

  it('全部查不到时报原来的错误', async () => {
    svc.aweme.mockRejectedValue(new DyError('网络错误'))
    await expect(call('douyin_download_batch', { videos: [ID1, ID2] })).rejects.toThrow('网络错误')
    expect(svc.aweme).toHaveBeenCalledTimes(2)
    expect(hooks.submit).not.toHaveBeenCalled()
  })

  it.each([
    ['要登录', new DyLoginError()],
    ['要验证', new DyVerifyError()]
  ])('%s时立即报错，不再查后面的', async (_name, error) => {
    svc.aweme.mockImplementation(async (id: string) => {
      if (id === ID2) throw error
      return aweme(id)
    })
    await expect(call('douyin_download_batch', { videos: [ID1, ID2, ID3] })).rejects.toBe(error)
    expect(svc.aweme).toHaveBeenCalledTimes(2)
    expect(hooks.submit).not.toHaveBeenCalled()
  })

  it('认得出的作品全部查不到时报原来的错误，即使还夹着认不出的项', async () => {
    svc.aweme.mockRejectedValue(new DyError('网络错误'))
    await expect(call('douyin_download_batch', { videos: ['bad', ID1] })).rejects.toThrow('网络错误')
  })

  it('同一作品传了两种写法且查不到时报原来的错误', async () => {
    svc.aweme.mockRejectedValue(new DyError('网络错误'))
    await expect(call('douyin_download_batch', { videos: [ID1, VIDEO_URL] })).rejects.toThrow('网络错误')
  })

  it('删掉的作品不下载；下载过的默认跳过', async () => {
    svc.aweme.mockImplementation(async (id: string) => aweme(id, id === ID2 ? { status: { is_delete: true } } : {}))
    history = [dyKey(ID1)]
    const r = await call('douyin_download_batch', { videos: [ID1, ID2] })
    expect(r).toMatchObject({ batch_id: null, selected: 0, skipped: { downloaded: 1, unavailable: 1 }, hint: t('mcpTools.allDownloaded') })
    await call('douyin_download_batch', { videos: [ID1, ID2], skip_downloaded: false })
    expect(submitted().items.map((i) => i.dyId)).toEqual([ID1])
  })

  it('指纹只看作品和标题，和传入顺序、写法无关', async () => {
    await call('douyin_download_batch', { videos: [ID1, ID2] })
    await call('douyin_download_batch', { videos: [dyVideoUrl(ID2), VIDEO_URL] })
    await call('douyin_download_batch', { videos: [ID1, ID2], title: '别的标题' })
    const [a, b, c] = hooks.findDuplicate.mock.calls.map((x) => x[1])
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('重复提交时返回原来的批次', async () => {
    hooks.findDuplicate.mockReturnValue({ id: 'old' } as Batch)
    expect(await call('douyin_download_batch', { videos: [ID1], request_id: 'r' })).toEqual({ batch_id: 'old', deduplicated: true })
    expect(hooks.findDuplicate).toHaveBeenCalledWith('r', expect.any(String))
    expect(hooks.submit).not.toHaveBeenCalled()
  })
})

describe('douyin_search_videos', () => {
  it('默认按综合排序搜 10 条，带当前账号，结果记进缓存', async () => {
    const r = await call('douyin_search_videos', { query: ' 猫 ' })
    expect(api.searchVideos).toHaveBeenCalledWith('猫', { offset: 0, searchId: undefined }, { sort: 0, within: undefined, duration: undefined }, { account: 'acc1' })
    expect(r).toEqual({
      content_notice: t('mcpDouyin.contentNotice'),
      query: '猫',
      sort: 'relevance',
      count: 1,
      hint: t('mcpDouyin.searchHint'),
      videos: [
        {
          id: ID1,
          url: VIDEO_URL,
          title: '示例作品 1',
          author: '示例博主',
          published: new Date(1_700_000_000_000).toISOString(),
          duration: 15,
          images: undefined,
          likes: 10,
          comments: 2,
          favorites: 3
        }
      ]
    })
    expect(svc.remember).toHaveBeenCalledWith([expect.objectContaining({ aweme_id: ID1 })])
  })

  it('图文给张数不给时长；缺的字段为空', async () => {
    api.searchVideos.mockResolvedValueOnce(
      pageOf([imagePost(ID1), { aweme_id: ID2 } as DyAweme])
    )
    snap = { accounts: [] }
    const r = await call('douyin_search_videos', { query: 'x' })
    expect(api.searchVideos.mock.calls[0][3]).toEqual({ account: null })
    expect(r.videos[0]).toMatchObject({ images: 2 })
    expect(r.videos[0].duration).toBeUndefined()
    expect(r.videos[1]).toEqual({ id: ID2, url: dyVideoUrl(ID2), title: `抖音_${ID2}` })
  })

  it('排序、发布时间和时长筛选换成接口的值', async () => {
    const cases = [
      [{ sort: 'likes', within: 'day', duration: 'short' }, { sort: 1, within: 1, duration: '0-1' }],
      [{ sort: 'newest', within: 'week', duration: 'medium' }, { sort: 2, within: 7, duration: '1-5' }],
      [{ sort: 'relevance', within: 'half_year', duration: 'long' }, { sort: 0, within: 180, duration: '5-10000' }]
    ] as const
    for (const [args, filter] of cases) {
      const r = await call('douyin_search_videos', { query: 'x', ...args })
      expect(r.sort).toBe(args.sort)
      expect(api.searchVideos.mock.calls.at(-1)![2]).toEqual(filter)
    }
  })

  it('within、duration 传 null 等于没传，不筛选', async () => {
    await call('douyin_search_videos', { query: 'x', within: null, duration: null })
    expect(api.searchVideos.mock.calls[0][2]).toEqual({ sort: 0, within: undefined, duration: undefined })
  })

  it('翻页直到够数：带上游标和搜索 id，重复的只算一次', async () => {
    api.searchVideos
      .mockResolvedValueOnce(pageOf([aweme(ID1), aweme(ID2)], { cursor: '10', hasMore: true, searchId: 's1' }))
      .mockResolvedValueOnce(pageOf([aweme(ID2), aweme(ID3), aweme(MIX)], { cursor: '20', hasMore: true }))
    const r = await call('douyin_search_videos', { query: 'x', limit: 3 })
    expect(api.searchVideos).toHaveBeenCalledTimes(2)
    expect(api.searchVideos.mock.calls[1][1]).toEqual({ offset: 10, searchId: 's1' })
    expect(r.videos.map((v: any) => v.id)).toEqual([ID1, ID2, ID3])
    expect(r.count).toBe(3)
    // 缓存里记的是返回给 agent 的这几条
    expect(svc.remember.mock.calls[0][0]).toHaveLength(3)
  })

  it.each([
    ['接口说没有下一页', { cursor: '10', hasMore: false }],
    ['游标没有前进', { cursor: '0', hasMore: true }],
    ['游标不是数字', { cursor: '', hasMore: true }]
  ])('%s时停止翻页', async (_name, over) => {
    api.searchVideos.mockResolvedValue(pageOf([aweme(ID1)], over))
    const r = await call('douyin_search_videos', { query: 'x' })
    expect(api.searchVideos).toHaveBeenCalledTimes(1)
    expect(r.count).toBe(1)
  })

  it('参数不对时报错', async () => {
    for (const bad of [{}, { query: 'x', limit: 0 }, { query: 'x', limit: 31 }, { query: 'x', sort: 'views' }, { query: 'x', within: 'year' }, { query: 'x', duration: 'tiny' }]) {
      await fails('douyin_search_videos', bad)
    }
    expect(api.searchVideos).not.toHaveBeenCalled()
  })

  it('接口出错时原样抛出', async () => {
    const error = new DyVerifyError()
    api.searchVideos.mockRejectedValueOnce(error)
    await expect(call('douyin_search_videos', { query: 'x' })).rejects.toBe(error)
  })
})

describe('douyin_search_users', () => {
  const user = (n: number, over: Partial<DyUser> = {}): DyUser => ({ sec_uid: `fake_sec_uid_abcdefghij_u${n}`, nickname: `博主${n}`, ...over })

  it('返回主页链接、抖音号、认证和简介，按 limit 截断', async () => {
    api.searchUsers.mockResolvedValueOnce(
      pageOf([
        user(1, { unique_id: 'uniq1', short_id: '111', follower_count: 5, aweme_count: 6, custom_verify: '个人认证', signature: 's'.repeat(400) }),
        user(2, { unique_id: '', short_id: '222', custom_verify: '', enterprise_verify_reason: '机构认证', signature: '简短' }),
        user(3, { signature: '' }),
        user(4)
      ])
    )
    const r = await call('douyin_search_users', { query: '博主', limit: 3 })
    expect(api.searchUsers).toHaveBeenCalledWith('博主', 0, { account: 'acc1' })
    expect(r).toMatchObject({ content_notice: t('mcpDouyin.contentNotice'), query: '博主', count: 3, hint: t('mcpDouyin.usersHint') })
    expect(r.users[0]).toEqual({
      sec_uid: 'fake_sec_uid_abcdefghij_u1',
      name: '博主1',
      handle: 'uniq1',
      url: 'https://www.douyin.com/user/fake_sec_uid_abcdefghij_u1',
      followers: 5,
      works: 6,
      verified: '个人认证',
      description: `${'s'.repeat(300)}…`
    })
    expect(r.users[1]).toMatchObject({ handle: '222', verified: '机构认证', description: '简短' })
    expect(r.users[2].verified).toBeUndefined()
    expect(r.users[2].description).toBeUndefined()
  })

  it('默认最多 10 个', async () => {
    api.searchUsers.mockResolvedValueOnce(pageOf(Array.from({ length: 12 }, (_, i) => user(i))))
    expect((await call('douyin_search_users', { query: 'x' })).count).toBe(10)
  })

  it('limit 超过一页时接着翻页', async () => {
    api.searchUsers.mockImplementation(async (_q: string, offset: number) =>
      pageOf(Array.from({ length: 10 }, (_, i) => user(offset + i)), { cursor: String(offset + 10), hasMore: offset < 20 })
    )
    expect((await call('douyin_search_users', { query: 'x', limit: 20 })).count).toBe(20)
  })

  it('参数不对时报错', async () => {
    await fails('douyin_search_users', {})
    await fails('douyin_search_users', { query: 'x', limit: 31 })
    expect(api.searchUsers).not.toHaveBeenCalled()
  })
})

describe('douyin_get_video_info', () => {
  const full = (id: string, over: Partial<DyAweme> = {}): DyAweme =>
    aweme(id, {
      desc: `示例标题\n${'x'.repeat(6000)}`,
      text_extra: [{ hashtag_name: '话题0' }, {}, ...Array.from({ length: 25 }, (_, i) => ({ hashtag_name: `话题${i + 1}` }))],
      music: { title: '示例配乐' },
      chapter_list: [{ desc: '开头', timestamp: 0 }, { desc: '结尾', timestamp: 9000 }],
      mix_info: { mix_id: MIX, mix_name: '示例合集' },
      ...over
    })

  it('单个作品：作者、话题、配乐、章节、画质和合集，简介最长 5000 字', async () => {
    svc.aweme.mockResolvedValueOnce(full(ID1))
    const r = await call('douyin_get_video_info', { videos: [VIDEO_URL] })
    expect(r.content_notice).toBe(t('mcpDouyin.contentNotice'))
    expect(r.failed).toBeUndefined()
    const v = r.videos[0]
    expect(v).toMatchObject({
      id: ID1,
      url: VIDEO_URL,
      title: '示例标题',
      author: { name: '示例博主', sec_uid: SEC, url: USER_URL },
      duration: 15,
      likes: 10,
      shares: 4,
      music: '示例配乐',
      cover: `https://img.example.com/${ID1}.jpg`,
      chapters: [{ start: 0, title: '开头' }, { start: 9, title: '结尾' }],
      qualities: [1080, 720, 'original'],
      collection: { id: MIX, name: '示例合集', url: `https://www.douyin.com/collection/${MIX}` }
    })
    expect(v.description).toHaveLength(5001)
    expect(v.description.endsWith('…')).toBe(true)
    expect(v.tags).toHaveLength(20)
    expect(v.tags.slice(0, 2)).toEqual(['话题0', '话题1'])
  })

  it('多个作品时简介最长 800 字；图文没有章节和视频画质', async () => {
    svc.aweme.mockImplementation(async (id: string) =>
      id === ID1
        ? full(ID1)
        : imagePost(ID2, { desc: undefined, author: { nickname: '无主页' }, chapter_list: [{ desc: '开头', timestamp: 0 }], statistics: undefined })
    )
    const r = await call('douyin_get_video_info', { videos: [ID1, ID2] })
    expect(r.videos[0].description).toHaveLength(801)
    expect(r.videos[1]).toMatchObject({ images: 2, author: { name: '无主页' }, qualities: [] })
    expect(r.videos[1].author.url).toBeUndefined()
    expect(r.videos[1].chapters).toBeUndefined()
    expect(r.videos[1].collection).toBeUndefined()
    expect(r.videos[1].description).toBeUndefined()
    expect(r.videos[1].tags).toBeUndefined()
    expect(r.videos[1].shares).toBeUndefined()
  })

  it('没有作者时为空', async () => {
    svc.aweme.mockResolvedValueOnce(aweme(ID1, { author: undefined }))
    const r = await call('douyin_get_video_info', { videos: ID1 })
    expect(r.videos[0].author).toBeUndefined()
    expect(r.videos[0].chapters).toEqual([])
  })

  it('认不出和查不到的放进 failed，其余照常返回', async () => {
    svc.aweme.mockImplementation(async (id: string) => {
      if (id === ID2) throw new DyError('网络错误')
      if (id === ID3) throw 'raw'
      return aweme(id)
    })
    const r = await call('douyin_get_video_info', { videos: [ID1, ID2, ID3, USER_URL] })
    expect(r.videos.map((v: any) => v.id)).toEqual([ID1])
    expect(r.failed).toEqual([
      { video: ID2, error: '网络错误' },
      { video: ID3, error: 'raw' },
      { video: USER_URL, error: t('mcpDouyin.badVideo', { input: USER_URL }) }
    ])
  })

  it('要验证时整个调用报错，不再查后面的', async () => {
    const error = new DyVerifyError()
    svc.aweme.mockRejectedValue(error)
    await expect(call('douyin_get_video_info', { videos: [ID1, ID2] })).rejects.toBe(error)
    expect(svc.aweme).toHaveBeenCalledTimes(1)
  })

  it('要登录时整个调用报错，不再查后面的', async () => {
    const error = new DyLoginError()
    svc.aweme.mockRejectedValue(error)
    await expect(call('douyin_get_video_info', { videos: [ID1, ID2] })).rejects.toBe(error)
    expect(svc.aweme).toHaveBeenCalledTimes(1)
  })

  it('没传或超过 10 个时报参数错误', async () => {
    expect((await fails('douyin_get_video_info', {})).message).toBe(t('mcpDouyin.videosRequired'))
    expect((await fails('douyin_get_video_info', { videos: [] })).message).toBe(t('mcpDouyin.videosRequired'))
    expect((await fails('douyin_get_video_info', { videos: Array.from({ length: 11 }, () => ID1) })).message).toBe(t('mcpDouyin.tooManyVideos', { max: 10 }))
    expect(svc.aweme).not.toHaveBeenCalled()
  })
})

describe('douyin_get_video_comments', () => {
  /** 三页评论，每页两条 */
  const threePages = () =>
    api.comments.mockImplementation(async (_id: string, cursor: string) => {
      const n = Number(cursor || 0)
      return pageOf([comment(`c${n}`), comment(`c${n + 1}`)], { cursor: String(n + 2), hasMore: n < 4, total: n === 0 ? 6 : 999 })
    })

  it('翻页直到够数，总数取第一页，给出下一段的位置', async () => {
    threePages()
    const r = await call('douyin_get_video_comments', { video: VIDEO_URL, limit: 3 })
    expect(api.comments.mock.calls.map((c) => c[1])).toEqual(['', '2'])
    expect(api.comments.mock.calls[0]).toEqual([ID1, '', { account: 'acc1' }])
    expect(r).toMatchObject({ content_notice: t('mcpDouyin.contentNotice'), id: ID1, total: 6, offset: 0, next_offset: 3 })
    expect(r.comments.map((c: any) => c.id)).toEqual(['c0', 'c1', 'c2'])
    expect(r.hint).toBeUndefined()

    const rest = await call('douyin_get_video_comments', { video: ID1, offset: 3, limit: 10 })
    expect(rest.comments.map((c: any) => c.id)).toEqual(['c3', 'c4', 'c5'])
    expect(rest.next_offset).toBeNull()
  })

  it('默认 20 条；刚好读完时没有下一段', async () => {
    threePages()
    const r = await call('douyin_get_video_comments', { video: ID1 })
    expect(r.comments).toHaveLength(6)
    expect(r.next_offset).toBeNull()
    expect((await call('douyin_get_video_comments', { video: ID1, limit: 6 })).next_offset).toBeNull()
  })

  it('读完了但缓存里还有多的，也给出下一段', async () => {
    api.comments.mockResolvedValue(pageOf([comment('a'), comment('b'), comment('c')]))
    const r = await call('douyin_get_video_comments', { video: ID1, limit: 2 })
    expect(r.next_offset).toBe(2)
  })

  it.each([
    ['返回空页', async () => pageOf<DyComment>([], { cursor: '20', hasMore: true })],
    ['游标不动', async (_id: string, cursor: string) => pageOf([comment('a')], { cursor: cursor || '', hasMore: true })]
  ])('接口说还有下一页但%s时停止', async (_name, impl) => {
    api.comments.mockImplementation(impl)
    const r = await call('douyin_get_video_comments', { video: ID1 })
    expect(api.comments).toHaveBeenCalledTimes(1)
    expect(r.next_offset).toBeNull()
  })

  it('评论字段：长内容截断，没有的为空', async () => {
    api.comments.mockResolvedValue(
      pageOf([
        comment('a', { text: 'x'.repeat(2500), ip_label: '某地', reply_comment_total: 3 }),
        { cid: 'b', ip_label: '', reply_comment_total: 0 }
      ])
    )
    const r = await call('douyin_get_video_comments', { video: ID1 })
    expect(r.comments[0]).toEqual({
      id: 'a',
      author: '路人a',
      text: `${'x'.repeat(2000)}…`,
      likes: 1,
      time: new Date(1_700_000_000_000).toISOString(),
      location: '某地',
      reply_count: 3
    })
    expect(JSON.parse(JSON.stringify(r.comments[1]))).toEqual({ id: 'b' })
    expect(r.total).toBeUndefined()
    expect(api.replies).not.toHaveBeenCalled()
  })

  it('同样的范围缓存 10 分钟，换账号重新取', async () => {
    await call('douyin_get_video_comments', { video: ID1 })
    await call('douyin_get_video_comments', { video: ID1 })
    expect(api.comments).toHaveBeenCalledTimes(1)
    snap = { accounts: [] }
    await call('douyin_get_video_comments', { video: ID1 })
    expect(api.comments).toHaveBeenCalledTimes(2)
    expect(api.comments.mock.calls[1][2]).toEqual({ account: null })
    clock += 10 * 60_000
    await call('douyin_get_video_comments', { video: ID1 })
    expect(api.comments).toHaveBeenCalledTimes(3)
  })

  it('取评论失败时报错，且不缓存', async () => {
    const error = new DyCooldownError(1000, 0)
    api.comments.mockRejectedValueOnce(error)
    await expect(call('douyin_get_video_comments', { video: ID1 })).rejects.toBe(error)
    expect((await call('douyin_get_video_comments', { video: ID1 })).comments).toHaveLength(1)
  })

  it('replies 大于 0 时只给有回复的评论取回复，按条数截断', async () => {
    api.comments.mockResolvedValue(pageOf([comment('a', { reply_comment_total: 5 }), comment('b')]))
    api.replies.mockResolvedValue(pageOf([comment('r1'), comment('r2'), comment('r3')]))
    const r = await call('douyin_get_video_comments', { video: ID1, replies: 2 })
    expect(api.replies.mock.calls).toEqual([[ID1, 'a', '', { account: 'acc1' }]])
    expect(r.comments[0].replies.map((c: any) => c.id)).toEqual(['r1', 'r2'])
    expect(r.comments[1].replies).toBeUndefined()
    expect(r.hint).toBeUndefined()
  })

  it('一次最多给 10 条评论取回复', async () => {
    api.comments.mockResolvedValue(pageOf(Array.from({ length: 12 }, (_, i) => comment(`c${i}`, { reply_comment_total: 1 }))))
    const r = await call('douyin_get_video_comments', { video: ID1, replies: 1 })
    expect(api.replies).toHaveBeenCalledTimes(10)
    expect(r.comments).toHaveLength(12)
    expect(r.comments[9].replies).toEqual([])
    expect(r.comments[10].replies).toBeUndefined()
  })

  it.each([
    ['错误对象', new DyVerifyError(), undefined],
    ['其他值', '接口没响应', '接口没响应']
  ])('取回复出错（%s）时保留已拿到的，之后不再试', async (_name, error, text) => {
    api.comments.mockResolvedValue(pageOf(['a', 'b', 'c'].map((id) => comment(id, { reply_comment_total: 1 }))))
    api.replies.mockResolvedValueOnce(pageOf([comment('r1')])).mockRejectedValueOnce(error)
    const r = await call('douyin_get_video_comments', { video: ID1, replies: 3 })
    expect(api.replies).toHaveBeenCalledTimes(2)
    expect(r.comments.map((c: any) => Boolean(c.replies))).toEqual([true, false, false])
    expect(r.hint).toBe(t('mcpDouyin.repliesStopped', { error: text ?? t('dy.errVerify') }))
  })

  it('没登录时不取回复，提示先登录', async () => {
    snap = { accounts: [] }
    api.comments.mockResolvedValue(pageOf([comment('a', { reply_comment_total: 5 })]))
    const r = await call('douyin_get_video_comments', { video: ID1, replies: 2 })
    expect(api.replies).not.toHaveBeenCalled()
    expect(r.hint).toBe(t('mcpDouyin.repliesNeedLogin'))
  })

  it('参数不对时报错', async () => {
    await fails('douyin_get_video_comments', {})
    for (const bad of [{ offset: -1 }, { offset: 1001 }, { limit: 0 }, { limit: 101 }, { replies: 21 }]) {
      await fails('douyin_get_video_comments', { video: ID1, ...bad })
    }
    expect(api.comments).not.toHaveBeenCalled()
  })
})

describe('作品参数', () => {
  it.each([
    ['纯数字 id（两头空格）', ` ${ID2} `, ID2],
    ['作品链接', dyVideoUrl(ID3), ID3],
    ['图文链接', `https://www.douyin.com/note/${ID2}`, ID2],
    ['分享口令里的短链', SHARE_TEXT, ID1]
  ])('认得%s', async (_name, input, id) => {
    expect((await call('douyin_get_video_comments', { video: input })).id).toBe(id)
  })

  it('主页链接、认不出的短链和别的网站报参数错误，输入截到 100 字', async () => {
    for (const bad of [USER_URL, OTHER_URL, '12345', `x${'y'.repeat(300)}`]) {
      const e = await fails('douyin_get_download_quality', { video: bad })
      expect(e.message).toBe(t('mcpDouyin.badVideo', { input: bad.slice(0, 100) }))
    }
    svc.target.mockResolvedValueOnce(null)
    await fails('douyin_get_download_quality', { video: SHORT })
    expect(svc.aweme).not.toHaveBeenCalled()
  })
})

describe('douyin_get_download_quality', () => {
  it('分别用不登录和每个没失效的账号查画质，单个失败时记下错误', async () => {
    snap.accounts.push(account('acc4'), account('acc5'))
    svc.aweme.mockImplementation(async (id: string, o: { account: string | null }) => {
      if (o.account === 'acc3') throw new DyError('网络错误')
      if (o.account === 'acc4') throw 'raw'
      if (o.account === 'acc5') return imagePost(id)
      if (o.account === null) return aweme(id, { fromShare: true, video: { play_addr: { uri: 'u', url_list: ['https://cdn.example.com/v'] }, bit_rate: [rate(720)] } })
      return aweme(id)
    })
    const r = await call('douyin_get_download_quality', { video: ID1 })
    expect(r.id).toBe(ID1)
    expect(r.hint).toBe(t('mcpDouyin.qualityHint'))
    expect(JSON.parse(JSON.stringify(r.results))).toEqual([
      { account_id: null, max: 720, qualities: [720], share_page: true },
      { account_id: 'acc1', name: '名字acc1', max: 1080, qualities: [1080, 720] },
      { account_id: 'acc3', name: '名字acc3', error: '网络错误' },
      { account_id: 'acc4', name: '名字acc4', error: 'raw' },
      { account_id: 'acc5', name: '名字acc5', max: null, qualities: [] }
    ])
    expect(svc.aweme).toHaveBeenCalledWith(ID1, { account: null, fresh: true })
    expect(svc.aweme).toHaveBeenCalledWith(ID1, { account: 'acc1', fresh: true })
    expect(svc.aweme).toHaveBeenCalledTimes(5)
  })
})

describe('扫码登录和登录状态', () => {
  it('start_login 默认打开扫码窗口，进行中时不重复打开，结束后可以再开', async () => {
    const gate = deferred()
    deps.controller.login.mockImplementation(() => gate.promise)
    expect(await call('douyin_start_login')).toEqual({ started: true, hint: t('mcpDouyin.loginStarted') })
    await call('douyin_start_login', { method: 'qr' })
    expect(deps.controller.login).toHaveBeenCalledTimes(1)
    expect((await call('douyin_get_login_status')).login_window_open).toBe(true)
    gate.resolve()
    await settle()
    expect((await call('douyin_get_login_status')).login_window_open).toBe(false)
    await call('douyin_start_login')
    expect(deps.controller.login).toHaveBeenCalledTimes(2)
    expect(deps.controller.importBrowser).not.toHaveBeenCalled()
  })

  it('wait_seconds 等到登录完成就返回', async () => {
    const gate = deferred()
    deps.controller.login.mockImplementation(() => gate.promise)
    snap = { accounts: [] }
    sleep.mockImplementation(() => new Promise<void>(() => {}))
    await call('douyin_start_login')
    const waiting = call('douyin_get_login_status', { wait_seconds: 30 })
    snap = { current: 'acc1', accounts: [account('acc1')] }
    gate.resolve()
    expect(await waiting).toMatchObject({ logged_in: true, login_window_open: false, account: { account_id: 'acc1', current: true } })
    expect(sleep).toHaveBeenCalledWith(30_000)
  })

  it('等到时间还没完成时返回窗口仍开着', async () => {
    deps.controller.login.mockImplementation(() => new Promise(() => {}))
    await call('douyin_start_login')
    const r = await call('douyin_get_login_status', { wait_seconds: 5 })
    expect(sleep).toHaveBeenCalledWith(5000)
    expect(r.login_window_open).toBe(true)
    expect(r.login_error).toBeUndefined()
  })

  it('没发起登录、已经结束或不要求等时不等', async () => {
    await call('douyin_get_login_status', { wait_seconds: 5 })
    await call('douyin_start_login')
    await settle()
    await call('douyin_get_login_status', { wait_seconds: 5 })
    deps.controller.login.mockImplementation(() => new Promise(() => {}))
    await call('douyin_start_login')
    await call('douyin_get_login_status', { wait_seconds: 0 })
    await call('douyin_get_login_status')
    expect(sleep).not.toHaveBeenCalled()
  })

  it.each([
    ['错误对象', new Error('确认身份失败')],
    ['其他值', '确认身份失败']
  ])('登录出错（%s）时在状态里给出原因', async (_name, error) => {
    deps.controller.login.mockRejectedValueOnce(error)
    await call('douyin_start_login')
    await settle()
    const r = await call('douyin_get_login_status')
    expect(r).toMatchObject({ login_window_open: false, login_error: '确认身份失败' })
  })

  it('不传 sleep 时用定时器等待', async () => {
    vi.useFakeTimers()
    tools = new DouyinTools(deps, hooks)
    deps.controller.login.mockImplementation(() => new Promise(() => {}))
    await call('douyin_start_login')
    const done = vi.fn()
    void call('douyin_get_login_status', { wait_seconds: 3 }).then(done)
    await vi.advanceTimersByTimeAsync(2999)
    expect(done).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toHaveBeenCalledWith(expect.objectContaining({ login_window_open: true }))
  })

  it('状态里显示当前账号，按需列出浏览器', async () => {
    expect(await call('douyin_get_login_status')).toEqual({
      logged_in: true,
      account: { account_id: 'acc1', name: '名字acc1', handle: 'dy_acc1', status: 'ready', current: true },
      login_window_open: false,
      login_error: undefined,
      browsers: undefined
    })
    snap.current = 'acc2'
    const r = await call('douyin_get_login_status', { include_browsers: true })
    expect(r.logged_in).toBe(false)
    expect(r.account.status).toBe('expired')
    expect(r.browsers[0]).toEqual({ id: 'p1', browser: 'Chrome', profile: 'p1', has_douyin_login: false })
    expect(r.browsers[2]).toMatchObject({ has_douyin_login: true, locked: true })
    expect(r.browsers[3]).toMatchObject({ blocked: true })
    snap = { accounts: [] }
    expect(await call('douyin_get_login_status')).toMatchObject({ logged_in: false, account: null })
    await fails('douyin_get_login_status', { wait_seconds: 61 })
    await fails('douyin_get_login_status', { include_browsers: 'yes' })
  })
})

describe('从浏览器导入登录', () => {
  it('默认用第一个可导入的配置档', async () => {
    const r = await call('douyin_start_login', { method: 'browser' })
    expect(deps.controller.importBrowser).toHaveBeenCalledWith('p5')
    expect(r).toEqual({
      imported: true,
      account: { account_id: 'from-p5', name: '名字from-p5', handle: 'dy_from-p5', status: 'ready', current: true },
      hint: t('mcpDouyin.loginDone')
    })
    expect(deps.controller.login).not.toHaveBeenCalled()
  })

  it('指定配置档', async () => {
    await call('douyin_start_login', { method: 'browser', browser_profile_id: 'p3' })
    expect(deps.controller.importBrowser).toHaveBeenCalledWith('p3')
  })

  it('导入后没有当前账号时不返回账号', async () => {
    deps.controller.importBrowser.mockResolvedValueOnce({ accounts: [] })
    const r = await call('douyin_start_login', { method: 'browser' })
    expect(r.imported).toBe(true)
    expect(r.account).toBeUndefined()
  })

  it('找不到配置档或没有可导入的登录时返回浏览器列表', async () => {
    const r = await call('douyin_start_login', { method: 'browser', browser_profile_id: 'zz' })
    expect(r).toMatchObject({ imported: false, hint: t('mcpDouyin.profileNotFound') })
    expect(r.browsers.map((b: any) => b.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
    browsers = browsers.slice(0, 4)
    const none = await call('douyin_start_login', { method: 'browser' })
    expect(none).toMatchObject({ imported: false, hint: t('mcpDouyin.noBrowserLogin') })
    expect(deps.controller.importBrowser).not.toHaveBeenCalled()
  })

  it('导入出错时原样抛出；method 不对时报错', async () => {
    deps.controller.importBrowser.mockRejectedValueOnce(new Error('读取失败'))
    await expect(call('douyin_start_login', { method: 'browser' })).rejects.toThrow('读取失败')
    await fails('douyin_start_login', { method: 'cookie' })
  })
})

describe('账号', () => {
  it('list_accounts 列出账号和当前账号', async () => {
    const r = await call('douyin_list_accounts')
    expect(r.current_account_id).toBe('acc1')
    expect(r.accounts.map((a: any) => [a.account_id, a.status, a.current])).toEqual([['acc1', 'ready', true], ['acc2', 'expired', false], ['acc3', 'ready', false]])
    snap = { accounts: [] }
    expect(await call('douyin_list_accounts')).toEqual({ current_account_id: null, accounts: [] })
  })

  it('switch_account：null 表示不登录，不存在的报 NOT_FOUND，别的类型报参数错误', async () => {
    expect((await call('douyin_switch_account', { account_id: 'acc3' })).current_account_id).toBe('acc3')
    expect(deps.accounts.select).toHaveBeenLastCalledWith('acc3')
    expect((await call('douyin_switch_account', { account_id: null })).current_account_id).toBeNull()
    expect(deps.accounts.select).toHaveBeenLastCalledWith(undefined)
    const e = await fails('douyin_switch_account', { account_id: 'zz' }, 'NOT_FOUND')
    expect(e.hint).toBe(t('mcpDouyin.listAccountsHint'))
    expect((await fails('douyin_switch_account', { account_id: 5 })).message).toBe(t('mcpDouyin.accountIdRequired'))
    await fails('douyin_switch_account', {})
    expect(deps.accounts.select).toHaveBeenCalledTimes(2)
  })

  it('logout_account：用户拒绝时不移除，同意后移除', async () => {
    deps.confirmRemove.mockResolvedValueOnce(false)
    expect(await call('douyin_logout_account', { account_id: 'acc2' })).toEqual({ removed: false, hint: t('mcpDouyin.logoutDeclined') })
    expect(deps.confirmRemove).toHaveBeenCalledWith('名字acc2')
    expect(deps.accounts.remove).not.toHaveBeenCalled()
    const r = await call('douyin_logout_account', { account_id: 'acc2' })
    expect(r.removed).toBe(true)
    expect(r.accounts.map((a: any) => a.account_id)).toEqual(['acc1', 'acc3'])
    expect(deps.accounts.remove).toHaveBeenCalledWith('acc2')
    await fails('douyin_logout_account', { account_id: 'zz' }, 'NOT_FOUND')
    await fails('douyin_logout_account', {})
    expect(deps.confirmRemove).toHaveBeenCalledTimes(2)
  })
})

describe('douyin_open_verification', () => {
  it('没有要验证的时不开窗口', async () => {
    states = [{ account: 'acc1', state: 'cooling', until: 1 }]
    expect(await call('douyin_open_verification', { wait_seconds: 5 })).toEqual({ needed: false, hint: t('mcpDouyin.verifyNone') })
    expect(deps.controller.verify).not.toHaveBeenCalled()
  })

  it('给需要验证的账号开窗口（不登录时是 null），不等时先返回', async () => {
    states = [{ account: null, state: 'verify' }]
    deps.controller.verify.mockImplementation(() => new Promise(() => {}))
    const r = await call('douyin_open_verification')
    expect(deps.controller.verify).toHaveBeenCalledWith(null)
    expect(r).toEqual({
      needed: true,
      completed: false,
      error: undefined,
      account_states: [{ account_id: null, state: 'verify', until: undefined }],
      hint: t('mcpDouyin.verifyStarted')
    })
    expect(sleep).not.toHaveBeenCalled()
  })

  it('进行中再次调用时接着等同一个窗口，完成后返回新的状态', async () => {
    states = [{ account: 'acc1', state: 'verify' }]
    const gate = deferred()
    deps.controller.verify.mockImplementation(() => gate.promise)
    sleep.mockImplementation(() => new Promise<void>(() => {}))
    await call('douyin_open_verification')
    // 验证状态已经消失也继续等原来那次
    states = []
    const waiting = call('douyin_open_verification', { wait_seconds: 60 })
    gate.resolve()
    expect(await waiting).toMatchObject({ needed: true, completed: true, account_states: [], hint: t('mcpDouyin.verifyDone') })
    expect(deps.controller.verify).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith(60_000)
    expect(await call('douyin_open_verification')).toMatchObject({ needed: false })
  })

  it.each([
    ['错误对象', new Error('窗口被关掉')],
    ['其他值', '窗口被关掉']
  ])('验证失败（%s）时给出原因，下次重新开窗口', async (_name, error) => {
    states = [{ account: 'acc1', state: 'verify' }]
    deps.controller.verify.mockRejectedValueOnce(error)
    sleep.mockImplementation(() => new Promise<void>(() => {}))
    const r = await call('douyin_open_verification', { wait_seconds: 5 })
    expect(r).toMatchObject({ needed: true, completed: false, error: '窗口被关掉' })
    const again = await call('douyin_open_verification', { wait_seconds: 5 })
    expect(deps.controller.verify).toHaveBeenCalledTimes(2)
    expect(again).toMatchObject({ completed: true, error: undefined })
  })

  it('wait_seconds 超出范围时报错', async () => {
    states = [{ account: 'acc1', state: 'verify' }]
    await fails('douyin_open_verification', { wait_seconds: 61 })
  })
})
