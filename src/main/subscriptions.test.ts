import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeOptions } from '@shared/options'
import type { EnqueueRequest, MediaItem, NewSubscription, ParseResult, Subscription } from '@shared/types'
import { authScope, inAuthScope } from './auth/scope'

const h = vi.hoisted(() => ({
  userData: '',
  resolveInput: vi.fn(),
  downloadedKeys: vi.fn<(_mid?: number) => string[]>(() => []),
  loadAllPages: vi.fn(),
  loadHeadPages: vi.fn(),
  prepare: vi.fn(),
  auth: vi.fn(),
  loadTailPages: vi.fn(async (..._args: unknown[]): Promise<unknown[]> => [])
}))
vi.mock('electron', () => ({ app: { getPath: () => h.userData } }))
vi.mock('./bili/resolve', () => ({ resolveInput: h.resolveInput }))
vi.mock('./bili/lists', async (orig) => ({
  isAscending: (await orig<typeof import('./bili/lists')>()).isAscending,
  loadAllPages: h.loadAllPages,
  loadHeadPages: h.loadHeadPages,
  loadTailPages: h.loadTailPages
}))
vi.mock('./history', () => ({ downloadedKeys: h.downloadedKeys }))
vi.mock('./enqueue', () => ({ prepareEnqueueItems: h.prepare }))
vi.mock('./auth/authGuard', () => ({ getAuthState: h.auth }))
const { SubscriptionManager } = await import('./subscriptions')
const { AuthExpiredError } = await import('./bili/http')

const OPTIONS = normalizeOptions({}, 80)
const item = (key: string, extra: Partial<MediaItem> = {}): MediaItem => ({ key, kind: 'ugc', title: key, index: 1, cid: 1, ...extra })
const result = (items: MediaItem[]): ParseResult => ({
  kind: 'ugc',
  title: '收藏夹标题',
  cover: 'c.jpg',
  meta: { owner: 'UP' },
  groups: [{ id: 'g', title: 'g', items }],
  defaultSelected: []
})
const newSub = (o: Partial<NewSubscription> = {}): NewSubscription => ({
  input: 'https://space.bilibili.com/1/favlist?fid=2',
  title: '我的收藏',
  kind: 'ugc',
  options: OPTIONS,
  intervalMin: 60,
  includeExisting: false,
  currentKeys: ['ugc:BV0:1'],
  ...o
})
const sub = (o: Partial<Subscription>): Subscription => ({
  id: o.input ?? 'id',
  input: 'in',
  title: 't',
  kind: 'ugc',
  intervalMin: 60,
  enabled: true,
  options: OPTIONS,
  seen: [],
  createdAt: 0,
  ...o
})

let enqueue: ReturnType<typeof vi.fn<(req: EnqueueRequest) => number>>
let m: InstanceType<typeof SubscriptionManager>
const saved = (): Subscription[] => JSON.parse(readFileSync(join(h.userData, 'subscriptions.json'), 'utf8'))

beforeEach(() => {
  vi.clearAllMocks()
  h.userData = mkdtempSync(join(tmpdir(), 'subs-'))
  h.downloadedKeys.mockReturnValue([])
  h.loadTailPages.mockResolvedValue([])
  h.loadHeadPages.mockResolvedValue([])
  h.loadAllPages.mockImplementation(async (result) => ({ result, complete: true }))
  h.prepare.mockImplementation(async (items) => ({ items, failed: [] }))
  h.auth.mockReturnValue({ loggedIn: false })
  enqueue = vi.fn((request) => request.items.length)
  m = new SubscriptionManager(enqueue)
})
afterEach(() => {
  m.stop()
  vi.useRealTimers()
  rmSync(h.userData, { recursive: true, force: true })
})

