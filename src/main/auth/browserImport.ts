import { execFile } from 'node:child_process'
import { createDecipheriv, pbkdf2Sync } from 'node:crypto'
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { AuthState, BrowserProfile } from '@shared/types'
import { replaceLogin } from './cookieImport'
import { unprotect } from './dpapi'
import { isBiliHost, type PlainCookie, type SameSite } from './session'

const IS_MAC = process.platform === 'darwin'
const IS_WINDOWS = process.platform === 'win32'

interface ChromiumBrowser {
  key: string
  name: string
  /** 数据文件夹 */
  root: string
  /** 加密 Cookie 的密码存在哪：macOS 是钥匙串里的条目名，Linux 是密钥环里 application 属性的值；Windows 不用（主密钥在 Local State 里） */
  secret: string
}

// 数据文件夹在模块加载时按 HOME 算好（测试里换了 HOME 要重新加载模块）
const SUPPORT = join(homedir(), 'Library/Application Support')
const CONFIG = join(homedir(), '.config')
const LOCAL = process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local')
const ROAMING = process.env.APPDATA || join(homedir(), 'AppData/Roaming')

const CHROMIUM: ChromiumBrowser[] = IS_MAC
  ? [
      { key: 'chrome', name: 'Chrome', root: join(SUPPORT, 'Google/Chrome'), secret: 'Chrome Safe Storage' },
      { key: 'edge', name: 'Edge', root: join(SUPPORT, 'Microsoft Edge'), secret: 'Microsoft Edge Safe Storage' },
      { key: 'brave', name: 'Brave', root: join(SUPPORT, 'BraveSoftware/Brave-Browser'), secret: 'Brave Safe Storage' },
      { key: 'arc', name: 'Arc', root: join(SUPPORT, 'Arc/User Data'), secret: 'Arc Safe Storage' },
      { key: 'vivaldi', name: 'Vivaldi', root: join(SUPPORT, 'Vivaldi'), secret: 'Vivaldi Safe Storage' },
      { key: 'chromium', name: 'Chromium', root: join(SUPPORT, 'Chromium'), secret: 'Chromium Safe Storage' }
    ]
  : IS_WINDOWS
    ? [
        { key: 'chrome', name: 'Chrome', root: join(LOCAL, 'Google/Chrome/User Data'), secret: '' },
        { key: 'edge', name: 'Edge', root: join(LOCAL, 'Microsoft/Edge/User Data'), secret: '' },
        { key: 'brave', name: 'Brave', root: join(LOCAL, 'BraveSoftware/Brave-Browser/User Data'), secret: '' },
        { key: 'vivaldi', name: 'Vivaldi', root: join(LOCAL, 'Vivaldi/User Data'), secret: '' },
        { key: 'chromium', name: 'Chromium', root: join(LOCAL, 'Chromium/User Data'), secret: '' }
      ]
    : // Edge 和 Vivaldi 在 Linux 上沿用 Chromium、Chrome 的密钥环条目
    [
      { key: 'chrome', name: 'Chrome', root: join(CONFIG, 'google-chrome'), secret: 'chrome' },
      { key: 'edge', name: 'Edge', root: join(CONFIG, 'microsoft-edge'), secret: 'chromium' },
      { key: 'brave', name: 'Brave', root: join(CONFIG, 'BraveSoftware/Brave-Browser'), secret: 'brave' },
      { key: 'vivaldi', name: 'Vivaldi', root: join(CONFIG, 'vivaldi'), secret: 'chrome' },
      { key: 'chromium', name: 'Chromium', root: join(CONFIG, 'chromium'), secret: 'chromium' },
      // Ubuntu 软件商店（snap）装的 Chromium
      { key: 'chromium-snap', name: 'Chromium', root: join(homedir(), 'snap/chromium/common/chromium'), secret: 'chromium' }
    ]

