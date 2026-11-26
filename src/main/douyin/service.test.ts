import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@shared/i18n'
import type { MediaItem } from '@shared/types'
import { UnsupportedError } from '../bili/http'
import { AbortError } from '../download/errors'
import type { DouyinApi, DyPage } from './api'
import { DyApiError, DyCooldownError, DyError, DyLoginError, DyUnavailableError, DyVerifyError } from './errors'
import type { DyGateSnapshot } from './gate'
import { DouyinService, douyin, setDouyin, type DyServiceDeps } from './service'
import type { DyAweme } from './types'

const ID = '7000000000000000001'
const MIX = '7100000000000000001'
const SEC = 'fake_sec_uid_abcdefghij_0001'
const MY_SEC = 'fake_sec_uid_abcdefghij_mine'
const HOUR = 60 * 60_000
const VIDEO_URL = `https://www.douyin.com/video/${ID}`
const USER_URL = `https://www.douyin.com/user/${SEC}`
const MIX_URL = `https://www.douyin.com/collection/${MIX}`
const selfUrl = (tab: string, folder?: string): string => `https://www.douyin.com/user/self?showTab=${tab}${folder ? `&collect_id=${folder}` : ''}`

const work = (id: string = ID, over: Partial<DyAweme> = {}): DyAweme => ({
  aweme_id: id,
  desc: `作品 ${id.slice(-2)}`,
  video: { play_addr: { uri: 'u', url_list: ['https://cdn.example.com/v'], width: 720, height: 1280 } },
  ...over
})
const pageOf = <T = DyAweme>(items: T[], over: Partial<DyPage<T>> = {}): DyPage<T> => ({ items, cursor: 'c1', hasMore: false, ...over })

function setup(over: Partial<DyServiceDeps> = {}) {
  const clock = { now: 1_000_000 }
  const api = {
    detail: vi.fn(async (id: string) => work(id)),
    posts: vi.fn(async () => pageOf([work()])),
    likes: vi.fn(async () => pageOf([work()])),
    collection: vi.fn(async () => pageOf([work()])),
    folderItems: vi.fn(async () => pageOf([work()])),
    mixItems: vi.fn(async () => pageOf([work()])),
    watchLater: vi.fn(async () => pageOf([work()])),
    history: vi.fn(async () => pageOf([work()])),
    folders: vi.fn(async () => pageOf<Record<string, unknown>>([])),
    mixCollections: vi.fn(async () => pageOf<Record<string, unknown>>([])),
    following: vi.fn(async () => pageOf<Record<string, unknown>>([])),
    profile: vi.fn(async () => ({ nickname: '示例博主', aweme_count: 40, avatar_thumb: { url_list: ['https://img.example.com/a'] } })),
    danmaku: vi.fn(async () => [{ text: '示例' }])
  }
  const gate = { snapshot: vi.fn((): DyGateSnapshot => ({ state: 'ok' })) }
  const share = { expand: vi.fn(async () => VIDEO_URL), detail: vi.fn(async (id: string) => work(id, { fromShare: true })) }
  const deps: DyServiceDeps = {
    api: api as unknown as DouyinApi,
    gate,
    share,
    currentAccount: () => 'cur',
    identity: (id) => (id === 'cur' || id === 'other' ? { secUid: MY_SEC, uid: '1001' } : undefined),
    now: () => clock.now,
    ...over
  }
  return { service: new DouyinService(deps), api, gate, share, deps, clock }
}

const anonymous = { currentAccount: () => undefined }

afterEach(() => {
  vi.useRealTimers()
})

describe('账号', () => {
  it('不指定时用当前账号，null 表示不登录', () => {
    const { service } = setup()
    expect(service.accountOf()).toBe('cur')
    expect(service.accountOf({ account: 'other' })).toBe('other')
    expect(service.accountOf({ account: null })).toBeNull()
    expect(service.currentAccount()).toBe('cur')
    expect(setup(anonymous).service.accountOf()).toBeNull()
  })

  it('按身份信息判断有没有这个账号', () => {
    const { service } = setup()
    expect(service.hasAccount('cur')).toBe(true)
    expect(service.hasAccount('nobody')).toBe(false)
  })

  it.each([
    [{ state: 'ok' }, undefined],
    [{ state: 'expired' }, 'login'],
    [{ state: 'verify' }, 'verify'],
    [{ state: 'cooling', until: 1 }, 'cooling']
  ] as [DyGateSnapshot, string | undefined][])('状态 %o 时队列要等什么', (snapshot, expected) => {
    const { service, gate } = setup()
    gate.snapshot.mockReturnValue(snapshot)
    expect(service.hold('cur')).toBe(expected)
    expect(gate.snapshot).toHaveBeenCalledWith('cur')
  })
})

