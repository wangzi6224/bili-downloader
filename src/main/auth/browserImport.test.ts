import { createCipheriv, createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthState } from '@shared/types'
import type { PlainCookie } from './session'

type ExecCb = (err: (Error & { code?: number }) | null, stdout: string, stderr: string) => void

const m = vi.hoisted(() => ({
  execFile: vi.fn(),
  checkAuth: vi.fn(),
  clearBiliCookies: vi.fn(async () => {}),
  setBiliCookies: vi.fn(async (_list: unknown[]) => {}),
  snapshotCookies: vi.fn(async () => [] as PlainCookie[])
}))

vi.mock('node:child_process', () => ({ execFile: m.execFile }))
vi.mock('./authGuard', () => ({ checkAuth: m.checkAuth }))
// isBiliHost 用真实实现
vi.mock('./session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./session')>()),
  clearBiliCookies: m.clearBiliCookies,
  setBiliCookies: m.setBiliCookies,
  snapshotCookies: m.snapshotCookies
}))

const { chromeTimeToUnix, chromiumKey, decryptChromiumValue } = await import('./browserImport')

function encrypt(plain: Buffer, password: string): Buffer {
  const cipher = createCipheriv('aes-128-cbc', chromiumKey(password), Buffer.alloc(16, ' '))
  return Buffer.concat([Buffer.from('v10'), cipher.update(plain), cipher.final()])
}

describe('chromium cookie decryption', () => {
  const key = chromiumKey('peanuts')

  it('decrypts legacy values (meta version < 24)', () => {
    const enc = encrypt(Buffer.from('abc%2C123%2Cdef'), 'peanuts')
    expect(decryptChromiumValue(enc, key, 23)).toBe('abc%2C123%2Cdef')
  })

  it('strips the 32-byte host hash for meta version >= 24', () => {
    const hash = createHash('sha256').update('.bilibili.com').digest()
    const enc = encrypt(Buffer.concat([hash, Buffer.from('SESSVALUE')]), 'peanuts')
    expect(decryptChromiumValue(enc, key, 24)).toBe('SESSVALUE')
  })

  it('passes through unencrypted values', () => {
    expect(decryptChromiumValue(Buffer.from('plain'), key, 24)).toBe('plain')
  })

  it('converts chrome time', () => {
    // 2024-01-01T00:00:00Z
    expect(chromeTimeToUnix(13348540800000000n)).toBe(1704067200)
    expect(chromeTimeToUnix(0n)).toBeUndefined()
  })

  it('空值解出空串', () => {
    expect(decryptChromiumValue(new Uint8Array(), key, 24)).toBe('')
  })
})

// ---------- 用临时 HOME 和真实的 SQLite 库模拟各浏览器 ----------

const PASSWORD = 'peanuts'
const NOW = Math.floor(Date.now() / 1000)
const FUTURE = NOW + 30 * 86400
const PAST = NOW - 86400
const IN: AuthState = { loggedIn: true, user: { mid: 1, uname: 'u', face: '', vipActive: false, vipLabel: '' } }
const isRoot = process.getuid?.() === 0

interface ChromeRow {
  host: string
  name: string
  value?: string
  enc?: Uint8Array
  path?: string
  /** unix 秒；0 表示会话 Cookie */
  expires?: number
  secure?: number
  httpOnly?: number
  sameSite?: number
}

interface FirefoxRow {
  host: string
  name: string
  value: string
  path?: string
  expiry: number
  secure?: number
  httpOnly?: number
  sameSite?: number
}

const chromeTime = (unix: number): bigint => (unix ? (BigInt(unix) + 11644473600n) * 1_000_000n : 0n)

/** 新版 Chromium 加密时明文前面带 32 字节的域名哈希 */
const encV24 = (host: string, value: string): Buffer =>
  encrypt(Buffer.concat([createHash('sha256').update(host).digest(), Buffer.from(value)]), PASSWORD)

let base: string
let home: string
let tmp: string
const locked: string[] = []
const env = { HOME: process.env.HOME, TMPDIR: process.env.TMPDIR }
let bi: typeof import('./browserImport')

const support = (...p: string[]): string => join(home, 'Library/Application Support', ...p)

