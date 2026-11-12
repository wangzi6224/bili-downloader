import { randomUUID } from 'node:crypto'
import { t } from '@shared/i18n'
import type { AccountState, AuthState, BiliAccount, LoginTarget, UserInfo } from '@shared/types'
import { AuthExpiredError, forgetBuvid } from '../bili/http'
import { configureLoginSession } from '../net/network'
import { readJson, writeJson } from '../store'
import { send } from '../windows'
import {
  activeAuthState, authStateFor, checkAuthThrottled, forgetSessionAuth, onSessionAuthChanged, publishActiveAuth
} from './authGuard'
import { activeScope, GUEST_PARTITION, inAuthScope, isRetired, PARTITION, retirePartition, setActiveScope } from './scope'
import { biliSession } from './session'
import { LoginRevokedError } from './importError'

export type LoginGuard = (mid: number) => void

interface AccountRecord {
  user: UserInfo
  partition?: string
  lastUsed: number
}

interface AccountFile {
  activeMid?: number
  legacyMid?: number
  profiles: AccountRecord[]
}

class Accounts {
  private file?: string
  private data: AccountFile = { profiles: [] }
  private loginPending = false
  private logoutRevision = 0
  private lastLogout = new Map<number, number>()
  private removals = new Map<number, Promise<void>>()
  private selectionRevision = 0
  private statuses = new Map<number, BiliAccount['status']>()
  private onStatus: (mid: number, status: BiliAccount['status']) => void = () => {}
  private legacy?: { count: () => number; assign: (mid: number) => void }

  init(file: string): void {
    this.file = file
    const saved = readJson<AccountFile>(file)
    if (saved && Array.isArray(saved.profiles)) {
      this.data = saved
      this.setActive(saved.activeMid)
    }
    onSessionAuthChanged((partition, state) => this.update(partition, state))
  }

  connect(
    onStatus: (mid: number, status: BiliAccount['status']) => void,
    legacy: { count: () => number; assign: (mid: number) => void }
  ): void {
    this.onStatus = onStatus
    this.legacy = legacy
    if (this.data.legacyMid !== undefined) legacy.assign(this.data.legacyMid)
  }

  snapshot(): AccountState {
    return {
      activeMid: this.data.activeMid,
      accounts: [...this.data.profiles]
        .sort((a, b) => b.lastUsed - a.lastUsed)
        .map(({ user }) => ({ ...user, status: this.status(user.mid) })),
      legacyCount: this.legacy?.count() ?? 0
    }
  }

  status(mid: number): BiliAccount['status'] {
    const partition = this.record(mid)?.partition
    if (!partition) return 'removed'
    if (isRetired(partition)) return 'expired'
    const state = authStateFor(partition)
    return state?.loggedIn ? 'ready' : state ? 'expired' : 'unchecked'
  }

  partition(mid: number): string | undefined {
    return this.record(mid)?.partition
  }

  auth(mid: number): AuthState {
    const partition = this.partition(mid)
    if (!partition || isRetired(partition)) return { loggedIn: false, expired: true }
    return authStateFor(partition) ?? { loggedIn: false }
  }

  midForPartition(partition: string): number | undefined {
    return this.data.profiles.find((p) => p.partition === partition)?.user.mid
  }

  async run<T>(mid: number | undefined, fn: () => Promise<T>, background = true): Promise<T> {
    const partition = mid === undefined ? undefined : this.partition(mid)
    if (!partition || isRetired(partition)) throw new AuthExpiredError()
    return inAuthScope({ partition, mid, background }, async () => {
      if (!(await checkAuthThrottled(60_000)).loggedIn || isRetired(partition)) throw new AuthExpiredError()
      const result = await fn()
      if (isRetired(partition)) throw new AuthExpiredError()
      return result
    })
  }

  async select(mid: number): Promise<AccountState> {
    const revision = ++this.selectionRevision
    await this.run(mid, async () => {})
    if (revision === this.selectionRevision) this.activate(mid)
    return this.snapshot()
  }

  /** 在整个登录流程开始时获取，换浏览器或登录方式时继续使用同一份。 */
  loginGuard(): LoginGuard {
    const revision = this.logoutRevision
    return (mid) => {
      if ((this.lastLogout.get(mid) ?? 0) > revision || this.removals.has(mid)) {
        throw new LoginRevokedError(t('accounts.loginRevoked'))
      }
    }
  }

  /** 登录在新分区里完成。只有服务端确认身份后才把会话交给下载和订阅。 */
  async login(
    attempt: () => Promise<AuthState>, target: LoginTarget = { mode: 'add' }, guard = this.loginGuard()
  ): Promise<AuthState> {
    if (target.mode === 'reauth') guard(target.mid)
    if (this.loginPending) throw new Error(t('accounts.loginBusy'))
    this.loginPending = true
    const partition = `persist:bilibili-${randomUUID()}`
    let saved = false
    try {
      const state = await inAuthScope({ partition, background: true }, async () => {
        await configureLoginSession()
        const result = await attempt()
        if (result.loggedIn) await biliSession().cookies.flushStore()
        return result
      })
      if (!state.loggedIn) return state
      const { mid } = state.user
      if (target.mode === 'reauth' && mid !== target.mid) {
        const name = this.record(target.mid)?.user.uname ?? String(target.mid)
        throw new Error(t('accounts.wrongAccount', { name }))
      }
      guard(mid)
      const previous = this.record(mid)
      const activate = this.data.activeMid === mid || (target.mode === 'add'
        ? target.activate !== false || this.data.activeMid === undefined
        : target.activate)
      const profile = { user: state.user, partition, lastUsed: activate ? this.nextLastUsed() : previous?.lastUsed ?? 0 }
      const activeMid = activate ? mid : this.data.activeMid
      this.save({
        ...this.data, activeMid, profiles: [...this.data.profiles.filter((p) => p.user.mid !== mid), profile]
      })
      saved = true
      if (activate) {
        this.selectionRevision++
        this.setActive(mid)
        publishActiveAuth()
      }
      this.publish()
      this.notifyStatus(mid)
      if (previous?.partition) await this.clear(previous.partition).catch((e) => console.warn('清理旧登录会话失败', e))
      return state
    } finally {
      this.loginPending = false
      if (!saved) await this.clear(partition).catch((e) => console.warn('清理未保存的登录会话失败', e))
    }
  }