describe('单个作品', () => {
  it('一小时内用缓存，过期或要求刷新时重新取', async () => {
    const { service, api, clock } = setup()
    await service.aweme(ID, { background: true })
    expect(api.detail).toHaveBeenCalledWith(ID, { account: 'cur', background: true, signal: undefined })
    clock.now += HOUR - 1
    await service.aweme(ID)
    expect(api.detail).toHaveBeenCalledTimes(1)
    await service.aweme(ID, { fresh: true })
    expect(api.detail).toHaveBeenCalledTimes(2)
    clock.now += HOUR
    await service.aweme(ID)
    expect(api.detail).toHaveBeenCalledTimes(3)
  })

  it('缺省用系统时间', async () => {
    vi.useFakeTimers({ now: 5000 })
    const { service, api } = setup({ now: undefined })
    await service.aweme(ID)
    vi.setSystemTime(5000 + HOUR)
    await service.aweme(ID)
    expect(api.detail).toHaveBeenCalledTimes(2)
  })

  it('缓存超过上限时丢掉最早记下的', async () => {
    const { service, api } = setup()
    const ids = Array.from({ length: 2000 }, (_, i) => `id${i}`)
    service.remember(ids.map((id) => work(id)))
    // 重新记一次的挪到最后
    service.remember([work('id0')])
    service.remember([work('extra')])
    await service.aweme('id0')
    await service.aweme('extra')
    await service.aweme('id2')
    expect(api.detail).not.toHaveBeenCalled()
    await service.aweme('id1')
    expect(api.detail).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['网络错误', new DyError('x')],
    ['限流', new DyCooldownError(0, 0)],
    ['要验证', new DyVerifyError()],
    ['要登录', new DyLoginError()]
  ])('匿名遇到%s时改从分享页取，不进缓存', async (_name, error) => {
    const { service, api, share } = setup(anonymous)
    api.detail.mockRejectedValue(error)
    const signal = new AbortController().signal
    await expect(service.aweme(ID, { signal })).resolves.toMatchObject({ fromShare: true })
    expect(share.detail).toHaveBeenCalledWith(ID, signal)
    await service.aweme(ID)
    expect(share.detail).toHaveBeenCalledTimes(2)
  })

  it('登录账号被拦时不走分享页', async () => {
    const { service, api, share } = setup()
    const error = new DyCooldownError(0, 0)
    api.detail.mockRejectedValue(error)
    await expect(service.aweme(ID)).rejects.toBe(error)
    expect(share.detail).not.toHaveBeenCalled()
  })

  it.each([
    ['作品不可用', new DyUnavailableError('没了')],
    ['业务错误', new DyApiError('不对', 5)],
    ['取消', new AbortError()]
  ])('匿名遇到%s时直接报错', async (_name, error) => {
    const { service, api, share } = setup(anonymous)
    api.detail.mockRejectedValue(error)
    await expect(service.aweme(ID)).rejects.toBe(error)
    expect(share.detail).not.toHaveBeenCalled()
  })

  it('分享页也拿不到时报原来的原因，分享页说不可用则报它', async () => {
    const { service, api, share } = setup(anonymous)
    const original = new DyLoginError()
    api.detail.mockRejectedValue(original)
    share.detail.mockRejectedValueOnce(new DyError('分享页也不行'))
    await expect(service.aweme(ID)).rejects.toBe(original)
    const gone = new DyUnavailableError('已删除')
    share.detail.mockRejectedValueOnce(gone)
    await expect(service.aweme(ID)).rejects.toBe(gone)
  })

  it('画质选项来自作品数据', async () => {
    const { service } = setup()
    const info = await service.streamInfo({ dyId: ID } as MediaItem)
    expect(info.qualities.map((q) => q.qn)).toContain(100_000)
    await expect(service.streamInfo({} as MediaItem)).rejects.toThrow(t('dy.badLink'))
  })

  it('弹幕带上账号去取', async () => {
    const { service, api } = setup()
    await expect(service.danmaku(ID, 0, 1000, { account: null })).resolves.toEqual([{ text: '示例' }])
    expect(api.danmaku).toHaveBeenCalledWith(ID, 0, 1000, { account: null, background: undefined, signal: undefined })
    await service.danmaku(ID, 0, 1000)
    expect(api.danmaku).toHaveBeenLastCalledWith(ID, 0, 1000, expect.objectContaining({ account: 'cur' }))
  })
})

