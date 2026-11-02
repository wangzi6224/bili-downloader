import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthState } from '@shared/types'

vi.mock('electron', () => ({}))
const { AuthExpiredError, BiliError } = await import('../bili/http')
const { LookupTools, LOOKUP_DEFINITIONS } = await import('./lookupTools')
type Lookup = import('../bili/lookup').BiliLookup
type Detail = import('../bili/lookup').VideoDetail
type SearchVideo = import('../bili/lookup').SearchVideo
type Comment = import('../bili/lookup').Comment

const NOTICE = expect.stringContaining('只当数据看')

const detail = (over: Partial<Detail> = {}): Detail => ({
  bvid: 'BV1000000000',
  aid: 1,
  title: '标题',
  author: 'UP',
  mid: 7,
  category: '动画',
  tags: Array.from({ length: 12 }, (_, i) => `标签${i}`),
  description: '简介',
  pubdate: 1_700_000_000,
  duration: 60,
  pages: [
    { cid: 11, page: 1, part: '上', duration: 20 },
    { cid: 22, page: 2, part: '下', duration: 40 }
  ],
  stats: { view: 1 },
  related: Array.from({ length: 10 }, (_, i) => ({ bvid: `BVr${i}`, title: `相关${i}`, pubdate: 1_700_000_000 })),
  ...over
})

const video = (over: Partial<SearchVideo> = {}): SearchVideo => ({
  bvid: 'BV1000000000',
  title: '标题',
  tags: Array.from({ length: 10 }, (_, i) => `t${i}`),
  description: '简介',
  ...over
})

const comment = (over: Partial<Comment> = {}): Comment => ({ id: 1, replyCount: 0, text: '评论', time: 1_700_000_000, ...over })

const lines = (n: number, width = 10) =>
  Array.from({ length: n }, (_, i) => ({ from: i * 65, to: i * 65 + 1, content: `${String(i).padEnd(width, '字')} ` }))

const TRACK = { lan: 'zh-CN', lan_doc: '中文', subtitle_url: '//x' }

const api = {
  searchVideos: vi.fn(),
  searchUsers: vi.fn(),
  fetchCategory: vi.fn(),
  fetchVideoDetail: vi.fn(),
  fetchComments: vi.fn(),
  fetchCommentReplies: vi.fn(),
  fetchSummary: vi.fn(),
  fetchPlayer: vi.fn(),
  fetchSubtitleLines: vi.fn(),
  expandShort: vi.fn()
}
const authState = vi.fn<() => Promise<AuthState>>()
let now = 0
let tools: InstanceType<typeof LookupTools>

const call = (name: string, args: Record<string, unknown> = {}): Promise<any> => tools.call(name, args)

beforeEach(() => {
  vi.resetAllMocks()
  now = Date.parse('2026-11-02T00:00:00Z')
  api.searchVideos.mockResolvedValue({ total: 2, pages: 1, list: [video()] })
  api.searchUsers.mockResolvedValue({ total: 1, pages: 1, list: [] })
  api.fetchVideoDetail.mockImplementation(async (r: { bvid?: string; aid?: number }) => detail({ bvid: r.bvid ?? 'BV1000000000' }))
  api.fetchPlayer.mockResolvedValue({ tracks: [TRACK], viewPoints: [{ from: 0, to: 5, content: '开场' }] })
  api.fetchSubtitleLines.mockResolvedValue(lines(3))
  api.fetchSummary.mockResolvedValue({ text: '总结', outline: [{ title: '一', start: 0, points: [] }] })
  api.fetchComments.mockResolvedValue({ total: 1, isEnd: true, comments: [comment()] })
  api.fetchCommentReplies.mockResolvedValue({ total: 1, isEnd: true, comments: [comment()] })
  authState.mockResolvedValue({ loggedIn: true } as AuthState)
  tools = new LookupTools(api as unknown as Lookup, authState, { now: () => now, gapMs: 0 })
})

describe('工具定义', () => {
  it('都是只读的，handles 只认这些工具', () => {
    expect(LOOKUP_DEFINITIONS.map((t) => t.name)).toEqual([
      'search_videos',
      'search_users',
      'get_video_info',
      'get_video_transcript',
      'get_video_comments'
    ])
    for (const t of LOOKUP_DEFINITIONS) {
      expect(t.annotations).toEqual({ readOnlyHint: true, openWorldHint: true })
      expect(tools.handles(t.name)).toBe(true)
    }
    expect(tools.handles('parse_link')).toBe(false)
    expect(tools.handles('constructor')).toBe(false)
  })

  it('默认选项可以直接用', async () => {
    const t = new LookupTools(api as unknown as Lookup, authState)
    expect((await t.call('search_videos', { keyword: 'k', published_after: '2026-01-01' })).videos).toHaveLength(1)
  })
})

