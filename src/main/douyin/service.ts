// 抖音的解析服务：链接转解析结果、翻页、取作品详情（带缓存和匿名兜底）。依赖都注入，测试时换成假的
import { dyTargetUrl, parseDyInput, type DyTarget } from '@shared/douyinUrl'
import { t, type Key } from '@shared/i18n'
import type { DyListEntry, DySourceCategory, MediaItem, PageResult, ParseResult, StreamInfo } from '@shared/types'
import { UnsupportedError } from '../bili/http'
import type { DouyinApi, DyPage } from './api'
import { DyCooldownError, DyError, DyLoginError, DyVerifyError } from './errors'
import type { DouyinGate } from './gate'
import { dyStreamInfo } from './pick'
import { awemeItem, firstUrl, listResult, singleResult } from './resolve'
import type { DouyinShare } from './share'
import type { DyAweme, DyDanmaku } from './types'

export interface DyServiceDeps {
  api: DouyinApi
  gate: Pick<DouyinGate, 'snapshot'>
  share: Pick<DouyinShare, 'expand' | 'detail'>
  currentAccount: () => string | undefined
  /** 账号在抖音的用户 id，取自己的列表时要用 */
  identity: (account: string) => { secUid: string; uid: string } | undefined
  now?: () => number
}

export interface DySource {
  url: string
  cursor: string
  account?: string | null
}

export interface DyCall {
  /** 不传时用当前账号；null 是不登录 */
  account?: string | null
  background?: boolean
  signal?: AbortSignal
}

/** 解析列表时拿到的作品数据这么久内直接用，批量下载不用逐个再请求；文件地址有效期约 3 小时 */
const CACHE_MS = 60 * 60_000
const CACHE_MAX = 2000

const UNSUPPORTED: Record<Extract<DyTarget, { type: 'unsupported' }>['what'], Key> = {
  live: 'dy.unsupportedLive',
  search: 'dy.unsupportedSearch',
  music: 'dy.unsupportedMusic',
  topic: 'dy.unsupportedTopic'
}

const SELF_TITLES: Record<Extract<DyTarget, { type: 'self' }>['tab'], Key> = {
  post: 'dy.groupMine',
  likes: 'dy.groupLikes',
  collection: 'dy.groupCollection',
  watchlater: 'dy.groupWatchLater',
  history: 'dy.groupHistory'
}

type ListTarget = Extract<DyTarget, { type: 'user' | 'mix' | 'self' }>

/** 游标里一起带上已经给出的条数和总数：翻页接口本身不记状态 */
const packCursor = (offset: number, total: number, cursor: string): string => `${offset}|${total}|${cursor}`
function unpackCursor(packed: string): { offset: number; total: number; cursor: string } {
  const [offset, total, ...rest] = packed.split('|')
  return { offset: Number(offset) || 0, total: Number(total) || 0, cursor: rest.join('|') }
}

export class DouyinService {
  private cache = new Map<string, { at: number; aweme: DyAweme }>()

