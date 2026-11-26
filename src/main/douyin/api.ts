// 抖音网页接口：组装参数，经限速状态机和页面桥发出，把各种形式的拒绝翻译成错误
import { t } from '@shared/i18n'
import { classify, type Expectation } from './classify'
import { DyApiError, DyCooldownError, DyError, DyLoginError, DyUnavailableError, DyVerifyError } from './errors'
import type { DouyinGate, RunOptions } from './gate'
import type { DouyinTransport, DyRawResponse, DyRequest } from './transport/types'
import type { DyAweme, DyComment, DyDanmaku, DyFolder, DyMixInfo, DyUser } from './types'

export interface CallOptions extends RunOptions {
  account: string | null
}

export interface DyPage<T = DyAweme> {
  items: T[]
  /** 取下一页用的游标 */
  cursor: string
  hasMore: boolean
  total?: number
}

export interface SearchFilter {
  /** 0 综合、1 最多点赞、2 最新 */
  sort?: 0 | 1 | 2
  /** 发布时间：不限、一天内、一周内、半年内 */
  within?: 0 | 1 | 7 | 180
  /** 时长筛选 */
  duration?: '0-1' | '1-5' | '5-10000'
}

/** 连续遇到这么多个空页就放弃（博主翻页中间会夹很多空页） */
const MAX_EMPTY_PAGES = 60
const PAGE_SIZE = 18

type Data = Record<string, unknown>

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v))
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

export class DouyinApi {
  constructor(
    private transport: DouyinTransport,
    private gate: DouyinGate
  ) {}

  /** 发一个请求；返回解析后的数据，其余情况抛错并更新账号状态 */
  async call(req: DyRequest, o: CallOptions, expect: Expectation = {}): Promise<Data> {
    return this.gate.run(
      o.account,
      async () => {
        let res: DyRawResponse
        try {
          res = await this.transport.request(req, { account: o.account, signal: o.signal })
        } catch (e) {
          if (e instanceof DyVerifyError) this.gate.requireVerify(o.account, req)
          throw e
        }
        return this.settle(res, req, o.account, expect)
      },
      o
    )
  }

  private settle(res: DyRawResponse, req: DyRequest, account: string | null, expect: Expectation): Data {
    const out = classify(res, expect)
    switch (out.type) {
      case 'ok':
        this.gate.ok(account)
        return out.data
      case 'verify':
        this.gate.requireVerify(account, req)
        throw new DyVerifyError(req)
      case 'rejected':
        // 匿名时不给数据多半是要登录（例如主页第二页），不算限流
        if (account === null) throw new DyLoginError(t('dy.errRejected'))
        throw new DyCooldownError(this.gate.cool(account))
      case 'cooldown':
        throw new DyCooldownError(this.gate.cool(account))
      case 'login':
        // 只有查自己资料的接口能说明登录失效；别的接口也可能只是单次拒绝
        if (req.endpoint === 'self' && account !== null) {
          this.gate.expire(account)
          throw new DyLoginError(t('dy.errExpired'))
        }
        throw new DyLoginError()
      case 'error':
        throw new DyApiError(out.message, out.code)
    }
  }

  /** 用户在亮出的窗口里完成验证；成功后账号恢复正常 */
  async verify(account: string | null, signal?: AbortSignal): Promise<void> {
    const probe = this.gate.probe(account) ?? { endpoint: 'self' as const }
    const res = await this.transport.verify(account, probe, signal)
    const out = classify(res)
    if (out.type === 'verify') throw new DyVerifyError(probe)
    if (out.type === 'cooldown') throw new DyCooldownError(this.gate.cool(account))
    // 请求能返回就说明验证框过去了（匿名查自己资料返回“未登录”也算）
    this.gate.reset(account)
  }

  async detail(id: string, o: CallOptions): Promise<DyAweme> {
    const data = await this.call({ endpoint: 'detail', query: { aweme_id: id } }, o)
    const aweme = data.aweme_detail as DyAweme | null
    if (aweme?.aweme_id) return aweme
    const filter = data.filter_detail as { detail_msg?: string; filter_reason?: string } | undefined
    // 作品没了时接口会说明原因；什么都没给多半是被拦了
    if (!filter) throw new DyError(t('dy.errRejected'))
    throw new DyUnavailableError(t('dy.errUnavailable', { reason: filter.detail_msg || filter.filter_reason || t('dy.errDeleted') }))
  }

