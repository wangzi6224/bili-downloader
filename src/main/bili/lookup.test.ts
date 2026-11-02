import { beforeEach, describe, expect, it, vi } from 'vitest'

type Params = Record<string, unknown>
const api = vi.hoisted(() => vi.fn<(url: string, params?: Params, opts?: Record<string, unknown>) => Promise<unknown>>())

vi.mock('electron', () => ({}))
vi.mock('./http', async (orig) => ({ ...(await orig<typeof import('./http')>()), api }))

const { BiliError } = await import('./http')
const { biliLookup, cleanText, fetchCategory, fetchCommentReplies, fetchComments, fetchSummary, fetchVideoDetail, searchUsers, searchVideos } =
  await import('./lookup')

const SEARCH = 'https://api.bilibili.com/x/web-interface/wbi/search/type'
const QUIET = { quietAuth: true, noRiskRetry: true }
const WBI = { wbi: true, ...QUIET }

beforeEach(() => {
  api.mockReset()
})

describe('cleanText', () => {
  it.each([
    ['《<em class="keyword">原神</em>》角色', '《原神》角色'],
    ['a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &#x4e2d; &nbsp;f', 'a & b <c> "d" \'e\' 中  f'],
    // 先去标签再解码：标题里本来写着的 <em> 字样要留下
    ['讲解 &lt;em&gt; 标签', '讲解 <em> 标签'],
    // 只解码一次，不会把 &amp;lt; 解成 <
    ['&amp;lt;', '&lt;'],
    ['&unknown; &#99999999;', '&unknown; &#99999999;'],
    // 不能把对象继承来的属性当成实体
    ['&constructor; &__proto__; &toString;', '&constructor; &__proto__; &toString;'],
    ['没有特殊字符', '没有特殊字符']
  ])('%s', (input, want) => {
    expect(cleanText(input)).toBe(want)
  })
})

describe('searchVideos', () => {
  const query = { keyword: '猫', page: 2, pageSize: 5 }

  it('参数和字段映射', async () => {
    api.mockResolvedValue({
      numResults: 1000,
      numPages: 200,
      result: [
        {
          bvid: 'BV1',
          title: '<em class="keyword">猫</em> &amp; 狗',
          author: 'UP',
          mid: 7,
          typename: '动物',
          tag: '猫,宠物,',
          description: '简介 &lt;x&gt;',
          duration: '1:02:03',
          pubdate: 100,
          play: 1,
          danmaku: 2,
          favorites: 3,
          like: 4
        }
      ]
    })
    const r = await searchVideos({ ...query, order: 'click', duration: 2, pubBegin: 10, pubEnd: 20 })
    expect(api).toHaveBeenCalledWith(
      SEARCH,
      { search_type: 'video', keyword: '猫', page: 2, page_size: 5, order: 'click', duration: 2, pubtime_begin_s: 10, pubtime_end_s: 20 },
      WBI
    )
    expect(r).toEqual({
      total: 1000,
      pages: 200,
      list: [
        {
          bvid: 'BV1',
          title: '猫 & 狗',
          author: 'UP',
          mid: 7,
          category: '动物',
          tags: ['猫', '宠物'],
          description: '简介 <x>',
          duration: 3723,
          pubdate: 100,
          play: 1,
          danmaku: 2,
          favorites: 3,
          like: 4
        }
      ]
    })
  })

  it('字段都缺时不出错，没有 bvid 的条目过滤掉', async () => {
    api.mockResolvedValue({ result: [{ title: '广告' }, { bvid: 'BV2' }] })
    const r = await searchVideos(query)
    expect(r.total).toBe(0)
    expect(r.pages).toBe(0)
    expect(r.list).toEqual([expect.objectContaining({ bvid: 'BV2', title: '', tags: [], description: '', category: undefined })])
  })

  it('code 是 0 但只有 v_voucher：当作风控', async () => {
    api.mockResolvedValue({ v_voucher: 'voucher' })
    await expect(searchVideos(query)).rejects.toSatisfy((e) => e instanceof BiliError && e.code === -412)
  })

  it('没有结果也没有 v_voucher：空列表', async () => {
    api.mockResolvedValue({ numResults: 0 })
    expect((await searchVideos(query)).list).toEqual([])
  })
})

describe('searchUsers', () => {
  it('字段映射', async () => {
    api.mockResolvedValue({
      numResults: 3,
      numPages: 1,
      result: [{ mid: 1, uname: '<em class="keyword">猫</em>', usign: '签名', fans: 10, videos: 2, level: 6, is_live: 1 }, { mid: 2 }]
    })
    const r = await searchUsers('猫', 1, 5)
    expect(api).toHaveBeenCalledWith(SEARCH, { search_type: 'bili_user', keyword: '猫', page: 1, page_size: 5 }, WBI)
    expect(r.list).toEqual([
      { mid: 1, name: '猫', sign: '签名', fans: 10, videos: 2, level: 6, isLive: true },
      { mid: 2, name: '', sign: '', isLive: false }
    ])
  })
})

