// 抖音接口经常用看起来成功的响应表示拒绝（200 空内容、只有 status_code 的空壳、列表为 null），
// 这些都不能当成“没有更多了”
import type { DyRawResponse } from './transport/types'

export type DyOutcome =
  | { type: 'ok'; data: Record<string, unknown> }
  /** 要手动完成安全验证 */
  | { type: 'verify' }
  /** 明确的限流或拦截 */
  | { type: 'cooldown' }
  /** 看起来成功但没给数据 */
  | { type: 'rejected' }
  | { type: 'login' }
  | { type: 'error'; code: number; message: string }

export interface Expectation {
  /** 应该带的列表字段 */
  list?: string
  /** 列表为 null 是否可能是“本来就没有”（自己的收藏夹、合集收藏等） */
  nullIsEmpty?: boolean
}

const LOGIN_CODES = new Set([8, 2483])
/** 不算内容的外壳字段 */
const ENVELOPE = new Set(['status_code', 'status_msg', 'log_pb', 'extra'])

export function classify(res: DyRawResponse, expect: Expectation = {}): DyOutcome {
  if (res.status === 403 || res.status === 429) return { type: 'cooldown' }
  const body = res.body.trim()
  if (body === 'blocked') return { type: 'cooldown' }
  if (res.status !== 200 || !body) return { type: 'rejected' }
  let data: Record<string, unknown>
  try {
    data = JSON.parse(body) as Record<string, unknown>
  } catch {
    return { type: 'rejected' }
  }
  if (!data || typeof data !== 'object') return { type: 'rejected' }
  const nil = data.search_nil_info as { search_nil_type?: string; search_nil_item?: string } | undefined
  if (nil?.search_nil_type === 'verify_check' || nil?.search_nil_item === 'verify_check') return { type: 'verify' }
  const code = typeof data.status_code === 'number' ? data.status_code : undefined
  if (code !== undefined && LOGIN_CODES.has(code)) return { type: 'login' }
  if (code !== undefined && code !== 0) return { type: 'error', code, message: String(data.status_msg || code) }
  if (!Object.keys(data).some((k) => !ENVELOPE.has(k))) return { type: 'rejected' }
  if (expect.list) {
    const list = data[expect.list]
    if (!Array.isArray(list) && !(expect.nullIsEmpty && !data.has_more)) return { type: 'rejected' }
  }
  return { type: 'ok', data }
}