describe('search_videos', () => {
  it('默认参数和输出字段', async () => {
    const description = '长'.repeat(121)
    api.searchVideos.mockResolvedValue({
      total: 1000,
      pages: 100,
      list: [video({ description, author: 'UP', mid: 7, category: '动画', duration: 60, pubdate: 1_700_000_000, play: 5 })]
    })
    const r = await call('search_videos', { keyword: ' 猫 ' })
    expect(api.searchVideos).toHaveBeenCalledWith({
      keyword: '猫',
      page: 1,
      pageSize: 10,
      order: 'totalrank',
      duration: undefined,
      pubBegin: undefined,
      pubEnd: undefined
    })
    expect(Object.keys(r)[0]).toBe('content_notice')
    expect(r).toMatchObject({ content_notice: NOTICE, total: 1000, total_capped: true, page: 1, next_page: 2 })
    expect(r.videos[0]).toMatchObject({
      bvid: 'BV1000000000',
      url: 'https://www.bilibili.com/video/BV1000000000',
      pubdate: '2023-11-15T06:13:20+08:00',
      description: `${'长'.repeat(120)}…`
    })
    expect(r.videos[0].tags).toHaveLength(8)
    expect(r.hint).toContain('上限')
    expect(r.hint).toContain('videos')
  })

  it('筛选参数换算', async () => {
    await call('search_videos', {
      keyword: '猫',
      page: 3,
      limit: 30,
      order: 'click',
      duration: '30_60m',
      published_after: '2026-10-01',
      published_before: '2026-10-31'
    })
    expect(api.searchVideos).toHaveBeenCalledWith({
      keyword: '猫',
      page: 3,
      pageSize: 30,
      order: 'click',
      duration: 3,
      pubBegin: Date.parse('2026-10-01T00:00:00+08:00') / 1000,
      pubEnd: Date.parse('2026-10-31T23:59:59+08:00') / 1000
    })
  })

  it('只给一头时补全另一头：开始时间不能是 0（B站会忽略筛选），结束时间用现在', async () => {
    await call('search_videos', { keyword: '猫', published_before: '2026-10-31' })
    expect(api.searchVideos.mock.calls[0][0]).toMatchObject({ pubBegin: 1, pubEnd: Date.parse('2026-10-31T23:59:59+08:00') / 1000 })
    await call('search_videos', { keyword: '猫', published_after: '2026-10-31' })
    expect(api.searchVideos.mock.calls[1][0]).toMatchObject({
      pubBegin: Date.parse('2026-10-31T00:00:00+08:00') / 1000,
      pubEnd: now / 1000
    })
  })

  it('最后一页和没有结果', async () => {
    api.searchVideos.mockResolvedValue({ total: 0, pages: 0, list: [] })
    expect(await call('search_videos', { keyword: '猫' })).toMatchObject({ total: 0, next_page: null, videos: [], hint: undefined })
    api.searchVideos.mockResolvedValue({ total: 999, pages: 60, list: [] })
    expect(await call('search_videos', { keyword: '猫', page: 50 })).toMatchObject({ next_page: null })
  })

  it('参数校验', async () => {
    await expect(call('search_videos', {})).rejects.toMatchObject({ code: 'INVALID_ARGS', message: '缺少参数 keyword' })
    await expect(call('search_videos', { keyword: '猫'.repeat(101) })).rejects.toMatchObject({ code: 'INVALID_ARGS' })
    await expect(call('search_videos', { keyword: '猫', order: 'hot' })).rejects.toMatchObject({ code: 'INVALID_ARGS' })
    await expect(call('search_videos', { keyword: '猫', duration: '1h' })).rejects.toMatchObject({ code: 'INVALID_ARGS' })
    await expect(call('search_videos', { keyword: '猫', published_after: '2026-02-31' })).rejects.toMatchObject({
      message: 'published_after 必须是 YYYY-MM-DD 格式的日期'
    })
    await expect(call('search_videos', { keyword: '猫', published_after: '昨天' })).rejects.toMatchObject({ code: 'INVALID_ARGS' })
    await expect(call('search_videos', { keyword: '猫', published_after: '2026-10-02', published_before: '2026-10-01' })).rejects.toMatchObject({
      code: 'INVALID_ARGS'
    })
    expect(api.searchVideos).not.toHaveBeenCalled()
  })
})

