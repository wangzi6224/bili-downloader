import { session } from 'electron'
import { t } from '@shared/i18n'
import type { NetworkStatus, Settings } from '@shared/types'
import { biliSession } from '../auth/session'
import { describeProxy, normalizeProxyUrl, parseResolvedProxy, setFetchProxy } from './proxy'

/** 文案在取的时候才生成，切换界面语言后跟着变（代理报错的原因除外，它是应用设置时生成的） */
let status: { error: boolean; text: () => string } = { error: false, text: () => describeProxy(undefined) }
let applied = ''
let loginProxy: Electron.ProxyConfig = { mode: 'system' }

export const networkStatus = (): NetworkStatus => ({ text: status.text(), error: status.error })
export const configureLoginSession = (): Promise<void> => biliSession().setProxy(loginProxy)

/**
 * 按设置切换代理：主进程的 fetch（接口和下载）用 undici 代理，
 * 登录窗口（Chromium）用 session 代理，两边保持一致。
 */
export async function applyNetwork(s: Settings, force = false): Promise<NetworkStatus> {
  const key = JSON.stringify(s.proxy)
  if (!force && key === applied) return networkStatus()
  applied = key
  try {
    let proxyUrl: string | undefined
    if (s.proxy.mode === 'manual') {
      proxyUrl = normalizeProxyUrl(s.proxy.url)
      const hostPort = proxyUrl.replace(/^\w+:\/\/([^@/]*@)?/, '')
      loginProxy = { proxyRules: `http=${hostPort};https=${hostPort}` }
    } else if (s.proxy.mode === 'system') {
      proxyUrl = parseResolvedProxy(await session.defaultSession.resolveProxy('https://api.bilibili.com'))
      loginProxy = { mode: 'system' }
    } else {
      loginProxy = { mode: 'direct' }
    }
    await configureLoginSession()
    setFetchProxy(proxyUrl)
    const fallback = s.proxy.mode === 'system' && !proxyUrl
    status = { error: false, text: () => (fallback ? t('net.systemNoProxy') : describeProxy(proxyUrl)) }
  } catch (e) {
    // 代理配置有误时退回直连，并把原因告诉用户
    loginProxy = { mode: 'direct' }
    setFetchProxy(undefined)
    const reason = e instanceof Error ? e.message : String(e)
    status = { error: true, text: () => t('net.proxyInvalid', { reason }) }
  }
  const result = networkStatus()
  console.info(`网络：${result.text}`)
  return result
}
