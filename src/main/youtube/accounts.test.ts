import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@shared/i18n'
import type { PlainCookie } from '../auth/session'

// 透传，只为了能模拟 Windows 上 chmod 失败
vi.mock('node:fs', async (o) => {
  const fs = await o<typeof import('node:fs')>()
  return { ...fs, chmodSync: vi.fn(fs.chmodSync) }
})

const { chmodSync } = await import('node:fs')
const { sapisidHash, whoAmI, YtAccounts } = await import('./accounts')
const { parseNetscape, toNetscape } = await import('./cookies')

const vault = {
  encrypt: (text: string) => Buffer.from(Buffer.from(text).toString('base64')),
  decrypt: (data: Buffer) => Buffer.from(data.toString(), 'base64').toString('utf8')
}

const cookie = (name: string, value: string, over: Partial<PlainCookie> = {}): PlainCookie => ({
  domain: '.youtube.com',
  name,
  value,
  path: '/',
  secure: true,
  httpOnly: false,
  expires: 2_000_000_000,
  sameSite: 'unspecified',
  ...over
})
const LOGIN = [cookie('SAPISID', 'sap'), cookie('SID', 'sid')]

const menu = (header: Record<string, unknown> | undefined) => ({
  actions: [{ openPopupAction: { popup: { multiPageMenuRenderer: { header: header && { activeAccountHeaderRenderer: header } } } } }]
})
const who = (name: string, handle?: string, avatar?: string) =>
  menu({
    accountName: { simpleText: name },
    ...(handle ? { channelHandle: { simpleText: handle } } : {}),
    ...(avatar ? { accountPhoto: { thumbnails: [{ url: 'small' }, { url: avatar }] } } : {})
  })
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status })

let dir = ''
let clock = 1_000
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'yt-accounts-'))
  clock = 1_000
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const make = (f: typeof fetch = vi.fn(async () => json(who('小明', '@ming', 'big')))) =>
  new YtAccounts(dir, { vault, fetch: f, now: () => clock })

describe('sapisidHash', () => {
  it('时间戳_sha1(时间戳 SAPISID 来源)', () => {
    const hash = createHash('sha1').update('100 abc https://www.youtube.com').digest('hex')
    expect(sapisidHash('abc', 100)).toBe(`SAPISIDHASH 100_${hash}`)
    const other = createHash('sha1').update('100 abc https://x').digest('hex')
    expect(sapisidHash('abc', 100, 'https://x')).toBe(`SAPISIDHASH 100_${other}`)
  })
})

