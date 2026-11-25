import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { setLanguage, t, translate } from '@shared/i18n'
import { DEFAULT_OPTIONS, DEFAULT_YT_OPTIONS, normalizeYtOptions } from '@shared/options'
import { ytKey } from '@shared/site'
import type { BrowserProfile, DownloadOptions, MediaItem, ParseResult, Settings, YtAccount, YtAccountsSnapshot, YtEngineStatus, YtOptions } from '@shared/types'
import { parseYtInput } from '@shared/ytUrl'
import { makeTask, mediaItem } from '../../test/fakeQueue'
import { listResult, videoResult } from '../youtube/resolve'
import { searchUrl } from '../youtube/lookup'
import type { YoutubeService } from '../youtube/service'
import type { YtFlatEntry, YtPlaylistInfo, YtVideoInfo } from '../youtube/types'
import type { Batch, NewBatch } from './batches'
import { ToolError } from './format'

// 翻页本身在 lists.test.ts 里测；这里只关心工具怎么用翻页结果
vi.mock('../bili/lists', () => ({ loadAllPages: vi.fn() }))
const { loadAllPages } = await import('../bili/lists')
const { definitions, parseYtArgs, videoId, ytOptionsOut, YoutubeTools } = await import('./youtubeTools')
type Deps = import('./youtubeTools').YoutubeMcpDeps
type Fn = Mock<(...args: any[]) => any>

const fixture = <T>(name: string): T => JSON.parse(readFileSync(join(__dirname, '../youtube/__fixtures__', name), 'utf8')) as T
const VIDEO = fixture<YtVideoInfo>('video.json')
const PLAYLIST = fixture<YtPlaylistInfo>('playlist.json')
const CHANNEL = fixture<YtPlaylistInfo>('channel.json')
const CHANNEL_PL = fixture<YtPlaylistInfo>('channel_playlists.json')
const SEARCH = fixture<YtPlaylistInfo>('search.json')
const SEARCH_CH = fixture<YtPlaylistInfo>('search_channels.json')

const RICK = 'dQw4w9WgXcQ'
const ZOO = 'jNQXAC9IVRw'
const PL_URL = 'https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI'
const PL_IDS = PLAYLIST.entries!.map((e) => e.id)

const ok = (v: unknown) => ({ stdout: `[debug] 前面的行\n${JSON.stringify(v)}\n`, stderr: '' })
const entry = (id: string, over: Partial<YtFlatEntry> = {}): YtFlatEntry => ({ id, title: id, url: `https://www.youtube.com/watch?v=${id}`, ...over })
const plInfo = (entries: YtFlatEntry[]): YtPlaylistInfo => ({ id: 'PLtest00', title: '测试列表', entries } as YtPlaylistInfo)

/** 按链接给出解析结果，和真实的 YoutubeService.parse 一样：不是 YouTube 链接时返回空 */
const parseFake = async (url: string): Promise<ParseResult | undefined> => {
  const target = parseYtInput(url)
  if (!target) return undefined
  if (target.type === 'video') return videoResult(target.id === RICK ? VIDEO : { ...VIDEO, id: target.id, title: `视频 ${target.id}` })
  if (target.type === 'playlist') return listResult(PLAYLIST, target, url)
  if (target.type === 'channel' && target.tab === 'playlists') return listResult(CHANNEL_PL, target, url)
  return listResult(CHANNEL, target, url)
}

let searchOut: unknown
let commentsOut: unknown
let vtt: string | undefined
let svc: {
  parse: Fn
  info: Fn
  expand: Fn
  exec: Fn
  currentAccount: Fn
}
let snap: YtAccountsSnapshot
let engine: YtEngineStatus
let browsers: BrowserProfile[]
let history: string[]
let tasks: ReturnType<typeof makeTask>[]
let settings: Settings
let deps: Deps & {
  engine: { status: Fn; ensure: Fn; checkUpdate: Fn }
  accounts: { snapshot: Fn; select: Fn; check: Fn; remove: Fn }
  importBrowser: Fn
  confirmRemove: Fn
  proxy: Fn
}
let hooks: { findDuplicate: Fn; submit: Fn; deduplicated: Fn }
let tools: InstanceType<typeof YoutubeTools>

const account = (id: string, over: Partial<YtAccount> = {}): YtAccount => ({ id, name: `名字${id}`, handle: `@${id}`, addedAt: 1, status: 'ready', ...over })
const profile = (id: string, over: Partial<BrowserProfile> = {}): BrowserProfile => ({ id, browser: 'Chrome', profile: id, hasBiliLogin: true, ...over })
const ytTask = (id: string, key: string, status: 'queued' | 'done' | 'waitingAuth' = 'queued') =>
  makeTask(id, { item: mediaItem(key, { kind: 'youtube', cid: 0 }), status })

const call = (name: string, args: Record<string, unknown> = {}): Promise<any> => tools.call(name, args)
const fails = async (name: string, args: Record<string, unknown>, code = 'INVALID_ARGS'): Promise<ToolError> => {
  const e = await call(name, args).then(() => undefined, (err: unknown) => err)
  expect(e).toBeInstanceOf(ToolError)
  expect((e as ToolError).code).toBe(code)
  return e as ToolError
}
const submitted = (): NewBatch => hooks.submit.mock.calls.at(-1)![0] as NewBatch

beforeEach(() => {
  vi.mocked(loadAllPages).mockReset()
  vi.mocked(loadAllPages).mockImplementation(async (r) => ({ result: r, complete: !r.paging?.hasMore }))
  searchOut = SEARCH
  commentsOut = { comments: [], comment_count: 0 }
  vtt = undefined
  svc = {
    parse: vi.fn(parseFake),
    info: vi.fn(async (url: string) => (url.endsWith(RICK) ? VIDEO : { ...VIDEO, id: url.slice(-11), title: `视频 ${url.slice(-11)}` })),
    expand: vi.fn(async (items: MediaItem[]) => items),
    exec: vi.fn(async (args: string[]) => {
      if (args.includes('--write-comments')) return ok(commentsOut)
      if (args.includes('--sub-format')) {
        if (vtt !== undefined) await writeFile(join(args[args.indexOf('-P') + 1], 'sub.x.vtt'), vtt)
        return { stdout: '', stderr: '' }
      }
      return ok(searchOut)
    }),
    currentAccount: vi.fn(() => 'acc1')
  }
  snap = { current: 'acc1', accounts: [account('acc1'), account('acc2', { status: 'expired' }), account('acc3', { status: 'unchecked' })] }
  engine = { state: 'ready', version: '2026.01.01', latest: '2026.01.01' }
  browsers = [profile('p1', { hasBiliLogin: false }), profile('p2', { appBoundLogin: true }), profile('p3', { locked: true }), profile('p4')]
  history = []
  tasks = []
  settings = {
    youtube: {
      downloadDir: '/dl/yt',
      defaultQn: 0,
      concurrency: 3,
      defaults: { ...DEFAULT_OPTIONS, yt: { ...DEFAULT_YT_OPTIONS } },
      autoUpdate: true
    }
  } as Settings
  deps = {
    service: () => svc as unknown as YoutubeService,
    engine: {
      status: vi.fn(() => engine),
      ensure: vi.fn(async () => {
        engine = { state: 'ready', version: '2026.02.02' }
        return '/bin/yt-dlp'
      }),
      checkUpdate: vi.fn(async () => engine)
    },
    accounts: {
      snapshot: vi.fn(() => snap),
      select: vi.fn((id: string | undefined) => {
        snap = { ...snap, current: id }
      }),
      check: vi.fn(async (id: string) => account(id)),
      remove: vi.fn((id: string) => {
        snap = { ...snap, accounts: snap.accounts.filter((a) => a.id !== id) }
      })
    },
    listBrowsers: () => browsers,
    importBrowser: vi.fn(async (id: string) => account(`from-${id}`)),
    confirmRemove: vi.fn(async () => true),
    queue: { list: () => tasks },
    settings: () => settings,
    downloadedKeys: () => history,
    proxy: vi.fn(async () => 'http://127.0.0.1:7890')
  }
  hooks = {
    findDuplicate: vi.fn((): Batch | undefined => undefined),
    submit: vi.fn((n: NewBatch) => ({ batch_id: 'b1', selected: n.items.length })),
    deduplicated: vi.fn((b: Batch) => ({ batch_id: b.id, deduplicated: true }))
  }
  tools = new YoutubeTools(deps, hooks, { gapMs: 0 })
})