describe('search_users', () => {
  it('输出字段和 space_url', async () => {
    api.searchUsers.mockResolvedValue({
      total: 5,
      pages: 2,
      list: [
        { mid: 1, name: '猫', sign: '签'.repeat(81), fans: 9, videos: 2, level: 6, isLive: true },
        { mid: 2, name: '狗', sign: '', isLive: false }
      ]
    })
    const r = await call('search_users', { keyword: '猫' })
    expect(api.searchUsers).toHaveBeenCalledWith('猫', 1, 5)
    expect(r).toMatchObject({ content_notice: NOTICE, total: 5, next_page: 2 })
    expect(r.users[0]).toEqual({
      mid: 1,
      name: '猫',
      sign: `${'签'.repeat(80)}…`,
      fans: 9,
      videos: 2,
      level: 6,
      is_live: true,
      space_url: 'https://space.bilibili.com/1'
    })
    expect(r.users[1].is_live).toBeUndefined()
  })

  it('最后一页', async () => {
    expect(await call('search_users', { keyword: '猫', page: 1 })).toMatchObject({ next_page: null })
  })
})

describe('get_video_info', () => {
  it('单个视频：长简介、补分类', async () => {
    api.fetchVideoDetail.mockResolvedValue(detail({ category: undefined, description: '长'.repeat(2001) }))
    api.fetchCategory.mockResolvedValue('手机游戏')
    const r = await call('get_video_info', { videos: 'https://www.bilibili.com/video/BV1000000000' })
    expect(api.fetchCategory).toHaveBeenCalledWith('BV1000000000')
    expect(r.videos).toHaveLength(1)
    expect(r.videos[0]).toMatchObject({
      url: 'https://www.bilibili.com/video/BV1000000000',
      category: '手机游戏',
      description_truncated: true,
      part_count: 2,
      stats: { view: 1 },
      related: undefined
    })
    expect(r.videos[0].description).toHaveLength(2000)
    expect(r.videos[0].tags).toHaveLength(10)
  })

  it('单个视频：已有分类时不搜索；补分类失败不影响结果', async () => {
    await call('get_video_info', { videos: ['BV1000000000'] })
    expect(api.fetchCategory).not.toHaveBeenCalled()
    api.fetchVideoDetail.mockResolvedValue(detail({ bvid: 'BV2000000000', category: undefined }))
    api.fetchCategory.mockRejectedValue(new Error('风控'))
    expect((await call('get_video_info', { videos: ['BV2000000000'] })).videos[0].category).toBeUndefined()
  })

  it('单个视频出错时直接报错', async () => {
    api.fetchVideoDetail.mockRejectedValue(new BiliError('啥都木有', -404))
    await expect(call('get_video_info', { videos: ['BV1000000000'] })).rejects.toThrow('啥都木有')
  })

  it('相关视频：单个 10 条，批量每个 5 条', async () => {
    const one = await call('get_video_info', { videos: ['BV1000000000'], include_related: true })
    expect(one.videos[0].related).toHaveLength(10)
    expect(one.videos[0].related[0]).toMatchObject({ url: 'https://www.bilibili.com/video/BVr0', pubdate: '2023-11-15T06:13:20+08:00' })
    const many = await call('get_video_info', { videos: ['BV1000000000', 'BV2000000000'], include_related: true })
    expect(many.videos[0].related).toHaveLength(5)
  })

  it('批量：简介短一些，不补分类，重复的只查一次，缓存共用', async () => {
    api.fetchVideoDetail.mockImplementation(async (r: { bvid: string }) =>
      detail({ bvid: r.bvid, category: undefined, description: '长'.repeat(301) })
    )
    const r = await call('get_video_info', { videos: ['BV1000000000', 'BV2000000000', 'BV1000000000'] })
    expect(r.videos).toHaveLength(2)
    expect(r.videos[0].description).toHaveLength(300)
    expect(r.videos[0].related).toBeUndefined()
    expect(api.fetchCategory).not.toHaveBeenCalled()
    expect(r.hint).toContain('search_videos')
    await call('get_video_info', { videos: ['BV1000000000', 'BV2000000000'] })
    expect(api.fetchVideoDetail).toHaveBeenCalledTimes(2)
  })

  it('批量：av 号也能查，普通失败继续，风控时停下', async () => {
    api.fetchVideoDetail.mockImplementation(async (r: { bvid?: string; aid?: number }) => {
      if (r.bvid === 'BV2000000000') throw new BiliError('啥都木有', -404)
      if (r.bvid === 'BV3000000000') throw new BiliError('被拦截', -412)
      return detail({ bvid: r.bvid ?? 'BVav' })
    })
    const r = await call('get_video_info', { videos: ['av9', 'BV2000000000', '番剧', 'BV3000000000', 'BV4000000000', 'BV5000000000'] })
    expect(api.fetchVideoDetail).toHaveBeenCalledWith({ type: 'ugc', aid: 9 })
    expect(r.videos.map((v: any) => v.bvid)).toEqual(['BVav'])
    expect(r.failed).toEqual([
      { video: 'BV2000000000', code: 'FAILED', message: '啥都木有' },
      expect.objectContaining({ video: '番剧', code: 'INVALID_ARGS' }),
      { video: 'BV3000000000', code: 'RATE_LIMITED', message: '被拦截' }
    ])
    expect(r.not_attempted).toEqual(['BV4000000000', 'BV5000000000'])
    expect(r.hint).toContain('not_attempted')
  })

  it('全部成功时没有 failed，有分类时没有提示', async () => {
    const r = await call('get_video_info', { videos: ['BV1000000000', 'BV2000000000'] })
    expect(r).toMatchObject({ failed: undefined, not_attempted: undefined, hint: undefined })
  })

  it('参数校验', async () => {
    await expect(call('get_video_info', {})).rejects.toMatchObject({ message: '缺少参数 videos' })
    await expect(call('get_video_info', { videos: [] })).rejects.toMatchObject({ code: 'INVALID_ARGS' })
    await expect(call('get_video_info', { videos: Array.from({ length: 21 }, (_, i) => `BV${i}`) })).rejects.toMatchObject({ code: 'INVALID_ARGS' })
  })

  it('短链要展开，不是视频时报错', async () => {
    api.expandShort.mockResolvedValue({ type: 'ugc', bvid: 'BV8000000000' })
    await call('get_video_info', { videos: 'https://b23.tv/abc' })
    expect(api.expandShort).toHaveBeenCalledWith('https://b23.tv/abc')
    expect(api.fetchVideoDetail).toHaveBeenCalledWith({ type: 'ugc', bvid: 'BV8000000000' })
    api.expandShort.mockResolvedValue(null)
    await expect(call('get_video_info', { videos: 'https://b23.tv/def' })).rejects.toMatchObject({ code: 'INVALID_ARGS' })
    await expect(call('get_video_info', { videos: 'ep123' })).rejects.toMatchObject({ code: 'INVALID_ARGS' })
  })
})

