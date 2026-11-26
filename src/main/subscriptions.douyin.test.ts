import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeOptions } from '@shared/options'
import type { EnqueueRequest, MediaItem, NewSubscription, ParseResult, Subscription } from '@shared/types'

const h = vi.hoisted(() => ({
  userData: '',
  resolveInput: vi.fn(),
  downloadedKeys: vi.fn<() => string[]>(() => []),
  loadAllPages: vi.fn(),
  loadHeadPages: vi.fn(),
  prepare: vi.fn(),
  auth: vi.fn()
}))
vi.mock('electron', () => ({ app: { getPath: () => h.userData } }))
vi.mock('./bili/resolve', () => ({ resolveInput: h.resolveInput }))
vi.mock('./bili/lists', () => ({
  isAscending: () => false,
  loadAllPages: h.loadAllPages,
  loadHeadPages: h.loadHeadPages,
  loadTailPages: vi.fn()
}))
vi.mock('./history', () => ({ downloadedKeys: h.downloadedKeys }))
vi.mock('./enqueue', () => ({ prepareEnqueueItems: h.prepare }))
vi.mock('./auth/authGuard', () => ({ getAuthState: h.auth }))
const { SubscriptionManager } = await import('./subscriptions')
const { setDouyin } = await import('./douyin/service')
const { DyVerifyError } = await import('./douyin/errors')

const SEC_UID = 'SEC-test-creator-abcdefghij'
const USER = `https://www.douyin.com/user/${SEC_UID}`
const MIX = 'https://www.douyin.com/collection/700000000000000009'
const LIKES = 'https://www.douyin.com/user/self?showTab=like'
const COLLECTION = 'https://www.douyin.com/user/self?showTab=favorite_collection'
const FOLDER = `${COLLECTION}&collect_id=700000000000000008`
const HISTORY = 'https://www.douyin.com/user/self?showTab=record'

const OPTIONS = normalizeOptions({}, 0)
const dy = (id: string, extra: Partial<MediaItem> = {}): MediaItem => ({ key: `dy:${id}`, kind: 'douyin', title: id, index: 1, cid: 0, dyId: id, ...extra })
const result = (items: MediaItem[], hasMore = false): ParseResult => ({
  kind: 'douyin',
  title: '抖音列表',
  cover: 'c.jpg',
  groups: [{ id: 'dy', title: 'dy', items }],
  defaultSelected: [],
  ...(hasMore ? { paging: { source: { type: 'dy', url: USER, cursor: '1|0|c', account: 'acc1' }, page: 1, total: 0, hasMore: true } } : {})
})
const sub = (o: Partial<Subscription> = {}): Subscription => ({
  id: 'd',
  input: USER,
  title: '测试博主',
  kind: 'douyin',
  intervalMin: 60,
  enabled: true,
  options: OPTIONS,
  seen: [],
  createdAt: 0,
  ...o
})
const newSub = (o: Partial<NewSubscription> = {}): NewSubscription => ({
  input: USER,
  title: '测试博主',
  kind: 'douyin',
  options: OPTIONS,
  intervalMin: 60,
  includeExisting: false,
  currentKeys: ['dy:old'],
  ...o
})

const service = {
  currentAccount: vi.fn<() => string | undefined>(),
  hasAccount: vi.fn<(id: string) => boolean>(),
  hold: vi.fn<(account: string) => 'login' | 'verify' | 'cooling' | undefined>(),
  parse: vi.fn<(input: string, o: object) => Promise<ParseResult | null>>()
}
let enqueue: ReturnType<typeof vi.fn<(req: EnqueueRequest) => number>>
let m: InstanceType<typeof SubscriptionManager>
const saved = (): Subscription[] => JSON.parse(readFileSync(join(h.userData, 'subscriptions.json'), 'utf8'))