  async remove(mid: number): Promise<void> {
    const record = this.record(mid)
    if (!record) return
    this.lastLogout.set(mid, ++this.logoutRevision)
    const pending = this.removals.get(mid)
    if (pending) return pending
    if (!record.partition) return
    const removal = this.removeSession(mid, record.partition).finally(() => this.removals.delete(mid))
    this.removals.set(mid, removal)
    await removal
  }

  private async removeSession(mid: number, partition: string): Promise<void> {
    const wasActive = this.data.activeMid === mid
    const revision = ++this.selectionRevision
    try {
      await this.clear(partition)
    } catch (e) {
      if (this.partition(mid) === partition) {
        if (this.data.activeMid === mid) publishActiveAuth()
        this.publish()
        this.notifyStatus(mid)
      }
      throw e
    }
    const active = this.data.activeMid === mid
    this.save({
      ...this.data,
      activeMid: active ? undefined : this.data.activeMid,
      profiles: this.data.profiles.map((p) => p.partition === partition ? { ...p, partition: undefined } : p)
    })
    if (active) {
      this.setActive(undefined)
      publishActiveAuth()
    }
    this.publish()
    this.notifyStatus(mid)
    if (!wasActive || !active || revision !== this.selectionRevision) return
    for (const candidate of this.snapshot().accounts) {
      if (candidate.status !== 'ready' && candidate.status !== 'unchecked') continue
      try {
        await this.run(candidate.mid, async () => {})
        if (revision === this.selectionRevision) this.activate(candidate.mid)
        return
      } catch {
        if (revision !== this.selectionRevision) return
      }
    }
  }

  async logout(): Promise<AuthState> {
    if (this.data.activeMid !== undefined) await this.remove(this.data.activeMid)
    return activeAuthState()
  }

  assignLegacy(mid: number): void {
    if (this.status(mid) !== 'ready') throw new AuthExpiredError()
    this.legacy?.assign(mid)
    this.onStatus(mid, this.status(mid))
    this.publish()
  }

  private record(mid: number): AccountRecord | undefined {
    return this.data.profiles.find((p) => p.user.mid === mid)
  }

  private update(partition: string, state: AuthState): void {
    const record = this.data.profiles.find((p) => p.partition === partition)
    if (!record) {
      if (partition !== PARTITION || this.data.legacyMid !== undefined || !state.loggedIn) return
      const mid = state.user.mid
      if (this.record(mid)) return
      const activeMid = activeScope().partition === PARTITION ? mid : this.data.activeMid
      this.save({
        activeMid, legacyMid: mid,
        profiles: [...this.data.profiles, { user: state.user, partition, lastUsed: Date.now() }]
      })
      if (activeMid === mid) this.setActive(mid)
      this.legacy?.assign(mid)
    } else if (state.loggedIn && JSON.stringify(record.user) !== JSON.stringify(state.user)) {
      this.save({ ...this.data, profiles: this.data.profiles.map((p) => p === record ? { ...p, user: state.user } : p) })
    }
    const mid = record?.user.mid ?? (state.loggedIn ? state.user.mid : undefined)
    if (mid === undefined) return
    this.publish()
    this.notifyStatus(mid)
  }

  private notifyStatus(mid: number): void {
    const status = this.status(mid)
    if (this.statuses.get(mid) === status) return
    this.statuses.set(mid, status)
    this.onStatus(mid, status)
  }

  private activate(mid: number): void {
    const profile = this.record(mid)
    if (!profile?.partition || isRetired(profile.partition)) throw new AuthExpiredError()
    this.save({
      ...this.data, activeMid: mid,
      profiles: this.data.profiles.map((p) => p === profile ? { ...p, lastUsed: this.nextLastUsed() } : p)
    })
    this.setActive(mid)
    publishActiveAuth()
    this.publish()
  }

  private setActive(mid: number | undefined): void {
    const partition = mid === undefined ? undefined : this.partition(mid)
    setActiveScope({ partition: partition ?? GUEST_PARTITION, mid: partition ? mid : undefined })
  }

  private nextLastUsed(): number {
    return Math.max(Date.now(), ...this.data.profiles.map((profile) => profile.lastUsed + 1))
  }

  private save(data: AccountFile): void {
    if (this.file) writeJson(this.file, data)
    this.data = data
  }

  private publish(): void {
    send('auth:accountsChanged', this.snapshot())
  }

  private async clear(partition: string): Promise<void> {
    retirePartition(partition)
    forgetSessionAuth(partition)
    forgetBuvid(partition)
    await inAuthScope({ partition, background: true }, async () => {
      const session = biliSession()
      await session.clearStorageData()
      await session.cookies.flushStore()
    })
  }
}

export const accounts = new Accounts()
