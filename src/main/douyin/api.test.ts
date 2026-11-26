import { describe, expect, it, vi } from 'vitest'
import { t } from '@shared/i18n'
import { DouyinApi } from './api'
import { DyApiError, DyCooldownError, DyError, DyLoginError, DyUnavailableError, DyVerifyError } from './errors'
import { DouyinGate } from './gate'
import type { DouyinTransport, DyRawResponse, DyRequest } from './transport/types'

const ID = '7000000000000000001'
const SEC = 'fake_sec_uid_abcdefghij_0001'
const ME = { account: 'acc' }
const ANON = { account: null }

const raw = (body: string, status = 200): DyRawResponse => ({ status, body })
const reply = (data: Record<string, unknown>): DyRawResponse => raw(JSON.stringify({ status_code: 0, ...data }))
const aweme = (n: number) => ({ aweme_id: `70000000000000000${String(n).padStart(2, '0')}` })

function setup(...replies: (DyRawResponse | Error)[]) {
  const queue = [...replies]
  const next = (): DyRawResponse => {
    const r = queue.length > 1 ? queue.shift()! : queue[0]
    if (r instanceof Error) throw r
    return r
  }
  const transport = {
    request: vi.fn<DouyinTransport['request']>(async () => next()),
    verify: vi.fn<DouyinTransport['verify']>(async () => next()),
    dispose: vi.fn()
  }
  const gate = new DouyinGate({ interval: 0, jitter: 0 })
  const api = new DouyinApi(transport, gate)
  const sent = (): DyRequest[] => transport.request.mock.calls.map((c) => c[0])
  return { api, gate, transport, sent }
}

const caught = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => {
      throw new Error('应该失败')
    },
    (e: unknown) => e
  )

describe('call', () => {
  it('把账号和取消信号交给通道，返回解析后的数据并恢复账号状态', async () => {
    const { api, gate, transport } = setup(reply({ user: { uid: '1' } }))
    const ok = vi.spyOn(gate, 'ok')
    const signal = new AbortController().signal
    await expect(api.call({ endpoint: 'self' }, { account: 'acc', signal })).resolves.toMatchObject({ user: { uid: '1' } })
    expect(transport.request).toHaveBeenCalledWith({ endpoint: 'self' }, { account: 'acc', signal })
    expect(ok).toHaveBeenCalledWith('acc')
  })

  it('通道报要验证时记下这个请求', async () => {
    const { api, gate } = setup(new DyVerifyError())
    const req: DyRequest = { endpoint: 'detail', query: { aweme_id: ID } }
    await expect(api.call(req, ME)).rejects.toBeInstanceOf(DyVerifyError)
    expect(gate.snapshot('acc')).toEqual({ state: 'verify' })
    expect(gate.probe('acc')).toEqual(req)
  })

  it('通道的其他错误原样抛出，不改账号状态', async () => {
    const error = new DyError('页面没响应')
    const { api, gate } = setup(error)
    await expect(api.call({ endpoint: 'self' }, ME)).rejects.toBe(error)
    expect(gate.snapshot('acc')).toEqual({ state: 'ok' })
  })

  it('响应要求验证时进入验证状态', async () => {
    const { api, gate } = setup(reply({ data: [], search_nil_info: { search_nil_type: 'verify_check' } }))
    const req: DyRequest = { endpoint: 'searchVideos' }
    const e = await caught(api.call(req, ME))
    expect(e).toBeInstanceOf(DyVerifyError)
    expect((e as DyVerifyError).probe).toBe(req)
    expect(gate.probe('acc')).toBe(req)
  })

  it('登录账号被空响应拒绝时进入冷却，之后的请求不再发出', async () => {
    const { api, gate, transport } = setup(raw(''))
    await expect(api.call({ endpoint: 'posts' }, ME)).rejects.toBeInstanceOf(DyCooldownError)
    expect(gate.snapshot('acc').state).toBe('cooling')
    await expect(api.call({ endpoint: 'posts' }, ME)).rejects.toBeInstanceOf(DyCooldownError)
    expect(transport.request).toHaveBeenCalledTimes(1)
    gate.reset('acc')
  })

  it('匿名被空响应拒绝时提示登录，不进冷却', async () => {
    const { api, gate } = setup(reply({}))
    const e = await caught(api.call({ endpoint: 'posts' }, ANON))
    expect(e).toBeInstanceOf(DyLoginError)
    expect((e as Error).message).toBe(t('dy.errRejected'))
    expect(gate.snapshot(null)).toEqual({ state: 'ok' })
  })

  it('明确的限流对匿名也生效', async () => {
    const { api, gate } = setup(raw('blocked'))
    await expect(api.call({ endpoint: 'detail' }, ANON)).rejects.toBeInstanceOf(DyCooldownError)
    expect(gate.snapshot(null).state).toBe('cooling')
    gate.reset(null)
  })

  it('只有查自己资料的接口能判定账号失效', async () => {
    const { api, gate } = setup(raw(JSON.stringify({ status_code: 8 })))
    const other = await caught(api.call({ endpoint: 'likes' }, ME))
    expect(other).toBeInstanceOf(DyLoginError)
    expect((other as Error).message).toBe(t('dy.errLogin'))
    expect(gate.snapshot('acc')).toEqual({ state: 'ok' })

    await expect(api.call({ endpoint: 'self' }, ANON)).rejects.toThrow(t('dy.errLogin'))
    expect(gate.snapshot(null)).toEqual({ state: 'ok' })

    await expect(api.call({ endpoint: 'self' }, ME)).rejects.toThrow(t('dy.errExpired'))
    expect(gate.snapshot('acc')).toEqual({ state: 'expired' })
  })

  it('业务错误带上状态码和说明', async () => {
    const { api } = setup(raw(JSON.stringify({ status_code: 5, status_msg: '参数不对' })))
    const e = await caught(api.call({ endpoint: 'detail' }, ME))
    expect(e).toBeInstanceOf(DyApiError)
    expect(e).toMatchObject({ code: 5, message: t('dy.errApi', { reason: '参数不对' }) })
  })
})