beforeEach(() => {
  vi.clearAllMocks()
  h.userData = mkdtempSync(join(tmpdir(), 'subs-dy-'))
  h.downloadedKeys.mockReturnValue([])
  h.loadHeadPages.mockResolvedValue([])
  h.loadAllPages.mockImplementation(async (r) => ({ result: r, complete: true }))
  h.prepare.mockImplementation(async (items) => ({ items, failed: [] }))
  h.auth.mockReturnValue({ loggedIn: false })
  service.currentAccount.mockReset().mockReturnValue('acc1')
  service.hasAccount.mockReset().mockReturnValue(true)
  service.hold.mockReset()
  service.parse.mockReset()
  setDouyin(service as never)
  enqueue = vi.fn((request) => request.items.length)
  m = new SubscriptionManager(enqueue)
})
afterEach(() => {
  m.stop()
  setDouyin(undefined as never)
  rmSync(h.userData, { recursive: true, force: true })
})

describe('添加抖音订阅', () => {
  it.each([LIKES, COLLECTION, HISTORY, 'https://www.douyin.com/user/self'])('自己的列表绑定当前账号：%s', async (input) => {
    const [s] = await m.add(newSub({ input }))
    expect(s.dyAccount).toBe('acc1')
    expect(saved()[0].dyAccount).toBe('acc1')
  })

  it('博主和合集不绑账号', async () => {
    await m.add(newSub({ input: USER }))
    const list = await m.add(newSub({ input: MIX }))
    for (const s of list) expect(s).not.toHaveProperty('dyAccount')
    expect(service.currentAccount).not.toHaveBeenCalled()
  })

  it('类型不是抖音的订阅不绑抖音账号', async () => {
    const [s] = await m.add(newSub({ input: LIKES, kind: 'ugc' }))
    expect(s).not.toHaveProperty('dyAccount')
  })

  it('没选账号时先不绑，检查时再按当时的账号', async () => {
    service.currentAccount.mockReturnValue(undefined)
    const [s] = await m.add(newSub({ input: LIKES }))
    expect(s.dyAccount).toBeUndefined()
  })

  it('同一个来源的不同写法不能订阅两次', async () => {
    await m.add(newSub({ input: USER }))
    await expect(m.add(newSub({ input: `长按复制 www.douyin.com/user/${SEC_UID}?from=test 打开抖音` }))).rejects.toThrow('已经订阅过这个来源')
    await m.add(newSub({ input: MIX }))
    await expect(m.add(newSub({ input: 'https://www.douyin.com/mix/700000000000000009' }))).rejects.toThrow('已经订阅过这个来源')
    expect(m.list()).toHaveLength(2)
  })

  it('现有内容也下载时立即检查一次', async () => {
    service.parse.mockResolvedValue(result([dy('a'), dy('b')]))
    const [s] = await m.add(newSub({ input: LIKES, includeExisting: true }))
    expect(service.parse).toHaveBeenCalledWith(LIKES, { account: 'acc1', background: true })
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ items: [dy('a'), dy('b')], dyAccount: 'acc1' }))
    expect(s.seen).toEqual(['dy:a', 'dy:b'])
  })
})

