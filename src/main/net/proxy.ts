import { Agent, ProxyAgent, setGlobalDispatcher } from 'undici'

export type ProxyMode = 'direct' | 'system' | 'manual'

export interface ProxyConfig {
  mode: ProxyMode
  /** 手动模式：http://[用户名:密码@]主机:端口 */
  url: string
}

/** 把用户填的代理地址规范成 http(s)://host:port；不合法时抛错 */
export function normalizeProxyUrl(input: string): string {
  const s = input.trim()
  if (!s) throw new Error('请填写代理地址，例如 http://127.0.0.1:7890')
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `http://${s}`
  let u: URL
  try {
    u = new URL(withScheme)
  } catch {
    throw new Error(`代理地址格式不对：${s}`)
  }
  if (/^socks/.test(u.protocol)) throw new Error('暂不支持 SOCKS 代理，请改用 HTTP 代理端口')
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(`不支持的代理协议：${u.protocol}`)
  // URL 会把默认端口（http 80 / https 443）去掉，这里要看用户原本有没有写
  const explicitDefault = /:(80|443)(\/|$)/.exec(withScheme.replace(/^[^:]+:\/\//, ''))?.[1]
  const port = u.port || explicitDefault
  if (!port) throw new Error('代理地址需要带端口，例如 http://127.0.0.1:7890')
  return `${u.protocol}//${u.username ? `${u.username}:${u.password}@` : ''}${u.hostname}:${port}`
}

/** 解析 Chromium resolveProxy 的结果，例如 "PROXY 127.0.0.1:7890; DIRECT" */
export function parseResolvedProxy(resolved: string): string | undefined {
  const first = resolved.split(';')[0].trim()
  const m = first.match(/^(PROXY|HTTPS)\s+(\S+)$/i)
  if (m) return `${m[1].toUpperCase() === 'HTTPS' ? 'https' : 'http'}://${m[2]}`
  if (/^SOCKS/i.test(first)) throw new Error('系统代理是 SOCKS 类型，暂不支持；请改为手动填写 HTTP 代理端口')
  return undefined
}

/**
 * 让主进程里所有 fetch（接口请求和视频下载）走指定代理。
 * proxyUrl 为空表示直连。返回给用户看的说明。
 */
export function setFetchProxy(proxyUrl: string | undefined): string {
  setGlobalDispatcher(proxyUrl ? new ProxyAgent(proxyUrl) : new Agent())
  return proxyUrl ? `通过 ${proxyUrl.replace(/\/\/[^@/]*@/, '//***@')} 连接` : '直连'
}