describe('whoAmI', () => {
  it('没有 SAPISID 时不请求，返回空', async () => {
    const f = vi.fn()
    expect(await whoAmI([cookie('SID', 'x')], f as unknown as typeof fetch)).toBeUndefined()
    expect(f).not.toHaveBeenCalled()
  })

  it('带鉴权头请求账号菜单，解析名字、handle 和最大的头像', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => json(who('小明', '@ming', 'big')))
    expect(await whoAmI(LOGIN, f as unknown as typeof fetch, 100)).toEqual({ name: '小明', handle: '@ming', avatar: 'big' })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://www.youtube.com/youtubei/v1/account/account_menu?prettyPrint=false')
    expect(init?.method).toBe('POST')
    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toBe(sapisidHash('sap', 100))
    expect(headers.Cookie).toBe('SAPISID=sap; SID=sid')
    expect(JSON.parse(String(init?.body))).toMatchObject({ context: { client: { clientName: 'WEB' } } })
  })

  it('只有 __Secure-3PAPISID 时也能用', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => json(who('小红')))
    expect(await whoAmI([cookie('__Secure-3PAPISID', 'p3')], f as unknown as typeof fetch, 1)).toEqual({ name: '小红', handle: undefined, avatar: undefined })
    expect((f.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe(sapisidHash('p3', 1))
  })

  it('不传 fetch 和时间时用全局的 fetch 和当前时间', async () => {
    const f = vi.fn(async () => json(who('全局')))
    vi.stubGlobal('fetch', f)
    try {
      expect(await whoAmI(LOGIN)).toMatchObject({ name: '全局' })
      expect(f).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('401、403 表示 cookie 失效，返回空', async () => {
    for (const status of [401, 403]) {
      expect(await whoAmI(LOGIN, (async () => new Response('', { status })) as typeof fetch)).toBeUndefined()
    }
  })

  it('其他错误码报错', async () => {
    await expect(whoAmI(LOGIN, (async () => new Response('', { status: 500 })) as typeof fetch)).rejects.toThrow('HTTP 500')
  })

  it('菜单里没有名字时返回空', async () => {
    expect(await whoAmI(LOGIN, (async () => json({})) as typeof fetch)).toBeUndefined()
    expect(await whoAmI(LOGIN, (async () => json(menu(undefined))) as typeof fetch)).toBeUndefined()
    expect(await whoAmI(LOGIN, (async () => json(menu({ accountName: {} }))) as typeof fetch)).toBeUndefined()
  })
})

describe('YtAccounts', () => {
  const account = (id: string, over: Record<string, unknown> = {}) => ({ id, name: id, addedAt: 1, status: 'ready', ...over })
  const saveStore = (data: unknown): void => writeFileSync(join(dir, 'accounts.json'), JSON.stringify(data))

  describe('构造', () => {
    it('没有存档时为空', () => {
      const a = make()
      expect(a.snapshot()).toEqual({ current: undefined, accounts: [] })
      expect(a.current()).toBeUndefined()
    })

    it('读出存档；current 指向不存在的账号时清掉', () => {
      saveStore({ current: 'a', accounts: [account('a')] })
      expect(make().current()).toBe('a')
      saveStore({ current: 'x', accounts: [account('a')] })
      expect(make().snapshot()).toEqual({ current: undefined, accounts: [account('a')] })
    })

    it('accounts 不是数组时当作空', () => {
      saveStore({ current: 'a', accounts: {} })
      expect(make().snapshot()).toEqual({ current: undefined, accounts: [] })
    })

    it('快照是副本，改它不影响内部', () => {
      saveStore({ accounts: [account('a')] })
      const a = make()
      a.snapshot().accounts[0].name = '改了'
      expect(a.snapshot().accounts[0].name).toBe('a')
    })
  })

  describe('add', () => {
    it('没有 SAPISID（或值为空）时报错', async () => {
      const a = make()
      await expect(a.add([cookie('SID', 'x')])).rejects.toThrow(t('ytLogin.noLoginCookie'))
      await expect(a.add([cookie('SAPISID', '')])).rejects.toThrow(t('ytLogin.noLoginCookie'))
    })

    it('验证请求出错时报错', async () => {
      const a = make((async () => new Response('', { status: 500 })) as typeof fetch)
      await expect(a.add(LOGIN)).rejects.toThrow(t('ytLogin.verifyFailed', { reason: 'HTTP 500' }))
      const b = make((async () => {
        throw 'boom'
      }) as typeof fetch)
      await expect(b.add(LOGIN)).rejects.toThrow(t('ytLogin.verifyFailed', { reason: 'boom' }))
    })

    it('登录已失效时报错', async () => {
      const a = make((async () => new Response('', { status: 401 })) as typeof fetch)
      await expect(a.add(LOGIN)).rejects.toThrow(t('ytLogin.expired'))
      expect(a.snapshot().accounts).toEqual([])
    })

    it('新账号：存加密的 cookie、设为当前，触发 changed 和 login', async () => {
      const a = make()
      const changed = vi.fn()
      const login = vi.fn()
      a.on('changed', changed)
      a.on('login', login)
      const acc = await a.add(LOGIN)
      expect(acc).toMatchObject({ name: '小明', handle: '@ming', avatar: 'big', addedAt: 1000, checkedAt: 1000, status: 'ready' })
      expect(a.current()).toBe(acc.id)
      expect(a.snapshot()).toEqual({ current: acc.id, accounts: [acc] })
      expect(changed).toHaveBeenCalledWith(a.snapshot())
      expect(login).toHaveBeenCalledWith(acc.id)
      // 磁盘上是加密的，读回来是原样
      const raw = readFileSync(join(dir, `${acc.id}.cookies`))
      expect(raw.toString()).not.toContain('sap')
      expect(a.readCookies(acc.id)).toEqual(LOGIN)
      if (process.platform !== 'win32') expect(statSync(join(dir, `${acc.id}.cookies`)).mode & 0o777).toBe(0o600)
      // 存档重启后还在
      expect(make().snapshot()).toEqual(a.snapshot())
    })

    it('同一个 handle 的更新原账号，保留添加时间，其他账号不动', async () => {
      saveStore({ accounts: [account('other', { handle: '@x' })] })
      const f = vi.fn(async () => json(who('小明', '@ming')))
      const a = make(f as unknown as typeof fetch)
      const first = await a.add(LOGIN)
      f.mockResolvedValueOnce(json(who('小明改名', '@ming', 'new')))
      clock = 5_000
      const second = await a.add([cookie('SAPISID', 'sap2')])
      expect(second).toMatchObject({ id: first.id, name: '小明改名', avatar: 'new', addedAt: 1000, checkedAt: 5000 })
      expect(a.snapshot().accounts).toEqual([account('other', { handle: '@x' }), second])
      expect(a.readCookies(first.id)).toEqual([cookie('SAPISID', 'sap2')])
    })

    it('没有 handle 时按名字认同一个人；不同的人另加一个账号', async () => {
      const f = vi.fn(async () => json(who('无名')))
      const a = make(f as unknown as typeof fetch)
      const first = await a.add(LOGIN)
      const again = await a.add(LOGIN)
      expect(again.id).toBe(first.id)
      f.mockResolvedValueOnce(json(who('别人', '@other')))
      const other = await a.add(LOGIN)
      expect(other.id).not.toBe(first.id)
      expect(a.snapshot()).toEqual({ current: other.id, accounts: [again, other] })
    })

    it('chmod 失败（Windows）不影响保存', async () => {
      vi.mocked(chmodSync).mockImplementationOnce(() => {
        throw new Error('EPERM')
      })
      const a = make()
      const acc = await a.add(LOGIN)
      expect(a.readCookies(acc.id)).toEqual(LOGIN)
    })
  })

  describe('select', () => {
    it('切换账号，触发 changed 和 login；undefined 表示不登录', () => {
      saveStore({ current: 'a', accounts: [account('a'), account('b')] })
      const a = make()
      const login = vi.fn()
      const changed = vi.fn()
      a.on('login', login)
      a.on('changed', changed)
      a.select('b')
      expect(a.current()).toBe('b')
      a.select(undefined)
      expect(a.current()).toBeUndefined()
      expect(login.mock.calls).toEqual([['b'], [undefined]])
      expect(changed).toHaveBeenCalledTimes(2)
    })

    it('账号不存在时报错', () => {
      expect(() => make().select('x')).toThrow(t('ytLogin.accountNotFound'))
    })
  })

  describe('remove', () => {
    it('删掉 cookie 文件；删的是当前账号时换成第一个，触发 removed', async () => {
      const f = vi.fn(async () => json(who('甲', '@a')))
      const a = make(f as unknown as typeof fetch)
      const first = await a.add(LOGIN)
      f.mockResolvedValueOnce(json(who('乙', '@b')))
      const second = await a.add(LOGIN)
      expect(a.current()).toBe(second.id)
      const removed = vi.fn()
      a.on('removed', removed)
      a.remove(second.id)
      expect(existsSync(join(dir, `${second.id}.cookies`))).toBe(false)
      expect(a.current()).toBe(first.id)
      expect(removed).toHaveBeenCalledWith(second.id)
      // 删的不是当前账号：当前不变；删光后没有当前账号
      a.remove(first.id)
      expect(a.snapshot()).toEqual({ current: undefined, accounts: [] })
    })

    it('删的不是当前账号时当前账号不变', () => {
      saveStore({ current: 'a', accounts: [account('a'), account('b')] })
      const a = make()
      a.remove('b')
      expect(a.snapshot()).toEqual({ current: 'a', accounts: [account('a')] })
    })

    it('账号不存在时报错', () => {
      expect(() => make().remove('x')).toThrow(t('ytLogin.accountNotFound'))
    })
  })

  describe('check', () => {
    it('还有效：更新名字、handle、头像和检查时间，其他账号不动', async () => {
      saveStore({ accounts: [account('other')] })
      const f = vi.fn(async () => json(who('甲', '@a', 'p1')))
      const a = make(f as unknown as typeof fetch)
      const acc = await a.add(LOGIN)
      clock = 9_000
      f.mockResolvedValueOnce(json(who('甲新', '@a2', 'p2')))
      expect(await a.check(acc.id)).toEqual({ ...acc, name: '甲新', handle: '@a2', avatar: 'p2', checkedAt: 9000 })
      // 这次没给 handle、头像：沿用原来的
      f.mockResolvedValueOnce(json(who('甲新')))
      expect(await a.check(acc.id)).toMatchObject({ handle: '@a2', avatar: 'p2', status: 'ready' })
      expect(a.snapshot().accounts.map((x) => x.name)).toEqual(['other', '甲新'])
    })

    it('失效时标成 expired', async () => {
      const f = vi.fn(async () => json(who('甲', '@a')))
      const a = make(f as unknown as typeof fetch)
      const acc = await a.add(LOGIN)
      f.mockResolvedValueOnce(new Response('', { status: 403 }))
      clock = 7_000
      expect(await a.check(acc.id)).toEqual({ ...acc, status: 'expired', checkedAt: 7000 })
      expect(a.snapshot().accounts[0].status).toBe('expired')
    })

    it('cookie 文件读不出来时当作失效（不请求）', async () => {
      saveStore({ accounts: [account('a')] })
      const f = vi.fn()
      const a = make(f as unknown as typeof fetch)
      expect(a.readCookies('a')).toEqual([])
      expect(await a.check('a')).toMatchObject({ status: 'expired' })
      expect(f).not.toHaveBeenCalled()
    })

    it('账号不存在时报错', async () => {
      await expect(make().check('x')).rejects.toThrow(t('ytLogin.accountNotFound'))
    })
  })

  describe('cookieFile', () => {
    const tmp = (): string => join(dir, 'tmp')

    it('没有账号、或账号没有 cookie 时返回空', async () => {
      saveStore({ accounts: [account('a')] })
      const a = make()
      expect(await a.cookieFile(undefined, tmp())).toBeUndefined()
      expect(await a.cookieFile('a', tmp())).toBeUndefined()
      expect(existsSync(tmp())).toBe(false)
    })

    it('写出只有自己可读的 Netscape 文件，每次一份', async () => {
      const a = make()
      const acc = await a.add(LOGIN)
      const c1 = (await a.cookieFile(acc.id, tmp()))!
      const c2 = (await a.cookieFile(acc.id, tmp()))!
      expect(c1.file).not.toBe(c2.file)
      expect(readFileSync(c1.file, 'utf8')).toBe(toNetscape(LOGIN))
      if (process.platform !== 'win32') expect(statSync(c1.file).mode & 0o777).toBe(0o600)
      await c1.done()
      await c2.done()
      expect(readdirSync(tmp())).toEqual([])
    })

    it('done 时把 yt-dlp 写回的新 cookie 合并回去，删掉文件', async () => {
      const a = make()
      const acc = await a.add(LOGIN)
      const c = (await a.cookieFile(acc.id, tmp()))!
      const fresh = [cookie('SID', 'sid2'), cookie('NEW', 'n'), cookie('OLD', 'gone', { expires: 1 })]
      writeFileSync(c.file, toNetscape(fresh))
      await c.done()
      expect(existsSync(c.file)).toBe(false)
      const merged = a.readCookies(acc.id)
      expect(merged.map((x) => `${x.name}=${x.value}`)).toEqual(['SAPISID=sap', 'SID=sid2', 'NEW=n'])
      expect(parseNetscape(toNetscape(merged))).toHaveLength(3)
    })

    it('写回的文件没有 cookie 时不改原来的', async () => {
      const a = make()
      const acc = await a.add(LOGIN)
      const c = (await a.cookieFile(acc.id, tmp()))!
      writeFileSync(c.file, '# Netscape HTTP Cookie File\n')
      await c.done()
      expect(a.readCookies(acc.id)).toEqual(LOGIN)
      expect(existsSync(c.file)).toBe(false)
    })

    it('账号已经删了：不再写回', async () => {
      const a = make()
      const acc = await a.add(LOGIN)
      const c = (await a.cookieFile(acc.id, tmp()))!
      a.remove(acc.id)
      writeFileSync(c.file, toNetscape([cookie('SID', 'x')]))
      await c.done()
      expect(existsSync(join(dir, `${acc.id}.cookies`))).toBe(false)
      expect(existsSync(c.file)).toBe(false)
    })

    it('读不到写回的内容时不报错，原来的 cookie 保留', async () => {
      const a = make()
      const acc = await a.add(LOGIN)
      const c = (await a.cookieFile(acc.id, tmp()))!
      rmSync(c.file)
      await expect(c.done()).resolves.toBeUndefined()
      expect(a.readCookies(acc.id)).toEqual(LOGIN)
    })
  })

  describe('markExpired', () => {
    it('标成 expired 并保存；已经失效或不存在的不动', () => {
      saveStore({ accounts: [account('a'), account('b')] })
      const a = make()
      const changed = vi.fn()
      a.on('changed', changed)
      clock = 3_000
      a.markExpired('a')
      expect(a.snapshot().accounts[0]).toMatchObject({ status: 'expired', checkedAt: 3000 })
      expect(a.snapshot().accounts[1]).toEqual(account('b'))
      a.markExpired('a')
      a.markExpired('x')
      expect(changed).toHaveBeenCalledTimes(1)
    })
  })

  it('不传 now 时用当前时间', async () => {
    const a = new YtAccounts(dir, { vault, fetch: (async () => json(who('甲'))) as typeof fetch })
    const before = Date.now()
    const acc = await a.add(LOGIN)
    expect(acc.addedAt).toBeGreaterThanOrEqual(before)
  })
})