describe('检查抖音订阅', () => {
  it('只下载没见过、没下载过、还能下载的作品；入队带检查用的账号', async () => {
    m.replaceAll([sub({ seen: ['dy:old'] })])
    h.downloadedKeys.mockReturnValue(['dy:done'])
    service.parse.mockResolvedValue(result([dy('new'), dy('old'), dy('done'), dy('gone', { unavailable: '已删除' })]))
    const found = vi.fn()
    m.on('found', found)
    const [s] = await m.check('d')
    expect(service.hold).toHaveBeenCalledWith('acc1')
    expect(service.parse).toHaveBeenCalledWith(USER, { account: 'acc1', background: true })
    expect(h.prepare.mock.calls).toEqual([[[dy('new')]]])
    expect(enqueue).toHaveBeenCalledExactlyOnceWith({
      title: '抖音列表',
      cover: 'c.jpg',
      kind: 'douyin',
      meta: undefined,
      items: [dy('new')],
      options: OPTIONS,
      accountMid: undefined,
      ytAccount: undefined,
      dyAccount: 'acc1'
    })
    expect(found).toHaveBeenCalledWith({ title: '测试博主', count: 1, note: undefined })
    expect(s).toMatchObject({ lastNew: 1, lastError: undefined })
    expect(s.seen).toEqual(['dy:new', 'dy:old', 'dy:done', 'dy:gone'])
    expect(s.lastCheck).toBeGreaterThan(0)
    expect(saved()[0].seen).toEqual(s.seen)
    expect(h.loadHeadPages).not.toHaveBeenCalled()
    expect(h.loadAllPages).not.toHaveBeenCalled()
  })

  it('没有新内容时不入队也不通知', async () => {
    m.replaceAll([sub({ seen: ['dy:old'], lastError: '上次的错误' })])
    service.parse.mockResolvedValue(result([dy('old')]))
    const found = vi.fn()
    m.on('found', found)
    const [s] = await m.check('d')
    expect(enqueue).not.toHaveBeenCalled()
    expect(found).not.toHaveBeenCalled()
    expect(s).toMatchObject({ lastNew: 0, lastError: undefined })
  })

  it('订阅自己的列表时一直用绑定的账号，换了当前账号也一样', async () => {
    m.replaceAll([sub({ input: LIKES, dyAccount: 'bound' })])
    service.parse.mockResolvedValue(result([dy('a')]))
    await m.check('d')
    expect(service.hold).toHaveBeenCalledWith('bound')
    expect(service.hasAccount).toHaveBeenCalledWith('bound')
    expect(service.parse).toHaveBeenCalledWith(LIKES, { account: 'bound', background: true })
    expect(enqueue.mock.calls[0][0].dyAccount).toBe('bound')
  })

  it.each(['login', 'verify', 'cooling'] as const)('账号现在不能发请求（%s）时这次跳过，什么都不改', async (reason) => {
    m.replaceAll([sub({ seen: ['dy:old'], lastCheck: 5 })])
    service.hold.mockReturnValue(reason)
    const update = vi.fn()
    m.on('update', update)
    const [s] = await m.check('d')
    expect(service.parse).not.toHaveBeenCalled()
    expect(s).toMatchObject({ lastCheck: 5, seen: ['dy:old'] })
    expect(s.lastError).toBeUndefined()
    expect(update).not.toHaveBeenCalled()
  })

  it('没有登录任何账号时记下要先登录', async () => {
    service.currentAccount.mockReturnValue(undefined)
    m.replaceAll([sub()])
    const [s] = await m.check('d')
    expect(s.lastError).toBe('抖音订阅需要先登录抖音账号')
    expect(s.lastCheck).toBeGreaterThan(0)
    expect(service.hold).not.toHaveBeenCalled()
    expect(service.parse).not.toHaveBeenCalled()
  })

  it('绑定的账号已经删掉时记下原因，不改用别的账号', async () => {
    service.hasAccount.mockReturnValue(false)
    m.replaceAll([sub({ input: LIKES, dyAccount: 'removed', seen: ['dy:old'] })])
    const [s] = await m.check('d')
    expect(s).toMatchObject({ lastError: '没有这个抖音账号', dyAccount: 'removed', seen: ['dy:old'] })
    expect(service.parse).not.toHaveBeenCalled()
  })

  it('认不出链接或解析失败时记下原因，已见记录不变', async () => {
    m.replaceAll([sub({ seen: ['dy:old'] })])
    service.parse.mockResolvedValueOnce(null)
    let [s] = await m.check('d')
    expect(s.lastError).toContain('没有认出抖音链接')
    service.parse.mockRejectedValueOnce(new DyVerifyError())
    ;[s] = await m.check('d')
    expect(s.lastError).toContain('安全验证')
    service.parse.mockRejectedValueOnce('网络断开')
    ;[s] = await m.check('d')
    expect(s).toMatchObject({ lastError: '网络断开', seen: ['dy:old'] })
    expect(enqueue).not.toHaveBeenCalled()
    expect(saved()[0].lastError).toBe('网络断开')
  })

  it('上次没加进去的条目再试一次，展开失败的留到下次，说明记进 lastError', async () => {
    const retry = dy('retry')
    m.replaceAll([sub({ seen: ['dy:old'], pending: [retry] })])
    h.downloadedKeys.mockReturnValue([])
    service.parse.mockResolvedValue(result([dy('old'), dy('new')]))
    h.prepare.mockResolvedValueOnce({ items: [dy('new')], failed: [retry], note: '有 1 个没加上' })
    const [s] = await m.check('d')
    expect(h.prepare).toHaveBeenCalledWith([retry, dy('new')])
    expect(s).toMatchObject({ lastNew: 1, lastError: '有 1 个没加上', pending: [retry] })
    expect(s.seen).toEqual(['dy:old', 'dy:new'])
  })

  it('待重试条目出现在这次的列表里时即使见过也再加', async () => {
    const retry = dy('retry')
    m.replaceAll([sub({ seen: ['dy:retry'], pending: [retry] })])
    service.parse.mockResolvedValue(result([retry]))
    const [s] = await m.check('d')
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ items: [retry] }))
    expect(s.pending).toBeUndefined()
  })
})