/** 放 Firefox 配置档的文件夹 */
const FIREFOX_ROOTS: string[] = IS_MAC
  ? [join(SUPPORT, 'Firefox/Profiles')]
  : IS_WINDOWS
    ? [join(ROAMING, 'Mozilla/Firefox/Profiles'), join(LOCAL, 'Mozilla/Firefox/Profiles')]
    : [
      join(homedir(), '.mozilla/firefox'),
      // 新版 Firefox 新建的配置档放在 XDG 目录里
      join(CONFIG, 'mozilla/firefox'),
      // Ubuntu 默认的 snap 版、flatpak 版
      join(homedir(), 'snap/firefox/common/.mozilla/firefox'),
      join(homedir(), '.var/app/org.mozilla.firefox/.mozilla/firefox')
    ]

// ---------- Chromium 解密（导出供单元测试） ----------

/** 加密密钥由密码经 PBKDF2 得到：macOS 迭代 1003 次，Linux 1 次 */
export function chromiumKey(password: string, iterations = IS_MAC ? 1003 : 1): Buffer {
  return pbkdf2Sync(password, 'saltysalt', iterations, 16, 'sha1')
}

/** v10、v11 两种前缀各自用的密钥。macOS 上两种都用钥匙串里的密码；Linux 上 v10 用固定密码 peanuts，v11 用密钥环里的密码 */
export type ChromiumKeys = Partial<Record<'v10' | 'v11', Buffer>>
const APP_BOUND_COOKIE_ERROR = '应用绑定加密 Cookie 无法导入，请使用应用内登录或手动粘贴 Cookie'

const encryptedPrefix = (enc: Uint8Array): 'v10' | 'v11' | undefined => {
  const prefix = Buffer.from(enc.subarray(0, 3)).toString('latin1')
  return prefix === 'v10' || prefix === 'v11' ? prefix : undefined
}

/** Chrome 127 起 Windows 上新写入的 Cookie 是 v20 应用绑定加密，只有浏览器自己解得开 */
const isAppBound = (enc: Uint8Array): boolean => Buffer.from(enc.subarray(0, 3)).toString('latin1') === 'v20'

/** 前缀 + AES-128-CBC（IV 为 16 个空格）；meta version ≥ 24 时明文前 32 字节是域名哈希 */
export function decryptChromiumValue(enc: Uint8Array, keys: ChromiumKeys, metaVersion: number): string {
  const buf = Buffer.from(enc)
  if (buf.length === 0) return ''
  const prefix = encryptedPrefix(buf)
  if (!prefix) return buf.toString('utf8')
  const key = keys[prefix]
  if (!key) throw new Error(`缺少解密 ${prefix} 的密钥`)
  const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, ' '))
  let out = Buffer.concat([decipher.update(buf.subarray(3)), decipher.final()])
  if (metaVersion >= 24) out = out.subarray(32)
  return out.toString('utf8')
}

/** Windows 的 v10：前缀 + 12 字节 nonce + AES-256-GCM 密文 + 16 字节认证标签，密钥是 Local State 里的主密钥；同样按 meta version 去掉域名哈希 */
export function decryptWindowsChromiumValue(enc: Uint8Array, key: Buffer, metaVersion: number): string {
  const buf = Buffer.from(enc)
  if (buf.length < 3 + 12 + 16) throw new Error('Chromium Cookie 加密数据不完整')
  const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(3, 15))
  decipher.setAuthTag(buf.subarray(-16))
  let plain = Buffer.concat([decipher.update(buf.subarray(15, -16)), decipher.final()])
  if (metaVersion >= 24) plain = plain.subarray(32)
  return plain.toString('utf8')
}

/** Chrome 时间：1601-01-01 起的微秒数 */
export function chromeTimeToUnix(us: bigint | number): number | undefined {
  const n = Number(us)
  if (!n) return undefined
  return Math.floor(n / 1e6 - 11644473600)
}

const CHROME_SAMESITE: Record<number, SameSite> = { 0: 'no_restriction', 1: 'lax', 2: 'strict' }
const FIREFOX_SAMESITE: Record<number, SameSite> = { 0: 'no_restriction', 1: 'lax', 2: 'strict' }

// ---------- SQLite 读取：先复制，避免和正在运行的浏览器抢锁 ----------