  /**
   * 取一页列表。中间夹着空页（has_more 仍为真）时继续往后翻，直到拿到内容或到底；
   * 游标不动说明接口异常，按失败处理而不是当成到底
   */
  private async page<T>(
    build: (cursor: string) => DyRequest,
    read: (data: Data) => DyPage<T>,
    cursor: string,
    o: CallOptions,
    expect: Expectation
  ): Promise<DyPage<T>> {
    let at = cursor
    for (let i = 0; i < MAX_EMPTY_PAGES; i++) {
      const page = read(await this.call(build(at), o, expect))
      if (page.items.length || !page.hasMore) return page
      if (page.cursor === at) break
      at = page.cursor
    }
    throw new DyError(t('dy.errIncomplete'))
  }

  private awemes(
    req: (cursor: string) => DyRequest,
    cursor: string,
    o: CallOptions,
    { key = 'aweme_list', next = 'max_cursor', nullIsEmpty = false } = {}
  ): Promise<DyPage> {
    return this.page(
      req,
      (d) => ({ items: list<DyAweme>(d[key]).filter((a) => a?.aweme_id), cursor: str(d[next]), hasMore: Boolean(d.has_more) }),
      cursor,
      o,
      { list: key, nullIsEmpty }
    )
  }

  posts(secUid: string, cursor: string, o: CallOptions): Promise<DyPage> {
    return this.awemes((c) => ({ endpoint: 'posts', query: { sec_user_id: secUid, max_cursor: c, count: String(PAGE_SIZE) } }), cursor || '0', o)
  }

  likes(secUid: string, cursor: string, o: CallOptions): Promise<DyPage> {
    return this.awemes(
      (c) => ({ endpoint: 'likes', query: { sec_user_id: secUid, max_cursor: c, min_cursor: '0', count: String(PAGE_SIZE) } }),
      cursor || '0',
      o,
      { nullIsEmpty: true }
    )
  }

  collection(cursor: string, o: CallOptions): Promise<DyPage> {
    return this.awemes(
      (c) => ({ endpoint: 'collection', method: 'POST', body: { cursor: c, count: String(PAGE_SIZE) } }),
      cursor || '0',
      o,
      { next: 'cursor', nullIsEmpty: true }
    )
  }

  folderItems(folder: string, cursor: string, o: CallOptions): Promise<DyPage> {
    return this.awemes(
      (c) => ({ endpoint: 'folderItems', query: { collects_id: folder, cursor: c, count: String(PAGE_SIZE) } }),
      cursor || '0',
      o,
      { next: 'cursor', nullIsEmpty: true }
    )
  }

  mixItems(mixId: string, cursor: string, o: CallOptions): Promise<DyPage> {
    return this.awemes((c) => ({ endpoint: 'mixItems', query: { mix_id: mixId, cursor: c, count: '20' } }), cursor || '0', o, { next: 'cursor' })
  }

  watchLater(cursor: string, o: CallOptions): Promise<DyPage> {
    return this.awemes((c) => ({ endpoint: 'watchLater', query: { offset: c, count: String(PAGE_SIZE) } }), cursor || '0', o, {
      key: 'items',
      next: 'offset',
      nullIsEmpty: true
    })
  }

  history(cursor: string, o: CallOptions): Promise<DyPage> {
    return this.awemes((c) => ({ endpoint: 'history', query: { max_cursor: c, count: '20' } }), cursor || '0', o, { nullIsEmpty: true })
  }

  async folders(cursor: string, o: CallOptions): Promise<DyPage<DyFolder>> {
    const d = await this.call({ endpoint: 'folders', query: { cursor: cursor || '0', count: '20' } }, o, { list: 'collects_list', nullIsEmpty: true })
    return { items: list<DyFolder>(d.collects_list), cursor: str(d.cursor), hasMore: Boolean(d.has_more), total: Number(d.total_number) || undefined }
  }

  async mixCollections(cursor: string, o: CallOptions): Promise<DyPage<DyMixInfo>> {
    const d = await this.call({ endpoint: 'mixCollections', query: { cursor: cursor || '0', count: '20' } }, o, { list: 'mix_infos', nullIsEmpty: true })
    return { items: list<DyMixInfo>(d.mix_infos), cursor: str(d.cursor), hasMore: Boolean(d.has_more) }
  }

  /** 关注列表按时间往前翻：游标是上一页返回的 min_time */
  async following(user: { secUid: string; uid: string }, cursor: string, o: CallOptions): Promise<DyPage<DyUser>> {
    const query = { sec_user_id: user.secUid, user_id: user.uid, offset: '0', min_time: '0', max_time: cursor || '0', count: '20', source_type: cursor ? '1' : '4' }
    const d = await this.call({ endpoint: 'following', query }, o, { list: 'followings', nullIsEmpty: true })
    return { items: list<DyUser>(d.followings), cursor: str(d.min_time), hasMore: Boolean(d.has_more), total: Number(d.total) || undefined }
  }

