import { session } from 'electron'
import type { Settings } from '@shared/types'
import { biliSession } from '../auth/session'
import { normalizeProxyUrl, parseResolvedProxy, setFetchProxy } from './proxy'

let status = '直连'
let applied = ''

export const networkStatus = (): string => status

/**
 * 按设置切换代理：主进程的 fetch（接口和下载）用 undici 代理，
 * 登录窗口（Chromium）用 session 代理，两边保持一致。
 */
export async function applyNetwork(s: Settings, force = false): Promise<string> {
  const key = JSON.stringify(s.proxy)
  if (!force && key === applied) return status
  applied = key
  try {
    let proxyUrl: string | undefined
    if (s.proxy.mode === 'manual') {
      proxyUrl = normalizeProxyUrl(s.proxy.url)
      const hostPort = proxyUrl.replace(/^\w+:\/\/([^@/]*@)?/, '')
      await biliSession().setProxy({ proxyRules: `http=${hostPort};https=${hostPort}` })
    } else if (s.proxy.mode === 'system') {
      proxyUrl = parseResolvedProxy(await session.defaultSession.resolveProxy('https://api.bilibili.com'))
      await biliSession().setProxy({ mode: 'system' })
    } else {
      await biliSession().setProxy({ mode: 'direct' })
    }
    status = setFetchProxy(proxyUrl)
    if (s.proxy.mode === 'system' && !proxyUrl) status = '跟随系统（系统未设置代理，直连）'
  } catch (e) {
    // 代理配置有误时退回直连，并把原因告诉用户
    setFetchProxy(undefined)
    status = `代理设置有误，已改为直连：${e instanceof Error ? e.message : String(e)}`
  }
  console.info(`网络：${status}`)
  return status
}