describe('get_video_transcript', () => {
  it('默认返回总结、章节和字幕', async () => {
    const r = await call('get_video_transcript', { video: 'BV1000000000' })
    expect(api.fetchSummary).toHaveBeenCalledWith('BV1000000000', 11, 7)
    expect(api.fetchPlayer).toHaveBeenCalledWith('BV1000000000', 11)
    expect(api.fetchSubtitleLines).toHaveBeenCalledWith(TRACK)
    expect(r).toMatchObject({
      content_notice: NOTICE,
      bvid: 'BV1000000000',
      page: 1,
      cid: 11,
      summary: { status: 'ok', text: '总结' },
      chapters: [{ from: 0, to: 5, title: '开场' }],
      subtitle: {
        status: 'ok',
        lang: 'zh-CN',
        available: [{ lang: 'zh-CN', name: '中文', ai: false }],
        total_lines: 3,
        offset: 0,
        next_offset: null
      },
      hint: undefined
    })
    expect(r.subtitle.text.split('\n')[1]).toMatch(/^\[01:05\] 1/)
  })

  it('超过一小时的时间戳带小时', async () => {
    api.fetchSubtitleLines.mockResolvedValue([{ from: 3665, to: 3666, content: '末尾' }])
    expect((await call('get_video_transcript', { video: 'BV1000000000' })).subtitle.text).toBe('[1:01:05] 末尾')
  })

  it('分P：默认用链接里的 p，也可以指定，超范围时报错', async () => {
    await call('get_video_transcript', { video: 'https://www.bilibili.com/video/BV1000000000?p=2' })
    expect(api.fetchPlayer).toHaveBeenLastCalledWith('BV1000000000', 22)
    await expect(call('get_video_transcript', { video: 'BV1000000000', page: 3 })).rejects.toMatchObject({
      code: 'INVALID_ARGS',
      message: expect.stringContaining('只有 2 个分P')
    })
  })

  it('时长和名字是这一P的；单P视频没有 part_title，缺时长时用整个视频的', async () => {
    expect(await call('get_video_transcript', { video: 'BV1000000000', page: 2 })).toMatchObject({ page: 2, duration: 40, part_title: '下' })
    api.fetchVideoDetail.mockResolvedValue(detail({ bvid: 'BV2000000000', pages: [{ cid: 33, page: 1 }] }))
    const r = await call('get_video_transcript', { video: 'BV2000000000' })
    expect(r).toMatchObject({ duration: 60, part_title: undefined })
  })

  it('include 只取需要的内容', async () => {
    const r = await call('get_video_transcript', { video: 'BV1000000000', include: ['summary'] })
    expect(r.summary.status).toBe('ok')
    expect(r.chapters).toBeUndefined()
    expect(r.subtitle).toBeUndefined()
    expect(api.fetchPlayer).not.toHaveBeenCalled()
    const c = await call('get_video_transcript', { video: 'BV1000000000', include: 'chapters' })
    expect(c.subtitle).toBeUndefined()
    expect(c.chapters).toHaveLength(1)
    expect(api.fetchSubtitleLines).not.toHaveBeenCalled()
  })

  it('分段读取：不重复总结和章节，字幕只下载一次，能读到结尾', async () => {
    api.fetchSubtitleLines.mockResolvedValue(lines(100, 20))
    const first = await call('get_video_transcript', { video: 'BV1000000000', max_chars: 500 })
    expect(first.subtitle.text.length).toBeLessThanOrEqual(500)
    expect(first.subtitle.next_offset).toBeGreaterThan(0)
    expect(first.hint).toContain(`offset=${first.subtitle.next_offset}`)
    let offset = first.subtitle.next_offset
    let read = first.subtitle.text.split('\n').length
    while (offset) {
      const next = await call('get_video_transcript', { video: 'BV1000000000', max_chars: 500, offset })
      expect(next.summary).toBeUndefined()
      expect(next.chapters).toBeUndefined()
      read += next.subtitle.text.split('\n').length
      offset = next.subtitle.next_offset
    }
    expect(read).toBe(100)
    expect(api.fetchSubtitleLines).toHaveBeenCalledTimes(1)
    expect(api.fetchSummary).toHaveBeenCalledTimes(1)
  })

  it('超长的一行也会返回并截断，不会卡住', async () => {
    api.fetchSubtitleLines.mockResolvedValue([{ from: 0, to: 1, content: '长'.repeat(1000) }, { from: 1, to: 2, content: '下一行' }])
    const r = await call('get_video_transcript', { video: 'BV1000000000', max_chars: 500 })
    expect(r.subtitle.text).toHaveLength(500)
    expect(r.subtitle.next_offset).toBe(1)
  })

  it('offset 超出范围时返回空内容', async () => {
    const r = await call('get_video_transcript', { video: 'BV1000000000', offset: 99 })
    expect(r.subtitle).toMatchObject({ status: 'ok', text: '', next_offset: null })
  })

  it('字幕语言：默认人工中文优先，其次 AI 中文，再次第一条；可以指定', async () => {
    const zh = { lan: 'zh-Hans', lan_doc: '中文', subtitle_url: '//zh' }
    const ai = { lan: 'ai-zh', lan_doc: '中文（自动生成）', subtitle_url: '//ai' }
    const en = { lan: 'en', lan_doc: 'English', subtitle_url: '//en' }
    // 每个视频的 cid 不同，字幕列表按 cid 缓存
    api.fetchVideoDetail.mockImplementation(async (r: { bvid: string }) => detail({ bvid: r.bvid, pages: [{ cid: Number(r.bvid[2]), page: 1 }] }))
    api.fetchPlayer.mockResolvedValueOnce({ tracks: [en, ai, zh], viewPoints: [] })
    expect((await call('get_video_transcript', { video: 'BV1000000000' })).subtitle.lang).toBe('zh-Hans')
    api.fetchPlayer.mockResolvedValueOnce({ tracks: [en, ai], viewPoints: [] })
    const r = await call('get_video_transcript', { video: 'BV2000000000' })
    expect(r.subtitle.lang).toBe('ai-zh')
    expect(r.subtitle.available).toContainEqual({ lang: 'ai-zh', name: '中文（自动生成）', ai: true })
    api.fetchPlayer.mockResolvedValueOnce({ tracks: [en], viewPoints: [] })
    expect((await call('get_video_transcript', { video: 'BV3000000000' })).subtitle.lang).toBe('en')
    api.fetchPlayer.mockResolvedValueOnce({ tracks: [en, ai], viewPoints: [] })
    expect((await call('get_video_transcript', { video: 'BV4000000000', lang: 'en' })).subtitle.lang).toBe('en')
  })

  it('指定的语言不存在', async () => {
    const r = await call('get_video_transcript', { video: 'BV1000000000', lang: 'fr' })
    expect(r.subtitle).toMatchObject({ status: 'not_found' })
    expect(r.hint).toContain('fr')
  })

  it('没有字幕：登录时说视频没有，没登录时提示登录，查不到登录状态时也有说法', async () => {
    api.fetchPlayer.mockResolvedValue({ tracks: [], viewPoints: [] })
    api.fetchVideoDetail.mockImplementation(async (r: { bvid: string }) => detail({ bvid: r.bvid, pages: [{ cid: Number(r.bvid[2]), page: 1 }] }))
    expect((await call('get_video_transcript', { video: 'BV1000000000' })).hint).toBe('这个视频没有字幕')
    authState.mockResolvedValue({ loggedIn: false })
    const r = await call('get_video_transcript', { video: 'BV2000000000' })
    expect(r.subtitle).toEqual({ status: 'none', available: [] })
    expect(r.hint).toContain('没有登录')
    authState.mockRejectedValue(new Error('网络'))
    expect((await call('get_video_transcript', { video: 'BV3000000000' })).hint).toBe('这个视频没有字幕')
  })

  it('字幕下载失败时写明原因，下次重新下载', async () => {
    api.fetchSubtitleLines.mockResolvedValueOnce(undefined)
    const r = await call('get_video_transcript', { video: 'BV1000000000', include: ['subtitle'] })
    expect(r.subtitle).toMatchObject({ status: 'failed', lang: 'zh-CN', error: expect.stringContaining('下载失败') })
    await new Promise((resolve) => setImmediate(resolve))
    expect((await call('get_video_transcript', { video: 'BV1000000000', include: ['subtitle'] })).subtitle.status).toBe('ok')
  })

  it('总结的各种状态都不影响字幕', async () => {
    api.fetchSummary.mockResolvedValueOnce(undefined)
    expect((await call('get_video_transcript', { video: 'BV1000000000' })).summary).toEqual({ status: 'none' })
    api.fetchSummary.mockRejectedValueOnce(new AuthExpiredError())
    const login = await call('get_video_transcript', { video: 'BV1000000000' })
    expect(login.summary).toEqual({ status: 'need_login' })
    expect(login.subtitle.status).toBe('ok')
    api.fetchSummary.mockRejectedValueOnce(new BiliError('服务错误', -504))
    expect((await call('get_video_transcript', { video: 'BV1000000000' })).summary).toEqual({ status: 'unavailable' })
    api.fetchSummary.mockRejectedValueOnce(new BiliError('被拦截', -412))
    expect((await call('get_video_transcript', { video: 'BV1000000000' })).summary).toEqual({ status: 'rate_limited' })
  })

  it('总结和提纲太长时截断', async () => {
    api.fetchSummary.mockResolvedValue({ text: '长'.repeat(2500), outline: Array.from({ length: 30 }, () => ({ title: '节', points: [] })) })
    const r = await call('get_video_transcript', { video: 'BV1000000000' })
    expect(r.summary).toMatchObject({ truncated: true, outline_total: 30 })
    expect(r.summary.text).toHaveLength(2000)
    expect(r.summary.outline).toHaveLength(20)
    expect(r.hint).toContain('只返回了前面的部分')
  })

  it('总结没超长时没有截断标记', async () => {
    const r = await call('get_video_transcript', { video: 'BV1000000000' })
    expect(r.summary).toMatchObject({ truncated: undefined, outline_total: undefined })
  })

  it('章节超过上限时写明总数', async () => {
    api.fetchPlayer.mockResolvedValue({
      tracks: [TRACK],
      viewPoints: Array.from({ length: 60 }, (_, i) => ({ from: i, to: i + 1, content: `节${i}` }))
    })
    const r = await call('get_video_transcript', { video: 'BV1000000000' })
    expect(r.chapters).toHaveLength(50)
    expect(r.chapters_total).toBe(60)
    expect(r.hint).toContain('60 个')
  })

  it('空的字幕列表不缓存：用户登录后再查能拿到', async () => {
    api.fetchPlayer.mockResolvedValueOnce({ tracks: [], viewPoints: [] })
    authState.mockResolvedValueOnce({ loggedIn: false })
    const before = await call('get_video_transcript', { video: 'BV1000000000', include: ['subtitle'] })
    expect(before.subtitle.status).toBe('none')
    expect(before.hint).toContain('没有登录')
    expect((await call('get_video_transcript', { video: 'BV1000000000', include: ['subtitle'] })).subtitle.status).toBe('ok')
    // 有字幕的结果照常缓存
    await call('get_video_transcript', { video: 'BV1000000000', include: ['subtitle'] })
    expect(api.fetchPlayer).toHaveBeenCalledTimes(2)
  })

  it('字幕列表失败时写在提示里，总结照常返回', async () => {
    api.fetchPlayer.mockRejectedValue(new BiliError('接口错误', -400))
    const r = await call('get_video_transcript', { video: 'BV1000000000' })
    expect(r.summary.status).toBe('ok')
    expect(r.subtitle).toBeUndefined()
    expect(r.chapters).toBeUndefined()
    expect(r.hint).toContain('接口错误')
  })

  it('视频详情失败时报错', async () => {
    api.fetchVideoDetail.mockRejectedValue(new BiliError('啥都木有', -404))
    await expect(call('get_video_transcript', { video: 'BV1000000000' })).rejects.toThrow('啥都木有')
  })

  it('参数校验', async () => {
    await expect(call('get_video_transcript', {})).rejects.toMatchObject({ message: '缺少参数 video' })
    await expect(call('get_video_transcript', { video: 'BV1000000000', include: ['x'] })).rejects.toMatchObject({ code: 'INVALID_ARGS' })
    await expect(call('get_video_transcript', { video: 'BV1000000000', max_chars: 10 })).rejects.toMatchObject({ code: 'INVALID_ARGS' })
  })
})