afterEach(() => {
  setLanguage('zh-CN')
})

describe('definitions', () => {
  it('15 个 youtube_ 工具，顺序固定，都有标题、说明、参数和注解', () => {
    const defs = definitions()
    expect(defs.map((d) => d.name)).toEqual([
      'youtube_get_status',
      'youtube_parse_link',
      'youtube_download_batch',
      'youtube_search_videos',
      'youtube_search_channels',
      'youtube_get_video_info',
      'youtube_get_video_transcript',
      'youtube_get_video_comments',
      'youtube_get_download_quality',
      'youtube_start_login',
      'youtube_get_login_status',
      'youtube_list_accounts',
      'youtube_switch_account',
      'youtube_logout_account',
      'youtube_update_engine'
    ])
    for (const d of defs) {
      expect(d.title).toBeTruthy()
      expect(d.description).toBeTruthy()
      expect(d.annotations).toBeTruthy()
      expect(d.inputSchema.type).toBe('object')
      expect(tools.handles(d.name)).toBe(true)
    }
    const download = defs.find((d) => d.name === 'youtube_download_batch')!
    expect((download.inputSchema.properties as Record<string, any>).options.additionalProperties).toBe(false)
  })

  it('描述按当前界面语言现算', () => {
    const zh = definitions()[0]
    setLanguage('en')
    const en = definitions()[0]
    expect(zh.title).toBe(translate('zh-CN', 'mcpYoutube.statusTitle'))
    expect(en.title).toBe(translate('en', 'mcpYoutube.statusTitle'))
    expect(en.description).toBe(translate('en', 'mcpYoutube.statusDesc'))
    expect(en.title).not.toBe(zh.title)
  })

  it('handles 只认自己的工具，不认原型链上的名字', () => {
    expect(tools.handles('get_status')).toBe(false)
    expect(tools.handles('toString')).toBe(false)
    expect(tools.handles('constructor')).toBe(false)
  })
})

describe('videoId', () => {
  it('认 11 位 id、视频链接、短链和播放列表里的视频', () => {
    expect(videoId(` ${RICK} `)).toBe(RICK)
    expect(videoId(`https://www.youtube.com/watch?v=${RICK}`)).toBe(RICK)
    expect(videoId(`https://youtu.be/${RICK}`)).toBe(RICK)
    expect(videoId(`https://www.youtube.com/watch?v=${RICK}&list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI`)).toBe(RICK)
  })

  it('播放列表、频道和别的网站报参数错误，输入截到 100 字', () => {
    for (const bad of [PL_URL, 'https://www.youtube.com/@google', 'https://www.bilibili.com/video/BV1xx411c7mD', 'abc']) {
      expect(() => videoId(bad)).toThrow(ToolError)
    }
    const long = `x${'y'.repeat(300)}`
    try {
      videoId(long)
    } catch (e) {
      expect((e as ToolError).code).toBe('INVALID_ARGS')
      expect((e as ToolError).message).toBe(t('mcpYoutube.badVideo', { input: long.slice(0, 100) }))
    }
  })
})

describe('parseYtArgs', () => {
  const base = (yt: Partial<YtOptions> = {}): Omit<DownloadOptions, 'qn'> & { yt: YtOptions } => ({ ...DEFAULT_OPTIONS, yt: normalizeYtOptions(yt) })

  it('没传时原样返回', () => {
    const b = base()
    expect(parseYtArgs(undefined, b)).toBe(b)
    expect(parseYtArgs(null, b)).toBe(b)
  })

  it('不是对象时报错', () => {
    for (const raw of ['x', 1, [], true]) expect(() => parseYtArgs(raw, base())).toThrow(t('mcpYoutube.badOptions'))
  })

  it('不认识的字段报错，并列出可用字段', () => {
    expect(() => parseYtArgs({ danmaku: true, foo: 1, hdr: true }, base())).toThrow(/danmaku, foo/)
  })

  it('枚举值不对时报错', () => {
    expect(() => parseYtArgs({ container: 'avi' }, base())).toThrow(t('mcpYoutube.badOption', { key: 'container', allowed: 'mp4 / mkv / webm' }))
    expect(() => parseYtArgs({ audio: 'flac' }, base())).toThrow(/audio/)
    expect(() => parseYtArgs({ output: 'all' }, base())).toThrow(/output/)
  })

  it('各字段换成下载选项，sponsorblock 的布尔值换成 mark / off', () => {
    const o = parseYtArgs(
      {
        output: 'audio',
        container: 'webm',
        codec_order: ['av1'],
        audio: 'opus',
        hdr: true,
        subtitles: true,
        embed_subtitles: true,
        subtitle_langs: ['en', 'zh-Hans', 'bad lang'],
        auto_subs: true,
        cover: false,
        embed_cover: false,
        chapters: false,
        sponsorblock: true,
        nfo: true
      },
      base()
    )
    expect(o).toMatchObject({ output: 'audio', subtitle: true, embedSubtitle: true, cover: false, embedCover: false, chapters: false, nfo: true })
    expect(o.yt).toEqual({ codecOrder: ['av1', 'avc', 'vp9'], audio: 'opus', container: 'webm', subtitleLangs: ['en', 'zh-Hans'], autoSubs: true, sponsorblock: 'mark', hdr: true })
    expect(parseYtArgs({ sponsorblock: false }, base({ sponsorblock: 'mark' })).yt.sponsorblock).toBe('off')
  })

  it('没传的字段和类型不对的布尔值沿用默认', () => {
    const b = { ...base({ sponsorblock: 'mark', hdr: true, container: 'mkv', subtitleLangs: ['ja'] }), subtitle: true, nfo: true }
    const o = parseYtArgs({ hdr: 'yes', nfo: 1 }, b)
    expect(o.yt).toEqual(b.yt)
    expect(o.subtitle).toBe(true)
    expect(o.nfo).toBe(true)
    expect(o.output).toBe(b.output)
  })
})