/** 建一个 Chromium 的 Cookies 库；wal 为 true 时返回仍打开着的连接（数据还在 -wal 里） */
function chromeDb(file: string, rows: ChromeRow[], opts: { version?: number | null; wal?: boolean } = {}): DatabaseSync | undefined {
  mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  if (opts.wal) db.exec('PRAGMA journal_mode=WAL')
  db.exec(`CREATE TABLE meta(key TEXT, value TEXT);
    CREATE TABLE cookies(host_key TEXT, name TEXT, value TEXT, encrypted_value BLOB, path TEXT,
      expires_utc INTEGER, is_secure INTEGER, is_httponly INTEGER, samesite INTEGER)`)
  const version = opts.version === undefined ? 24 : opts.version
  if (version !== null) db.prepare(`INSERT INTO meta VALUES ('version', ?)`).run(String(version))
  const ins = db.prepare(`INSERT INTO cookies VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  for (const r of rows) {
    ins.run(r.host, r.name, r.value ?? '', r.enc ?? new Uint8Array(), r.path ?? '/', chromeTime(r.expires ?? FUTURE), r.secure ?? 1, r.httpOnly ?? 0, r.sameSite ?? -1)
  }
  if (opts.wal) return db
  db.close()
  return undefined
}

function firefoxDb(file: string, rows: FirefoxRow[]): void {
  mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec(`CREATE TABLE moz_cookies(host TEXT, name TEXT, value TEXT, path TEXT, expiry INTEGER,
    isSecure INTEGER, isHttpOnly INTEGER, sameSite INTEGER)`)
  const ins = db.prepare(`INSERT INTO moz_cookies VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  for (const r of rows) ins.run(r.host, r.name, r.value, r.path ?? '/', r.expiry, r.secure ?? 1, r.httpOnly ?? 0, r.sameSite ?? 0)
  db.close()
}

const sess = (expires = FUTURE, host = '.bilibili.com'): ChromeRow => ({ host, name: 'SESSDATA', value: 'plain-sess', expires })

function lock(path: string): void {
  chmodSync(path, 0o000)
  locked.push(path)
}

/** withDbCopy 留下的临时目录 */
const leftovers = (): string[] => readdirSync(tmp).filter((n) => n.startsWith('bili-cookies-'))

const byId = <T extends { id: string }>(list: T[]): T[] => [...list].sort((a, b) => a.id.localeCompare(b.id))

const lastImported = (): PlainCookie[] => m.setBiliCookies.mock.calls.at(-1)![0] as PlainCookie[]

beforeEach(async () => {
  vi.clearAllMocks()
  base = mkdtempSync(join(tmpdir(), 'bili-browser-test-'))
  home = join(base, 'home')
  tmp = join(base, 'tmp')
  mkdirSync(support(), { recursive: true })
  mkdirSync(tmp)
  process.env.HOME = home
  process.env.TMPDIR = tmp
  m.checkAuth.mockResolvedValue(IN)
  m.execFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: ExecCb) => cb(null, `${PASSWORD}\n`, ''))
  // SUPPORT 在模块加载时就按 HOME 算好了，换了 HOME 要重新加载
  vi.resetModules()
  bi = await import('./browserImport')
})

afterEach(() => {
  process.env.HOME = env.HOME
  process.env.TMPDIR = env.TMPDIR
  for (const p of locked.splice(0)) chmodSync(p, 0o755)
  rmSync(base, { recursive: true, force: true })
})

