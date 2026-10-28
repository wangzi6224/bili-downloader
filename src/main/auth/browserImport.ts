import { execFile } from 'node:child_process'
import { createDecipheriv, pbkdf2Sync } from 'node:crypto'
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { AuthState, BrowserProfile } from '@shared/types'
import { replaceLogin } from './cookieImport'
import { isBiliHost, type PlainCookie, type SameSite } from './session'

const SUPPORT = join(homedir(), 'Library/Application Support')

interface ChromiumBrowser {
  key: string
  name: string
  root: string
  keychain: string
}

const CHROMIUM: ChromiumBrowser[] = [
  { key: 'chrome', name: 'Chrome', root: 'Google/Chrome', keychain: 'Chrome Safe Storage' },
  { key: 'edge', name: 'Edge', root: 'Microsoft Edge', keychain: 'Microsoft Edge Safe Storage' },
  { key: 'brave', name: 'Brave', root: 'BraveSoftware/Brave-Browser', keychain: 'Brave Safe Storage' },
  { key: 'arc', name: 'Arc', root: 'Arc/User Data', keychain: 'Arc Safe Storage' },
  { key: 'vivaldi', name: 'Vivaldi', root: 'Vivaldi', keychain: 'Vivaldi Safe Storage' },
  { key: 'chromium', name: 'Chromium', root: 'Chromium', keychain: 'Chromium Safe Storage' }
]

const FIREFOX_PROFILES = join(SUPPORT, 'Firefox/Profiles')

// ---------- Chromium 解密（导出供单元测试） ----------

export function chromiumKey(password: string): Buffer {
  return pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1')
}

/** v10 前缀 + AES-128-CBC（IV 为 16 个空格）；meta version ≥ 24 时明文前 32 字节是域名哈希 */
export function decryptChromiumValue(enc: Uint8Array, key: Buffer, metaVersion: number): string {
  const buf = Buffer.from(enc)
  if (buf.length === 0) return ''
  const prefix = buf.subarray(0, 3).toString('latin1')
  if (prefix !== 'v10' && prefix !== 'v11') return buf.toString('utf8')
  const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, ' '))
  let out = Buffer.concat([decipher.update(buf.subarray(3)), decipher.final()])
  if (metaVersion >= 24) out = out.subarray(32)
  return out.toString('utf8')
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

/** 浏览器目录存在但被 macOS 隐私保护拦截时，返回一条占位记录 */
function blockedEntry(key: string, browser: string): Found {
  return {
    browser: 'firefox',
    cookieFile: '',
    profile: { id: `${key}::`, browser, profile: '无权限读取', hasBiliLogin: false, blocked: true }
  }
}

function chromiumProfiles(b: ChromiumBrowser): Found[] {
  const root = join(SUPPORT, b.root)
  if (!existsSync(root)) return []
  try {
    return readChromiumProfiles(b, root)
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

function firefoxProfiles(): Found[] {
  if (!existsSync(FIREFOX_PROFILES)) return []
  let dirs: string[]
  try {
    dirs = readdirSync(FIREFOX_PROFILES)
  } catch (e) {
    if (isPermissionError(e)) return [blockedEntry('firefox', 'Firefox')]
    throw e
  }
  return dirs
    .filter((dir) => existsSync(join(FIREFOX_PROFILES, dir, 'cookies.sqlite')))
    .map((dir) => ({
      browser: 'firefox' as const,
      cookieFile: join(FIREFOX_PROFILES, dir, 'cookies.sqlite'),
      profile: {
        id: `firefox::${dir}`,
        browser: 'Firefox',
        profile: dir.slice(dir.indexOf('.') + 1) || dir,
        hasBiliLogin: false
      }
    }))
}

function findAll(): Found[] {
  return [...CHROMIUM.flatMap(chromiumProfiles), ...firefoxProfiles()]
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
      return isPermissionError(e) ? { ...f.profile, blocked: true } : f.profile
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

async function readChromium(f: Found & { browser: ChromiumBrowser }): Promise<PlainCookie[]> {
  const key = chromiumKey(await keychainPassword(f.browser.keychain))
  return withDbCopy(f.cookieFile, (db) => {
    const meta = db.prepare(`SELECT value FROM meta WHERE key = 'version'`).get()
    const version = Number(meta?.value ?? 0)
    const stmt = db.prepare(
      `SELECT host_key, name, value, encrypted_value, path, expires_utc, is_secure, is_httponly, samesite FROM cookies`
    )
    stmt.setReadBigInts(true)
    const out: PlainCookie[] = []
    for (const r of stmt.all()) {
      const host = String(r.host_key)
      if (!isBiliHost(host)) continue
      const value = r.value ? String(r.value) : decryptChromiumValue(r.encrypted_value as Uint8Array, key, version)
      out.push({
        domain: host,
        name: String(r.name),
        value,
        path: String(r.path),
        secure: Number(r.is_secure) === 1,
        httpOnly: Number(r.is_httponly) === 1,
        expires: chromeTimeToUnix(r.expires_utc as bigint),
        sameSite: CHROME_SAMESITE[Number(r.samesite)] ?? 'unspecified'
      })
    }
    return out
  })
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

export async function importFromBrowser(id: string): Promise<AuthState> {
  const f = findAll().find((x) => x.profile.id === id)
  if (!f || f.profile.blocked) throw new Error('找不到这个浏览器配置档，或没有读取权限')
  const cookies =
    f.browser === 'firefox' ? readFirefox(f) : await readChromium(f as Found & { browser: ChromiumBrowser })
  if (!cookies.some((c) => c.name === 'SESSDATA' && c.value)) {
    throw new Error(`${f.profile.browser}（${f.profile.profile}）里没有 B站登录信息`)
  }
  return replaceLogin(cookies, '导入的登录信息已失效，请先在浏览器里重新登录 B站，或改用应用内登录')
}