describe('target', () => {
  it('认出链接，短链先展开', async () => {
    const { service, share } = setup()
    await expect(service.target(USER_URL)).resolves.toEqual({ type: 'user', secUid: SEC })
    const signal = new AbortController().signal
    await expect(service.target('看看这个 https://v.douyin.com/FakeCode/ 复制打开', signal)).resolves.toEqual({ type: 'video', id: ID })
    expect(share.expand).toHaveBeenCalledWith('https://v.douyin.com/FakeCode/', signal)
  })

  it('不是抖音链接、展开后认不出或还是短链时返回 null', async () => {
    const { service, share } = setup()
    await expect(service.target('https://example.com/video/1')).resolves.toBeNull()
    share.expand.mockResolvedValueOnce('https://www.douyin.com/')
    await expect(service.target('https://v.douyin.com/FakeCode/')).resolves.toBeNull()
    share.expand.mockResolvedValueOnce('https://v.douyin.com/Other/')
    await expect(service.target('https://v.douyin.com/FakeCode/')).resolves.toBeNull()
    await expect(service.parse('随便写点什么')).resolves.toBeNull()
  })

  it.each([
    ['https://live.douyin.com/12345', 'dy.unsupportedLive'],
    ['https://www.douyin.com/search/abc', 'dy.unsupportedSearch'],
    ['https://www.douyin.com/music/7000000000000000009', 'dy.unsupportedMusic'],
    ['https://www.douyin.com/hashtag/7000000000000000009', 'dy.unsupportedTopic']
  ] as const)('不支持的链接说明原因：%s', async (url, key) => {
    const { service } = setup()
    const e = await service.target(url).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(UnsupportedError)
    expect((e as Error).message).toBe(t(key))
  })
})