describe('fetchCategory', () => {
  it('只认 BV 号完全相同的结果', async () => {
    api.mockResolvedValue({ result: [{ bvid: 'BV2', typename: '别的' }, { bvid: 'BV1', typename: '动画' }] })
    expect(await fetchCategory('BV1')).toBe('动画')
    expect(api.mock.calls[0][1]).toMatchObject({ keyword: 'BV1', search_type: 'video' })
    api.mockResolvedValue({ result: [{ bvid: 'BV2', typename: '别的' }] })
    expect(await fetchCategory('BV1')).toBeUndefined()
  })
})

describe('fetchVideoDetail', () => {
  const DETAIL = 'https://api.bilibili.com/x/web-interface/wbi/view/detail'

  it('用 bvid 或 aid 查询，映射详情、标签和相关视频', async () => {
    api.mockResolvedValue({
      View: {
        bvid: 'BV1',
        aid: 1,
        title: '标题',
        pic: 'c.jpg',
        desc: '简介',
        pubdate: 100,
        duration: 60,
        tname: '旧分区',
        tname_v2: '新分区',
        owner: { mid: 7, name: 'UP' },
        stat: { view: 1, danmaku: 2, reply: 3, favorite: 4, coin: 5, share: 6, like: 7, now_rank: 0 },
        pages: [{ cid: 11, page: 1, part: 'P1', duration: 60 }],
        ugc_season: { id: 9, title: '合集', cover: 'c' }
      },
      Tags: [{ tag_name: '猫' }, {}],
      Related: [
        { bvid: 'BV2', title: '相关', tname: '动物', pubdate: 200, duration: 30, owner: { name: 'B' }, stat: { view: 9 } },
        { title: '没有 bvid' },
        { bvid: 'BV3' }
      ]
    })
    const d = await fetchVideoDetail({ bvid: 'BV1' })
    expect(api).toHaveBeenCalledWith(DETAIL, { bvid: 'BV1' }, WBI)
    expect(d).toEqual({
      bvid: 'BV1',
      aid: 1,
      title: '标题',
      cover: 'c.jpg',
      author: 'UP',
      mid: 7,
      category: '新分区',
      tags: ['猫'],
      description: '简介',
      pubdate: 100,
      duration: 60,
      pages: [{ cid: 11, page: 1, part: 'P1', duration: 60 }],
      season: { id: 9, title: '合集' },
      stats: { view: 1, danmaku: 2, reply: 3, favorite: 4, coin: 5, share: 6, like: 7 },
      related: [
        { bvid: 'BV2', title: '相关', author: 'B', category: '动物', pubdate: 200, duration: 30, play: 9 },
        { bvid: 'BV3', title: '' }
      ]
    })
    await fetchVideoDetail({ aid: 1 })
    expect(api).toHaveBeenLastCalledWith(DETAIL, { aid: 1 }, WBI)
  })

  it('分区名是空串时算没有；可选字段都缺时不出错', async () => {
    api.mockResolvedValue({ View: { bvid: 'BV1', aid: 1, title: 't', tname: '', tname_v2: '' } })
    expect(await fetchVideoDetail({ bvid: 'BV1' })).toMatchObject({ category: undefined, tags: [], description: '', pages: [], related: [] })
    api.mockResolvedValue({ View: { bvid: 'BV1', aid: 1, title: 't', tname: '旧分区' } })
    expect((await fetchVideoDetail({ bvid: 'BV1' })).category).toBe('旧分区')
  })
})

