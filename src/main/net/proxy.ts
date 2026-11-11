import { Agent, ProxyAgent, setGlobalDispatcher } from 'undici'
import { t } from '@shared/i18n'

export type ProxyMode = 'direct' | 'system' | 'manual'

export interface ProxyConfig {
  mode: ProxyMode
  /** 手动模式：http://[用户名:密码@]主机:端口 */
  url: string
}

/** 把用户填的代理地址规范成 http(s)://host:port；不合法时抛错 */
export function normalizeProxyUrl(input: string): string {
  const s = input.trim()
  if (!s) throw new Error(t('net.proxyRequired'))
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `http://${s}`
  let u: URL
  try {
    u = new URL(withScheme)
  } catch {
    throw new Error(t('net.proxyBadFormat', { url: s }))
  }
  if (/^socks/.test(u.protocol)) throw new Error(t('net.socksUnsupported'))
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(t('net.protocolUnsupported', { protocol: u.protocol }))
  // URL 会把默认端口（http 80 / https 443）去掉，这里要看用户原本有没有写
  const explicitDefault = /:(80|443)(\/|$)/.exec(withScheme.replace(/^[^:]+:\/\//, ''))?.[1]
  const port = u.port || explicitDefault
  if (!port) throw new Error(t('net.portRequired'))
  return `${u.protocol}//${u.username ? `${u.username}:${u.password}@` : ''}${u.hostname}:${port}`
}

/** 解析 Chromium resolveProxy 的结果，例如 "PROXY 127.0.0.1:7890; DIRECT" */
export function parseResolvedProxy(resolved: string): string | undefined {
  const first = resolved.split(';')[0].trim()
  const m = first.match(/^(PROXY|HTTPS)\s+(\S+)$/i)
  if (m) return `${m[1].toUpperCase() === 'HTTPS' ? 'https' : 'http'}://${m[2]}`
  if (/^SOCKS/i.test(first)) throw new Error(t('net.systemSocks'))
  return undefined
}

/** 给用户看的连接方式说明，代理地址里的账号密码打码 */
export const describeProxy = (proxyUrl: string | undefined): string =>
  proxyUrl ? t('net.via', { url: proxyUrl.replace(/\/\/[^@/]*@/, '//***@') }) : t('net.direct')

/** 让主进程里所有 fetch（接口请求和视频下载）走指定代理，proxyUrl 为空表示直连 */
export function setFetchProxy(proxyUrl: string | undefined): void {
  setGlobalDispatcher(proxyUrl ? new ProxyAgent(proxyUrl) : new Agent())
}