describe('一键订阅并下载', () => {
  const input = 'https://www.bilibili.com/medialist/detail/ml2'
  const verifyAccount = vi.fn()
  const request = { input, defaults: OPTIONS, verifyAccount }

  it('超过 30 项先确认，什么都不做；确认后复用已加载的列表', async () => {
    const items = Array.from({ length: 31 }, (_, i) => item(`ugc:BV${i}:1`))
    h.resolveInput.mockResolvedValue(result(items))
    expect(await m.downloadSource(request)).toEqual({
      title: '收藏夹标题', subscribed: false, count: 0, confirm: { count: 31, vip: 0, extras: 0, subscribe: true }
    })
    expect(enqueue).not.toHaveBeenCalled()
    expect(m.list()).toEqual([])
    expect(await m.downloadSource({ ...request, choice: 'all' })).toMatchObject({ subscribed: true, count: 31 })
    expect(h.resolveInput).toHaveBeenCalledOnce()
    expect(h.loadAllPages).toHaveBeenCalledOnce()
  })

  it('新订阅番剧时说明会跳过的会员集和花絮，只订阅以后的新内容时不入队', async () => {
    const free = item('pgc:1', { kind: 'pgc' })
    const vip = item('pgc:2', { kind: 'pgc', needVip: true })
    const pv = item('pgc:3', { kind: 'pgc' })
    h.resolveInput.mockResolvedValue({
      ...result([]), kind: 'pgc',
      groups: [{ id: 'main', title: '正片', items: [free, vip] }, { id: 'sec-1', title: 'PV', items: [pv] }]
    })
    expect(await m.downloadSource(request)).toMatchObject({ confirm: { count: 1, vip: 1, extras: 1, subscribe: true } })
    expect(await m.downloadSource({ ...request, choice: 'future' })).toEqual({ title: '收藏夹标题', subscribed: true, count: 0 })
    expect(enqueue).not.toHaveBeenCalled()
    expect(saved()[0].seen).toEqual([free.key, vip.key, pv.key])
  })

  it('已有订阅补缺失时不再询问，跳过会员集和花絮并说明；大会员账号照常下载会员集', async () => {
    const free = item('pgc:1', { kind: 'pgc' })
    const vip = item('pgc:2', { kind: 'pgc', needVip: true })
    const pv = item('pgc:3', { kind: 'pgc' })
    h.resolveInput.mockResolvedValue({
      ...result([]), kind: 'pgc',
      groups: [{ id: 'main', title: '正片', items: [free, vip] }, { id: 'sec-1', title: 'PV', items: [pv] }]
    })
    const subscription = sub({ id: 's', input })
    m.replaceAll([subscription])
    expect(await m.downloadSource({ ...request, subscription })).toMatchObject({ count: 1, skipped: { vip: 1, extras: 1 } })
    expect(enqueue).toHaveBeenLastCalledWith(expect.objectContaining({ items: [free] }))
    h.auth.mockReturnValue({ loggedIn: true, user: { mid: 1, uname: '', face: '', vipActive: true, vipLabel: '' } })
    expect(await m.downloadSource({ ...request, subscription })).toMatchObject({ count: 2, skipped: { vip: 0, extras: 1 } })
    expect(enqueue).toHaveBeenLastCalledWith(expect.objectContaining({ items: [free, vip] }))
  })

  it('加载后续分页并只加入缺失分 P，用所有原始条目建立订阅基线', async () => {
    const lazy = item('ugc:BV1', { lazy: true, bvid: 'BV1', pages: 2 })
    // 合集、系列不给分 P 数：下载过就不再逐个查分 P
    const collected = item('ugc:BV4', { lazy: true, bvid: 'BV4' })
    const existing = item('ugc:BV2:20')
    const unavailable = item('ugc:BV3', { unavailable: '失效' })
    const first = result([existing])
    const all = result([existing, lazy, collected, unavailable])
    h.resolveInput.mockResolvedValue(first)
    h.loadAllPages.mockResolvedValue({ result: all, complete: true })
    h.downloadedKeys.mockReturnValue([existing.key, 'ugc:BV1:10', 'ugc:BV4:40'])
    h.prepare.mockResolvedValueOnce({ items: [item('ugc:BV1:10'), item('ugc:BV1:11')], failed: [] })
    expect(await m.downloadSource(request)).toMatchObject({ subscribed: true, count: 1 })
    expect(h.loadAllPages).toHaveBeenCalledWith(first, { beforePage: verifyAccount })
    expect(h.prepare).toHaveBeenCalledWith([lazy])
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ items: [item('ugc:BV1:11')], options: OPTIONS }))
    expect(saved()[0]).toMatchObject({
      enabled: true, intervalMin: 360, seen: [existing.key, lazy.key, collected.key, unavailable.key], lastNew: 1
    })
  })

  it('复用从单集链接添加的订阅及其选项和暂停状态', async () => {
    const original = sub({ input: 'ep55', kind: 'pgc', enabled: false, options: normalizeOptions({}, 64) })
    m.replaceAll([original])
    h.resolveInput.mockResolvedValue({
      ...result([item('pgc:55', { kind: 'pgc', epId: 55 })]),
      kind: 'pgc'
    })
    expect(await m.downloadSource({ ...request, input: 'ss12' })).toMatchObject({ subscribed: false, count: 1 })
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ options: original.options }))
    expect(saved()).toMatchObject([{ id: original.id, enabled: false, seen: ['pgc:55'] }])
  })

  it('分页失败保留原状，操作结束后可以重试', async () => {
    const first = result([])
    h.resolveInput.mockResolvedValue(first)
    h.loadAllPages.mockResolvedValueOnce({ result: first, complete: false, error: '请求失败' })
    await expect(m.downloadSource(request)).rejects.toThrow('请求失败')
    expect(m.list()).toEqual([])
    expect(enqueue).not.toHaveBeenCalled()
    expect(await m.downloadSource(request)).toMatchObject({ subscribed: true, count: 0 })
  })

  it('重复点击只执行一次，在准备期间切换账号则取消入队', async () => {
    let resolve!: (value: ParseResult) => void
    h.resolveInput.mockReturnValue(new Promise<ParseResult>((done) => { resolve = done }))
    const run = m.downloadSource({
      ...request,
      verifyAccount: vi.fn().mockImplementationOnce(() => {}).mockImplementationOnce(() => {}).mockImplementation(() => { throw new Error('账号切换') })
    })
    await expect(m.downloadSource(request)).rejects.toThrow('此来源正在检查或准备下载')
    resolve(result([item('new')]))
    await expect(run).rejects.toThrow('账号切换')
    expect(enqueue).not.toHaveBeenCalled()
    expect(m.list()).toEqual([])
  })

  it('展开失败的条目不记为已见，重启后即使移出首页也能补下缺失分 P', async () => {
    const lazy = item('ugc:BV1', { lazy: true, bvid: 'BV1', pages: 2 })
    const nextPart = item('ugc:BV1:11')
    const other = item('known')
    h.resolveInput.mockResolvedValueOnce(result([other, lazy]))
    h.downloadedKeys.mockReturnValue(['ugc:BV1:10'])
    h.prepare.mockResolvedValueOnce({ items: [other], failed: [{ ...lazy, unavailable: '风控' }], note: '风控' })
    expect(await m.downloadSource(request)).toMatchObject({ subscribed: true, count: 1, note: '风控' })
    const [subscription] = saved()
    expect(subscription.seen).toEqual(['known'])
    expect(subscription.pending).toEqual([lazy])
    const restarted = new SubscriptionManager(enqueue)
    h.resolveInput.mockResolvedValueOnce({
      ...result([other]),
      paging: { source: { type: 'fav', mediaId: 2 }, page: 1, total: 21, hasMore: true }
    })
    h.prepare.mockResolvedValueOnce({ items: [item('ugc:BV1:10'), nextPart], failed: [] })
    await restarted.check(subscription.id)
    expect(h.prepare).toHaveBeenLastCalledWith([lazy])
    expect(enqueue).toHaveBeenLastCalledWith(expect.objectContaining({ items: [nextPart] }))
    expect(saved()[0]).toMatchObject({ seen: ['known', lazy.key], lastNew: 1 })
    expect(saved()[0].pending).toBeUndefined()
    expect(saved()[0].lastError).toBeUndefined()
  })

  it('下载缺失内容时丢弃完整列表中已不存在的待重试条目', async () => {
    const removed = item('ugc:BVremoved', { lazy: true, bvid: 'BVremoved' })
    const present = item('ugc:BVpresent', { lazy: true, bvid: 'BVpresent' })
    const part = item('ugc:BVpresent:4')
    const existing = sub({ input, pending: [removed, present] })
    m.replaceAll([existing])
    h.resolveInput.mockResolvedValueOnce(result([present]))
    h.prepare.mockImplementationOnce(async (items: MediaItem[]) => ({
      items: items.map((entry) => entry.key === present.key ? part : item('ugc:BVremoved:4')),
      failed: []
    }))
    expect(await m.downloadSource({ ...request, subscription: existing })).toMatchObject({ subscribed: false, count: 1 })
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ items: [part] }))
    expect(saved()[0].seen).toEqual([present.key])
    expect(saved()[0].pending).toBeUndefined()
  })

  it('复用旧的稍后再看时将它绑定到当前账号，并保留原来的订阅设置', async () => {
    const legacy = sub({
      input: 'watchlater',
      options: normalizeOptions({}, 64),
      seen: ['unknown-owner'],
      pending: [item('unknown-owner-pending')]
    })
    m.replaceAll([legacy])
    h.resolveInput.mockResolvedValue(result([]))
    const requestA = { ...request, input: 'https://www.bilibili.com/watchlater', accountMid: 7 }
    expect(await m.downloadSource(requestA)).toMatchObject({ subscribed: false })
    expect(saved()).toMatchObject([{ id: legacy.id, accountMid: 7, options: legacy.options, seen: [] }])
    expect(enqueue).not.toHaveBeenCalled()
    expect(await m.downloadSource({ ...requestA, accountMid: 8 })).toMatchObject({ subscribed: true })
    expect(saved().map((s) => s.accountMid)).toEqual([7, 8])
    h.auth.mockReturnValue({ loggedIn: true, user: { mid: 8 } })
    h.resolveInput.mockClear()
    await m.check(legacy.id)
    expect(h.resolveInput).not.toHaveBeenCalled()
  })

  it('稍后再看只在对应账号登录时检查', async () => {
    m.replaceAll([sub({ id: 'watch', input: 'watchlater', accountMid: 7 })])
    h.auth.mockReturnValue({ loggedIn: true, user: { mid: 8 } })
    await m.check('watch')
    expect(h.resolveInput).not.toHaveBeenCalled()
    h.auth.mockReturnValue({ loggedIn: true, user: { mid: 7 } })
    h.resolveInput.mockResolvedValue(result([]))
    await m.check('watch')
    expect(h.resolveInput).toHaveBeenCalledWith('watchlater')
  })
})