describe('listBrowserProfiles', () => {
  it('什么浏览器都没装时返回空', () => {
    expect(bi.listBrowserProfiles()).toEqual([])
  })

  it('配置档名称取自 Local State，只认 Default 和 Profile *，Cookie 库可以在 Network/ 下', () => {
    const root = support('Google/Chrome')
    chromeDb(join(root, 'Default/Cookies'), [sess()])
    chromeDb(join(root, 'Profile 1/Network/Cookies'), [])
    chromeDb(join(root, 'Profile 3/Network/Cookies'), [])
    chromeDb(join(root, 'Guest Profile/Cookies'), [sess()])
    chromeDb(join(root, 'System Profile/Cookies'), [sess()])
    // 没有 Cookie 库的配置档跳过
    mkdirSync(join(root, 'Profile 2'))
    writeFileSync(
      join(root, 'Local State'),
      JSON.stringify({ profile: { info_cache: { Default: { name: '个人' }, 'Profile 1': { name: '' }, 'Profile 3': { name: '工作' } } } })
    )
    expect(byId(bi.listBrowserProfiles())).toEqual([
      { id: 'chrome::Default', browser: 'Chrome', profile: '个人', hasBiliLogin: true },
      { id: 'chrome::Profile 1', browser: 'Chrome', profile: 'Profile 1', hasBiliLogin: false },
      { id: 'chrome::Profile 3', browser: 'Chrome', profile: '工作', hasBiliLogin: false }
    ])
  })

  it('Local State 缺失或损坏时用目录名', () => {
    chromeDb(support('Microsoft Edge/Default/Cookies'), [])
    chromeDb(support('BraveSoftware/Brave-Browser/Default/Cookies'), [])
    writeFileSync(support('BraveSoftware/Brave-Browser/Local State'), '{oops')
    expect(byId(bi.listBrowserProfiles()).map((p) => [p.id, p.profile])).toEqual([
      ['brave::Default', 'Default'],
      ['edge::Default', 'Default']
    ])
  })

  it('按 SESSDATA 判断是否已登录：过期、非 B站域名都不算，会话 Cookie 算', () => {
    chromeDb(support('Chromium/Default/Cookies'), [sess(PAST)])
    chromeDb(support('Chromium/Profile 1/Cookies'), [sess(FUTURE, '.evilbilibili.com'), sess(FUTURE, 'notbilibili.com')])
    chromeDb(support('Chromium/Profile 2/Cookies'), [sess(0)])
    chromeDb(support('Chromium/Profile 3/Cookies'), [sess(FUTURE, 'www.bilibili.com')])
    expect(byId(bi.listBrowserProfiles()).map((p) => [p.id, p.hasBiliLogin])).toEqual([
      ['chromium::Default', false],
      ['chromium::Profile 1', false],
      ['chromium::Profile 2', true],
      ['chromium::Profile 3', true]
    ])
  })

  it('浏览器正在运行（WAL 模式）时也能读到还没写回主库的数据', () => {
    const db = chromeDb(support('Vivaldi/Default/Cookies'), [sess()], { wal: true })
    try {
      expect(bi.listBrowserProfiles()).toEqual([{ id: 'vivaldi::Default', browser: 'Vivaldi', profile: 'Default', hasBiliLogin: true }])
    } finally {
      db!.close()
    }
  })

  it('Firefox：目录名去掉随机前缀，毫秒和秒两种过期时间都认', () => {
    const profiles = support('Firefox/Profiles')
    firefoxDb(join(profiles, 'abc123.default-release/cookies.sqlite'), [
      { host: '.bilibili.com', name: 'SESSDATA', value: 's', expiry: FUTURE * 1000 }
    ])
    firefoxDb(join(profiles, 'def456.work/cookies.sqlite'), [{ host: '.bilibili.com', name: 'SESSDATA', value: 's', expiry: FUTURE }])
    firefoxDb(join(profiles, 'ghi789.old/cookies.sqlite'), [
      { host: '.bilibili.com', name: 'SESSDATA', value: 's', expiry: PAST * 1000 },
      { host: '.evilbilibili.com', name: 'SESSDATA', value: 's', expiry: FUTURE }
    ])
    firefoxDb(join(profiles, 'nodot/cookies.sqlite'), [])
    firefoxDb(join(profiles, 'trailing./cookies.sqlite'), [])
    // 没有 cookies.sqlite 的目录跳过
    mkdirSync(join(profiles, 'empty.profile'))
    expect(byId(bi.listBrowserProfiles()).map((p) => [p.id, p.browser, p.profile, p.hasBiliLogin])).toEqual([
      ['firefox::abc123.default-release', 'Firefox', 'default-release', true],
      ['firefox::def456.work', 'Firefox', 'work', true],
      ['firefox::ghi789.old', 'Firefox', 'old', false],
      ['firefox::nodot', 'Firefox', 'nodot', false],
      ['firefox::trailing.', 'Firefox', 'trailing.', false]
    ])
  })

  it.skipIf(isRoot)('浏览器目录没有读取权限时标记为 blocked', () => {
    chromeDb(support('Arc/User Data/Default/Cookies'), [sess()])
    lock(support('Arc/User Data'))
    mkdirSync(support('Firefox/Profiles'), { recursive: true })
    lock(support('Firefox/Profiles'))
    expect(byId(bi.listBrowserProfiles())).toEqual([
      { id: 'arc::', browser: 'Arc', profile: '无权限读取', hasBiliLogin: false, blocked: true },
      { id: 'firefox::', browser: 'Firefox', profile: '无权限读取', hasBiliLogin: false, blocked: true }
    ])
  })

  it.skipIf(isRoot)('目录能列出但 Cookie 库读不了时也标记为 blocked', () => {
    const file = support('Google/Chrome/Default/Cookies')
    chromeDb(file, [sess()])
    lock(file)
    expect(bi.listBrowserProfiles()).toEqual([
      { id: 'chrome::Default', browser: 'Chrome', profile: 'Default', hasBiliLogin: false, blocked: true }
    ])
    expect(leftovers()).toEqual([])
  })

  it('Cookie 库损坏时照常列出，只是判为未登录', () => {
    mkdirSync(support('Google/Chrome/Default'), { recursive: true })
    writeFileSync(support('Google/Chrome/Default/Cookies'), 'not a database')
    expect(bi.listBrowserProfiles()).toEqual([{ id: 'chrome::Default', browser: 'Chrome', profile: 'Default', hasBiliLogin: false }])
    expect(leftovers()).toEqual([])
  })
})

