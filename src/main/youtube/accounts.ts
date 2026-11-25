// YouTube 账号：导入的 cookie 用系统的安全存储（macOS 钥匙串、Windows DPAPI、Linux 密钥环）加密后存在本机。
// 运行 yt-dlp 时解密成一份临时 cookies.txt，结束后把它写回的新 cookie 收回来，再删掉临时文件
import { createHash, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { t } from '@shared/i18n'
import type { YtAccount, YtAccountsSnapshot } from '@shared/types'
import type { PlainCookie } from '../auth/session'
import { readJson, writeJson } from '../store'
import { cookieHeader, mergeCookies, parseNetscape, toNetscape, YT_LOGIN_COOKIE } from './cookies'
import type { CookieFile } from './service'

export interface Vault {
  encrypt: (text: string) => Buffer
  decrypt: (data: Buffer) => string
}

export interface YtAccountsDeps {
  vault: Vault
  fetch?: typeof fetch
  now?: () => number
}

export interface YtIdentity {
  name: string
  handle?: string
  avatar?: string
}

/** 网页版的客户端版本：账号菜单接口要带，旧一点的版本 YouTube 也接受 */
const WEB_VERSION = '2.20251120.01.00'
const ORIGIN = 'https://www.youtube.com'

/** YouTube 网页版接口的鉴权头：SAPISIDHASH 时间戳_sha1(时间戳 SAPISID 来源) */
export function sapisidHash(sapisid: string, nowSec: number, origin = ORIGIN): string {
  const hash = createHash('sha1').update(`${nowSec} ${sapisid} ${origin}`).digest('hex')
  return `SAPISIDHASH ${nowSec}_${hash}`
}

interface MenuResponse {
  actions?: {
    openPopupAction?: {
      popup?: {
        multiPageMenuRenderer?: {
          header?: {
            activeAccountHeaderRenderer?: {
              accountName?: { simpleText?: string }
              channelHandle?: { simpleText?: string }
              accountPhoto?: { thumbnails?: { url: string }[] }
            }
          }
        }
      }
    }
  }[]
}

/** 用 cookie 问 YouTube 当前登录的是谁；cookie 失效时返回空 */
export async function whoAmI(cookies: PlainCookie[], f: typeof fetch = fetch, nowSec = Math.floor(Date.now() / 1000)): Promise<YtIdentity | undefined> {
  const sapisid = cookies.find((c) => c.name === YT_LOGIN_COOKIE || c.name === '__Secure-3PAPISID')?.value
  if (!sapisid) return undefined
  const res = await f(`${ORIGIN}/youtubei/v1/account/account_menu?prettyPrint=false`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: sapisidHash(sapisid, nowSec),
      Cookie: cookieHeader(cookies),
      Origin: ORIGIN,
      'X-Origin': ORIGIN,
      'X-Youtube-Client-Name': '1',
      'X-Youtube-Client-Version': WEB_VERSION
    },
    body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: WEB_VERSION, hl: 'en' } } })
  })
  if (res.status === 401 || res.status === 403) return undefined
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as MenuResponse
  const header = data.actions?.[0]?.openPopupAction?.popup?.multiPageMenuRenderer?.header?.activeAccountHeaderRenderer
  const name = header?.accountName?.simpleText
  if (!name) return undefined
  return { name, handle: header.channelHandle?.simpleText, avatar: header.accountPhoto?.thumbnails?.at(-1)?.url }
}

interface Store {
  current?: string
  accounts: YtAccount[]
}

/**
 * 事件：
 * - changed(snapshot)：账号列表或当前账号变了
 * - login(accountId)：导入了新的登录（等待登录的任务可以重新排队）
 */
export class YtAccounts extends EventEmitter {
  private store: Store

  constructor(
    private readonly dir: string,
    private readonly deps: YtAccountsDeps
  ) {
    super()
    const saved = readJson<Store>(this.file)
    this.store = { current: saved?.current, accounts: Array.isArray(saved?.accounts) ? saved.accounts : [] }
    if (this.store.current && !this.store.accounts.some((a) => a.id === this.store.current)) this.store.current = undefined
  }

  private get file(): string {
    return join(this.dir, 'accounts.json')
  }