it('同一个稍后再看地址按所属账号检查，A 过期时 B 照常入队', async () => {
  const availability = new Map<number, 'ready' | 'expired'>([[1, 'expired'], [2, 'ready']])
  m = new SubscriptionManager(enqueue, {
    status: (mid) => availability.get(mid) ?? 'removed',
    run: (mid, fn) => inAuthScope({ partition: `account-${mid}`, mid, background: true }, fn)
  })
  h.auth.mockImplementation(() => ({ loggedIn: true, user: { mid: authScope().mid } }))
  h.resolveInput.mockImplementation(async () => result([item(`ugc:BV${authScope().mid}:1`)]))
  const input = 'https://www.bilibili.com/list/watchlater'
  const a = sub({ id: 'a', input, accountMid: 1 })
  const b = sub({ id: 'b', input, accountMid: 2 })
  m.replaceAll([a, b])
  await m.check('a')
  await m.check('b')
  expect(enqueue).toHaveBeenCalledTimes(1)
  expect(enqueue).toHaveBeenLastCalledWith(expect.objectContaining({ accountMid: 2, items: [item('ugc:BV2:1')] }))
  availability.set(1, 'ready')
  await m.check('a')
  expect(enqueue).toHaveBeenLastCalledWith(expect.objectContaining({ accountMid: 1, items: [item('ugc:BV1:1')] }))
  expect(m.list().map((s) => s.seen)).toEqual([['ugc:BV1:1'], ['ugc:BV2:1']])
})