  constructor(private deps: DyServiceDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  accountOf(o: DyCall = {}): string | null {
    return o.account === undefined ? (this.deps.currentAccount() ?? null) : o.account
  }

  private call(o: DyCall): { account: string | null; background?: boolean; signal?: AbortSignal } {
    return { account: this.accountOf(o), background: o.background, signal: o.signal }
  }

  currentAccount(): string | undefined {
    return this.deps.currentAccount()
  }

  hasAccount(id: string): boolean {
    return Boolean(this.deps.identity(id))
  }

  /** 下载队列开始任务前问一下账号现在能不能发请求 */
  hold(account: string | null): 'login' | 'verify' | 'cooling' | undefined {
    const { state } = this.deps.gate.snapshot(account)
    return state === 'ok' ? undefined : state === 'expired' ? 'login' : state
  }

  remember(awemes: DyAweme[]): void {
    for (const aweme of awemes) {
      this.cache.delete(aweme.aweme_id)
      this.cache.set(aweme.aweme_id, { at: this.now(), aweme })
    }
    for (const key of this.cache.keys()) {
      if (this.cache.size <= CACHE_MAX) break
      this.cache.delete(key)
    }
  }

  /** 单个作品。fresh 时不用缓存（上次下载失败，地址可能过期了） */
  async aweme(id: string, o: DyCall & { fresh?: boolean } = {}): Promise<DyAweme> {
    const cached = this.cache.get(id)
    if (!o.fresh && cached && this.now() - cached.at < CACHE_MS) return cached.aweme
    const call = this.call(o)
    try {
      const aweme = await this.deps.api.detail(id, call)
      this.remember([aweme])
      return aweme
    } catch (e) {
      // 没登录又被拦了：改从分享页取（画质有限）。分享页也拿不到时报原来的原因
      const blocked = e instanceof DyError || e instanceof DyCooldownError || e instanceof DyVerifyError || e instanceof DyLoginError
      if (call.account !== null || !blocked) throw e
      try {
        return await this.deps.share.detail(id, o.signal)
      } catch (fallback) {
        throw o.signal?.aborted || fallback instanceof UnsupportedError ? fallback : e
      }
    }
  }

  /** 认出链接；短链先展开。不是抖音链接返回 null */
  async target(input: string, signal?: AbortSignal): Promise<Exclude<DyTarget, { type: 'short' | 'unsupported' }> | null> {
    let target = parseDyInput(input)
    if (target?.type === 'short') target = parseDyInput(await this.deps.share.expand(target.url, signal))
    if (!target || target.type === 'short') return null
    if (target.type === 'unsupported') throw new UnsupportedError(t(UNSUPPORTED[target.what]))
    return target
  }

  private selfIdentity(account: string | null): { secUid: string; uid: string } {
    const me = account === null ? undefined : this.deps.identity(account)
    if (!me) throw new DyLoginError(t('dy.listNeedsLogin'))
    return me
  }

  private page(target: ListTarget, cursor: string, o: DyCall): Promise<DyPage> {
    const { api } = this.deps
    const call = this.call(o)
    if (target.type === 'user') return api.posts(target.secUid, cursor, call)
    if (target.type === 'mix') return api.mixItems(target.id, cursor, call)
    const me = this.selfIdentity(call.account)
    switch (target.tab) {
      case 'post':
        return api.posts(me.secUid, cursor, call)
      case 'likes':
        return api.likes(me.secUid, cursor, call)
      case 'collection':
        return target.folder ? api.folderItems(target.folder, cursor, call) : api.collection(cursor, call)
      case 'watchlater':
        return api.watchLater(cursor, call)
      case 'history':
        return api.history(cursor, call)
    }
  }

  async parse(input: string, o: DyCall = {}): Promise<ParseResult | null> {
    const target = await this.target(input, o.signal)
    if (!target) return null
    if (target.type === 'video') return singleResult(await this.aweme(target.id, o))
    const url = dyTargetUrl(target)
    const account = this.accountOf(o)
    if (target.type === 'self') this.selfIdentity(account)

    let title = ''
    let owner: string | undefined
    let cover: string | undefined
    let total = 0
    if (target.type === 'user') {
      const user = await this.deps.api.profile(target.secUid, this.call(o))
      owner = user.nickname
      cover = firstUrl(user.avatar_thumb)
      total = user.aweme_count ?? 0
      title = t('dy.groupUser', { name: owner ?? target.secUid.slice(-6) })
    }
    const first = await this.page(target, '', o)
    this.remember(first.items)
    if (target.type === 'mix') {
      const mix = first.items[0]?.mix_info
      title = mix?.mix_name || t('dy.groupMix')
      owner = first.items[0]?.author?.nickname
      total = mix?.statis?.updated_to_episode ?? 0
    } else if (target.type === 'self') {
      const folder = target.folder ? await this.folderName(target.folder, o) : undefined
      title = folder ? t('dy.groupFolder', { name: folder }) : t(SELF_TITLES[target.tab])
    }
    if (!first.items.length) throw new UnsupportedError(t('dy.emptyList'))
    // 没登录时博主主页只能看第一页
    const limited = target.type === 'user' && account === null && first.hasMore
    const hasMore = first.hasMore && !limited
    return listResult({
      title,
      url,
      owner,
      cover,
      awemes: first.items,
      paging: {
        source: { type: 'dy', url, cursor: packCursor(first.items.length, total, first.cursor), account },
        page: 1,
        total: Math.max(total, first.items.length),
        hasMore
      },
      note: limited ? t('dy.anonymousFirstPage') : undefined
    })
  }

  private async folderName(id: string, o: DyCall): Promise<string | undefined> {
    try {
      const page = await this.deps.api.folders('', this.call(o))
      return page.items.find((f) => String(f.collects_id_str ?? f.collects_id) === id)?.collects_name
    } catch {
      // 只是拿不到名字，不影响看里面的内容
      return undefined
    }
  }

  async loadPage(source: DySource, page: number, o: DyCall = {}): Promise<PageResult> {
    const target = await this.target(source.url, o.signal)
    if (!target || target.type === 'video') throw new UnsupportedError(t('dy.badLink'))
    const { offset, total, cursor } = unpackCursor(source.cursor)
    const account = source.account === undefined ? this.accountOf(o) : source.account
    const next = await this.page(target, cursor, { ...o, account })
    this.remember(next.items)
    const items = next.items.map((a, i) => awemeItem(a, offset + i + 1))
    const count = offset + items.length
    return {
      items,
      page,
      total: Math.max(total, count),
      hasMore: next.hasMore,
      next: { type: 'dy', url: source.url, cursor: packCursor(count, total, next.cursor), account }
    }
  }

  async streamInfo(item: MediaItem, o: DyCall = {}): Promise<StreamInfo> {
    if (!item.dyId) throw new UnsupportedError(t('dy.badLink'))
    return dyStreamInfo(await this.aweme(item.dyId, o))
  }

  danmaku(id: string, start: number, duration: number, o: DyCall = {}): Promise<DyDanmaku[]> {
    return this.deps.api.danmaku(id, start, duration, this.call(o))
  }

  /** 账号里的列表：收藏夹、收藏的合集、关注的博主 */
  async lists(category: DySourceCategory, cursor: string, o: DyCall = {}): Promise<{ entries: DyListEntry[]; cursor: string; hasMore: boolean }> {
    const call = this.call(o)
    const me = this.selfIdentity(call.account)
    if (category === 'folders') {
      const page = await this.deps.api.folders(cursor, call)
      const entries = page.items.map((f): DyListEntry => {
        const id = String(f.collects_id_str ?? f.collects_id)
        return {
          id,
          title: f.collects_name || id,
          cover: firstUrl(f.collects_cover),
          count: f.total_number,
          url: dyTargetUrl({ type: 'self', tab: 'collection', folder: id })
        }
      })
      return { entries, cursor: page.cursor, hasMore: page.hasMore }
    }
    if (category === 'mixes') {
      const page = await this.deps.api.mixCollections(cursor, call)
      const entries = page.items.filter((m) => m.mix_id).map((m): DyListEntry => ({
        id: m.mix_id!,
        title: m.mix_name || m.mix_id!,
        subtitle: m.author?.nickname,
        cover: firstUrl(m.cover_url),
        count: m.statis?.updated_to_episode,
        url: dyTargetUrl({ type: 'mix', id: m.mix_id! })
      }))
      return { entries, cursor: page.cursor, hasMore: page.hasMore }
    }
    const page = await this.deps.api.following(me, cursor, call)
    const entries = page.items.filter((u) => u.sec_uid).map((u): DyListEntry => ({
      id: u.sec_uid!,
      title: u.nickname || u.sec_uid!,
      subtitle: u.signature,
      cover: firstUrl(u.avatar_thumb),
      count: u.aweme_count,
      url: dyTargetUrl({ type: 'user', secUid: u.sec_uid! })
    }))
    return { entries, cursor: page.cursor, hasMore: page.hasMore }
  }
}

let instance: DouyinService | undefined

export const setDouyin = (service: DouyinService): void => {
  instance = service
}

export function douyin(): DouyinService {
  if (!instance) throw new Error(t('dy.errNotReady'))
  return instance
}