  async mixDetail(mixId: string, o: CallOptions): Promise<DyMixInfo | undefined> {
    const d = await this.call({ endpoint: 'mixDetail', query: { mix_id: mixId } }, o)
    return d.mix_info as DyMixInfo | undefined
  }

  async profile(secUid: string, o: CallOptions): Promise<DyUser> {
    const d = await this.call({ endpoint: 'profile', query: { sec_user_id: secUid } }, o)
    const user = d.user as DyUser | null
    if (!user) throw new DyUnavailableError(t('dy.errUserMissing'))
    return user
  }

  /** 当前登录的账号；匿名或登录失效时抛 DyLoginError */
  async self(o: CallOptions): Promise<DyUser> {
    const d = await this.call({ endpoint: 'self' }, o)
    const user = d.user as DyUser | null
    if (!user?.sec_uid) {
      if (o.account !== null) this.gate.expire(o.account)
      throw new DyLoginError(t('dy.errExpired'))
    }
    return user
  }

  async searchVideos(keyword: string, cursor: { offset: number; searchId?: string }, filter: SearchFilter, o: CallOptions): Promise<DyPage & { searchId: string }> {
    const filtered = Boolean(filter.sort || filter.within || filter.duration)
    const query: Record<string, string> = {
      search_channel: 'aweme_video_web',
      keyword,
      search_source: 'normal_search',
      query_correct_type: '1',
      is_filter_search: filtered ? '1' : '0',
      offset: String(cursor.offset),
      count: '10',
      ...(filtered ? { sort_type: String(filter.sort ?? 0), publish_time: String(filter.within ?? 0), filter_duration: filter.duration ?? '' } : {}),
      ...(cursor.searchId ? { search_id: cursor.searchId } : {})
    }
    const d = await this.call({ endpoint: 'searchVideos', query }, o, { list: 'data', nullIsEmpty: true })
    return {
      items: list<{ aweme_info?: DyAweme }>(d.data).flatMap((x) => (x.aweme_info?.aweme_id ? [x.aweme_info] : [])),
      cursor: str(d.cursor),
      hasMore: Boolean(d.has_more),
      searchId: str((d.extra as { logid?: string } | undefined)?.logid ?? (d.log_pb as { impr_id?: string } | undefined)?.impr_id)
    }
  }

  async searchUsers(keyword: string, offset: number, o: CallOptions): Promise<DyPage<DyUser>> {
    const query = { search_channel: 'aweme_user_web', keyword, search_source: 'normal_search', query_correct_type: '1', is_filter_search: '0', offset: String(offset), count: '10' }
    const d = await this.call({ endpoint: 'searchUsers', query }, o, { list: 'user_list', nullIsEmpty: true })
    return {
      items: list<{ user_info?: DyUser }>(d.user_list).flatMap((x) => (x.user_info?.sec_uid ? [x.user_info] : [])),
      cursor: str(d.cursor),
      hasMore: Boolean(d.has_more)
    }
  }

  async comments(awemeId: string, cursor: string, o: CallOptions): Promise<DyPage<DyComment>> {
    const d = await this.call({ endpoint: 'comments', query: { aweme_id: awemeId, cursor: cursor || '0', count: '20' } }, o, { list: 'comments', nullIsEmpty: true })
    return { items: list<DyComment>(d.comments), cursor: str(d.cursor), hasMore: Boolean(d.has_more), total: Number(d.total) || undefined }
  }

  /** 评论的回复：匿名调会弹验证，只在登录时用 */
  async replies(awemeId: string, commentId: string, cursor: string, o: CallOptions): Promise<DyPage<DyComment>> {
    if (o.account === null) throw new DyLoginError()
    const query = { item_id: awemeId, comment_id: commentId, cursor: cursor || '0', count: '20' }
    const d = await this.call({ endpoint: 'replies', query }, o, { list: 'comments', nullIsEmpty: true })
    return { items: list<DyComment>(d.comments), cursor: str(d.cursor), hasMore: Boolean(d.has_more), total: Number(d.total) || undefined }
  }

  /** 从 start（毫秒）开始的一个时间窗口里的弹幕；接口固定给大约 32 秒以上的内容 */
  async danmaku(awemeId: string, start: number, duration: number, o: CallOptions): Promise<DyDanmaku[]> {
    const query = { item_id: awemeId, group_id: awemeId, start_time: String(start), end_time: String(start + 32_000), duration: String(duration) }
    const d = await this.call({ endpoint: 'danmaku', query }, o, { list: 'danmaku_list', nullIsEmpty: true })
    return list<DyDanmaku>(d.danmaku_list)
  }
}