it('定时检查与一键补下载用订阅账号下载，按不分账号的历史在展开后按分 P 去重', async () => {
  const first = item('ugc:BV1:1')
  const lazy = item('ugc:BV2', { lazy: true, bvid: 'BV2', pages: 2 })
  const partA = item('ugc:BV2:10')
  const partB = item('ugc:BV2:11')
  let history: string[] = []
  h.downloadedKeys.mockImplementation(() => history)
  h.auth.mockImplementation(() => ({ loggedIn: true, user: { mid: authScope().mid } }))
  h.resolveInput.mockResolvedValue(result([first, lazy]))
  h.prepare.mockImplementation(async (items: MediaItem[]) => ({
    items: items.flatMap((entry) => entry.lazy ? [partA, partB] : [entry]), failed: []
  }))
  m = new SubscriptionManager(enqueue, {
    status: () => 'ready',
    run: (mid, fn) => inAuthScope({ partition: 'account-2', mid, background: true }, fn)
  })
  const subscription = sub({ id: 'b', input: 'watchlater', accountMid: 2 })
  m.replaceAll([subscription])
  await m.check('b')
  expect(enqueue).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ accountMid: 2, items: [first, partA, partB] }))
  expect(m.list()[0].seen).toEqual([first.key, lazy.key])

  enqueue.mockClear()
  // 其他账号下过的分 P 也算已下载
  history = [partA.key]
  expect(await m.downloadSource({ input: subscription.input, subscription, accountMid: 2, defaults: OPTIONS, verifyAccount: () => {} }))
    .toMatchObject({ count: 2, subscribed: false })
  expect(enqueue).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ accountMid: 2, items: [first, partB] }))
  expect(h.downloadedKeys).toHaveBeenCalledWith()
})

describe('退出账号时处理名下订阅', () => {
  it('转给另一个账号时稍后再看留在原账号；一起删除时只删原账号的', () => {
    const fav = sub({ id: 'fav', input: 'https://space.bilibili.com/1/favlist?fid=2', accountMid: 1, lastError: '账号已失效' })
    const later = sub({ id: 'later', input: 'https://www.bilibili.com/watchlater', accountMid: 1 })
    const mine = sub({ id: 'mine', input: 'https://space.bilibili.com/9/favlist?fid=3', accountMid: 2 })
    m.replaceAll([fav, later, mine])
    expect(m.accountSubscriptions(1)).toEqual({ all: [fav, later], personal: [later] })
    m.transferAccount(1, 2)
    expect(saved().map((s) => [s.id, s.accountMid, s.lastError])).toEqual([['fav', 2, undefined], ['later', 1, undefined], ['mine', 2, undefined]])
    m.removeAccount(1)
    expect(m.list().map((s) => s.id)).toEqual(['fav', 'mine'])
    m.removeAccount(42)
    expect(m.list()).toHaveLength(2)
  })
})