describe('verify', () => {
  it('重发触发验证的请求，通过后账号恢复正常', async () => {
    const { api, gate, transport } = setup(reply({ aweme_detail: aweme(1) }))
    const probe: DyRequest = { endpoint: 'detail', query: { aweme_id: ID } }
    gate.requireVerify('acc', probe)
    const signal = new AbortController().signal
    await api.verify('acc', signal)
    expect(transport.verify).toHaveBeenCalledWith('acc', probe, signal)
    expect(gate.snapshot('acc')).toEqual({ state: 'ok' })
  })

  it('没记下请求时用查自己资料的接口；匿名返回未登录也算通过', async () => {
    const { api, gate, transport } = setup(raw(JSON.stringify({ status_code: 8 })))
    gate.requireVerify(null)
    await api.verify(null)
    expect(transport.verify).toHaveBeenCalledWith(null, { endpoint: 'self' }, undefined)
    expect(gate.snapshot(null)).toEqual({ state: 'ok' })
  })

  it('仍然要验证时保持原状态', async () => {
    const { api, gate } = setup(reply({ data: [], search_nil_info: { search_nil_item: 'verify_check' } }))
    gate.requireVerify('acc')
    const e = await caught(api.verify('acc'))
    expect(e).toBeInstanceOf(DyVerifyError)
    expect((e as DyVerifyError).probe).toEqual({ endpoint: 'self' })
    expect(gate.snapshot('acc')).toEqual({ state: 'verify' })
  })

  it('验证时被限流就进入冷却', async () => {
    const { api, gate } = setup(raw('', 429))
    gate.requireVerify('acc')
    await expect(api.verify('acc')).rejects.toBeInstanceOf(DyCooldownError)
    expect(gate.snapshot('acc').state).toBe('cooling')
    gate.reset('acc')
  })
})