function withDbCopy<T>(file: string, fn: (db: DatabaseSync) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'bili-cookies-'))
  try {
    const copy = join(dir, 'db.sqlite')
    copyFileSync(file, copy)
    for (const suffix of ['-wal', '-journal']) {
      if (existsSync(file + suffix)) copyFileSync(file + suffix, copy + suffix)
    }
    const db = new DatabaseSync(copy)
    try {
      return fn(db)
    } finally {
      db.close()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ---------- 枚举浏览器配置档 ----------

interface Found {
  profile: BrowserProfile
  cookieFile: string
  browser: ChromiumBrowser | 'firefox'
}

const isPermissionError = (e: unknown): boolean => ['EPERM', 'EACCES'].includes((e as { code?: string }).code ?? '')
/** Windows 上 Chrome 系浏览器开着时独占 Cookie 数据库，连复制都会报 EBUSY */
const isLockedError = (e: unknown): boolean => (e as { code?: string }).code === 'EBUSY'

/** 浏览器目录存在但没有权限读取（macOS 的隐私保护拦截，或文件夹权限不允许）时，返回一条占位记录 */
function blockedEntry(key: string, browser: string): Found {
  return {
    browser: 'firefox',
    cookieFile: '',
    profile: { id: `${key}::`, browser, profile: '无权限读取', hasBiliLogin: false, blocked: true }
  }
}

function chromiumProfiles(b: ChromiumBrowser): Found[] {
  if (!existsSync(b.root)) return []
  try {
    return readChromiumProfiles(b, b.root)
  } catch (e) {
    if (isPermissionError(e)) return [blockedEntry(b.key, b.name)]
    throw e
  }
}

function readChromiumProfiles(b: ChromiumBrowser, root: string): Found[] {
  let names: Record<string, { name?: string }> = {}
  try {
    names = JSON.parse(readFileSync(join(root, 'Local State'), 'utf8')).profile?.info_cache ?? {}
  } catch {
    // 没有 Local State 就用目录名
  }
  const out: Found[] = []
  for (const dir of readdirSync(root)) {
    if (dir !== 'Default' && !dir.startsWith('Profile ')) continue
    const cookieFile = [join(root, dir, 'Cookies'), join(root, dir, 'Network/Cookies')].find(existsSync)
    if (!cookieFile) continue
    out.push({
      browser: b,
      cookieFile,
      profile: { id: `${b.key}::${dir}`, browser: b.name, profile: names[dir]?.name || dir, hasBiliLogin: false }
    })
  }
  return out
}

function firefoxProfiles(root: string): Found[] {
  if (!existsSync(root)) return []
  let dirs: string[]
  try {
    dirs = readdirSync(root)
  } catch (e) {
    if (isPermissionError(e)) return [blockedEntry('firefox', 'Firefox')]
    throw e
  }
  return dirs
    .filter((dir) => existsSync(join(root, dir, 'cookies.sqlite')))
    .map((dir) => ({
      browser: 'firefox' as const,
      cookieFile: join(root, dir, 'cookies.sqlite'),
      profile: {
        id: `firefox::${dir}`,
        browser: 'Firefox',
        profile: dir.slice(dir.indexOf('.') + 1) || dir,
        hasBiliLogin: false
      }
    }))
}

function findAll(): Found[] {
  return [...CHROMIUM.flatMap(chromiumProfiles), ...FIREFOX_ROOTS.flatMap(firefoxProfiles)]
}

function hasSessData(f: Found): boolean {
  const now = Date.now() / 1000
  return withDbCopy(f.cookieFile, (db) => {
    if (f.browser === 'firefox') {
      const rows = db.prepare(`SELECT host, expiry FROM moz_cookies WHERE name = 'SESSDATA'`).all()
      return rows.some((r) => isBiliHost(String(r.host)) && firefoxExpiry(Number(r.expiry))! > now)
    }
    const stmt = db.prepare(`SELECT host_key, expires_utc FROM cookies WHERE name = 'SESSDATA'`)
    stmt.setReadBigInts(true)
    return stmt.all().some((r) => {
      const exp = chromeTimeToUnix(r.expires_utc as bigint)
      return isBiliHost(String(r.host_key)) && (exp === undefined || exp > now)
    })
  })
}

export function listBrowserProfiles(): BrowserProfile[] {
  return findAll().map((f) => {
    if (f.profile.blocked) return f.profile
    try {
      return { ...f.profile, hasBiliLogin: hasSessData(f) }
    } catch (e) {
      // 目录能列出但 Cookies 文件被拦截，同样需要授权
      if (isPermissionError(e)) return { ...f.profile, blocked: true }
      return isLockedError(e) ? { ...f.profile, locked: true } : f.profile
    }
  })
}

// ---------- 读取并导入 ----------

function keychainPassword(service: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('security', ['find-generic-password', '-w', '-s', service], { timeout: 120_000 }, (err, stdout) => {
      if (err) {
        const code = (err as { code?: number }).code
        reject(
          new Error(
            code === 44
              ? `钥匙串里没有找到“${service}”`
              : `没有拿到钥匙串授权（${service}），请在系统弹窗里点“允许”`
          )
        )
      } else resolve(stdout.trim())
    })
  })
}