describe('parse', () => {
  it('单个作品', async () => {
    const { service } = setup()
    await expect(service.parse(VIDEO_URL)).resolves.toMatchObject({ kind: 'douyin', title: '作品 01', defaultSelected: [`dy:${ID}`] })
  })

  it('博主主页：标题、头像和总数来自资料，翻页来源带游标', async () => {
    const { service, api } = setup()
    api.posts.mockResolvedValue(pageOf([work(), work('7000000000000000002')], { cursor: '1700', hasMore: true }))
    const r = (await service.parse(USER_URL))!
    expect(r).toMatchObject({ title: t('dy.groupUser', { name: '示例博主' }), owner: '示例博主', cover: 'https://img.example.com/a' })
    expect(r.paging).toEqual({ source: { type: 'dy', url: USER_URL, cursor: '2|40|1700', account: 'cur' }, page: 1, total: 40, hasMore: true })
    expect(r.note).toBeUndefined()
    expect(api.posts).toHaveBeenCalledWith(SEC, '', { account: 'cur', background: undefined, signal: undefined })
    await service.aweme(ID)
    expect(api.detail).not.toHaveBeenCalled()
  })

  it('博主没有昵称和作品数时用 id 末几位和实际条数', async () => {
    const { service, api } = setup()
    api.profile.mockResolvedValue({} as never)
    const r = (await service.parse(USER_URL))!
    expect(r.title).toBe(t('dy.groupUser', { name: SEC.slice(-6) }))
    expect(r.paging).toMatchObject({ total: 1, hasMore: false })
  })

  it('未登录的博主主页只给第一页并提示', async () => {
    const { service, api } = setup(anonymous)
    api.posts.mockResolvedValue(pageOf([work()], { hasMore: true }))
    const r = (await service.parse(USER_URL))!
    expect(r.note).toBe(t('dy.anonymousFirstPage'))
    expect(r.paging).toMatchObject({ hasMore: false, source: { account: null } })
  })

  it('未登录但只有一页时不提示', async () => {
    const { service } = setup(anonymous)
    expect((await service.parse(USER_URL))!.note).toBeUndefined()
  })

  it('合集：标题和总集数来自第一个作品', async () => {
    const { service, api } = setup(anonymous)
    const first = work(ID, { author: { nickname: '合集作者' }, mix_info: { mix_name: '示例合集', statis: { updated_to_episode: 12 } } })
    api.mixItems.mockResolvedValue(pageOf([first], { hasMore: true }))
    const r = (await service.parse(MIX_URL))!
    expect(r).toMatchObject({ title: '示例合集', owner: '合集作者' })
    expect(r.paging).toMatchObject({ total: 12, hasMore: true })
    expect(r.note).toBeUndefined()
    expect(api.mixItems).toHaveBeenCalledWith(MIX, '', expect.objectContaining({ account: null }))
  })

  it('合集没带名字时用通用标题', async () => {
    const { service } = setup()
    const r = (await service.parse(MIX_URL))!
    expect(r.title).toBe(t('dy.groupMix'))
    expect(r.paging!.total).toBe(1)
  })

  it('空列表报错', async () => {
    const { service, api } = setup()
    api.mixItems.mockResolvedValue(pageOf<DyAweme>([]))
    await expect(service.parse(MIX_URL)).rejects.toThrow(t('dy.emptyList'))
  })

  it.each([
    ['post', 'posts', 'dy.groupMine'],
    ['like', 'likes', 'dy.groupLikes'],
    ['favorite_collection', 'collection', 'dy.groupCollection'],
    ['watch_later', 'watchLater', 'dy.groupWatchLater'],
    ['record', 'history', 'dy.groupHistory']
  ] as const)('自己的列表 %s', async (tab, method, key) => {
    const { service, api } = setup()
    const r = (await service.parse(selfUrl(tab)))!
    expect(r.title).toBe(t(key))
    expect(api[method]).toHaveBeenCalledTimes(1)
    expect(api[method].mock.calls[0]).toContainEqual(expect.objectContaining({ account: 'cur' }))
    if (method === 'posts' || method === 'likes') expect(api[method].mock.calls[0]).toContain(MY_SEC)
    expect(r.paging!.source).toMatchObject({ url: selfUrl(tab) })
  })

  it('收藏夹用它的名字做标题', async () => {
    const { service, api } = setup()
    api.folders.mockResolvedValue(pageOf<Record<string, unknown>>([{ collects_id: 54, collects_name: '别的' }, { collects_id_str: '55', collects_name: '示例收藏夹' }]))
    const r = (await service.parse(selfUrl('favorite_collection', '55')))!
    expect(r.title).toBe(t('dy.groupFolder', { name: '示例收藏夹' }))
    expect(api.folderItems).toHaveBeenCalledWith('55', '', expect.anything())
    expect(api.collection).not.toHaveBeenCalled()
  })

  it('拿不到收藏夹名字时用收藏的通用标题', async () => {
    const { service, api } = setup()
    const url = selfUrl('favorite_collection', '55')
    expect((await service.parse(url))!.title).toBe(t('dy.groupCollection'))
    api.folders.mockRejectedValue(new DyError('x'))
    expect((await service.parse(url))!.title).toBe(t('dy.groupCollection'))
  })

  it('自己的列表要登录，未登录或身份不明时不发请求', async () => {
    for (const currentAccount of [() => undefined, () => 'unknown']) {
      const { service, api } = setup({ currentAccount })
      await expect(service.parse(selfUrl('like'))).rejects.toThrow(t('dy.listNeedsLogin'))
      expect(api.likes).not.toHaveBeenCalled()
    }
  })
})