describe('单个对象的接口', () => {
  it('作品详情', async () => {
    const { api, sent } = setup(reply({ aweme_detail: aweme(1) }))
    await expect(api.detail(ID, ME)).resolves.toEqual(aweme(1))
    expect(sent()).toEqual([{ endpoint: 'detail', query: { aweme_id: ID } }])
  })

  it.each([
    [{ detail_msg: '作者设为私密', filter_reason: 'status' }, '作者设为私密'],
    [{ filter_reason: 'status_audit' }, 'status_audit'],
    [{}, '可能已删除或设为私密']
  ])('作品不可用时说明原因 %#', async (filter_detail, reason) => {
    const { api } = setup(reply({ aweme_detail: null, filter_detail }))
    const e = await caught(api.detail(ID, ME))
    expect(e).toBeInstanceOf(DyUnavailableError)
    expect((e as Error).message).toBe(t('dy.errUnavailable', { reason }))
  })

  it('没给作品也没给原因：当作被拦，可以重试', async () => {
    const { api } = setup(reply({ aweme_detail: null }))
    const e = await caught(api.detail(ID, ME))
    expect(e).toBeInstanceOf(DyError)
    expect((e as Error).message).toBe(t('dy.errRejected'))
  })

  it('博主资料；没有这个人时报错', async () => {
    const found = setup(reply({ user: { nickname: '示例博主' } }))
    await expect(found.api.profile(SEC, ME)).resolves.toEqual({ nickname: '示例博主' })
    expect(found.sent()[0]).toEqual({ endpoint: 'profile', query: { sec_user_id: SEC } })
    const missing = setup(reply({ user: null }))
    await expect(missing.api.profile(SEC, ME)).rejects.toThrow(t('dy.errUserMissing'))
  })

  it('当前账号：返回里没有用户就标记失效', async () => {
    const found = setup(reply({ user: { sec_uid: SEC } }))
    await expect(found.api.self(ME)).resolves.toEqual({ sec_uid: SEC })

    const expired = setup(reply({ user: null }))
    await expect(expired.api.self(ME)).rejects.toThrow(t('dy.errExpired'))
    expect(expired.gate.snapshot('acc')).toEqual({ state: 'expired' })

    const anonymous = setup(reply({ user: {} }))
    await expect(anonymous.api.self(ANON)).rejects.toBeInstanceOf(DyLoginError)
    expect(anonymous.gate.snapshot(null)).toEqual({ state: 'ok' })
  })

  it('合集详情', async () => {
    const { api, sent } = setup(reply({ mix_info: { mix_id: '1' } }))
    await expect(api.mixDetail('1', ME)).resolves.toEqual({ mix_id: '1' })
    expect(sent()[0]).toEqual({ endpoint: 'mixDetail', query: { mix_id: '1' } })
  })
})

describe('作品列表翻页', () => {
  it('取到内容就返回，丢掉没有 id 的条目', async () => {
    const { api, sent } = setup(reply({ aweme_list: [aweme(1), null, {}, aweme(2)], max_cursor: 1700, has_more: 1 }))
    await expect(api.posts(SEC, '', ME)).resolves.toEqual({ items: [aweme(1), aweme(2)], cursor: '1700', hasMore: true })
    expect(sent()).toEqual([{ endpoint: 'posts', query: { sec_user_id: SEC, max_cursor: '0', count: '18' } }])
  })

  it('中间的空页在游标前进时继续翻', async () => {
    const { api, sent } = setup(
      reply({ aweme_list: [], max_cursor: 300, has_more: 1 }),
      reply({ aweme_list: [], max_cursor: 200, has_more: 1 }),
      reply({ aweme_list: [aweme(3)], max_cursor: 100, has_more: 0 })
    )
    await expect(api.posts(SEC, '400', ME)).resolves.toEqual({ items: [aweme(3)], cursor: '100', hasMore: false })
    expect(sent().map((r) => r.query!.max_cursor)).toEqual(['400', '300', '200'])
  })

  it('没有下一页的空页是正常到底', async () => {
    const { api } = setup(reply({ aweme_list: [], has_more: 0 }))
    await expect(api.posts(SEC, '', ME)).resolves.toEqual({ items: [], cursor: '', hasMore: false })
  })

  it('空页游标不动时报没读完，而不是当成到底', async () => {
    const { api, transport } = setup(reply({ aweme_list: [], max_cursor: 5, has_more: 1 }))
    const e = await caught(api.posts(SEC, '5', ME))
    expect(e).toBeInstanceOf(DyError)
    expect((e as Error).message).toBe(t('dy.errIncomplete'))
    expect(transport.request).toHaveBeenCalledTimes(1)
  })

  it('空页太多时放弃', async () => {
    const { api, transport } = setup(reply({ aweme_list: [], max_cursor: 1, has_more: 1 }))
    let n = 0
    transport.request.mockImplementation(async () => reply({ aweme_list: [], max_cursor: ++n, has_more: 1 }))
    await expect(api.posts(SEC, '', ME)).rejects.toThrow(t('dy.errIncomplete'))
    expect(transport.request).toHaveBeenCalledTimes(60)
  })

  it('博主主页的列表为 null 算拒绝', async () => {
    const { api } = setup(reply({ aweme_list: null, has_more: 0 }))
    await expect(api.posts(SEC, '', ANON)).rejects.toBeInstanceOf(DyLoginError)
  })

  type Case = [string, (api: DouyinApi, cursor: string) => Promise<unknown>, string, string, (c: string) => DyRequest]
  const cases: Case[] = [
    [
      '喜欢',
      (a, c) => a.likes(SEC, c, ME),
      'aweme_list',
      'max_cursor',
      (c) => ({ endpoint: 'likes', query: { sec_user_id: SEC, max_cursor: c, min_cursor: '0', count: '18' } })
    ],
    ['收藏', (a, c) => a.collection(c, ME), 'aweme_list', 'cursor', (c) => ({ endpoint: 'collection', method: 'POST', body: { cursor: c, count: '18' } })],
    ['收藏夹内容', (a, c) => a.folderItems('55', c, ME), 'aweme_list', 'cursor', (c) => ({ endpoint: 'folderItems', query: { collects_id: '55', cursor: c, count: '18' } })],
    ['合集内容', (a, c) => a.mixItems('66', c, ME), 'aweme_list', 'cursor', (c) => ({ endpoint: 'mixItems', query: { mix_id: '66', cursor: c, count: '20' } })],
    ['稍后再看', (a, c) => a.watchLater(c, ME), 'items', 'offset', (c) => ({ endpoint: 'watchLater', query: { offset: c, count: '18' } })],
    ['观看历史', (a, c) => a.history(c, ME), 'aweme_list', 'max_cursor', (c) => ({ endpoint: 'history', query: { max_cursor: c, count: '20' } })]
  ]

  it.each(cases)('%s：缺省从头取，之后带上游标', async (_name, run, key, next, request) => {
    const { api, sent } = setup(reply({ [key]: [aweme(1)], [next]: 42, has_more: true }))
    await expect(run(api, '')).resolves.toEqual({ items: [aweme(1)], cursor: '42', hasMore: true })
    await run(api, '42')
    expect(sent()).toEqual([request('0'), request('42')])
  })

  it.each(cases.filter(([name]) => name !== '合集内容'))('%s：列表为 null 且没有下一页是空列表', async (_name, run, key) => {
    const { api } = setup(reply({ [key]: null, has_more: 0 }))
    await expect(run(api, '')).resolves.toEqual({ items: [], cursor: '', hasMore: false })
  })

  it('合集内容为 null 算拒绝', async () => {
    const { api, gate } = setup(reply({ aweme_list: null, has_more: 0 }))
    await expect(api.mixItems('66', '', ME)).rejects.toBeInstanceOf(DyCooldownError)
    gate.reset('acc')
  })
})