describe('add', () => {
  it('默认只下载以后新增的：现有条目记为已见，保存并通知界面', async () => {
    const onUpdate = vi.fn()
    m.on('update', onUpdate)
    const list = await m.add(newSub())
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ title: '我的收藏', enabled: true, seen: ['ugc:BV0:1'] })
    expect(list[0].lastCheck).toBeTypeOf('number')
    expect(h.resolveInput).not.toHaveBeenCalled()
    expect(saved()).toEqual(list)
    expect(onUpdate).toHaveBeenCalledWith(list)
  })

  it('同一个来源不能订阅两次', async () => {
    await m.add(newSub())
    await expect(m.add(newSub())).rejects.toThrow('已经订阅过这个来源')
    // 同一个收藏夹的另一种链接写法也算重复
    await expect(m.add(newSub({ input: 'https://www.bilibili.com/medialist/detail/ml2' }))).rejects.toThrow('已经订阅过这个来源')
  })

  it('正序的合集、系列添加时马上检查一次，把最后一页记为已见', async () => {
    const paging = { source: { type: 'spaceSeason', mid: 1, seasonId: 2 }, page: 1, total: 65, hasMore: true }
    h.resolveInput.mockResolvedValue({ ...result([item('ugc:BV1')]), paging })
    h.loadTailPages.mockResolvedValue([item('ugc:BV61'), item('ugc:BV65')])
    const input = 'https://space.bilibili.com/1/lists/2?type=season'
    const [s] = await m.add(newSub({ input, currentKeys: ['ugc:BV1'] }))
    expect(h.resolveInput).toHaveBeenCalledWith(input)
    const [arg, isKnown] = h.loadTailPages.mock.calls[0] as [unknown, () => boolean]
    expect(arg).toBe(paging)
    expect(isKnown()).toBe(true)
    expect(enqueue).not.toHaveBeenCalled()
    expect(s).toMatchObject({ tailBaseline: true, lastNew: 0 })
    expect(s.seen).toEqual(['ugc:BV1', 'ugc:BV61', 'ugc:BV65'])
    expect(saved()[0].seen).toEqual(s.seen)
  })

  it('选了“现有内容也下载”就马上检查一次', async () => {
    h.resolveInput.mockResolvedValue(result([item('ugc:BV0:1'), item('ugc:BV9:1')]))
    const [s] = await m.add(newSub({ includeExisting: true }))
    expect(enqueue.mock.calls[0][0]).toMatchObject({ items: [item('ugc:BV0:1'), item('ugc:BV9:1')] })
    expect(s.lastNew).toBe(2)
    // 现有内容都要下载，之后是正序合集时也从最后一页一直往前翻；这里不是分页来源，不用翻页
    expect(s.tailBaseline).toBe(true)
    expect(h.loadTailPages).not.toHaveBeenCalled()
  })
})

