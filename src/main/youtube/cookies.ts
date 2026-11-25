// YouTube 的 cookie：只认 youtube.com 的（google.com 的不读，导入的越少越好）。
// 支持手动粘贴的三种格式，以及给 yt-dlp 用的 Netscape cookies.txt
import type { PlainCookie, SameSite } from '../auth/session'
import type { CookieSite } from '../auth/browserImport'

export const isYtCookieHost = (host: string): boolean => /(^|\.)youtube\.com$/i.test(host.replace(/^\./, ''))

/** 代表已登录的 cookie：YouTube 网页版请求鉴权用的就是它 */
export const YT_LOGIN_COOKIE = 'SAPISID'
export const YT_SITE: CookieSite = { host: isYtCookieHost, key: YT_LOGIN_COOKIE }

const HALF_YEAR = 180 * 86400
const SAME_SITE: Record<string, SameSite> = { no_restriction: 'no_restriction', none: 'no_restriction', lax: 'lax', strict: 'strict' }

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

const dotted = (domain: string): string => `.${domain.replace(/^\./, '')}`

/** Netscape 格式：域名、子域名、路径、secure、过期、名字、值，用 tab 分隔；#HttpOnly_ 前缀表示 httpOnly */
export function parseNetscape(text: string): PlainCookie[] {
  const out: PlainCookie[] = []
  for (const raw of text.split(/\r?\n/)) {
    const httpOnly = raw.startsWith('#HttpOnly_')
    const line = httpOnly ? raw.slice('#HttpOnly_'.length) : raw
    if (!line.trim() || line.startsWith('#')) continue
    const f = line.split('\t')
    if (f.length < 7) continue
    const [domain, , path, secure, expires, name, ...value] = f
    if (!isYtCookieHost(domain)) continue
    const exp = Number(expires)
    out.push({
      domain,
      name,
      value: value.join('\t'),
      path: path || '/',
      secure: secure.toUpperCase() === 'TRUE',
      httpOnly,
      expires: exp > 0 ? exp : undefined,
      sameSite: 'unspecified'
    })
  }
  return out
}

/** 手动粘贴的：cookies.txt、Cookie-Editor 导出的 JSON、或请求头里的 “a=b; c=d” */
export function parseYtCookieText(text: string, now = Math.floor(Date.now() / 1000)): PlainCookie[] {
  const trimmed = text.trim()
  if (/\t/.test(trimmed) && /youtube\.com/i.test(trimmed)) return parseNetscape(trimmed)
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const raw = JSON.parse(trimmed) as JsonCookie | JsonCookie[]
    return (Array.isArray(raw) ? raw : [raw])
      .filter((c) => c.name && typeof c.value === 'string' && (!c.domain || isYtCookieHost(c.domain)))
      .map((c) => ({
        domain: c.domain ? (c.domain.startsWith('.') || c.domain === 'youtube.com' ? dotted(c.domain) : c.domain) : '.youtube.com',
        name: c.name,
        value: c.value,
        path: c.path || '/',
        secure: c.secure ?? true,
        httpOnly: c.httpOnly ?? false,
        expires: c.expirationDate ? Math.floor(c.expirationDate) : now + HALF_YEAR,
        sameSite: SAME_SITE[(c.sameSite ?? '').toLowerCase()] ?? 'unspecified'
      }))
  }
  return trimmed
    .replace(/^cookie:\s*/i, '')
    .split(/;\s*/)
    .map((pair) => {
      const i = pair.indexOf('=')
      return i > 0 ? [pair.slice(0, i).trim(), pair.slice(i + 1).trim()] : null
    })
    .filter((p): p is string[] => Boolean(p && p[0]))
    .map(([name, value]) => ({
      domain: '.youtube.com',
      name,
      value,
      path: '/',
      secure: true,
      httpOnly: false,
      expires: now + HALF_YEAR,
      sameSite: 'unspecified' as const
    }))
}

/** 写给 yt-dlp 的 cookies.txt */
export function toNetscape(cookies: PlainCookie[]): string {
  const lines = cookies.map((c) => {
    const domain = c.domain
    return [
      `${c.httpOnly ? '#HttpOnly_' : ''}${domain}`,
      domain.startsWith('.') ? 'TRUE' : 'FALSE',
      c.path || '/',
      c.secure ? 'TRUE' : 'FALSE',
      String(c.expires ?? 0),
      c.name,
      c.value
    ].join('\t')
  })
  return ['# Netscape HTTP Cookie File', ...lines, ''].join('\n')
}

const cookieId = (c: Pick<PlainCookie, 'domain' | 'name' | 'path'>): string => `${dotted(c.domain).toLowerCase()}\t${c.path || '/'}\t${c.name}`

/** 把 yt-dlp 写回的 cookie 合进原来的：同域名、路径、名字的用新值，过期的去掉 */
export function mergeCookies(old: PlainCookie[], fresh: PlainCookie[], now = Math.floor(Date.now() / 1000)): PlainCookie[] {
  const map = new Map(old.map((c) => [cookieId(c), c]))
  for (const c of fresh) map.set(cookieId(c), { ...map.get(cookieId(c)), ...c, sameSite: map.get(cookieId(c))?.sameSite ?? c.sameSite })
  return [...map.values()].filter((c) => c.expires === undefined || c.expires > now)
}

/** 请求 youtube.com 用的 Cookie 头 */
export const cookieHeader = (cookies: PlainCookie[]): string => cookies.map((c) => `${c.name}=${c.value}`).join('; ')