describe('翻页', () => {
  it.each([USER, LIKES, HISTORY])('新内容在最前的来源首页全是新的时往后翻到见过的为止：%s', async (input) => {
    m.replaceAll([sub({ input, seen: ['dy:old'] })])
    service.parse.mockResolvedValue(result([dy('n1')], true))
    h.loadHeadPages.mockResolvedValueOnce([dy('n2')])
    await m.check('d')
    expect(h.loadHeadPages).toHaveBeenCalledWith(expect.objectContaining({ page: 1, hasMore: true }), expect.any(Function))
    expect(h.loadAllPages).not.toHaveBeenCalled()
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ items: [dy('n1'), dy('n2')] }))
  })

  it('置顶的旧作品不算翻页边界', async () => {
    m.replaceAll([sub({ seen: ['dy:top', 'dy:old'] })])
    service.parse.mockResolvedValue(result([dy('top', { pinned: true }), dy('n1')], true))
    h.loadHeadPages.mockResolvedValueOnce([dy('n2')])
    await m.check('d')
    const boundary = h.loadHeadPages.mock.calls[0][1] as (item: MediaItem) => boolean
    expect(boundary(dy('top', { pinned: true }))).toBe(false)
    expect(boundary(dy('old'))).toBe(true)
    expect(boundary(dy('n3'))).toBe(false)
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ items: [dy('n1'), dy('n2')] }))
  })

  it('首页就有见过的普通作品时不再翻页', async () => {
    m.replaceAll([sub({ seen: ['dy:old'] })])
    service.parse.mockResolvedValue(result([dy('n1'), dy('old')], true))
    await m.check('d')
    expect(h.loadHeadPages).not.toHaveBeenCalled()
  })

  it('现有内容也要下载（还没有已见记录）时往后翻，最多 500 项', async () => {
    m.replaceAll([sub()])
    const first = result([dy('n1')], true)
    service.parse.mockResolvedValue(first)
    h.loadAllPages.mockResolvedValueOnce({ result: result([dy('n1'), dy('n2')]), complete: true })
    await m.check('d')
    expect(h.loadAllPages).toHaveBeenCalledWith(first, { maxItems: 500 })
    expect(h.loadHeadPages).not.toHaveBeenCalled()
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ items: [dy('n1'), dy('n2')] }))
  })

  it.each([MIX, COLLECTION, FOLDER])('顺序不定的合集和收藏夹最多读 500 项再比对：%s', async (input) => {
    m.replaceAll([sub({ input, seen: ['dy:a'] })])
    const first = result([dy('a')], true)
    service.parse.mockResolvedValue(first)
    h.loadAllPages.mockResolvedValueOnce({ result: result([dy('a'), dy('b'), dy('c')]), complete: true })
    const [s] = await m.check('d')
    expect(h.loadAllPages).toHaveBeenCalledWith(first, { maxItems: 500 })
    expect(h.loadHeadPages).not.toHaveBeenCalled()
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ items: [dy('b'), dy('c')] }))
    expect(s.seen).toEqual(['dy:a', 'dy:b', 'dy:c'])
  })

  it('超过 500 项没读完但没出错时按读到的比对', async () => {
    m.replaceAll([sub({ input: MIX, seen: ['dy:a'] })])
    service.parse.mockResolvedValue(result([dy('a')], true))
    h.loadAllPages.mockResolvedValueOnce({ result: result([dy('a'), dy('b')], true), complete: false })
    const [s] = await m.check('d')
    expect(s).toMatchObject({ lastNew: 1, lastError: undefined })
  })

  it('读到一半被拒绝时整次作废，不入队、不更新已见记录', async () => {
    m.replaceAll([sub({ input: MIX, seen: ['dy:a'] })])
    service.parse.mockResolvedValue(result([dy('a')], true))
    h.loadAllPages.mockResolvedValueOnce({ result: result([dy('a'), dy('b')], true), complete: false, error: '抖音要求完成安全验证' })
    const [s] = await m.check('d')
    expect(s).toMatchObject({ lastError: '抖音要求完成安全验证', seen: ['dy:a'] })
    expect(h.prepare).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('往后翻页出错时同样整次作废', async () => {
    m.replaceAll([sub({ seen: ['dy:old'] })])
    service.parse.mockResolvedValue(result([dy('n1')], true))
    h.loadHeadPages.mockRejectedValueOnce(new Error('限流了'))
    const [s] = await m.check('d')
    expect(s).toMatchObject({ lastError: '限流了', seen: ['dy:old'] })
    expect(enqueue).not.toHaveBeenCalled()
  })
})