/** Linux：Chrome 系浏览器存在 GNOME 密钥环（libsecret）里的密码，用 secret-tool 读 */
function keyringPassword(application: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // 密钥环锁着时会弹出解锁窗口，留足时间
    execFile('secret-tool', ['lookup', 'application', application], { timeout: 120_000 }, (err, stdout) => {
      if ((err as { code?: unknown } | null)?.code === 'ENOENT') {
        reject(
          new Error(
            '读取 Chrome 系浏览器的登录信息需要 secret-tool，请先安装（Debian / Ubuntu：sudo apt install libsecret-tools），或改用应用内登录'
          )
        )
      } else if (err || !stdout.trim()) {
        reject(new Error(`系统密钥环里没有找到浏览器的密码（application=${application}），或密钥环没有解锁。也可以改用应用内登录`))
      } else resolve(stdout.trim())
    })
  })
}

/** 只取实际用到的密钥：Linux 上没有 v11 的 Cookie 就不去碰密钥环 */
async function chromiumKeys(b: ChromiumBrowser, needsV11: boolean): Promise<ChromiumKeys> {
  if (IS_MAC) {
    const key = chromiumKey(await keychainPassword(b.secret))
    return { v10: key, v11: key }
  }
  return {
    v10: chromiumKey('peanuts'),
    v11: needsV11 ? chromiumKey(await keyringPassword(b.secret)) : undefined
  }
}

/** Windows：Local State 里存着 DPAPI 保护的主密钥（前面带 DPAPI 五个字符） */
async function windowsMasterKey(b: ChromiumBrowser): Promise<Buffer> {
  let encryptedKey: string | undefined
  try {
    encryptedKey = JSON.parse(readFileSync(join(b.root, 'Local State'), 'utf8')).os_crypt?.encrypted_key
  } catch {
    throw new Error('无法读取 Windows 浏览器的加密密钥，请改用应用内登录或手动粘贴 Cookie')
  }
  if (!encryptedKey) throw new Error('Windows 浏览器没有可读取的 DPAPI 密钥，请改用应用内登录或手动粘贴 Cookie')
  const wrapped = Buffer.from(encryptedKey, 'base64')
  if (wrapped.subarray(0, 5).toString('ascii') !== 'DPAPI') {
    throw new Error('Windows 浏览器密钥格式不受支持，请改用应用内登录或手动粘贴 Cookie')
  }
  const [key] = await unprotect([wrapped.subarray(5)])
  return key
}

type CookieRow = Record<string, unknown>

const chromiumCookie = (r: CookieRow, value: string): PlainCookie => ({
  domain: String(r.host_key),
  name: String(r.name),
  value,
  path: String(r.path),
  secure: Number(r.is_secure) === 1,
  httpOnly: Number(r.is_httponly) === 1,
  expires: chromeTimeToUnix(r.expires_utc as bigint),
  sameSite: CHROME_SAMESITE[Number(r.samesite)] ?? 'unspecified'
})

