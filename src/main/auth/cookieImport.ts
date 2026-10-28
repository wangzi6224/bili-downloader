import type { AuthState } from '@shared/types'
import { checkAuth } from './authGuard'
import { clearBiliCookies, setBiliCookies, type PlainCookie, type SameSite } from './session'

const HTTP_ONLY = new Set(['SESSDATA'])
const HALF_YEAR = 180 * 86400

interface JsonCookie {
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  expirationDate?: number
  sameSite?: string
}

const SAME_SITE: Record<string, SameSite> = { no_restriction: 'no_restriction', none: 'no_restriction', lax: 'lax', strict: 'strict' }

/**
 * 解析手动粘贴的 Cookie：支持 “a=b; c=d”（可带 “Cookie:” 前缀）
 * 和浏览器插件（如 Cookie-Editor）导出的 JSON 数组。只保留 bilibili.com 的。
 */
export function parseCookieText(text: string, now = Math.floor(Date.now() / 1000)): PlainCookie[] {
  const t = text.trim()
  if (t.startsWith('[') || t.startsWith('{')) {
    const raw = JSON.parse(t) as JsonCookie | JsonCookie[]
    return (Array.isArray(raw) ? raw : [raw])
      .filter((c) => c.name && typeof c.value === 'string')
      .filter((c) => !c.domain || c.domain.replace(/^\./, '').endsWith('bilibili.com'))
      .map((c) => ({
        domain: c.domain ? (c.domain.startsWith('.') || c.domain === 'bilibili.com' ? `.${c.domain.replace(/^\./, '')}` : c.domain) : '.bilibili.com',
        name: c.name,
        value: c.value,
        path: c.path || '/',
        secure: c.secure ?? true,
        httpOnly: c.httpOnly ?? HTTP_ONLY.has(c.name),
        expires: c.expirationDate ? Math.floor(c.expirationDate) : now + HALF_YEAR,
        sameSite: SAME_SITE[(c.sameSite ?? '').toLowerCase()] ?? 'unspecified'
      }))
  }
  return t
    .replace(/^cookie:\s*/i, '')
    .split(/;\s*/)
    .map((pair) => {
      const i = pair.indexOf('=')
      return i > 0 ? [pair.slice(0, i).trim(), pair.slice(i + 1).trim()] : null
    })
    .filter((p): p is string[] => Boolean(p && p[0]))
    .map(([name, value]) => ({
      domain: '.bilibili.com',
      name,
      value,
      path: '/',
      secure: true,
      httpOnly: HTTP_ONLY.has(name),
      expires: now + HALF_YEAR,
      sameSite: 'unspecified' as const
    }))
}

export async function importCookieText(text: string): Promise<AuthState> {
  let cookies: PlainCookie[]
  try {
    cookies = parseCookieText(text)
  } catch {
    throw new Error('看不懂这段内容，请粘贴 “SESSDATA=…; bili_jct=…” 这样的 Cookie，或插件导出的 JSON')
  }
  if (!cookies.some((c) => c.name === 'SESSDATA' && c.value)) throw new Error('里面没有 SESSDATA，无法登录')
  await clearBiliCookies()
  await setBiliCookies(cookies)
  const state = await checkAuth()
  if (!state.loggedIn) throw new Error('这段 Cookie 已经失效，请重新获取')
  return state
}
