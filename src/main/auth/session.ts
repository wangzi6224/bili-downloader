import { session, type Cookie, type CookiesSetDetails } from 'electron'

/** 应用唯一的 cookie 存储：登录窗口、浏览器导入、API 请求都用它 */
export const PARTITION = 'persist:bilibili'

export const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

export const biliSession = (): Electron.Session => session.fromPartition(PARTITION)

export type SameSite = NonNullable<CookiesSetDetails['sameSite']>

export interface PlainCookie {
  domain: string
  name: string
  value: string
  path: string
  secure: boolean
  httpOnly: boolean
  /** unix 秒；undefined 表示会话 cookie */
  expires?: number
  sameSite: SameSite
}

export async function getBiliCookies(): Promise<Cookie[]> {
  return biliSession().cookies.get({ domain: 'bilibili.com' })
}

export async function getCookie(name: string): Promise<string | undefined> {
  const list = await biliSession().cookies.get({ domain: 'bilibili.com', name })
  return list.find((c) => c.value)?.value
}

export async function cookieHeader(): Promise<string> {
  const map = new Map<string, string>()
  for (const c of await getBiliCookies()) {
    // 同名 cookie 优先取 .bilibili.com 域的
    if (!map.has(c.name) || c.domain === '.bilibili.com') map.set(c.name, c.value)
  }
  return [...map].map(([k, v]) => `${k}=${v}`).join('; ')
}

export async function setBiliCookies(list: PlainCookie[]): Promise<void> {
  const cookies = biliSession().cookies
  for (const c of list) {
    const host = c.domain.replace(/^\./, '')
    await cookies.set({
      url: `https://${host}${c.path || '/'}`,
      name: c.name,
      value: c.value,
      // 以点开头的是域 cookie，否则是只属于该主机的 cookie
      domain: c.domain.startsWith('.') ? c.domain : undefined,
      path: c.path || '/',
      secure: c.secure,
      httpOnly: c.httpOnly,
      expirationDate: c.expires,
      // Chromium 拒绝没有 Secure 的 SameSite=None
      sameSite: c.sameSite === 'no_restriction' && !c.secure ? 'unspecified' : c.sameSite
    })
  }
  await cookies.flushStore()
}

export async function clearBiliCookies(): Promise<void> {
  await biliSession().clearStorageData({ storages: ['cookies'] })
}
