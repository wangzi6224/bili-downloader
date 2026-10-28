import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlainCookie } from './session'

const m = vi.hoisted(() => ({
  list: [] as { domain: string; name: string; value: string }[],
  get: vi.fn(),
  set: vi.fn(async (_c: Record<string, unknown>) => {}),
  flushStore: vi.fn(async () => {}),
  clearStorageData: vi.fn(async () => {}),
  fromPartition: vi.fn()
}))

vi.mock('electron', () => ({
  session: {
    fromPartition: m.fromPartition.mockImplementation(() => ({
      cookies: { get: m.get, set: m.set, flushStore: m.flushStore },
      clearStorageData: m.clearStorageData
    }))
  }
}))

const { clearBiliCookies, cookieHeader, getBiliCookies, getCookie, isBiliHost, PARTITION, setBiliCookies, snapshotCookies } =
  await import('./session')

beforeEach(() => {
  vi.clearAllMocks()
  m.list = []
  // 模拟 Electron 按 name 过滤
  m.get.mockImplementation(async (filter: { name?: string }) => m.list.filter((c) => !filter.name || c.name === filter.name))
})

const cookie = (over: Partial<PlainCookie> = {}): PlainCookie => ({
  domain: '.bilibili.com',
  name: 'SESSDATA',
  value: 'v',
  path: '/',
  secure: true,
  httpOnly: true,
  expires: 1_800_000_000,
  sameSite: 'lax',
  ...over
})

describe('biliSession', () => {
  it('从固定的分区取会话，并按 bilibili.com 查询', async () => {
    await getBiliCookies()
    expect(m.fromPartition).toHaveBeenCalledWith(PARTITION)
    expect(m.get).toHaveBeenCalledWith({ domain: 'bilibili.com' })
  })
})

describe('cookieHeader', () => {
  it('同名 Cookie 以 .bilibili.com 域的为准（在后面也覆盖）', async () => {
    m.list = [
      { domain: 'www.bilibili.com', name: 'buvid3', value: 'host' },
      { domain: '.bilibili.com', name: 'buvid3', value: 'domain' },
      { domain: '.bilibili.com', name: 'SESSDATA', value: 's' }
    ]
    expect(await cookieHeader()).toBe('buvid3=domain; SESSDATA=s')
  })

  it('同名 Cookie 以 .bilibili.com 域的为准（在前面不被覆盖）', async () => {
    m.list = [
      { domain: '.bilibili.com', name: 'buvid3', value: 'domain' },
      { domain: 'www.bilibili.com', name: 'buvid3', value: 'host' }
    ]
    expect(await cookieHeader()).toBe('buvid3=domain')
  })

  it('没有 Cookie 时返回空串', async () => {
    expect(await cookieHeader()).toBe('')
  })
})

describe('getCookie', () => {
  it('跳过空值，取第一个有值的', async () => {
    m.list = [
      { domain: 'www.bilibili.com', name: 'SESSDATA', value: '' },
      { domain: '.bilibili.com', name: 'SESSDATA', value: 'real' }
    ]
    expect(await getCookie('SESSDATA')).toBe('real')
    expect(m.get).toHaveBeenCalledWith({ domain: 'bilibili.com', name: 'SESSDATA' })
  })

  it('都是空值或不存在时返回 undefined', async () => {
    m.list = [{ domain: '.bilibili.com', name: 'SESSDATA', value: '' }]
    expect(await getCookie('SESSDATA')).toBeUndefined()
    expect(await getCookie('bili_jct')).toBeUndefined()
  })
})