describe('fetchComments', () => {
  const MAIN = 'https://api.bilibili.com/x/v2/reply/wbi/main'
  const reply = (rpid: number) => ({ rpid, ctime: 100, like: 2, rcount: 1, member: { uname: `用户${rpid}` }, content: { message: `评论${rpid}` } })

  it('第一页带置顶并去重，游标原样传递', async () => {
    api.mockResolvedValue({
      cursor: { is_end: false, all_count: 50, pagination_reply: { next_offset: 'next' } },
      top_replies: [reply(1)],
      replies: [reply(1), reply(2)]
    })
    const r = await fetchComments(9, 'hot')
    expect(api).toHaveBeenCalledWith(
      MAIN,
      { oid: 9, type: 1, mode: 3, plat: 1, web_location: 1315875, pagination_str: '{"offset":""}' },
      WBI
    )
    expect(r).toEqual({
      total: 50,
      isEnd: false,
      next: 'next',
      comments: [
        { id: 1, author: '用户1', time: 100, likes: 2, replyCount: 1, text: '评论1', pinned: true },
        { id: 2, author: '用户2', time: 100, likes: 2, replyCount: 1, text: '评论2', pinned: undefined }
      ]
    })
  })

  it('翻页时不再带置顶，按时间排序', async () => {
    api.mockResolvedValue({ cursor: { is_end: false, pagination_reply: {} }, top_replies: [reply(1)], replies: null })
    const r = await fetchComments(9, 'time', 'abc')
    expect(api.mock.calls[0][1]).toMatchObject({ mode: 2, pagination_str: '{"offset":"abc"}' })
    expect(r.comments).toEqual([])
    expect(r.next).toBeUndefined()
  })

  it('翻到头时没有下一页；响应里什么都没有时也不出错', async () => {
    api.mockResolvedValue({ cursor: { is_end: true, all_count: 1, pagination_reply: { next_offset: 'x' } } })
    expect(await fetchComments(9, 'hot')).toEqual({ total: 1, isEnd: true, next: undefined, comments: [] })
    api.mockResolvedValue({ top_replies: null, replies: [{ rpid: 3 }] })
    expect(await fetchComments(9, 'hot')).toEqual({
      total: 0,
      isEnd: true,
      next: undefined,
      comments: [{ id: 3, author: undefined, time: undefined, likes: undefined, replyCount: 0, text: '', pinned: undefined }]
    })
  })
})

describe('fetchCommentReplies', () => {
  const SUB = 'https://api.bilibili.com/x/v2/reply/reply'

  it('游标是下一页的页码', async () => {
    api.mockResolvedValue({ page: { count: 41 }, replies: [{ rpid: 1 }] })
    const r = await fetchCommentReplies(9, 5, 2)
    expect(api).toHaveBeenCalledWith(SUB, { oid: 9, type: 1, root: 5, pn: 2, ps: 20 }, QUIET)
    expect(r).toMatchObject({ total: 41, isEnd: false, next: '3' })
    expect(r.comments).toHaveLength(1)
  })

  it('最后一页没有游标；空响应不出错', async () => {
    api.mockResolvedValue({ page: { count: 40 }, replies: null })
    expect(await fetchCommentReplies(9, 5, 2)).toEqual({ total: 40, isEnd: true, next: undefined, comments: [] })
    api.mockResolvedValue({})
    expect((await fetchCommentReplies(9, 5, 1)).total).toBe(0)
  })
})

describe('fetchSummary', () => {
  const URL = 'https://api.bilibili.com/x/web-interface/view/conclusion/get'

  it('有总结时映射提纲', async () => {
    api.mockResolvedValue({
      code: 0,
      model_result: {
        summary: '总结',
        outline: [{ title: '一', timestamp: 5, part_outline: [{ timestamp: 6, content: '要点' }, {}] }, {}]
      }
    })
    expect(await fetchSummary('BV1', 2, 3)).toEqual({
      text: '总结',
      outline: [
        { title: '一', start: 5, points: [{ start: 6, text: '要点' }, { start: undefined, text: '' }] },
        { title: '', start: undefined, points: [] }
      ]
    })
    expect(api).toHaveBeenCalledWith(URL, { bvid: 'BV1', cid: 2, up_mid: 3 }, WBI)
  })

  it('没有提纲时只有总结', async () => {
    api.mockResolvedValue({ code: 0, model_result: { summary: '总结' } })
    expect(await fetchSummary('BV1', 2, 3)).toEqual({ text: '总结', outline: [] })
  })

  it('这个视频没有总结时返回 undefined', async () => {
    api.mockResolvedValue({ code: -1, model_result: { summary: '', outline: [] } })
    expect(await fetchSummary('BV1', 2, 3)).toBeUndefined()
    api.mockResolvedValue({ code: 0 })
    expect(await fetchSummary('BV1', 2, 3)).toBeUndefined()
  })
})

describe('biliLookup', () => {
  it('取字幕列表时不触发全局的登录失效', async () => {
    api.mockResolvedValue({})
    await biliLookup.fetchPlayer('BV1', 2)
    expect(api).toHaveBeenCalledWith('https://api.bilibili.com/x/player/wbi/v2', { bvid: 'BV1', cid: 2 }, WBI)
  })

  it('所有请求都不触发登录失效，风控时也不重试', async () => {
    api.mockResolvedValue({ View: { bvid: 'BV1', aid: 1, title: 't' } })
    await searchVideos({ keyword: 'k', page: 1, pageSize: 1 })
    await searchUsers('k', 1, 1)
    await fetchVideoDetail({ bvid: 'BV1' })
    await fetchComments(1, 'hot')
    await fetchCommentReplies(1, 2, 1)
    await fetchSummary('BV1', 2, 3)
    for (const [, , opts] of api.mock.calls) expect(opts).toMatchObject(QUIET)
    expect(api).toHaveBeenCalledTimes(6)
  })
})
