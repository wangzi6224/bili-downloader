// 抖音功能里把账号、验证状态、解析记录串起来的部分。依赖全部注入，Electron 相关的装配在 setup.ts
import { t } from '@shared/i18n'
import type { BrowserProfile, DyAccountsSnapshot, DyAccountState, ParseRecord, ParseResult } from '@shared/types'
import { ImportError } from '../auth/importError'
import type { PlainCookie } from '../auth/session'
import type { DownloadManager } from '../download/manager'
import type { DyAccounts } from './accounts'
import type { DouyinApi } from './api'
import { parseDyCookieText } from './cookies'
import { DyLoginError } from './errors'
import type { DyGateSnapshot, DouyinGate } from './gate'
import type { DouyinService } from './service'
import type { DouyinTransport } from './transport/types'

export interface DyControllerDeps {
  api: Pick<DouyinApi, 'self' | 'verify'>
  gate: Pick<DouyinGate, 'reset' | 'expire'>
  transport: Pick<DouyinTransport, 'dispose'>
  accounts: DyAccounts
  service: Pick<DouyinService, 'parse'>
  queue: Pick<DownloadManager, 'siteLoginChanged' | 'siteAccountRemoved' | 'siteVerified' | 'schedule'>
  /** 打开扫码窗口，拿到登录返回 true */
  openLogin: (partition: string) => Promise<boolean>
  writeCookies: (partition: string, cookies: PlainCookie[]) => Promise<void>
  listBrowsers: (browserKey?: string) => BrowserProfile[]
  readBrowser: (profile: string) => Promise<PlainCookie[]>
  record: (entry: ParseRecord) => void
  /** 账号状态变了 */
  onStatus: (status: DyAccountState[]) => void
  /** 要用户做一件事（验证）：发系统通知 */
  onNeedsUser: () => void
}

export class DouyinController {
  private states = new Map<string, DyAccountState>()
  private verifying = new Map<string, Promise<DyAccountState[]>>()
  private loggingIn?: Promise<DyAccountsSnapshot>

  constructor(private deps: DyControllerDeps) {
    const { accounts, transport, gate, queue } = deps
    accounts.on('login', (id: string) => {
      transport.dispose(id)
      gate.reset(id)
      queue.siteLoginChanged('douyin', id)
    })
    accounts.on('removed', (id: string) => {
      transport.dispose(id)
      gate.reset(id)
      this.states.delete(id)
      queue.siteAccountRemoved('douyin', id)
      deps.onStatus(this.status())
    })
  }

  status(): DyAccountState[] {
    return [...this.states.values()]
  }

  /** 限速状态机的状态变化（含冷却结束） */
  gateChanged(account: string | null, snapshot: DyGateSnapshot): void {
    const key = account ?? ''
    const before = this.states.get(key)?.state
    if (snapshot.state === 'ok') this.states.delete(key)
    else this.states.set(key, { account, state: snapshot.state, ...(snapshot.until ? { until: snapshot.until } : {}) })
    if (snapshot.state === 'expired' && account !== null) this.deps.accounts.markExpired(account)
    if (snapshot.state === 'verify' && before !== 'verify') this.deps.onNeedsUser()
    this.deps.onStatus(this.status())
    // 冷却结束、恢复正常：让排队的任务接着跑
    this.deps.queue.schedule()
  }

  /** 亮出窗口让用户完成验证；同一个账号同时只开一个 */
  verify(account: string | null): Promise<DyAccountState[]> {
    const key = account ?? ''
    const running = this.verifying.get(key)
    if (running) return running
    const run = this.deps.api
      .verify(account)
      .then(() => {
        this.deps.queue.siteVerified('douyin', account)
        return this.status()
      })
      .finally(() => this.verifying.delete(key))
    this.verifying.set(key, run)
    return run
  }

  /** 新分区里的登录确认身份后记成账号；失败时清掉分区 */
  private async adopt(id: string): Promise<DyAccountsSnapshot> {
    try {
      const user = await this.deps.api.self({ account: id })
      return await this.deps.accounts.commit(id, user)
    } catch (e) {
      await this.deps.accounts.discard(id)
      throw e
    } finally {
      // 确认身份时开的网页用完就关；这个临时 id 的状态一起丢掉
      this.deps.transport.dispose(id)
      this.deps.gate.reset(id)
    }
  }

  /** 扫码登录；界面和 AI 助手同时发起时共用一个窗口和结果 */
  login(): Promise<DyAccountsSnapshot> {
    this.loggingIn ??= this.runLogin().finally(() => (this.loggingIn = undefined))
    return this.loggingIn
  }

  private async runLogin(): Promise<DyAccountsSnapshot> {
    const { id, partition } = this.deps.accounts.prepare()
    let ok = false
    try {
      ok = await this.deps.openLogin(partition)
    } finally {
      if (!ok) await this.deps.accounts.discard(id)
    }
    return ok ? this.adopt(id) : this.deps.accounts.snapshot()
  }

  private async importCookies(cookies: PlainCookie[]): Promise<DyAccountsSnapshot> {
    if (!cookies.some((c) => c.name === 'sessionid' && c.value)) throw new Error(t('dy.errNoLoginCookie'))
    const { id, partition } = this.deps.accounts.prepare()
    try {
      await this.deps.writeCookies(partition, cookies)
    } catch (e) {
      await this.deps.accounts.discard(id)
      throw e
    }
    return this.adopt(id)
  }

  listBrowsers(browserKey?: string): BrowserProfile[] {
    return this.deps.listBrowsers(browserKey)
  }

  async importBrowser(profile: string): Promise<DyAccountsSnapshot> {
    let cookies: PlainCookie[]
    try {
      cookies = await this.deps.readBrowser(profile)
    } catch (e) {
      if (e instanceof ImportError && e.code === 'no_login') throw new Error(t('dy.errNoLoginInBrowser'))
      throw e
    }
    return this.importCookies(cookies)
  }

  importCookie(text: string): Promise<DyAccountsSnapshot> {
    return this.importCookies(parseDyCookieText(text))
  }

  /** 查一下账号还能不能用 */
  async check(id: string): Promise<DyAccountsSnapshot> {
    const { accounts, gate, api, transport } = this.deps
    // 之前标记失效的账号要先放行，才发得出这次查询
    gate.reset(id)
    transport.dispose(id)
    try {
      return accounts.update(id, await api.self({ account: id }))
    } catch (e) {
      if (!(e instanceof DyLoginError)) throw e
      gate.expire(id)
      return accounts.snapshot()
    }
  }

  /** 解析并记进解析记录（界面和 MCP 共用） */
  async parseAndRecord(input: string, o: { account?: string | null; signal?: AbortSignal } = {}): Promise<ParseResult> {
    const text = input.trim()
    const parsed = await this.deps.service.parse(text, o)
    if (!parsed) throw new Error(t('dy.badLink'))
    this.deps.record({
      input: text,
      title: parsed.title,
      kind: 'douyin',
      cover: parsed.cover,
      count: parsed.groups.reduce((n, g) => n + g.items.length, 0),
      at: Date.now()
    })
    return { ...parsed, input: text }
  }
}