describe('importFromBrowser', () => {
  it('Chromium：明文和密文混合，过滤非 B站域名，字段逐一映射', async () => {
    chromeDb(support('Google/Chrome/Default/Cookies'), [
      { host: '.bilibili.com', name: 'SESSDATA', enc: encV24('.bilibili.com', 'enc-sess'), secure: 1, httpOnly: 1, sameSite: 0, expires: FUTURE },
      { host: '.bilibili.com', name: 'bili_jct', value: 'plain-jct', secure: 0, httpOnly: 0, sameSite: 1, expires: 0 },
      { host: 'www.bilibili.com', name: 'buvid3', value: 'b', path: '/video', sameSite: 2 },
      { host: '.evilbilibili.com', name: 'SESSDATA', value: 'evil' },
      { host: '.example.com', name: 'other', value: 'x' }
    ])
    expect(await bi.importFromBrowser('chrome::Default')).toBe(IN)
    expect(m.execFile).toHaveBeenCalledWith(
      'security',
      ['find-generic-password', '-w', '-s', 'Chrome Safe Storage'],
      expect.objectContaining({ timeout: 120_000 }),
      expect.any(Function)
    )
    expect(lastImported()).toEqual([
      { domain: '.bilibili.com', name: 'SESSDATA', value: 'enc-sess', path: '/', secure: true, httpOnly: true, expires: FUTURE, sameSite: 'no_restriction' },
      { domain: '.bilibili.com', name: 'bili_jct', value: 'plain-jct', path: '/', secure: false, httpOnly: false, expires: undefined, sameSite: 'lax' },
      { domain: 'www.bilibili.com', name: 'buvid3', value: 'b', path: '/video', secure: true, httpOnly: false, expires: FUTURE, sameSite: 'strict' }
    ])
    expect(m.clearBiliCookies.mock.invocationCallOrder[0]).toBeLessThan(m.setBiliCookies.mock.invocationCallOrder[0])
    expect(leftovers()).toEqual([])
  })

  it('Chromium：meta 里没有版本号时按旧格式解密，未知 samesite 记为 unspecified', async () => {
    chromeDb(
      support('Microsoft Edge/Profile 1/Network/Cookies'),
      [{ host: '.bilibili.com', name: 'SESSDATA', enc: encrypt(Buffer.from('legacy'), PASSWORD), sameSite: -1 }],
      { version: null }
    )
    await bi.importFromBrowser('edge::Profile 1')
    expect(m.execFile.mock.calls[0][1]).toEqual(['find-generic-password', '-w', '-s', 'Microsoft Edge Safe Storage'])
    expect(lastImported()).toEqual([expect.objectContaining({ value: 'legacy', sameSite: 'unspecified' })])
  })

  it('钥匙串里没有这一项（错误码 44）', async () => {
    chromeDb(support('Google/Chrome/Default/Cookies'), [sess()])
    m.execFile.mockImplementation((_c: string, _a: string[], _o: unknown, cb: ExecCb) =>
      cb(Object.assign(new Error('not found'), { code: 44 }), '', '')
    )
    await expect(bi.importFromBrowser('chrome::Default')).rejects.toThrow('钥匙串里没有找到“Chrome Safe Storage”')
    expect(m.clearBiliCookies).not.toHaveBeenCalled()
  })

  it('钥匙串授权被拒绝或超时', async () => {
    chromeDb(support('Google/Chrome/Default/Cookies'), [sess()])
    m.execFile.mockImplementation((_c: string, _a: string[], _o: unknown, cb: ExecCb) =>
      cb(Object.assign(new Error('denied'), { code: 128 }), '', '')
    )
    await expect(bi.importFromBrowser('chrome::Default')).rejects.toThrow(
      '没有拿到钥匙串授权（Chrome Safe Storage），请在系统弹窗里点“允许”'
    )
  })

  it('Firefox：毫秒过期时间换算成秒，字段逐一映射', async () => {
    firefoxDb(support('Firefox/Profiles/abc.default/cookies.sqlite'), [
      { host: '.bilibili.com', name: 'SESSDATA', value: 's', expiry: FUTURE * 1000, secure: 1, httpOnly: 1, sameSite: 1 },
      { host: 'www.bilibili.com', name: 'buvid3', value: 'b', path: '/x', expiry: FUTURE, secure: 0, httpOnly: 0, sameSite: 2 },
      { host: '.bilibili.com', name: 'a', value: '1', expiry: FUTURE, sameSite: 0 },
      { host: '.bilibili.com', name: 'b', value: '2', expiry: FUTURE, sameSite: 256 },
      { host: '.example.com', name: 'SESSDATA', value: 'x', expiry: FUTURE }
    ])
    expect(await bi.importFromBrowser('firefox::abc.default')).toBe(IN)
    expect(m.execFile).not.toHaveBeenCalled()
    expect(lastImported()).toEqual([
      { domain: '.bilibili.com', name: 'SESSDATA', value: 's', path: '/', secure: true, httpOnly: true, expires: FUTURE, sameSite: 'lax' },
      { domain: 'www.bilibili.com', name: 'buvid3', value: 'b', path: '/x', secure: false, httpOnly: false, expires: FUTURE, sameSite: 'strict' },
      expect.objectContaining({ name: 'a', sameSite: 'no_restriction' }),
      expect.objectContaining({ name: 'b', sameSite: 'unspecified' })
    ])
    expect(leftovers()).toEqual([])
  })

  it('找不到配置档，或配置档没有读取权限', async () => {
    await expect(bi.importFromBrowser('chrome::Nope')).rejects.toThrow('找不到这个浏览器配置档，或没有读取权限')
    if (isRoot) return
    mkdirSync(support('Google/Chrome'), { recursive: true })
    lock(support('Google/Chrome'))
    await expect(bi.importFromBrowser('chrome::')).rejects.toThrow('找不到这个浏览器配置档，或没有读取权限')
  })

  it('里面没有 SESSDATA（或值为空）时报错，不动现有登录', async () => {
    chromeDb(support('Google/Chrome/Default/Cookies'), [
      { host: '.bilibili.com', name: 'SESSDATA', value: '', enc: new Uint8Array() },
      { host: '.bilibili.com', name: 'bili_jct', value: 'j' }
    ])
    writeFileSync(support('Google/Chrome/Local State'), JSON.stringify({ profile: { info_cache: { Default: { name: '个人' } } } }))
    await expect(bi.importFromBrowser('chrome::Default')).rejects.toThrow('Chrome（个人）里没有 B站登录信息')
    expect(m.clearBiliCookies).not.toHaveBeenCalled()
    expect(m.setBiliCookies).not.toHaveBeenCalled()
  })

  it('导入后仍未登录时提示登录信息已失效', async () => {
    firefoxDb(support('Firefox/Profiles/abc.default/cookies.sqlite'), [
      { host: '.bilibili.com', name: 'SESSDATA', value: 's', expiry: FUTURE }
    ])
    const old: PlainCookie[] = [{ domain: '.bilibili.com', name: 'SESSDATA', value: 'mine', path: '/', secure: true, httpOnly: true, sameSite: 'lax' }]
    m.snapshotCookies.mockResolvedValueOnce(old)
    m.checkAuth.mockResolvedValueOnce({ loggedIn: false, expired: true }).mockResolvedValueOnce(IN)
    await expect(bi.importFromBrowser('firefox::abc.default')).rejects.toThrow('导入的登录信息已失效')
    // 原来的登录写回去了（回归）
    expect(lastImported()).toBe(old)
    expect(m.checkAuth).toHaveBeenCalledTimes(2)
  })

  it('读库出错时临时副本目录也会被清理', async () => {
    mkdirSync(support('Firefox/Profiles/abc.default'), { recursive: true })
    writeFileSync(support('Firefox/Profiles/abc.default/cookies.sqlite'), 'not a database')
    await expect(bi.importFromBrowser('firefox::abc.default')).rejects.toThrow()
    expect(leftovers()).toEqual([])
  })
})