  private cookiePath(id: string): string {
    return join(this.dir, `${id}.cookies`)
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  snapshot(): YtAccountsSnapshot {
    return { current: this.store.current, accounts: this.store.accounts.map((a) => ({ ...a })) }
  }

  current(): string | undefined {
    return this.store.current
  }

  private save(): void {
    mkdirSync(this.dir, { recursive: true })
    writeJson(this.file, this.store)
    this.emit('changed', this.snapshot())
  }

  readCookies(id: string): PlainCookie[] {
    try {
      return JSON.parse(this.deps.vault.decrypt(readFileSync(this.cookiePath(id)))) as PlainCookie[]
    } catch {
      return []
    }
  }

  private writeCookies(id: string, cookies: PlainCookie[]): void {
    mkdirSync(this.dir, { recursive: true })
    const path = this.cookiePath(id)
    writeFileSync(path, this.deps.vault.encrypt(JSON.stringify(cookies)))
    try {
      chmodSync(path, 0o600)
    } catch {
      // Windows 上没有这套权限
    }
  }

  /** 导入一份登录：确认有效后，同一个人的更新原账号，否则新加一个，并设为当前账号 */
  async add(cookies: PlainCookie[]): Promise<YtAccount> {
    if (!cookies.some((c) => c.name === YT_LOGIN_COOKIE && c.value)) throw new Error(t('ytLogin.noLoginCookie'))
    const who = await whoAmI(cookies, this.deps.fetch).catch((e: unknown) => {
      throw new Error(t('ytLogin.verifyFailed', { reason: e instanceof Error ? e.message : String(e) }))
    })
    if (!who) throw new Error(t('ytLogin.expired'))
    const same = this.store.accounts.find((a) => (who.handle && a.handle === who.handle) || (!who.handle && a.name === who.name))
    const account: YtAccount = {
      id: same?.id ?? randomUUID(),
      name: who.name,
      handle: who.handle,
      avatar: who.avatar,
      addedAt: same?.addedAt ?? this.now(),
      checkedAt: this.now(),
      status: 'ready'
    }
    this.writeCookies(account.id, cookies)
    this.store.accounts = same ? this.store.accounts.map((a) => (a.id === same.id ? account : a)) : [...this.store.accounts, account]
    this.store.current = account.id
    this.save()
    this.emit('login', account.id)
    return account
  }

  select(id: string | undefined): void {
    if (id !== undefined && !this.store.accounts.some((a) => a.id === id)) throw new Error(t('ytLogin.accountNotFound'))
    this.store.current = id
    this.save()
    this.emit('login', id)
  }

  remove(id: string): void {
    if (!this.store.accounts.some((a) => a.id === id)) throw new Error(t('ytLogin.accountNotFound'))
    rmSync(this.cookiePath(id), { force: true })
    this.store.accounts = this.store.accounts.filter((a) => a.id !== id)
    if (this.store.current === id) this.store.current = this.store.accounts[0]?.id
    this.save()
    this.emit('removed', id)
  }

  /** 重新确认登录是否还有效 */
  async check(id: string): Promise<YtAccount> {
    const account = this.store.accounts.find((a) => a.id === id)
    if (!account) throw new Error(t('ytLogin.accountNotFound'))
    const who = await whoAmI(this.readCookies(id), this.deps.fetch)
    const next: YtAccount = who
      ? { ...account, name: who.name, handle: who.handle ?? account.handle, avatar: who.avatar ?? account.avatar, status: 'ready', checkedAt: this.now() }
      : { ...account, status: 'expired', checkedAt: this.now() }
    this.store.accounts = this.store.accounts.map((a) => (a.id === id ? next : a))
    this.save()
    return next
  }

  /** 给一次 yt-dlp 运行用的 cookies.txt；每次一份，几个进程同时写回时不会互相覆盖 */
  async cookieFile(id: string | undefined, tmpDir: string): Promise<CookieFile | undefined> {
    if (!id) return undefined
    const cookies = this.readCookies(id)
    if (!cookies.length) return undefined
    mkdirSync(tmpDir, { recursive: true })
    const file = join(tmpDir, `${randomUUID()}.txt`)
    writeFileSync(file, toNetscape(cookies), { mode: 0o600 })
    return {
      file,
      done: async () => {
        try {
          const fresh = parseNetscape(readFileSync(file, 'utf8'))
          if (fresh.length && this.store.accounts.some((a) => a.id === id)) {
            this.writeCookies(id, mergeCookies(this.readCookies(id), fresh, Math.floor(this.now() / 1000)))
          }
        } catch {
          // 读不到写回的内容就算了，原来的 cookie 还在
        } finally {
          rmSync(file, { force: true })
        }
      }
    }
  }

  /** yt-dlp 说要登录：当前账号的 cookie 多半失效了，标出来让用户重新导入 */
  markExpired(id: string): void {
    const account = this.store.accounts.find((a) => a.id === id)
    if (!account || account.status === 'expired') return
    this.store.accounts = this.store.accounts.map((a) => (a.id === id ? { ...a, status: 'expired', checkedAt: this.now() } : a))
    this.save()
  }
}
