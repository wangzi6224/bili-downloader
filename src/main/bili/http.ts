import { cookieHeader, getCookie, setBiliCookies, UA } from '../auth/session'
import { encWbi, keyFromUrl } from './wbi'

export class BiliError extends Error {
  constructor(
    message: string,
    public code = -1
  ) {
    super(message)
  }
}

export class AuthExpiredError extends BiliError {
  constructor() {
    super('登录已失效，请重新登录', -101)
  }
}

/** 该内容本身无法下载（DRM、地区限制、需要大会员等），重试没有意义 */
export class UnsupportedError extends BiliError {}

export const BASE_HEADERS = {
  'User-Agent': UA,
  Referer: 'https://www.bilibili.com/',
  Origin: 'https://www.bilibili.com'
}

export const NAV_URL = 'https://api.bilibili.com/x/web-interface/nav'

type Params = Record<string, string | number | boolean | undefined>

export interface BiliJson<T> {
  code: number
  message: string
  data?: T
  result?: T
}

let onAuthExpired: () => void = () => {}
export function setAuthExpiredHook(fn: () => void): void {
  onAuthExpired = fn
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export async function biliFetch(url: string, init: RequestInit = {}, retries = 3): Promise<Response> {
  let lastErr: unknown
  for (let i = 0; i <= retries; i++) {
    try {
      const started = Date.now()
      const res = await fetch(url, {
        ...init,
        headers: { ...BASE_HEADERS, Cookie: await cookieHeader(), ...init.headers }
      })
      const ms = Date.now() - started
      if (ms > 1500) console.warn(`[slow] ${ms}ms HTTP ${res.status} ${url.split('?')[0]}`)
      if (res.status === 412) throw new BiliError('请求被 B站风控拦截（HTTP 412），请稍后再试', 412)
      if (res.status >= 500) throw new BiliError(`B站服务器错误（HTTP ${res.status}）`, res.status)
      return res
    } catch (e) {
      lastErr = e
      if (init.signal?.aborted) throw e
      console.warn(`[retry ${i + 1}/${retries}] ${url.split('?')[0]}: ${(e as Error).message}`)
      if (i < retries) await sleep(1000 * 2 ** i)
    }
  }
  throw lastErr instanceof BiliError ? lastErr : new BiliError(`网络请求失败：${String(lastErr)}`)
}

// ---- WBI key 缓存 ----

let wbiKeys: { img: string; sub: string; at: number } | undefined

export function updateWbiKeys(wbiImg?: { img_url: string; sub_url: string }): void {
  if (wbiImg?.img_url && wbiImg.sub_url) {
    wbiKeys = { img: keyFromUrl(wbiImg.img_url), sub: keyFromUrl(wbiImg.sub_url), at: Date.now() }
  }
}

async function getWbiKeys(): Promise<{ img: string; sub: string }> {
  if (!wbiKeys || Date.now() - wbiKeys.at > 3600_000) {
    const json = (await (await biliFetch(NAV_URL)).json()) as BiliJson<{
      wbi_img: { img_url: string; sub_url: string }
    }>
    updateWbiKeys(json.data?.wbi_img)
    if (!wbiKeys) throw new BiliError('获取 WBI 签名密钥失败')
  }
  return wbiKeys
}

// ---- buvid：缺少时部分接口会触发风控 ----

let buvidChecked = false
async function ensureBuvid(): Promise<void> {
  if (buvidChecked) return
  buvidChecked = true
  if (await getCookie('buvid3')) return
  try {
    const json = (await (
      await biliFetch('https://api.bilibili.com/x/frontend/finger/spi')
    ).json()) as BiliJson<{ b_3: string; b_4: string }>
    if (!json.data) return
    const base = { domain: '.bilibili.com', path: '/', secure: false, httpOnly: false, sameSite: 'unspecified' as const }
    const expires = Math.floor(Date.now() / 1000) + 365 * 86400
    await setBiliCookies([
      { ...base, name: 'buvid3', value: json.data.b_3, expires },
      { ...base, name: 'buvid4', value: json.data.b_4, expires }
    ])
  } catch {
    // 拿不到也不影响大部分接口
  }
}

function toQuery(params: Params = {}): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) out[k] = typeof v === 'boolean' ? Number(v) : v
  }
  return out
}

/** 返回完整 JSON，不检查 code */
export async function getRaw<T>(url: string, params?: Params, opts: { wbi?: boolean } = {}): Promise<BiliJson<T>> {
  await ensureBuvid()
  const q = toQuery(params)
  let qs: string
  if (opts.wbi) {
    const { img, sub } = await getWbiKeys()
    qs = encWbi(q, img, sub)
  } else {
    qs = new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)])).toString()
  }
  const res = await biliFetch(qs ? `${url}?${qs}` : url)
  try {
    return (await res.json()) as BiliJson<T>
  } catch {
    throw new BiliError(`接口返回了无法解析的内容（HTTP ${res.status}）`, res.status)
  }
}

/** 检查 code === 0 并返回 data / result；-101 视为登录失效 */
export async function api<T>(url: string, params?: Params, opts: { wbi?: boolean } = {}): Promise<T> {
  let json = await getRaw<T>(url, params, opts)
  if (opts.wbi && (json.code === -352 || json.code === -403)) {
    // 签名密钥可能已轮换，刷新后重试一次
    wbiKeys = undefined
    json = await getRaw<T>(url, params, opts)
  }
  if (json.code === -101) {
    onAuthExpired()
    throw new AuthExpiredError()
  }
  if (json.code !== 0) throw new BiliError(json.message || `接口错误（${json.code}）`, json.code)
  return (json.data ?? json.result) as T
}