describe('ytOptionsOut', () => {
  it('下载选项换回 agent 用的字段', () => {
    const o = { ...DEFAULT_OPTIONS, subtitle: true, yt: normalizeYtOptions({ sponsorblock: 'mark', container: 'mkv' }) }
    expect(ytOptionsOut(o)).toEqual({
      output: 'full',
      container: 'mkv',
      codec_order: ['avc', 'vp9', 'av1'],
      audio: 'best',
      hdr: false,
      subtitles: true,
      embed_subtitles: DEFAULT_OPTIONS.embedSubtitle,
      subtitle_langs: [],
      auto_subs: false,
      cover: DEFAULT_OPTIONS.cover,
      embed_cover: DEFAULT_OPTIONS.embedCover,
      chapters: DEFAULT_OPTIONS.chapters,
      sponsorblock: true,
      nfo: DEFAULT_OPTIONS.nfo
    })
  })

  it('没有 YouTube 选项时对应字段为空，sponsorblock 为 false', () => {
    const out = ytOptionsOut({ ...DEFAULT_OPTIONS })
    expect(out.container).toBeUndefined()
    expect(out.codec_order).toBeUndefined()
    expect(out.sponsorblock).toBe(false)
  })
})

describe('youtube_get_status', () => {
  it('一切正常时没有提示，只数 YouTube 的任务', async () => {
    tasks = [ytTask('t1', ytKey(RICK)), makeTask('t2'), ytTask('t3', ytKey(ZOO), 'done')]
    const r = await call('youtube_get_status')
    expect(r).toMatchObject({
      engine: { state: 'ready', version: '2026.01.01', latest: '2026.01.01' },
      login: { logged_in: true, account_id: 'acc1', name: '名字acc1', handle: '@acc1' },
      proxy: 'http://127.0.0.1:7890',
      queue: { total: 2, queued: 1, done: 1 },
      download_dir: '/dl/yt',
      settings: { concurrency: 3, default_quality: 'best', auto_update: true }
    })
    expect(r.hint).toBeUndefined()
  })

  it('组件没装、没登录、有等待登录的任务时都给提示；代理出错时为空', async () => {
    engine = { state: 'missing' }
    snap = { accounts: [] }
    deps.proxy.mockRejectedValue(new Error('x'))
    tasks = [ytTask('t1', ytKey(RICK), 'waitingAuth')]
    settings.youtube.defaultQn = 1080
    const r = await call('youtube_get_status')
    expect(r.login).toEqual({ logged_in: false })
    expect(r.proxy).toBeNull()
    expect(r.settings.default_quality).toBe(1080)
    expect(r.hint).toContain(t('mcpYoutube.hintEngine'))
    expect(r.hint).toContain(t('mcpYoutube.hintNoLogin'))
    expect(r.hint).toContain(t('mcpYoutube.hintWaitingAuth', { count: 1 }))
  })

  it('组件有新版本、当前登录失效时提示更新和重新导入；没有代理时为空', async () => {
    engine = { state: 'ready', version: '1', latest: '2' }
    snap = { current: 'acc2', accounts: snap.accounts }
    deps.proxy.mockResolvedValue('')
    const r = await call('youtube_get_status')
    expect(r.login).toMatchObject({ logged_in: false, account_id: 'acc2' })
    expect(r.proxy).toBeNull()
    expect(r.hint).toContain(t('mcpYoutube.hintEngineUpdate'))
    expect(r.hint).toContain(t('mcpYoutube.hintExpired'))
  })

  it('不知道最新版本时不提示更新', async () => {
    engine = { state: 'ready', version: '1' }
    expect((await call('youtube_get_status')).hint).toBeUndefined()
  })
})

describe('youtube_parse_link', () => {
  it('分段返回条目，标出下载过和排队中的，列表没读完时提示', async () => {
    history = [ytKey(PL_IDS[0])]
    tasks = [ytTask('t1', ytKey(PL_IDS[1])), ytTask('t2', ytKey(PL_IDS[2]), 'done')]
    const r = await call('youtube_parse_link', { url: PL_URL, limit: 3 })
    expect(r).toMatchObject({ title: 'Popular Music Videos', total: 182, fetched: 5, complete: false, offset: 0, limit: 3, next_offset: 3 })
    expect(r.content_notice).toBe(t('mcpYoutube.contentNotice'))
    expect(r.items.map((i: any) => i.id)).toEqual(PL_IDS.slice(0, 3))
    expect(r.items[0]).toMatchObject({ index: 1, channel: 'Peso Pluma', duration: 235, downloaded: true })
    expect(r.items[0].queued).toBeUndefined()
    expect(r.items[1]).toMatchObject({ queued: true })
    expect(r.items[1].downloaded).toBeUndefined()
    expect(r.items[2].queued).toBeUndefined()
    expect(r.hint).toContain(t('mcpYoutube.truncated', { count: 5 }))
    expect(r.hint).toContain(t('mcpTools.moreItems', { next: 3 }))
    expect(loadAllPages).toHaveBeenCalledWith(expect.objectContaining({ input: PL_URL }), { maxItems: 200, interval: 300 })

    const rest = await call('youtube_parse_link', { url: PL_URL, offset: 3, limit: 3 })
    expect(rest.items.map((i: any) => i.id)).toEqual(PL_IDS.slice(3))
    expect(rest.next_offset).toBeNull()
  })

  it('翻页出错时提示错误和已拿到的条数', async () => {
    vi.mocked(loadAllPages).mockImplementationOnce(async (r) => ({ result: r, complete: false, error: '网络错误' }))
    const r = await call('youtube_parse_link', { url: PL_URL, max_items: 10 })
    expect(r.hint).toBe(t('mcpTools.pageError', { error: '网络错误', count: 5 }))
  })

  it('单个视频带发布时间，没有翻页时总数就是条数', async () => {
    const r = await call('youtube_parse_link', { url: `https://youtu.be/${RICK}` })
    expect(r).toMatchObject({ total: 1, fetched: 1, complete: true, next_offset: null })
    expect(r.items[0]).toMatchObject({ id: RICK, published: new Date(VIDEO.timestamp! * 1000).toISOString() })
    expect(r.hint).toBeUndefined()
  })

  it('频道的播放列表页：条目标成播放列表并提示', async () => {
    const r = await call('youtube_parse_link', { url: 'https://www.youtube.com/@google/playlists' })
    expect(r.items).toHaveLength(3)
    expect(r.items[0]).toMatchObject({ id: 'ytpl:PLAeFjVYtuU34', playlist: {} })
    expect(r.items[0].published).toBeUndefined()
    expect(r.hint).toBe(t('mcpYoutube.playlistItems'))
  })

  it('结果缓存，refresh 时重新解析；换了账号也重新解析', async () => {
    await call('youtube_parse_link', { url: PL_URL })
    await call('youtube_parse_link', { url: PL_URL, offset: 2 })
    expect(svc.parse).toHaveBeenCalledTimes(1)
    await call('youtube_parse_link', { url: PL_URL, refresh: true })
    expect(svc.parse).toHaveBeenCalledTimes(2)
    svc.currentAccount.mockReturnValue(undefined)
    await call('youtube_parse_link', { url: PL_URL })
    expect(svc.parse).toHaveBeenCalledTimes(3)
  })

  it('不是 YouTube 链接时报参数错误，失败的不缓存', async () => {
    const e = await fails('youtube_parse_link', { url: 'https://www.bilibili.com/video/BV1xx411c7mD' })
    expect(e.message).toBe(t('mcpYoutube.notYoutube', { url: 'https://www.bilibili.com/video/BV1xx411c7mD' }))
    await fails('youtube_parse_link', { url: 'https://www.bilibili.com/video/BV1xx411c7mD' })
    expect(svc.parse).toHaveBeenCalledTimes(2)
    await fails('youtube_parse_link', {})
  })
})