describe('账号里的列表', () => {
  it('收藏夹', async () => {
    const { api, sent } = setup(reply({ collects_list: [{ collects_id_str: '55' }], cursor: 20, has_more: true, total_number: 3 }))
    await expect(api.folders('', ME)).resolves.toEqual({ items: [{ collects_id_str: '55' }], cursor: '20', hasMore: true, total: 3 })
    await api.folders('20', ME)
    expect(sent().map((r) => r.query)).toEqual([{ cursor: '0', count: '20' }, { cursor: '20', count: '20' }])
    const empty = setup(reply({ collects_list: null }))
    await expect(empty.api.folders('', ME)).resolves.toEqual({ items: [], cursor: '', hasMore: false, total: undefined })
  })

  it('收藏的合集', async () => {
    const { api, sent } = setup(reply({ mix_infos: [{ mix_id: '66' }], cursor: 1, has_more: 0 }))
    await expect(api.mixCollections('', ME)).resolves.toEqual({ items: [{ mix_id: '66' }], cursor: '1', hasMore: false })
    await api.mixCollections('1', ME)
    expect(sent().map((r) => r.query!.cursor)).toEqual(['0', '1'])
  })

  it('关注列表按时间往前翻', async () => {
    const { api, sent } = setup(reply({ followings: [{ sec_uid: SEC }], min_time: 1600, has_more: true, total: 9 }))
    const me = { secUid: SEC, uid: '1001' }
    await expect(api.following(me, '', ME)).resolves.toEqual({ items: [{ sec_uid: SEC }], cursor: '1600', hasMore: true, total: 9 })
    await api.following(me, '1600', ME)
    expect(sent()[0].query).toMatchObject({ sec_user_id: SEC, user_id: '1001', max_time: '0', source_type: '4' })
    expect(sent()[1].query).toMatchObject({ max_time: '1600', source_type: '1' })
    const empty = setup(reply({ followings: null }))
    await expect(empty.api.following(me, '', ME)).resolves.toMatchObject({ items: [], total: undefined })
  })
})

