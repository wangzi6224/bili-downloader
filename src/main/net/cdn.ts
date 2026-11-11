// B站视频 CDN 的官方镜像节点。接口返回的地址有时是速度很慢的 PCDN，
// 可以换成指定节点；原地址保留为备用，换了不通会自动退回。

import { t } from '@shared/i18n'

const NODES: { host: string; label: () => string }[] = [
  { host: 'upos-sz-mirrorali.bilivideo.com', label: () => t('net.cdnAliyun') },
  { host: 'upos-sz-mirrorcos.bilivideo.com', label: () => t('net.cdnTencent') },
  { host: 'upos-sz-mirrorhw.bilivideo.com', label: () => t('net.cdnHuawei') },
  { host: 'upos-sz-mirror08c.bilivideo.com', label: () => '08c' },
  { host: 'upos-sz-mirroraliov.bilivideo.com', label: () => t('net.cdnAliyunOverseas') },
  { host: 'upos-sz-mirrorcosov.bilivideo.com', label: () => t('net.cdnTencentOverseas') },
  { host: 'upos-hz-mirrorakam.akamaized.net', label: () => t('net.cdnAkamaiOverseas') }
]

/** 可选的节点，名称按当前界面语言 */
export const cdnHosts = (): { host: string; label: string }[] =>
  NODES.map((n) => ({ host: n.host, label: n.label() }))

/** 只改写 upos 格式的地址（路径以 /upgcxcode/ 开头），其余保持原样 */
export function preferCdn(urls: string[], host: string): string[] {
  if (!host) return urls
  const src = urls.find((u) => {
    try {
      return new URL(u).pathname.startsWith('/upgcxcode/')
    } catch {
      return false
    }
  })
  if (!src) return urls
  const u = new URL(src)
  if (u.hostname === host) return urls
  const rewritten = `https://${host}${u.pathname}${u.search}`
  return [rewritten, ...urls.filter((x) => x !== rewritten)]
}

/** 测连接延迟（DNS + TCP + TLS + 一次往返），失败返回 null */
export async function pingHost(host: string, timeoutMs = 5000): Promise<number | null> {
  const start = Date.now()
  try {
    const res = await fetch(`https://${host}/`, { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs) })
    await res.body?.cancel()
    return Date.now() - start
  } catch {
    return null
  }
}