describe('check', () => {
  it('只下载没见过、没下载过、还能下载的条目', async () => {
    m.replaceAll([sub({ id: 's', input: 'fav', title: '我的收藏', seen: ['seen'] })])
    // 列表里的多P视频还没展开，只要这个视频的任何一P下载过就不算新的
    h.downloadedKeys.mockReturnValue(['done', 'ugc:BV1:5'])
    h.resolveInput.mockResolvedValue(
      result([
        item('seen'),
        item('done'),
        item('ugc:BV1', { lazy: true, bvid: 'BV1' }),
        item('gone', { unavailable: '已失效' }),
        item('new'),
        item('ugc:BV2', { lazy: true, bvid: 'BV2' })
      ])
    )
    const found = vi.fn()
    m.on('found', found)
    const [s] = await m.check('s')
    expect(h.resolveInput).toHaveBeenCalledWith('fav')
    expect(enqueue).toHaveBeenCalledWith({
      title: '收藏夹标题',
      cover: 'c.jpg',
      kind: 'ugc',
      meta: { owner: 'UP' },
      items: [item('new'), item('ugc:BV2', { lazy: true, bvid: 'BV2' })],
      options: OPTIONS
    })
    expect(found).toHaveBeenCalledWith({ title: '我的收藏', count: 2, note: undefined })
    expect(s.seen).toEqual(['seen', 'done', 'ugc:BV1', 'gone', 'new', 'ugc:BV2'])
    expect(s).toMatchObject({ lastNew: 2, lastError: undefined })
    expect(saved()[0].seen).toEqual(s.seen)
  })

  it('正序的合集、系列从最后一页往前找新内容，见过或下载过的不算', async () => {
    m.replaceAll([sub({ id: 's', seen: ['ugc:BV1', 'ugc:BV60'], tailBaseline: true })])
    h.downloadedKeys.mockReturnValue(['ugc:BV61:9'])
    const paging = { source: { type: 'spaceSeason', mid: 1, seasonId: 2 }, page: 1, total: 63, hasMore: true }
    h.resolveInput.mockResolvedValue({ ...result([item('ugc:BV1')]), paging })
    const tail = ['ugc:BV60', 'ugc:BV61', 'ugc:BV62'].map((k, i) => item(k, { lazy: true, bvid: `BV${60 + i}` }))
    h.loadTailPages.mockResolvedValue(tail)
    const [s] = await m.check('s')
    const isKnown = h.loadTailPages.mock.calls[0][1] as (i: MediaItem) => boolean
    expect(tail.map(isKnown)).toEqual([true, true, false])
    expect(enqueue.mock.calls[0][0]).toMatchObject({ items: [tail[2]] })
    expect(s.seen.slice(0, 4)).toEqual(['ugc:BV1', 'ugc:BV60', 'ugc:BV61', 'ugc:BV62'])
  })

  it('早先只记了第一页的订阅（包括短链接）：第一次检查只补记最后一页，不把中间的旧视频当成新的', async () => {
    m.replaceAll([sub({ id: 's', input: 'https://b23.tv/abc', seen: ['ugc:BV1'] })])
    const paging = { source: { type: 'spaceSeries', mid: 1, seriesId: 3 }, page: 1, total: 200, hasMore: true }
    h.resolveInput.mockResolvedValue({ ...result([item('ugc:BV1'), item('ugc:BV2')]), paging })
    h.loadTailPages.mockResolvedValue([item('ugc:BV181'), item('ugc:BV200')])
    let [s] = await m.check('s')
    expect((h.loadTailPages.mock.calls[0][1] as () => boolean)()).toBe(true)
    // 第一页上没见过的照常下载
    expect(enqueue.mock.calls[0][0]).toMatchObject({ items: [item('ugc:BV2')] })
    expect(s).toMatchObject({ tailBaseline: true, lastNew: 1 })
    expect(s.seen).toEqual(expect.arrayContaining(['ugc:BV181', 'ugc:BV200']))

    // 之后照常从最后一页往前找
    h.loadTailPages.mockResolvedValue([item('ugc:BV200'), item('ugc:BV201')])
    ;[s] = await m.check('s')
    expect((h.loadTailPages.mock.calls[1][1] as (i: MediaItem) => boolean)(item('ugc:BV200'))).toBe(true)
    expect(enqueue.mock.calls[1][0]).toMatchObject({ items: [item('ugc:BV201')] })
  })

  it('补记最后一页或加入下载失败时不留标记，下次再补记', async () => {
    m.replaceAll([sub({ id: 's', seen: ['ugc:BV1'] })])
    const paging = { source: { type: 'spaceSeason', mid: 1, seasonId: 2 }, page: 1, total: 99, hasMore: true }
    h.resolveInput.mockResolvedValue({ ...result([item('ugc:BV1'), item('ugc:BV2')]), paging })
    h.loadTailPages.mockRejectedValueOnce(new Error('请求过于频繁'))
    let [s] = await m.check('s')
    expect(s).toMatchObject({ lastError: '请求过于频繁', seen: ['ugc:BV1'] })
    expect(s.tailBaseline).toBeUndefined()
    h.loadTailPages.mockResolvedValueOnce([item('ugc:BV99')])
    enqueue.mockImplementationOnce(() => { throw new Error('磁盘满了') })
    ;[s] = await m.check('s')
    expect(s.tailBaseline).toBeUndefined()
    expect(s.seen).toEqual(['ugc:BV1'])
  })

  it('收藏夹首页全是新增时继续翻页，遇到已见条目便停下', async () => {
    m.replaceAll([sub({ id: 's', seen: ['old'] })])
    const paging = { source: { type: 'fav', mediaId: 1 }, page: 1, total: 99, hasMore: true }
    const first = Array.from({ length: 20 }, (_, i) => item(`new${i}`))
    h.resolveInput.mockResolvedValueOnce({ ...result(first), paging })
    h.loadHeadPages.mockResolvedValueOnce([item('new20')])
    const [s] = await m.check('s')
    expect(h.loadHeadPages).toHaveBeenCalledWith(paging, expect.any(Function))
    expect(h.loadHeadPages.mock.calls[0][1](item('old'))).toBe(true)
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ items: [...first, item('new20')] }))
    expect(h.loadTailPages).not.toHaveBeenCalled()
    expect(s).toMatchObject({ lastNew: 21, seen: [...first.map((it) => it.key), 'new20', 'old'] })
    h.resolveInput.mockResolvedValueOnce({ ...result(first), paging })
    await m.check('s')
    expect(h.loadHeadPages).toHaveBeenCalledOnce()
    expect(enqueue).toHaveBeenCalledOnce()
  })

  it('同一个订阅正在检查时，再检查直接返回', async () => {
    m.replaceAll([sub({ id: 's' })])
    let release!: (v: ParseResult) => void
    h.resolveInput.mockReturnValueOnce(new Promise((r) => (release = r)))
    const first = m.check('s')
    await m.check('s')
    expect(h.resolveInput).toHaveBeenCalledTimes(1)
    release(result([]))
    await first
    await m.check('s')
    expect(h.resolveInput).toHaveBeenCalledTimes(2)
  })

  it('稍后再看在准备分 P 时切号会保留待处理条目，不加入旧账号的任务', async () => {
    const lazy = item('ugc:BV1', { lazy: true, bvid: 'BV1' })
    m.replaceAll([sub({ id: 's', accountMid: 7, pending: [lazy] })])
    h.auth.mockReturnValue({ loggedIn: true, user: { mid: 7 } })
    h.resolveInput.mockResolvedValueOnce(result([lazy]))
    h.prepare.mockImplementationOnce(async () => {
      h.auth.mockReturnValue({ loggedIn: true, user: { mid: 8 } })
      return { items: [item('ugc:BV1:10')], failed: [] }
    })
    await m.check('s')
    expect(enqueue).not.toHaveBeenCalled()
    expect(saved()[0]).toMatchObject({ seen: [], pending: [lazy] })
  })

  it('旧版稍后再看在读取期间切号会丢弃结果，成功检查后绑定当前账号', async () => {
    const legacy = sub({ input: 'watchlater', seen: ['a-seen'] })
    m.replaceAll([legacy])
    await m.check(legacy.id)
    expect(h.resolveInput).not.toHaveBeenCalled()

    h.auth.mockReturnValue({ loggedIn: true, user: { mid: 7 } })
    h.resolveInput.mockImplementationOnce(async () => {
      h.auth.mockReturnValue({ loggedIn: true, user: { mid: 8 } })
      return result([item('b-watch-later')])
    })
    await m.check(legacy.id)
    expect(enqueue).not.toHaveBeenCalled()
    expect(saved()[0]).toEqual(legacy)

    h.auth.mockReturnValue({ loggedIn: true, user: { mid: 7 } })
    h.resolveInput.mockResolvedValueOnce(result([item('a-seen'), item('a-new')]))
    await m.check(legacy.id)
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ items: [item('a-new')] }))
    expect(saved()[0]).toMatchObject({ accountMid: 7, seen: ['a-seen', 'a-new'] })

    h.auth.mockReturnValue({ loggedIn: true, user: { mid: 8 } })
    await m.check(legacy.id)
    expect(h.resolveInput).toHaveBeenCalledTimes(2)
    expect(enqueue).toHaveBeenCalledOnce()
  })

  it('完整列表里已经移除的条目不再自动重试，列表里仍存在的条目继续补齐分 P', async () => {
    const removed = item('ugc:BVremoved', { lazy: true, bvid: 'BVremoved' })
    const present = item('ugc:BVpresent', { lazy: true, bvid: 'BVpresent' })
    const part = item('ugc:BVpresent:4')
    m.replaceAll([sub({ id: 's', pending: [removed, present] })])
    h.downloadedKeys.mockReturnValue(['ugc:BVpresent:3'])
    h.resolveInput.mockResolvedValueOnce(result([present]))
    h.prepare.mockImplementationOnce(async (items: MediaItem[]) => ({
      items: items.map((entry) => entry.key === present.key ? part : item('ugc:BVremoved:4')),
      failed: []
    }))
    await m.check('s')
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ items: [part] }))
    expect(saved()[0].pending).toBeUndefined()
  })

  it('没有新内容时不加入下载、不通知', async () => {
    m.replaceAll([sub({ id: 's', seen: ['a'] })])
    h.resolveInput.mockResolvedValue(result([item('a')]))
    const found = vi.fn()
    m.on('found', found)
    const [s] = await m.check('s')
    expect(enqueue).not.toHaveBeenCalled()
    expect(found).not.toHaveBeenCalled()
    expect(s.lastNew).toBe(0)
  })

  it('已见记录新的在前，最多 5000 条', async () => {
    const old = Array.from({ length: 5000 }, (_, i) => `old${i}`)
    m.replaceAll([sub({ id: 's', seen: old })])
    h.resolveInput.mockResolvedValue(result([item('x')]))
    const [s] = await m.check('s')
    expect(s.seen).toHaveLength(5000)
    expect(s.seen[0]).toBe('x')
    expect(s.seen.at(-1)).toBe('old4998')
  })

  it('登录失效时记下原因，已见记录不变，下次还会再检查', async () => {
    m.replaceAll([sub({ id: 's', seen: ['a'], lastCheck: 1 })])
    h.resolveInput.mockRejectedValue(new AuthExpiredError())
    const [s] = await m.check('s')
    expect(s.lastError).toBe('登录已失效，重新登录后会继续检查')
    expect(s.seen).toEqual(['a'])
    expect(s.lastCheck).toBeGreaterThan(1)
  })

  it('加入下载失败时不记为已见，下次重试', async () => {
    m.replaceAll([sub({ id: 's' })])
    h.resolveInput.mockResolvedValue(result([item('x')]))
    enqueue.mockImplementation(() => { throw new Error('磁盘满了') })
    let [s] = await m.check('s')
    expect(s.lastError).toBe('磁盘满了')
    expect(s.seen).toEqual([])
    h.resolveInput.mockRejectedValue('奇怪的错误')
    ;[s] = await m.check('s')
    expect(s.lastError).toBe('奇怪的错误')
  })

  it('检查成功后清掉上次的错误', async () => {
    m.replaceAll([sub({ id: 's', lastError: '旧错误' })])
    h.resolveInput.mockResolvedValue(result([]))
    expect((await m.check('s'))[0].lastError).toBeUndefined()
  })

  it('不存在的订阅什么都不做', async () => {
    expect(await m.check('nope')).toEqual([])
    expect(h.resolveInput).not.toHaveBeenCalled()
  })
})

