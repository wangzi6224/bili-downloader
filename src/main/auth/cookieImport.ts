import type { AuthState } from '@shared/types'
import { BiliError } from '../bili/http'
import { checkAuth } from './authGuard'
import { ImportError } from './importError'
import { clearBiliCookies, isBiliHost, setBiliCookies, snapshotCookies, type PlainCookie, type SameSite } from './session'

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
      .filter((c) => !c.domain || isBiliHost(c.domain))
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
  return replaceLogin(cookies, '这段 Cookie 已经失效，请重新获取')
}

let lastReplace: Promise<unknown> = Promise.resolve()
/** 请求本身没有超时，网络卡住时不能让后面排队的导入一直等 */
const CONFIRM_TIMEOUT = 30_000

function confirmLogin(): Promise<AuthState> {
  let timer: NodeJS.Timeout
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BiliError('确认登录超时，请检查网络')), CONFIRM_TIMEOUT)
  })
  return Promise.race([checkAuth(), timeout]).finally(() => clearTimeout(timer))
}

/**
 * 用导入的 cookie 换掉现在的登录，确认登录有效才保留；
 * 无效或确认时出错就写回原来的 cookie，导入失败不会把用户登出。
 * 界面和 MCP 都可能同时导入，一个一个来：两次交叉时后一次会把前一次写到一半的 cookie 当成备份。
 * shouldApply 在轮到这次时才判断，排队期间用户已经用别的方式登录的话就不替换
 */
export function replaceLogin(cookies: PlainCookie[], invalid: string, shouldApply?: () => boolean): Promise<AuthState> {
  const run = lastReplace.then(() => {
    if (shouldApply && !shouldApply()) throw new ImportError('cancelled', '这次导入已取消')
    return swapCookies(cookies, invalid)
  })
  lastReplace = run.catch(() => {})
  return run
}

async function swapCookies(cookies: PlainCookie[], invalid: string): Promise<AuthState> {
  const backup = await snapshotCookies()
  try {
    await clearBiliCookies()
    await setBiliCookies(cookies)
    const state = await confirmLogin()
    if (!state.loggedIn) throw new ImportError('expired', invalid)
    return state
  } catch (e) {
    try {
      await clearBiliCookies()
      await setBiliCookies(backup)
      await confirmLogin()
    } catch (err) {
      console.warn('恢复原来的登录失败', err)
    }
    throw e
  }
}