describe('get_video_comments', () => {
  it('用视频的 aid 查询，整理输出字段', async () => {
    api.fetchComments.mockResolvedValue({
      total: 100,
      isEnd: false,
      next: 'abc',
      comments: [comment({ id: 5, author: '用户', likes: 3, replyCount: 2, text: '长'.repeat(301), pinned: true }), comment({ id: 6 })]
    })
    const r = await call('get_video_comments', { video: 'BV1000000000' })
    expect(api.fetchComments).toHaveBeenCalledWith(1, 'hot', undefined)
    expect(r).toMatchObject({ content_notice: NOTICE, total: 100, partial: undefined, next_cursor: 'abc' })
    expect(r.comments[0]).toMatchObject({
      id: 5,
      author: '用户',
      time: '2023-11-15T06:13:20+08:00',
      likes: 3,
      reply_count: 2,
      truncated: true,
      pinned: true
    })
    expect(r.comments[0].text).toHaveLength(300)
    expect(r.comments[1].reply_count).toBeUndefined()
    expect(r.hint).toContain('root')
  })

  it('翻页和排序', async () => {
    const r = await call('get_video_comments', { video: 'BV1000000000', sort: 'time', cursor: 'abc' })
    expect(api.fetchComments).toHaveBeenCalledWith(1, 'time', 'abc')
    expect(r).toMatchObject({ next_cursor: null, hint: undefined })
  })

  it('第一页就到头时 partial：按实际登录状态提示；回复算进去后对得上就不是', async () => {
    api.fetchComments.mockResolvedValue({ total: 8000, isEnd: true, comments: [comment()] })
    authState.mockResolvedValueOnce({ loggedIn: false })
    const r = await call('get_video_comments', { video: 'BV1000000000' })
    expect(r.partial).toBe(true)
    expect(r.hint).toContain('没有登录')
    // 已登录时不能让用户再去登录；查不到登录状态时同样不提登录
    const logged = await call('get_video_comments', { video: 'BV1000000000' })
    expect(logged.partial).toBe(true)
    expect(logged.hint).toContain('隐藏或折叠')
    expect(logged.hint).not.toContain('登录')
    authState.mockRejectedValueOnce(new Error('网络'))
    expect((await call('get_video_comments', { video: 'BV1000000000' })).hint).toContain('隐藏或折叠')
    api.fetchComments.mockResolvedValue({ total: 8, isEnd: true, comments: [comment({ replyCount: 7 })] })
    expect((await call('get_video_comments', { video: 'BV1000000000' })).partial).toBeUndefined()
    // 翻页到最后一页时当前页比总数少是正常的
    api.fetchComments.mockResolvedValue({ total: 8000, isEnd: true, comments: [comment()] })
    expect((await call('get_video_comments', { video: 'BV1000000000', cursor: 'x' })).partial).toBeUndefined()
  })

  it('root 读楼中楼，游标是页码', async () => {
    api.fetchCommentReplies.mockResolvedValue({ total: 50, isEnd: false, next: '2', comments: [comment({ replyCount: 1 })] })
    const r = await call('get_video_comments', { video: 'BV1000000000', root: 5 })
    expect(api.fetchCommentReplies).toHaveBeenCalledWith(1, 5, 1)
    expect(r).toMatchObject({ next_cursor: '2', partial: undefined, hint: undefined })
    await call('get_video_comments', { video: 'BV1000000000', root: 5, cursor: '2' })
    expect(api.fetchCommentReplies).toHaveBeenLastCalledWith(1, 5, 2)
    expect(api.fetchComments).not.toHaveBeenCalled()
  })

  it('楼中楼的游标不是页码时报错', async () => {
    await expect(call('get_video_comments', { video: 'BV1000000000', root: 5, cursor: 'abc' })).rejects.toMatchObject({ code: 'INVALID_ARGS' })
  })

  it('详情缓存共用：同一视频不重复查 aid', async () => {
    await call('get_video_comments', { video: 'BV1000000000' })
    await call('get_video_comments', { video: 'BV1000000000', sort: 'time' })
    expect(api.fetchVideoDetail).toHaveBeenCalledTimes(1)
  })
})