describe('修改和持久化', () => {
  it('订阅文件内容不是数组时当作没有订阅，定时检查也不会出错（回归）', async () => {
    writeFileSync(join(h.userData, 'subscriptions.json'), '{}')
    const m2 = new SubscriptionManager(enqueue)
    expect(m2.list()).toEqual([])
    expect(await m2.add(newSub())).toHaveLength(1)
  })

  it('修改、删除都会保存，重新打开后还在', async () => {
    const [s] = await m.add(newSub())
    m.update(s.id, { enabled: false, intervalMin: 30 })
    expect(saved()[0]).toMatchObject({ enabled: false, intervalMin: 30 })
    await m.add(newSub({ input: 'other' }))
    expect(new SubscriptionManager(enqueue).list().map((x) => x.input)).toEqual([s.input, 'other'])
    expect(m.remove(s.id).map((x) => x.input)).toEqual(['other'])
    expect(saved().map((x) => x.input)).toEqual(['other'])
  })
})

describe('定时检查', () => {
  it('启动 10 秒后检查一次，只查到期的、启用的，相邻两个间隔 2 秒', async () => {
    vi.useFakeTimers()
    const now = Date.now()
    m.replaceAll([
      sub({ id: 'never', input: 'never' }),
      sub({ id: 'recent', input: 'recent', lastCheck: now }),
      sub({ id: 'off', input: 'off', enabled: false }),
      sub({ id: 'due', input: 'due', lastCheck: now - 61 * 60_000 })
    ])
    h.resolveInput.mockResolvedValue(result([]))
    m.start()
    await vi.advanceTimersByTimeAsync(9_999)
    expect(h.resolveInput).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(h.resolveInput.mock.calls.map((c) => c[0])).toEqual(['never'])
    await vi.advanceTimersByTimeAsync(2000)
    expect(h.resolveInput.mock.calls.map((c) => c[0])).toEqual(['never', 'due'])
    await vi.advanceTimersByTimeAsync(2000)
    expect(h.resolveInput).toHaveBeenCalledTimes(2)
  })

  it('上一轮还没查完时，下一轮跳过', async () => {
    vi.useFakeTimers()
    m.replaceAll([sub({ id: 'slow', input: 'slow' })])
    let finish!: (r: ParseResult) => void
    h.resolveInput.mockReturnValue(new Promise<ParseResult>((r) => (finish = r)))
    m.start()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(h.resolveInput).toHaveBeenCalledOnce()
    finish(result([]))
    await vi.advanceTimersByTimeAsync(2000)
    // 刚查过，没到间隔不会再查
    await vi.advanceTimersByTimeAsync(60_000)
    expect(h.resolveInput).toHaveBeenCalledOnce()
  })

  it('停止后不再定时检查', async () => {
    vi.useFakeTimers()
    m.replaceAll([sub({ id: 'a', input: 'a', intervalMin: 1 })])
    h.resolveInput.mockResolvedValue(result([]))
    m.start()
    await vi.advanceTimersByTimeAsync(12_000)
    expect(h.resolveInput).toHaveBeenCalledOnce()
    m.stop()
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(h.resolveInput).toHaveBeenCalledOnce()
  })
})
