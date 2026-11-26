// 抖音的 cookie：只认 douyin.com 的。支持浏览器导入和手动粘贴（cookies.txt、扩展导出的 JSON、请求头那一行）
import type { CookieSite } from '../auth/browserImport'
import type { PlainCookie, SameSite } from '../auth/session'

export const isDyCookieHost = (host: string): boolean => /(^|\.)douyin\.com$/i.test(host.replace(/^\./, ''))

/** 代表已登录的 cookie */
export const DY_LOGIN_COOKIE = 'sessionid'
export const DY_SITE: CookieSite = { host: isDyCookieHost, key: DY_LOGIN_COOKIE }

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

const cookie = (name: string, value: string, now: number): PlainCookie => ({
  domain: '.douyin.com',
  name,
  value,
  path: '/',
  secure: true,
  httpOnly: false,
  expires: now + HALF_YEAR,
  sameSite: 'unspecified'
})

/** cookies.txt：域名、子域名、路径、secure、过期、名字、值，tab 分隔；#HttpOnly_ 前缀表示 httpOnly */
function netscape(text: string): PlainCookie[] {
  return text.split(/\r?\n/).flatMap((raw): PlainCookie[] => {
    const httpOnly = raw.startsWith('#HttpOnly_')
    const line = httpOnly ? raw.slice('#HttpOnly_'.length) : raw
    if (line.startsWith('#')) return []
    const [domain, , path, secure, expires, name, ...value] = line.split('\t')
    if (!value.length || !isDyCookieHost(domain)) return []
    const exp = Number(expires)
    return [{ domain, name, value: value.join('\t'), path: path || '/', secure: secure.toUpperCase() === 'TRUE', httpOnly, expires: exp > 0 ? exp : undefined, sameSite: 'unspecified' }]
  })
}

export function parseDyCookieText(text: string, now = Math.floor(Date.now() / 1000)): PlainCookie[] {
  const trimmed = text.trim()
  const json = trimmed.startsWith('[') || trimmed.startsWith('{')
  if (!json && /\t/.test(trimmed) && /douyin\.com/i.test(trimmed)) return netscape(trimmed)
  if (json) {
    const raw = JSON.parse(trimmed) as JsonCookie | JsonCookie[]
    return (Array.isArray(raw) ? raw : [raw])
      .filter((c) => c.name && typeof c.value === 'string' && (!c.domain || isDyCookieHost(c.domain)))
      .map((c) => ({
        domain: c.domain ? (c.domain === 'douyin.com' ? '.douyin.com' : c.domain) : '.douyin.com',
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
    .flatMap((pair) => {
      const i = pair.indexOf('=')
      const name = pair.slice(0, i).trim()
      return i > 0 && name ? [cookie(name, pair.slice(i + 1).trim(), now)] : []
    })
}