async function readChromium(f: Found & { browser: ChromiumBrowser }): Promise<PlainCookie[]> {
  const { version, rows } = withDbCopy(f.cookieFile, (db) => {
    const meta = db.prepare(`SELECT value FROM meta WHERE key = 'version'`).get()
    const stmt = db.prepare(
      `SELECT host_key, name, value, encrypted_value, path, expires_utc, is_secure, is_httponly, samesite FROM cookies`
    )
    stmt.setReadBigInts(true)
    return { version: Number(meta?.value ?? 0), rows: stmt.all().filter((r) => isBiliHost(String(r.host_key))) }
  })
  if (IS_WINDOWS) return windowsCookies(f.browser, rows, version)
  const needsV11 = rows.some((r) => !r.value && encryptedPrefix(r.encrypted_value as Uint8Array) === 'v11')
  const keys = await chromiumKeys(f.browser, needsV11)
  return rows.map((r) =>
    chromiumCookie(r, r.value ? String(r.value) : decryptChromiumValue(r.encrypted_value as Uint8Array, keys, version))
  )
}

/**
 * Windows 上 Cookie 有三种加密：v10 用主密钥做 AES-256-GCM；更早的 Chromium 没有前缀，每条直接用 DPAPI；v20 是应用绑定加密。
 * v20 的跳过（缺了 buvid3 之类的会自动补上），只有 SESSDATA 也是 v20 时才报错
 */
async function windowsCookies(b: ChromiumBrowser, rows: CookieRow[], version: number): Promise<PlainCookie[]> {
  const sealed = rows.filter((r) => !r.value && (r.encrypted_value as Uint8Array).length)
  const bound = sealed.filter((r) => isAppBound(r.encrypted_value as Uint8Array))
  if (bound.some((r) => r.name === 'SESSDATA')) throw new Error(APP_BOUND_COOKIE_ERROR)
  const aes = sealed.filter((r) => encryptedPrefix(r.encrypted_value as Uint8Array))
  const legacy = sealed.filter((r) => !bound.includes(r) && !aes.includes(r))
  const key = aes.length ? await windowsMasterKey(b) : undefined
  const legacyPlain = legacy.length ? await unprotect(legacy.map((r) => Buffer.from(r.encrypted_value as Uint8Array))) : []
  const values = new Map<CookieRow, string>([
    ...aes.map((r) => [r, decryptWindowsChromiumValue(r.encrypted_value as Uint8Array, key!, version)] as const),
    ...legacy.map((r, i) => [r, legacyPlain[i].toString('utf8')] as const)
  ])
  return rows.filter((r) => !bound.includes(r)).map((r) => chromiumCookie(r, values.get(r) ?? String(r.value ?? '')))
}

/** 新版 Firefox 的 expiry 是毫秒 */
function firefoxExpiry(n: number): number | undefined {
  if (!n) return undefined
  return n > 1e11 ? Math.floor(n / 1000) : n
}

function readFirefox(f: Found): PlainCookie[] {
  return withDbCopy(f.cookieFile, (db) =>
    db
      .prepare(`SELECT host, name, value, path, expiry, isSecure, isHttpOnly, sameSite FROM moz_cookies`)
      .all()
      .filter((r) => isBiliHost(String(r.host)))
      .map((r) => ({
        domain: String(r.host),
        name: String(r.name),
        value: String(r.value),
        path: String(r.path),
        secure: Number(r.isSecure) === 1,
        httpOnly: Number(r.isHttpOnly) === 1,
        expires: firefoxExpiry(Number(r.expiry)),
        sameSite: FIREFOX_SAMESITE[Number(r.sameSite)] ?? 'unspecified'
      }))
  )
}

const lockedMessage = (browser: string): string =>
  `${browser} 正在运行，读不到它的登录信息。请完全退出 ${browser}（包括后台运行的）后再导入，或改用应用内登录`

export async function importFromBrowser(id: string): Promise<AuthState> {
  const f = findAll().find((x) => x.profile.id === id)
  if (!f || f.profile.blocked) throw new Error('找不到这个浏览器配置档，或没有读取权限')
  let cookies: PlainCookie[]
  try {
    cookies = f.browser === 'firefox' ? readFirefox(f) : await readChromium(f as Found & { browser: ChromiumBrowser })
  } catch (e) {
    if (isLockedError(e)) throw new Error(lockedMessage(f.profile.browser))
    throw e
  }
  if (!cookies.some((c) => c.name === 'SESSDATA' && c.value)) {
    throw new Error(`${f.profile.browser}（${f.profile.profile}）里没有 B站登录信息`)
  }
  return replaceLogin(cookies, '导入的登录信息已失效，请先在浏览器里重新登录 B站，或改用应用内登录')
}