describe('resolveBvids', () => {
  it('带 BV 号的不请求接口，短链和 av 号要查，查不到的放进 rejected', async () => {
    api.expandShort.mockResolvedValueOnce({ type: 'ugc', bvid: 'BV3000000000' })
    api.expandShort.mockResolvedValueOnce(null)
    api.expandShort.mockRejectedValueOnce(new TypeError('fetch failed'))
    api.fetchVideoDetail.mockResolvedValue(detail({ bvid: 'BV4000000000' }))
    const r = await tools.resolveBvids([
      'BV1000000000',
      'https://www.bilibili.com/video/BV2000000000?p=3',
      'https://b23.tv/aaa',
      'https://b23.tv/bbb',
      'https://b23.tv/ccc',
      'av9',
      'https://space.bilibili.com/1',
      '随便'
    ])
    expect(r.bvids).toEqual(['BV1000000000', 'BV2000000000', 'BV3000000000', 'BV4000000000'])
    expect(r.rejected).toEqual(['https://b23.tv/bbb', 'https://b23.tv/ccc', 'https://space.bilibili.com/1', '随便'])
    expect(api.fetchVideoDetail).toHaveBeenCalledTimes(1)
    expect(api.fetchVideoDetail).toHaveBeenCalledWith({ type: 'ugc', aid: 9 })
  })

  it('带 BV 号的再多也不请求', async () => {
    const list = Array.from({ length: 200 }, (_, i) => `BV${String(i).padStart(10, '0')}`)
    expect((await tools.resolveBvids(list)).bvids).toHaveLength(200)
    expect(api.expandShort).not.toHaveBeenCalled()
  })

  it('短链和 av 号最多 20 个', async () => {
    const list = Array.from({ length: 21 }, (_, i) => `https://b23.tv/x${i}`)
    await expect(tools.resolveBvids(list)).rejects.toMatchObject({ code: 'INVALID_ARGS' })
    expect(api.expandShort).not.toHaveBeenCalled()
  })

  it('风控时直接抛出，不再查后面的', async () => {
    api.fetchVideoDetail.mockRejectedValue(new BiliError('被拦截', -412))
    await expect(tools.resolveBvids(['av1', 'av2'])).rejects.toMatchObject({ message: '被拦截' })
    expect(api.fetchVideoDetail).toHaveBeenCalledTimes(1)
  })
})