describe('youtube_download_batch：url', () => {
  it('单个视频直接下载，带上当前账号、YouTube 下载目录和选项', async () => {
    const r = await call('youtube_download_batch', { url: `https://www.youtube.com/watch?v=${RICK}`, quality: 1080, subdir: 'music', options: { container: 'mkv' }, request_id: 'r1' })
    expect(r).toMatchObject({ batch_id: 'b1', selected: 1, logged_in: true })
    expect(r.unknown_ids).toBeUndefined()
    expect(r.hint).toBe(t('mcpTools.checkProgress', { id: 'b1' }))
    const n = submitted()
    expect(n).toMatchObject({
      requestId: 'r1',
      url: `https://www.youtube.com/watch?v=${RICK}`,
      title: VIDEO.title,
      kind: 'youtube',
      dir: join('/dl/yt', 'music'),
      skipDownloaded: true,
      skipped: { downloaded: 0, unavailable: 0 },
      ytAccount: 'acc1'
    })
    expect(n.options.qn).toBe(1080)
    expect(n.options.yt?.container).toBe('mkv')
    expect(n.items.map((i) => i.key)).toEqual([ytKey(RICK)])
    expect(n.meta?.url).toBeTruthy()
    expect(hooks.findDuplicate).toHaveBeenCalledWith('r1', expect.stringMatching(/^[0-9a-f]{64}$/))
  })

  it('没登录时 ytAccount 为空，画质默认用设置里的', async () => {
    svc.currentAccount.mockReturnValue(undefined)
    settings.youtube.defaultQn = 720
    const r = await call('youtube_download_batch', { url: RICK.length ? `https://youtu.be/${RICK}` : '' })
    expect(r.logged_in).toBe(false)
    expect(submitted().ytAccount).toBeUndefined()
    expect(submitted().options.qn).toBe(720)
    expect(submitted().dir).toBe('/dl/yt')
  })

  it('分页的列表要传 ids 或 all', async () => {
    const e = await fails('youtube_download_batch', { url: PL_URL })
    expect(e.message).toBe(t('mcpYoutube.pagedList', { total: 182 }))
    await fails('youtube_download_batch', { url: PL_URL, ids: [PL_IDS[0]], all: true })
    await fails('youtube_download_batch', { url: 'https://www.bilibili.com/video/BV1xx411c7mD' })
    await fails('youtube_download_batch', {})
  })

  it('分页列表总数为 0 时按已读到的条数提示', async () => {
    svc.parse.mockImplementationOnce(async (url: string) => {
      const r = listResult(PLAYLIST, parseYtInput(url)!, url)
      return { ...r, paging: { ...r.paging!, total: 0 } }
    })
    const e = await fails('youtube_download_batch', { url: PL_URL })
    expect(e.message).toBe(t('mcpYoutube.pagedList', { total: 5 }))
  })

  it('ids 按视频 id 或条目 key 选，不认识的忽略并提示', async () => {
    const r = await call('youtube_download_batch', { url: PL_URL, ids: [PL_IDS[0], ytKey(PL_IDS[1]), PL_IDS[0], 'nope'] })
    expect(r.unknown_ids).toEqual(['nope'])
    expect(r.hint).toContain(t('mcpTools.unknownIds', { count: 1 }))
    expect(submitted().items.map((i) => i.ytId)).toEqual(PL_IDS.slice(0, 2))
    expect(submitted().title).toBe('Popular Music Videos')
    const e = await fails('youtube_download_batch', { url: PL_URL, ids: ['a', 'b'] })
    expect(e.message).toBe(t('mcpTools.idsNone', { examples: 'a、b' }))
  })

  it('all 下载已读到的全部，默认跳过下载过的', async () => {
    history = [ytKey(PL_IDS[0]), ytKey(PL_IDS[1])]
    const r = await call('youtube_download_batch', { url: PL_URL, all: true, max_items: 50 })
    expect(r.selected).toBe(3)
    expect(submitted().skipped).toEqual({ downloaded: 2, unavailable: 0 })
    await call('youtube_download_batch', { url: PL_URL, all: true, skip_downloaded: false })
    expect(submitted().items).toHaveLength(5)
    expect(svc.expand).not.toHaveBeenCalled()
  })

  it('全部下载过时不提交，batch_id 为空', async () => {
    history = PL_IDS.map(ytKey)
    const r = await call('youtube_download_batch', { url: PL_URL, all: true })
    expect(r).toEqual({ batch_id: null, title: 'Popular Music Videos', selected: 0, skipped: { downloaded: 5, unavailable: 0 }, hint: t('mcpTools.allDownloaded') })
    expect(hooks.submit).not.toHaveBeenCalled()
  })

  it('没有列表分页时选默认条目，下不了的不算；都下不了时提示没有可下载的', async () => {
    const url = 'https://www.youtube.com/playlist?list=PLtest00'
    svc.parse.mockImplementation(async (u: string) =>
      listResult(plInfo([entry('aaaaaaaaaaa', { title: '[Private video]' }), entry('bbbbbbbbbbb', { live_status: 'is_upcoming' })]), parseYtInput(u)!, u))
    const r = await call('youtube_download_batch', { url, all: true, ids: ['zzz'] }).catch((e: ToolError) => e)
    expect(r).toBeInstanceOf(ToolError)
    const out = await call('youtube_download_batch', { url, all: true })
    expect(out).toMatchObject({ batch_id: null, selected: 0, skipped: { downloaded: 0, unavailable: 2 }, hint: t('mcpTools.nothingToDownload') })
    const ids = await call('youtube_download_batch', { url, ids: ['aaaaaaaaaaa', 'nope'] })
    expect(ids.unknown_ids).toEqual(['nope'])
    const def = await call('youtube_download_batch', { url })
    expect(def.batch_id).toBeNull()
  })

  it('默认选择会排除下不了的', async () => {
    const url = 'https://www.youtube.com/playlist?list=PLtest00'
    svc.parse.mockImplementation(async (u: string) =>
      listResult(plInfo([entry('aaaaaaaaaaa'), entry('bbbbbbbbbbb', { title: '[Deleted video]' })]), parseYtInput(u)!, u))
    await call('youtube_download_batch', { url })
    expect(submitted().items.map((i) => i.ytId)).toEqual(['aaaaaaaaaaa'])
  })

  it('播放列表项先展开成视频，展开失败的计数并提示', async () => {
    svc.expand.mockImplementation(async (items: MediaItem[]) => [
      { ...mediaItem(ytKey('aaaaaaaaaaa'), { kind: 'youtube', ytId: 'aaaaaaaaaaa', cid: 0 }) },
      { ...items[1], lazy: false, unavailable: '展开失败' },
      { ...mediaItem(ytKey('ccccccccccc'), { kind: 'youtube', ytId: 'ccccccccccc', cid: 0 }) }
    ])
    const r = await call('youtube_download_batch', { url: 'https://www.youtube.com/@google/playlists', all: true })
    expect(svc.expand).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ lazy: true })]))
    expect(r.hint).toContain(t('mcpYoutube.expandFailed', { count: 1 }))
    expect(submitted().items.map((i) => i.ytId)).toEqual(['aaaaaaaaaaa', 'ccccccccccc'])
    expect(submitted().skipped).toEqual({ downloaded: 0, unavailable: 1 })
  })

  it('重复提交时返回原来的批次', async () => {
    hooks.findDuplicate.mockReturnValue({ id: 'old' } as Batch)
    const r = await call('youtube_download_batch', { url: `https://youtu.be/${RICK}` })
    expect(r).toEqual({ batch_id: 'old', deduplicated: true })
    expect(hooks.submit).not.toHaveBeenCalled()
  })

  it('同样的请求指纹相同，选项不同指纹不同', async () => {
    await call('youtube_download_batch', { url: `https://youtu.be/${RICK}` })
    await call('youtube_download_batch', { url: `https://www.youtube.com/watch?v=${RICK}` })
    await call('youtube_download_batch', { url: `https://youtu.be/${RICK}`, options: { hdr: true } })
    const [a, b, c] = hooks.findDuplicate.mock.calls.map((x) => x[1])
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe('youtube_download_batch：videos', () => {
  it('多个视频：去重，认不出的放进 unknown_ids，用固定的中文标题', async () => {
    setLanguage('en')
    const r = await call('youtube_download_batch', { videos: [RICK, `https://youtu.be/${RICK}`, 'bad', `https://www.youtube.com/watch?v=${ZOO}`, 'bad'] })
    expect(r.unknown_ids).toEqual(['bad'])
    expect(svc.info).not.toHaveBeenCalled()
    const n = submitted()
    expect(n.title).toBe(translate('zh-CN', 'mcpTools.videosTitle', { count: 2 }))
    expect(n.url).toBe('')
    expect(n.cover).toBe('')
    expect(n.items).toEqual([
      { key: ytKey(RICK), kind: 'youtube', title: RICK, index: 1, cid: 0, ytId: RICK, cover: `https://i.ytimg.com/vi/${RICK}/hqdefault.jpg`, duration: undefined },
      { key: ytKey(ZOO), kind: 'youtube', title: ZOO, index: 2, cid: 0, ytId: ZOO, cover: `https://i.ytimg.com/vi/${ZOO}/hqdefault.jpg`, duration: undefined }
    ])
  })

  it('只有一个视频时取它的标题、封面和时长；可以自定义标题', async () => {
    await call('youtube_download_batch', { videos: RICK })
    expect(svc.info).toHaveBeenCalledWith(`https://www.youtube.com/watch?v=${RICK}`)
    expect(submitted()).toMatchObject({ title: VIDEO.title, cover: VIDEO.thumbnail })
    expect(submitted().items[0]).toMatchObject({ title: VIDEO.title, duration: 213 })
    await call('youtube_download_batch', { videos: [RICK], title: '我的标题' })
    expect(submitted().title).toBe('我的标题')
  })

  it('单个视频取不到封面和时长时为空', async () => {
    svc.info.mockResolvedValueOnce({ ...VIDEO, thumbnail: undefined, duration: null })
    await call('youtube_download_batch', { videos: [RICK] })
    expect(submitted().cover).toBe('')
    expect(submitted().items[0].duration).toBeUndefined()
  })

  it('参数错误：和 url 等一起传、都认不出、太多、标题太长', async () => {
    for (const key of ['url', 'ids', 'all', 'max_items']) {
      const e = await fails('youtube_download_batch', { videos: [RICK], [key]: key === 'all' ? true : key === 'max_items' ? 5 : 'x' })
      expect(e.message).toBe(t('mcpTools.videosWith', { key }))
    }
    expect((await call('youtube_download_batch', { videos: [RICK], url: null })).batch_id).toBe('b1')
    const none = await fails('youtube_download_batch', { videos: ['a', 'b', 'c', 'd'] })
    expect(none.message).toBe(t('mcpTools.videosNone', { examples: 'a、b、c' }))
    const many = Array.from({ length: 201 }, (_, i) => `v${String(i).padStart(10, '0')}`)
    await fails('youtube_download_batch', { videos: many })
    await fails('youtube_download_batch', { videos: [RICK], title: 'x'.repeat(101) })
  })
})

describe('youtube_search_videos', () => {
  const results = (entries: YtFlatEntry[]) => ({ ...SEARCH, entries })

  it('按相关度搜视频，过滤掉不是视频的条目', async () => {
    searchOut = results([...SEARCH.entries!, entry('UCK8sQmJBp8GCxrOtXWBpyEA', { title: '频道' }), entry('', { title: '空' })])
    const r = await call('youtube_search_videos', { query: 'lofi' })
    expect(r).toMatchObject({ query: 'lofi', sort: 'relevance', count: 3 })
    expect(r.hint).toBe(t('mcpYoutube.searchHint'))
    expect(r.videos[0]).toMatchObject({ id: 'rFZHOHl-L8A', url: 'https://www.youtube.com/watch?v=rFZHOHl-L8A', channel: 'Lofi Girl', views: 26632045 })
    expect(r.videos[0].duration).toBeUndefined()
    const [args, opts] = svc.exec.mock.calls[0]
    expect(args).toEqual(['--flat-playlist', '-J', '--playlist-items', '1:20', searchUrl('lofi', { type: 'video', sort: 'relevance' })])
    expect(opts).toEqual({})
  })

  it('排序、上传时间和时长筛选编进搜索链接', async () => {
    await call('youtube_search_videos', { query: 'x', sort: 'date', upload_date: 'week', duration: 'short', limit: 5 })
    expect(svc.exec.mock.calls[0][0]).toEqual(['--flat-playlist', '-J', '--playlist-items', '1:5', searchUrl('x', { type: 'video', sort: 'date', uploadDate: 'week', duration: 'short' })])
    await call('youtube_search_videos', { query: 'x', upload_date: '', duration: null })
    expect(svc.exec.mock.calls[1][0].at(-1)).toBe(searchUrl('x', { type: 'video' }))
    await fails('youtube_search_videos', { query: 'x', upload_date: 'decade' })
    await fails('youtube_search_videos', { query: 'x', sort: 'random' })
    await fails('youtube_search_videos', {})
  })

  it('按时长在本地重排，搜索本身用相关度', async () => {
    searchOut = results([
      entry('aaaaaaaaaaa', { duration: 100, uploader: '上传者', live_status: 'is_live', description: 'd'.repeat(400) }),
      entry('bbbbbbbbbbb', { duration: 300 }),
      entry('ccccccccccc')
    ])
    const desc = await call('youtube_search_videos', { query: 'x', sort: 'duration' })
    expect(desc.videos.map((v: any) => v.id)).toEqual(['bbbbbbbbbbb', 'aaaaaaaaaaa', 'ccccccccccc'])
    expect(svc.exec.mock.calls[0][0].at(-1)).toBe(searchUrl('x', { type: 'video' }))
    const a = desc.videos[1]
    expect(a).toMatchObject({ channel: '上传者', live: true, duration: 100 })
    expect(a.description).toHaveLength(300)
    expect(desc.videos[0].live).toBeUndefined()
    expect(desc.videos[0].description).toBeUndefined()
    const asc = await call('youtube_search_videos', { query: 'x', sort: 'duration_asc' })
    expect(asc.videos.map((v: any) => v.id)).toEqual(['ccccccccccc', 'aaaaaaaaaaa', 'bbbbbbbbbbb'])
  })
})

describe('youtube_search_channels', () => {
  it('返回频道 id、名称、handle 和链接', async () => {
    searchOut = {
      ...SEARCH_CH,
      entries: [
        ...SEARCH_CH.entries!,
        { id: 'UCxxxxxxxxxxxxxxxxxxxxxx', title: '没有 handle', url: 'https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx', description: 'z'.repeat(500) }
      ]
    }
    const r = await call('youtube_search_channels', { query: 'google', limit: 4 })
    expect(r.count).toBe(4)
    expect(r.hint).toBe(t('mcpYoutube.channelsHint'))
    expect(r.channels[0]).toMatchObject({ channel_id: 'UCK8sQmJBp8GCxrOtXWBpyEA', name: 'Google', handle: '@Google', url: 'https://www.youtube.com/@Google', subscribers: 14700000 })
    expect(r.channels[3]).toEqual({
      channel_id: 'UCxxxxxxxxxxxxxxxxxxxxxx',
      name: '没有 handle',
      handle: undefined,
      url: 'https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx',
      subscribers: undefined,
      description: 'z'.repeat(300)
    })
    expect(svc.exec.mock.calls[0][0]).toEqual(['--flat-playlist', '-J', '--playlist-items', '1:4', searchUrl('google', { type: 'channel' })])
  })

  it('handle 不以 @ 开头时用原链接，默认取 10 个', async () => {
    searchOut = { ...SEARCH_CH, entries: [{ id: 'UCy', title: 't', url: 'https://www.youtube.com/channel/UCy', uploader_id: 'legacy', channel: '频道名' }] }
    const r = await call('youtube_search_channels', { query: 'g' })
    expect(r.channels[0]).toMatchObject({ name: '频道名', handle: 'legacy', url: 'https://www.youtube.com/channel/UCy' })
    expect(svc.exec.mock.calls[0][0][3]).toBe('1:10')
  })
})

describe('youtube_get_video_info', () => {
  it('单个视频：详情、章节、画质、字幕，简介最长 5000 字', async () => {
    svc.info.mockResolvedValueOnce({ ...VIDEO, description: 'x'.repeat(6000) })
    const r = await call('youtube_get_video_info', { videos: [`https://youtu.be/${RICK}`] })
    expect(r.failed).toBeUndefined()
    const v = r.videos[0]
    expect(v).toMatchObject({
      id: RICK,
      url: `https://www.youtube.com/watch?v=${RICK}`,
      channel: 'Rick Astley',
      published: new Date(VIDEO.timestamp! * 1000).toISOString(),
      duration: 213,
      categories: ['Music'],
      chapters: [{ start: '00:00', title: 'Intro' }, { start: '00:43', title: 'Chorus' }],
      subtitles: ['en', 'ja'],
      auto_caption_lang: 'en'
    })
    expect(v.age_limit).toBeUndefined()
    expect(v.description).toEqual({ text: 'x'.repeat(5000), truncated: true })
    expect(v.qualities.length).toBeGreaterThan(0)
    expect(svc.info).toHaveBeenCalledWith(`https://www.youtube.com/watch?v=${RICK}`)
  })

  it('多个视频时简介最长 800 字，取不到的放进 failed', async () => {
    svc.info.mockImplementation(async (url: string) => {
      if (url.endsWith(ZOO)) throw new Error('私享视频')
      if (url.endsWith('ccccccccccc')) throw 'raw'
      return {
        ...VIDEO,
        description: 'y'.repeat(1000),
        timestamp: null,
        release_timestamp: 1700000000,
        channel: null,
        uploader: '上传者',
        categories: null,
        age_limit: 18,
        chapters: null,
        formats: []
      }
    })
    const r = await call('youtube_get_video_info', { videos: [RICK, ZOO, 'ccccccccccc'] })
    expect(r.videos).toHaveLength(1)
    expect(r.videos[0]).toMatchObject({ channel: '上传者', published: new Date(1700000000 * 1000).toISOString(), age_limit: 18, qualities: [] })
    expect(r.videos[0].categories).toBeUndefined()
    expect(r.videos[0].chapters).toBeUndefined()
    expect(r.videos[0].hdr).toBeUndefined()
    expect(r.videos[0].description).toEqual({ text: 'y'.repeat(800), truncated: true })
    expect(r.failed).toEqual([{ video: ZOO, error: '私享视频' }, { video: 'ccccccccccc', error: 'raw' }])
  })

  it('没有发布时间和简介时为空', async () => {
    svc.info.mockResolvedValueOnce({ ...VIDEO, timestamp: null, release_timestamp: null, description: null })
    const r = await call('youtube_get_video_info', { videos: [RICK] })
    expect(r.videos[0].published).toBeUndefined()
    expect(r.videos[0].description).toEqual({ text: '' })
  })

  it('没传或超过 20 个时报参数错误', async () => {
    await fails('youtube_get_video_info', {})
    await fails('youtube_get_video_info', { videos: [] })
    await fails('youtube_get_video_info', { videos: Array.from({ length: 21 }, () => RICK) })
  })

  it('认不出的视频放进 failed，其余照常返回', async () => {
    const r = await call('youtube_get_video_info', { videos: [RICK, PL_URL] })
    expect(r.videos.map((v: any) => v.id)).toEqual([RICK])
    expect(r.failed).toEqual([{ video: PL_URL, error: t('mcpYoutube.badVideo', { input: PL_URL }) }])
    expect(svc.info).toHaveBeenCalledTimes(1)
  })
})

describe('youtube_get_video_transcript', () => {
  const cues = (n: number, from = 0): string =>
    `WEBVTT\n\n${Array.from({ length: n }, (_, i) => `00:${String(Math.floor((from + i) / 60)).padStart(2, '0')}:${String((from + i) % 60).padStart(2, '0')}.000 --> 00:00:59.000\n第${i}行的字幕内容`).join('\n\n')}`
  const subInfo = (subtitles: Record<string, unknown[]>, auto: Record<string, unknown[]>) => ({ ...VIDEO, subtitles, automatic_captions: auto }) as YtVideoInfo
  const subArgs = () => svc.exec.mock.calls.at(-1)![0] as string[]
  const subLang = () => subArgs()[subArgs().indexOf('--sub-langs') + 1]

  it('不指定语言时优先人工字幕', async () => {
    vtt = cues(2)
    const r = await call('youtube_get_video_transcript', { video: RICK })
    expect(subArgs()).toContain('--write-subs')
    expect(subLang()).toBe('en')
    expect(r).toMatchObject({
      id: RICK,
      title: VIDEO.title,
      lang: 'en',
      chapters: [{ start: '00:00', title: 'Intro' }, { start: '00:43', title: 'Chorus' }],
      available: { subtitles: ['en', 'ja'], auto_captions: ['en'] },
      lines: 2,
      offset: 0,
      next_offset: null,
      transcript: '[00:00] 第0行的字幕内容\n[00:01] 第1行的字幕内容'
    })
    expect(r.auto_generated).toBeUndefined()
  })

  it('没有人工字幕时用原语言的自动字幕', async () => {
    svc.info.mockResolvedValue(subInfo({ live_chat: [] }, { 'ja-orig': [], en: [] }))
    vtt = 'WEBVTT\n\n01:01:40.000 --> 01:01:41.000\n很晚的一句'
    const r = await call('youtube_get_video_transcript', { video: RICK })
    expect(subArgs()).toContain('--write-auto-subs')
    expect(subLang()).toBe('ja-orig')
    expect(r).toMatchObject({ lang: 'ja', auto_generated: true, available: { subtitles: [], auto_captions: ['ja'] }, transcript: '[1:01:40] 很晚的一句' })
  })

  it('指定语言：先找人工字幕（含地区后缀），再找自动字幕', async () => {
    svc.info.mockResolvedValue(subInfo({ 'en-GB': [] }, { 'en-orig': [], fr: [], 'de-DE': [] }))
    vtt = cues(1)
    expect((await call('youtube_get_video_transcript', { video: RICK, lang: 'en' })).lang).toBe('en-GB')
    expect(subArgs()).toContain('--write-subs')
    const fr = await call('youtube_get_video_transcript', { video: RICK, lang: 'fr' })
    expect(fr).toMatchObject({ lang: 'fr', auto_generated: true })
    expect(subArgs()).toContain('--write-auto-subs')
    expect((await call('youtube_get_video_transcript', { video: RICK, lang: 'de' })).lang).toBe('de-DE')
    expect((await call('youtube_get_video_transcript', { video: RICK, lang: 'en-GB' })).lang).toBe('en-GB')
    const none = await call('youtube_get_video_transcript', { video: RICK, lang: 'xx' })
    expect(none).toMatchObject({ transcript: null, hint: t('mcpYoutube.noTranscript') })
  })

  it('没有字幕也没有原语言自动字幕时返回空', async () => {
    svc.info.mockResolvedValue({ ...VIDEO, subtitles: undefined, automatic_captions: undefined, chapters: undefined })
    const r = await call('youtube_get_video_transcript', { video: RICK })
    expect(r).toEqual({
      content_notice: t('mcpYoutube.contentNotice'),
      id: RICK,
      title: VIDEO.title,
      chapters: undefined,
      available: { subtitles: [], auto_captions: [] },
      transcript: null,
      hint: t('mcpYoutube.noTranscript')
    })
    expect(svc.exec).not.toHaveBeenCalled()
  })

  it('字幕没下载下来时提示', async () => {
    const r = await call('youtube_get_video_transcript', { video: RICK })
    expect(r).toMatchObject({ transcript: null, hint: t('mcpYoutube.transcriptFailed', { lang: 'en' }) })
    vtt = 'WEBVTT\n'
    expect((await call('youtube_get_video_transcript', { video: RICK })).transcript).toBeNull()
  })

  it('按 max_chars 分段，用 next_offset 接着读，后面的段不带章节', async () => {
    vtt = cues(100)
    const first = await call('youtube_get_video_transcript', { video: RICK, max_chars: 500 })
    expect(first.transcript.length).toBeLessThanOrEqual(500)
    expect(first.lines).toBe(100)
    expect(first.next_offset).toBe(first.transcript.split('\n').length)
    expect(first.chapters).toBeDefined()
    const second = await call('youtube_get_video_transcript', { video: RICK, max_chars: 500, offset: first.next_offset })
    expect(second.chapters).toBeUndefined()
    expect(second.transcript.split('\n')[0]).toContain(`第${first.next_offset}行`)
    const last = await call('youtube_get_video_transcript', { video: RICK, offset: 95 })
    expect(last.next_offset).toBeNull()
    expect(last.transcript.split('\n')).toHaveLength(5)
    await fails('youtube_get_video_transcript', { video: RICK, max_chars: 100 })
    await fails('youtube_get_video_transcript', { video: 'nope' })
  })
})

describe('youtube_get_video_comments', () => {
  const comment = (id: string, parent = 'root', over: Record<string, unknown> = {}) => ({ id, parent, text: `评论${id}`, author: `@${id}`, like_count: 1, timestamp: 1700000000, ...over })

  it('顶层评论分页，回复挂到父评论下', async () => {
    commentsOut = {
      comments: [
        comment('r1', 'root', { is_pinned: true, author_is_uploader: true, text: 'x'.repeat(2500) }),
        comment('c1', 'r1'),
        comment('c2', 'r1', { timestamp: undefined }),
        comment('r2'),
        comment('r3')
      ],
      comment_count: 99
    }
    const r = await call('youtube_get_video_comments', { video: RICK, limit: 2 })
    expect(r).toMatchObject({ id: RICK, sort: 'top', total: 99, offset: 0, next_offset: 2 })
    expect(r.comments.map((c: any) => c.id)).toEqual(['r1', 'r2'])
    expect(r.comments[0]).toMatchObject({ pinned: true, by_uploader: true, time: new Date(1700000000 * 1000).toISOString() })
    expect(r.comments[0].text).toHaveLength(2000)
    expect(r.comments[0].replies.map((c: any) => c.id)).toEqual(['c1', 'c2'])
    expect(r.comments[0].replies[1].time).toBeUndefined()
    expect(r.comments[1].pinned).toBeUndefined()
    expect(r.comments[1].replies).toBeUndefined()
    expect(svc.exec.mock.calls[0][0]).toContain('youtube:max_comments=200,50,150,3;comment_sort=top')

    const next = await call('youtube_get_video_comments', { video: RICK, limit: 2, offset: 2 })
    expect(next.comments.map((c: any) => c.id)).toEqual(['r3'])
    expect(next.next_offset).toBeNull()
    // 同一档（50 条）内翻页用缓存
    expect(svc.exec).toHaveBeenCalledTimes(1)
  })

  it('超出这一档时多取一档；按新旧排、回复数也传给 yt-dlp', async () => {
    commentsOut = { comments: Array.from({ length: 50 }, (_, i) => comment(`r${i}`)) }
    const r = await call('youtube_get_video_comments', { video: RICK, limit: 50 })
    expect(r.next_offset).toBe(50)
    expect(r.total).toBeUndefined()
    await call('youtube_get_video_comments', { video: RICK, limit: 10, offset: 45 })
    expect(svc.exec).toHaveBeenCalledTimes(2)
    expect(svc.exec.mock.calls[1][0]).toContain('youtube:max_comments=400,100,300,3;comment_sort=top')
    await call('youtube_get_video_comments', { video: RICK, sort: 'new', replies: 0 })
    expect(svc.exec.mock.calls[2][0]).toContain('youtube:max_comments=50,50,0,0;comment_sort=new')
    await fails('youtube_get_video_comments', { video: RICK, sort: 'hot' })
  })
})

describe('youtube_get_download_quality', () => {
  it('分别用不登录和每个没失效的账号查画质，单个失败时记下错误', async () => {
    svc.info.mockImplementation(async (_url: string, o: { account: string | null }) => {
      if (o.account === 'acc3') throw new Error('需要登录')
      if (o.account === 'acc1') throw 'raw'
      return o.account === null ? VIDEO : { ...VIDEO, formats: [] }
    })
    snap.accounts.push(account('acc4'))
    const r = await call('youtube_get_download_quality', { video: RICK })
    expect(r.id).toBe(RICK)
    expect(r.hint).toBe(t('mcpYoutube.qualityHint'))
    expect(r.results.map((x: any) => x.account_id)).toEqual([null, 'acc1', 'acc3', 'acc4'])
    expect(r.results[0].max).toBeGreaterThan(0)
    expect(r.results[0].qualities[0]).toBe(r.results[0].max)
    expect(r.results[1]).toEqual({ account_id: 'acc1', name: '名字acc1', error: 'raw' })
    expect(r.results[2]).toEqual({ account_id: 'acc3', name: '名字acc3', error: '需要登录' })
    expect(r.results[3]).toEqual({ account_id: 'acc4', name: '名字acc4', max: null, qualities: [] })
    expect(svc.info).toHaveBeenCalledWith(`https://www.youtube.com/watch?v=${RICK}`, { account: null, fresh: true })
  })
})

describe('youtube 登录和账号', () => {
  it('start_login 默认用第一个可导入的浏览器', async () => {
    const r = await call('youtube_start_login')
    expect(deps.importBrowser).toHaveBeenCalledWith('p4')
    expect(r).toEqual({ imported: true, account: { account_id: 'from-p4', name: '名字from-p4', handle: '@from-p4', status: 'ready', current: true }, hint: t('mcpYoutube.loginDone') })
  })

  it('start_login 指定浏览器配置档', async () => {
    await call('youtube_start_login', { browser_profile_id: 'p1' })
    expect(deps.importBrowser).toHaveBeenCalledWith('p1')
  })

  it('start_login 找不到配置档或没有可导入的登录时返回浏览器列表', async () => {
    const r = await call('youtube_start_login', { browser_profile_id: 'zz' })
    expect(r.imported).toBe(false)
    expect(r.hint).toBe(t('mcpYoutube.profileNotFound'))
    expect(r.browsers[2]).toEqual({ id: 'p3', browser: 'Chrome', profile: 'p3', has_youtube_login: true, locked: true, blocked: undefined })
    browsers = [profile('p5', { blocked: true })]
    expect((await call('youtube_start_login')).hint).toBe(t('mcpYoutube.noBrowserLogin'))
    expect(deps.importBrowser).not.toHaveBeenCalled()
  })

  it('login_status 显示当前账号，按需列出浏览器', async () => {
    expect(await call('youtube_get_login_status')).toEqual({
      logged_in: true,
      account: { account_id: 'acc1', name: '名字acc1', handle: '@acc1', status: 'ready', current: true },
      browsers: undefined
    })
    snap.current = 'acc2'
    const r = await call('youtube_get_login_status', { include_browsers: true })
    expect(r.logged_in).toBe(false)
    expect(r.account.status).toBe('expired')
    expect(r.browsers[0]).toEqual({ id: 'p1', browser: 'Chrome', profile: 'p1', has_youtube_login: false })
    snap = { accounts: [] }
    expect(await call('youtube_get_login_status')).toMatchObject({ logged_in: false, account: null })
  })

  it('list_accounts 列出账号和当前账号', async () => {
    const r = await call('youtube_list_accounts')
    expect(r.current_account_id).toBe('acc1')
    expect(r.accounts.map((a: any) => [a.account_id, a.current])).toEqual([['acc1', true], ['acc2', false], ['acc3', false]])
    snap = { accounts: [] }
    expect(await call('youtube_list_accounts')).toEqual({ current_account_id: null, accounts: [] })
  })

  it('switch_account：null 表示不登录，不存在的报 NOT_FOUND，别的类型报参数错误', async () => {
    expect((await call('youtube_switch_account', { account_id: 'acc3' })).current_account_id).toBe('acc3')
    expect(deps.accounts.select).toHaveBeenLastCalledWith('acc3')
    expect((await call('youtube_switch_account', { account_id: null })).current_account_id).toBeNull()
    expect(deps.accounts.select).toHaveBeenLastCalledWith(undefined)
    const e = await fails('youtube_switch_account', { account_id: 'zz' }, 'NOT_FOUND')
    expect(e.hint).toBe(t('mcpYoutube.listAccountsHint'))
    await fails('youtube_switch_account', { account_id: 5 })
    await fails('youtube_switch_account', {})
    expect(deps.accounts.select).toHaveBeenCalledTimes(2)
  })

  it('logout_account：用户拒绝时不移除，同意后移除', async () => {
    deps.confirmRemove.mockResolvedValueOnce(false)
    expect(await call('youtube_logout_account', { account_id: 'acc2' })).toEqual({ removed: false, hint: t('mcpYoutube.logoutDeclined') })
    expect(deps.confirmRemove).toHaveBeenCalledWith('名字acc2')
    expect(deps.accounts.remove).not.toHaveBeenCalled()
    const r = await call('youtube_logout_account', { account_id: 'acc2' })
    expect(r.removed).toBe(true)
    expect(r.accounts.map((a: any) => a.account_id)).toEqual(['acc1', 'acc3'])
    expect(deps.accounts.remove).toHaveBeenCalledWith('acc2')
    await fails('youtube_logout_account', { account_id: 'zz' }, 'NOT_FOUND')
    await fails('youtube_logout_account', {})
  })
})

describe('youtube_update_engine', () => {
  it('没装时安装', async () => {
    engine = { state: 'missing' }
    expect(await call('youtube_update_engine')).toEqual({ installed: true, state: 'ready', version: '2026.02.02' })
    expect(deps.engine.ensure).toHaveBeenCalled()
    expect(deps.engine.checkUpdate).not.toHaveBeenCalled()
  })

  it('装了时强制检查更新，版本变了算更新过', async () => {
    deps.engine.checkUpdate.mockResolvedValueOnce({ state: 'ready', version: '2026.03.03' })
    expect(await call('youtube_update_engine')).toEqual({ updated: true, state: 'ready', version: '2026.03.03' })
    expect(deps.engine.checkUpdate).toHaveBeenCalledWith(true)
    expect(await call('youtube_update_engine')).toMatchObject({ updated: false, version: '2026.01.01' })
  })
})

describe('其他边界', () => {
  it('不传选项时用默认间隔构造；播放列表项可以按 key 选', async () => {
    tools = new YoutubeTools(deps, hooks)
    svc.expand.mockImplementation(async (items: MediaItem[]) => items.map((i) => ({ ...i, lazy: false, ytId: 'aaaaaaaaaaa' })))
    await call('youtube_download_batch', { url: 'https://www.youtube.com/@google/playlists', ids: ['ytpl:PLAeFjVYtuU34'] })
    expect(svc.expand).toHaveBeenCalledWith([expect.objectContaining({ key: 'ytpl:PLAeFjVYtuU34' })])
    expect(submitted().items).toHaveLength(1)
  })

  it('按时长排序时没有时长的算 0', async () => {
    searchOut = { ...SEARCH, entries: [entry('aaaaaaaaaaa'), entry('bbbbbbbbbbb', { duration: 5 }), entry('ccccccccccc'), entry('ddddddddddd', { duration: 1 })] }
    const r = await call('youtube_search_videos', { query: 'x', sort: 'duration_asc' })
    expect(r.videos.map((v: any) => v.id)).toEqual(['aaaaaaaaaaa', 'ccccccccccc', 'ddddddddddd', 'bbbbbbbbbbb'])
  })
})