describe('检查过程中订阅发生变化', () => {
  it('订阅不在列表里时什么都不做', async () => {
    expect(await m.check('nobody')).toEqual([])
    expect(service.parse).not.toHaveBeenCalled()
  })

  it('读取期间订阅被删除：丢弃结果，不入队也不写回', async () => {
    m.replaceAll([sub()])
    service.parse.mockImplementation(async () => {
      m.remove('d')
      return result([dy('a')])
    })
    expect(await m.check('d')).toEqual([])
    expect(h.prepare).not.toHaveBeenCalled()
    expect(saved()).toEqual([])
  })

  it('准备条目期间订阅被删除：不入队', async () => {
    m.replaceAll([sub()])
    service.parse.mockResolvedValue(result([dy('a')]))
    h.prepare.mockImplementationOnce(async (items: MediaItem[]) => {
      m.remove('d')
      return { items, failed: [] }
    })
    expect(await m.check('d')).toEqual([])
    expect(enqueue).not.toHaveBeenCalled()
    expect(saved()).toEqual([])
  })

  it('读取失败时订阅已被删除：不记错误', async () => {
    m.replaceAll([sub()])
    const removed = m.list()[0]
    service.parse.mockImplementation(async () => {
      m.remove('d')
      throw new Error('失败')
    })
    expect(await m.check('d')).toEqual([])
    expect(removed.lastError).toBeUndefined()
  })

  it('同一个订阅正在检查时，再检查直接返回；结束后可以再查', async () => {
    m.replaceAll([sub()])
    let finish!: (r: ParseResult) => void
    service.parse.mockReturnValue(new Promise<ParseResult>((r) => (finish = r)))
    const first = m.check('d')
    await m.check('d')
    expect(service.parse).toHaveBeenCalledOnce()
    finish(result([]))
    await first
    const second = m.check('d')
    finish(result([]))
    await second
    expect(service.parse).toHaveBeenCalledTimes(2)
  })

  it('同一来源正在一键下载时跳过检查', async () => {
    m.replaceAll([sub()])
    let finish!: (r: ParseResult) => void
    h.resolveInput.mockReturnValue(new Promise<ParseResult>((r) => (finish = r)))
    const quick = m.downloadSource({ input: `www.douyin.com/user/${SEC_UID}`, defaults: OPTIONS, verifyAccount: vi.fn() })
    await m.check('d')
    expect(service.parse).not.toHaveBeenCalled()
    finish(result([]))
    await quick
  })

  it('有多账号时抖音订阅不要求 B站账号', async () => {
    const run = vi.fn()
    m = new SubscriptionManager(enqueue, { status: () => 'ready', run })
    m.replaceAll([sub()])
    service.parse.mockResolvedValue(result([dy('a')]))
    await m.check('d')
    expect(run).not.toHaveBeenCalled()
    expect(enqueue).toHaveBeenCalled()
  })
})