describe('loadPage', () => {
  it('接着游标取下一页，序号和总数累加', async () => {
    const { service, api } = setup()
    api.posts.mockResolvedValue(pageOf([work('7000000000000000003'), work('7000000000000000004')], { cursor: 'a|b', hasMore: true }))
    const r = await service.loadPage({ url: USER_URL, cursor: '18|40|x|y', account: 'other' }, 2, { background: true })
    expect(api.posts).toHaveBeenCalledWith(SEC, 'x|y', { account: 'other', background: true, signal: undefined })
    expect(r.items.map((i) => i.index)).toEqual([19, 20])
    expect(r).toMatchObject({ page: 2, total: 40, hasMore: true, next: { type: 'dy', url: USER_URL, cursor: '20|40|a|b', account: 'other' } })
  })

  it('来源没记账号时用调用时的账号；记了 null 就不登录', async () => {
    const { service, api } = setup()
    const r = await service.loadPage({ url: MIX_URL, cursor: '' }, 2)
    expect(r).toMatchObject({ total: 1, next: { cursor: '1|0|c1', account: 'cur' } })
    await service.loadPage({ url: MIX_URL, cursor: '', account: null }, 2)
    expect(api.mixItems).toHaveBeenLastCalledWith(MIX, '', expect.objectContaining({ account: null }))
  })

  it('取到的作品进缓存', async () => {
    const { service, api } = setup()
    await service.loadPage({ url: MIX_URL, cursor: '' }, 2)
    await service.aweme(ID)
    expect(api.detail).not.toHaveBeenCalled()
  })

  it('单个作品链接和认不出的链接不能翻页', async () => {
    const { service } = setup()
    await expect(service.loadPage({ url: VIDEO_URL, cursor: '' }, 2)).rejects.toThrow(t('dy.badLink'))
    await expect(service.loadPage({ url: 'https://example.com', cursor: '' }, 2)).rejects.toThrow(t('dy.badLink'))
  })

  it('自己的列表用来源账号的身份', async () => {
    const { service } = setup()
    await expect(service.loadPage({ url: selfUrl('like'), cursor: '', account: null }, 2)).rejects.toThrow(t('dy.listNeedsLogin'))
  })
})

describe('账号里的列表', () => {
  it('收藏夹', async () => {
    const { service, api } = setup()
    api.folders.mockResolvedValue(
      pageOf<Record<string, unknown>>(
        [
          { collects_id_str: '55', collects_id: 1, collects_name: '示例', total_number: 3, collects_cover: { url_list: ['f.jpg'] } },
          { collects_id: 56 }
        ],
        { hasMore: true }
      )
    )
    await expect(service.lists('folders', '')).resolves.toEqual({
      entries: [
        { id: '55', title: '示例', cover: 'f.jpg', count: 3, url: selfUrl('favorite_collection', '55') },
        { id: '56', title: '56', cover: undefined, count: undefined, url: selfUrl('favorite_collection', '56') }
      ],
      cursor: 'c1',
      hasMore: true
    })
  })

  it('收藏的合集，没有 id 的丢掉', async () => {
    const { service, api } = setup()
    api.mixCollections.mockResolvedValue(
      pageOf<Record<string, unknown>>([
        { mix_id: MIX, mix_name: '示例合集', author: { nickname: '作者' }, cover_url: { url_list: ['m.jpg'] }, statis: { updated_to_episode: 5 } },
        { mix_id: '7100000000000000002' },
        { mix_name: '没有编号' }
      ])
    )
    const r = await service.lists('mixes', 'k')
    expect(api.mixCollections).toHaveBeenCalledWith('k', expect.objectContaining({ account: 'cur' }))
    expect(r.entries).toEqual([
      { id: MIX, title: '示例合集', subtitle: '作者', cover: 'm.jpg', count: 5, url: MIX_URL },
      expect.objectContaining({ title: '7100000000000000002', url: 'https://www.douyin.com/collection/7100000000000000002' })
    ])
    expect(r).toMatchObject({ cursor: 'c1', hasMore: false })
  })

  it('关注的博主，没有主页标识的丢掉', async () => {
    const { service, api } = setup()
    api.following.mockResolvedValue(
      pageOf<Record<string, unknown>>([
        { sec_uid: SEC, nickname: '示例博主', signature: '简介', avatar_thumb: { url_list: ['u.jpg'] }, aweme_count: 8 },
        { sec_uid: MY_SEC },
        { nickname: '没有标识' }
      ])
    )
    const r = await service.lists('following', '')
    expect(api.following).toHaveBeenCalledWith({ secUid: MY_SEC, uid: '1001' }, '', expect.anything())
    expect(r.entries).toEqual([
      { id: SEC, title: '示例博主', subtitle: '简介', cover: 'u.jpg', count: 8, url: USER_URL },
      expect.objectContaining({ id: MY_SEC, title: MY_SEC })
    ])
  })

  it('要登录', async () => {
    const { service } = setup(anonymous)
    await expect(service.lists('folders', '')).rejects.toBeInstanceOf(DyLoginError)
  })
})

describe('全局实例', () => {
  it('装配之前取会报错，装配后返回同一个', () => {
    expect(() => douyin()).toThrow(t('dy.errNotReady'))
    const { service } = setup()
    setDouyin(service)
    expect(douyin()).toBe(service)
  })
})