describe('setBiliCookies', () => {
  it('带点的 domain 原样保留，url 用去掉点的主机', async () => {
    await setBiliCookies([cookie({ path: '/video' })])
    expect(m.set).toHaveBeenCalledWith({
      url: 'https://bilibili.com/video',
      name: 'SESSDATA',
      value: 'v',
      domain: '.bilibili.com',
      path: '/video',
      secure: true,
      httpOnly: true,
      expirationDate: 1_800_000_000,
      sameSite: 'lax'
    })
  })

  it('不带点的 domain 作为只属于该主机的 Cookie', async () => {
    await setBiliCookies([cookie({ domain: 'www.bilibili.com' })])
    expect(m.set.mock.calls[0]).toEqual([
      expect.objectContaining({ url: 'https://www.bilibili.com/', domain: undefined })
    ])
  })

  it('空 path 补成 /', async () => {
    await setBiliCookies([cookie({ path: '' })])
    expect(m.set.mock.calls[0]).toEqual([expect.objectContaining({ url: 'https://bilibili.com/', path: '/' })])
  })

  it('SameSite=None 但不是 Secure 时降级为 unspecified，Secure 时保留', async () => {
    await setBiliCookies([
      cookie({ name: 'a', sameSite: 'no_restriction', secure: false }),
      cookie({ name: 'b', sameSite: 'no_restriction', secure: true })
    ])
    expect(m.set.mock.calls.map(([c]) => c.sameSite)).toEqual(['unspecified', 'no_restriction'])
  })

  it('全部写完后只 flush 一次', async () => {
    await setBiliCookies([cookie({ name: 'a' }), cookie({ name: 'b' }), cookie({ name: 'c' })])
    expect(m.set).toHaveBeenCalledTimes(3)
    expect(m.flushStore).toHaveBeenCalledTimes(1)
    expect(m.flushStore.mock.invocationCallOrder[0]).toBeGreaterThan(m.set.mock.invocationCallOrder[2])
  })
})

describe('snapshotCookies', () => {
  it('取分区里的全部 cookie，换成能写回的格式，会话 cookie 不带过期时间', async () => {
    m.get.mockResolvedValue([
      { domain: '.bilibili.com', name: 'SESSDATA', value: 's', path: '/', secure: true, httpOnly: true, session: false, expirationDate: 1_800_000_000.5, sameSite: 'lax' },
      { domain: 'www.bilibili.com', name: 'buvid3', value: 'b', path: '', session: true, expirationDate: 1, sameSite: 'unspecified' },
      { name: 'nodomain', value: 'x', sameSite: 'unspecified' }
    ])
    expect(await snapshotCookies()).toEqual([
      { domain: '.bilibili.com', name: 'SESSDATA', value: 's', path: '/', secure: true, httpOnly: true, expires: 1_800_000_000.5, sameSite: 'lax' },
      { domain: 'www.bilibili.com', name: 'buvid3', value: 'b', path: '/', secure: false, httpOnly: false, expires: undefined, sameSite: 'unspecified' }
    ])
    expect(m.get).toHaveBeenCalledWith({})
  })

  it('取出来的能原样写回', async () => {
    m.get.mockResolvedValue([{ domain: 'www.bilibili.com', name: 'a', value: '1', path: '/x', secure: true, httpOnly: false, session: true, sameSite: 'strict' }])
    await setBiliCookies(await snapshotCookies())
    expect(m.set).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://www.bilibili.com/x', domain: undefined, name: 'a', path: '/x' }))
  })
})

describe('clearBiliCookies', () => {
  it('只清 cookies 存储', async () => {
    await clearBiliCookies()
    expect(m.clearStorageData).toHaveBeenCalledWith({ storages: ['cookies'] })
  })
})

describe('isBiliHost', () => {
  it.each([
    ['bilibili.com', true],
    ['.bilibili.com', true],
    ['www.bilibili.com', true],
    ['.passport.bilibili.com', true],
    ['evilbilibili.com', false],
    ['notbilibili.com', false],
    ['.evilbilibili.com', false],
    ['bilibili.com.evil.com', false],
    ['', false]
  ])('%s → %s', (host, ok) => {
    expect(isBiliHost(host)).toBe(ok)
  })
})