describe('搜索', () => {
  it('不筛选时不带筛选参数；翻页带上搜索 id', async () => {
    const { api, sent } = setup(reply({ data: [{ aweme_info: aweme(1) }, {}, { aweme_info: {} }], cursor: 10, has_more: 1, extra: { logid: 'log-1' } }))
    await expect(api.searchVideos('示例词', { offset: 0 }, {}, ME)).resolves.toEqual({ items: [aweme(1)], cursor: '10', hasMore: true, searchId: 'log-1' })
    await api.searchVideos('示例词', { offset: 10, searchId: 'log-1' }, { sort: 0, within: 0 }, ME)
    expect(sent()[0].query).toMatchObject({ keyword: '示例词', offset: '0', is_filter_search: '0' })
    expect(sent()[0].query).not.toHaveProperty('sort_type')
    expect(sent()[0].query).not.toHaveProperty('search_id')
    expect(sent()[1].query).toMatchObject({ offset: '10', search_id: 'log-1', is_filter_search: '0' })
  })

  it.each([
    [{ sort: 1 as const }, { sort_type: '1', publish_time: '0', filter_duration: '' }],
    [{ within: 7 as const }, { sort_type: '0', publish_time: '7', filter_duration: '' }],
    [{ duration: '1-5' as const }, { sort_type: '0', publish_time: '0', filter_duration: '1-5' }]
  ])('带筛选条件 %#', async (filter, expected) => {
    const { api, sent } = setup(reply({ data: [] }))
    await api.searchVideos('示例词', { offset: 0 }, filter, ME)
    expect(sent()[0].query).toMatchObject({ is_filter_search: '1', ...expected })
  })

  it('搜索 id 缺省取 log_pb，两个都没有时为空', async () => {
    const fallback = setup(reply({ data: [], log_pb: { impr_id: 'impr-1' } }))
    await expect(fallback.api.searchVideos('词', { offset: 0 }, {}, ME)).resolves.toMatchObject({ searchId: 'impr-1' })
    const none = setup(reply({ data: null }))
    await expect(none.api.searchVideos('词', { offset: 0 }, {}, ME)).resolves.toEqual({ items: [], cursor: '', hasMore: false, searchId: '' })
  })

  it('搜博主', async () => {
    const { api, sent } = setup(reply({ user_list: [{ user_info: { sec_uid: SEC } }, { user_info: {} }, {}], cursor: 10, has_more: 0 }))
    await expect(api.searchUsers('示例词', 20, ME)).resolves.toEqual({ items: [{ sec_uid: SEC }], cursor: '10', hasMore: false })
    expect(sent()[0]).toMatchObject({ endpoint: 'searchUsers', query: { keyword: '示例词', offset: '20' } })
  })
})

describe('评论和弹幕', () => {
  it('评论', async () => {
    const { api, sent } = setup(reply({ comments: [{ cid: '1' }], cursor: 20, has_more: 1, total: 30 }))
    await expect(api.comments(ID, '', ANON)).resolves.toEqual({ items: [{ cid: '1' }], cursor: '20', hasMore: true, total: 30 })
    await api.comments(ID, '20', ANON)
    expect(sent().map((r) => r.query!.cursor)).toEqual(['0', '20'])
    const empty = setup(reply({ comments: null }))
    await expect(empty.api.comments(ID, '', ME)).resolves.toMatchObject({ items: [], total: undefined })
  })

  it('回复要登录，匿名时不发请求', async () => {
    const { api, transport } = setup(reply({ comments: [] }))
    await expect(api.replies(ID, '1', '', ANON)).rejects.toBeInstanceOf(DyLoginError)
    expect(transport.request).not.toHaveBeenCalled()
  })

  it('回复', async () => {
    const { api, sent } = setup(reply({ comments: [{ cid: '2' }], cursor: 3, has_more: 0, total: 1 }))
    await expect(api.replies(ID, '1', '', ME)).resolves.toEqual({ items: [{ cid: '2' }], cursor: '3', hasMore: false, total: 1 })
    await api.replies(ID, '1', '3', ME)
    expect(sent()[0]).toEqual({ endpoint: 'replies', query: { item_id: ID, comment_id: '1', cursor: '0', count: '20' } })
    expect(sent()[1].query!.cursor).toBe('3')
    const empty = setup(reply({ comments: null }))
    await expect(empty.api.replies(ID, '1', '', ME)).resolves.toMatchObject({ items: [], total: undefined })
  })

  it('弹幕按 32 秒的窗口取', async () => {
    const { api, sent } = setup(reply({ danmaku_list: [{ text: '示例' }] }))
    await expect(api.danmaku(ID, 32_000, 90_000, ME)).resolves.toEqual([{ text: '示例' }])
    expect(sent()[0].query).toEqual({ item_id: ID, group_id: ID, start_time: '32000', end_time: '64000', duration: '90000' })
    const empty = setup(reply({ danmaku_list: null }))
    await expect(empty.api.danmaku(ID, 0, 1000, ME)).resolves.toEqual([])
  })
})
