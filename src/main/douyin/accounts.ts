// 抖音账号：每个账号一个独立的 Electron 会话分区，登录信息就留在分区里（页面桥要在里面打开网页）；
// 这里只记录账号是谁、用哪个分区
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { t } from '@shared/i18n'
import type { DyAccount, DyAccountsSnapshot } from '@shared/types'
import { readJson, writeJson } from '../store'
import { firstUrl } from './resolve'
import type { DyUser } from './types'

export const GUEST_PARTITION = 'persist:douyin-guest'

interface Stored extends DyAccount {
  partition: string
  uid: string
  secUid: string
}

export interface DyAccountsDeps {
  /** 清掉一个分区里的所有数据 */
  clearPartition: (partition: string) => Promise<void>
  now?: () => number
}

/**
 * 事件：changed(snapshot) 账号列表或当前账号变化；login(id) 账号登录或重新登录成功、切换到它；
 * removed(id) 账号被删除
 */
export class DyAccounts extends EventEmitter {
  private current_?: string
  private list: Stored[]
  /** 正在登录、还没确认身份的账号 → 分区 */
  private pending = new Map<string, string>()

  constructor(
    private dir: string,
    private deps: DyAccountsDeps
  ) {
    super()
    const saved = readJson<{ current?: string; accounts?: Stored[] }>(this.file())
    this.list = (saved?.accounts ?? []).filter((a) => a?.id && a.partition && a.secUid)
    this.current_ = this.list.some((a) => a.id === saved?.current) ? saved!.current : undefined
  }

  private file(): string {
    return join(this.dir, 'accounts.json')
  }

  private save(): void {
    writeJson(this.file(), { current: this.current_, accounts: this.list })
    this.emit('changed', this.snapshot())
  }

  private find(id: string | null | undefined): Stored | undefined {
    return this.list.find((a) => a.id === id)
  }

  snapshot(): DyAccountsSnapshot {
    return {
      current: this.current_,
      accounts: this.list.map(({ partition: _p, uid: _u, secUid: _s, ...account }) => account)
    }
  }

  current(): string | undefined {
    return this.current_
  }

  /** 账号用哪个会话分区；不登录和不认识的账号用访客分区 */
  partition(account: string | null): string {
    return (account && (this.pending.get(account) ?? this.find(account)?.partition)) || GUEST_PARTITION
  }

  identity(id: string): { secUid: string; uid: string } | undefined {
    const a = this.find(id)
    return a && { secUid: a.secUid, uid: a.uid }
  }

  /** 开始登录一个账号：分给它一个新分区 */
  prepare(): { id: string; partition: string } {
    const id = randomUUID()
    const partition = `persist:douyin-${id}`
    this.pending.set(id, partition)
    return { id, partition }
  }

  async discard(id: string): Promise<void> {
    const partition = this.pending.get(id)
    if (!partition) return
    this.pending.delete(id)
    await this.deps.clearPartition(partition)
  }

  /** 确认了身份：同一个抖音账号重新登录时换成新分区，保留原来的 id（任务和订阅还指着它） */
  async commit(id: string, user: DyUser): Promise<DyAccountsSnapshot> {
    const partition = this.pending.get(id)
    if (!partition || !user.sec_uid) throw new Error(t('dy.errExpired'))
    this.pending.delete(id)
    const now = this.deps.now?.() ?? Date.now()
    const known = this.list.find((a) => a.secUid === user.sec_uid)
    const account: Stored = {
      id: known?.id ?? id,
      partition,
      uid: user.uid ?? '',
      secUid: user.sec_uid,
      name: user.nickname || user.unique_id || user.sec_uid.slice(-6),
      handle: user.unique_id || user.short_id || undefined,
      avatar: firstUrl(user.avatar_thumb),
      addedAt: known?.addedAt ?? now,
      checkedAt: now,
      status: 'ready'
    }
    if (known) {
      const old = known.partition
      this.list[this.list.indexOf(known)] = account
      await this.deps.clearPartition(old)
    } else this.list.push(account)
    this.current_ = account.id
    this.save()
    this.emit('login', account.id)
    return this.snapshot()
  }

  select(id: string | undefined): DyAccountsSnapshot {
    if (id !== undefined && !this.find(id)) throw new Error(t('dy.errAccountMissing'))
    this.current_ = id
    this.save()
    if (id !== undefined) this.emit('login', id)
    return this.snapshot()
  }

  async remove(id: string): Promise<DyAccountsSnapshot> {
    const account = this.find(id)
    if (!account) return this.snapshot()
    this.list = this.list.filter((a) => a !== account)
    if (this.current_ === id) this.current_ = this.list.find((a) => a.status !== 'expired')?.id
    this.save()
    this.emit('removed', id)
    await this.deps.clearPartition(account.partition)
    return this.snapshot()
  }

  /** 查过一次资料：更新名字头像并标记可用 */
  update(id: string, user: DyUser): DyAccountsSnapshot {
    const account = this.find(id)
    if (account) {
      Object.assign(account, {
        name: user.nickname || account.name,
        avatar: firstUrl(user.avatar_thumb) ?? account.avatar,
        checkedAt: this.deps.now?.() ?? Date.now(),
        status: 'ready'
      })
      this.save()
    }
    return this.snapshot()
  }

  markExpired(id: string): void {
    const account = this.find(id)
    if (!account || account.status === 'expired') return
    account.status = 'expired'
    this.save()
  }
}
