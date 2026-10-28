// B站视频 CDN 的官方镜像节点。接口返回的地址有时是速度很慢的 PCDN，
// 可以换成指定节点；原地址保留为备用，换了不通会自动退回。

export const CDN_HOSTS: { host: string; label: string }[] = [
  { host: 'upos-sz-mirrorali.bilivideo.com', label: '阿里云' },
  { host: 'upos-sz-mirrorcos.bilivideo.com', label: '腾讯云' },
  { host: 'upos-sz-mirrorhw.bilivideo.com', label: '华为云' },
  { host: 'upos-sz-mirror08c.bilivideo.com', label: '08c' },
  { host: 'upos-sz-mirroraliov.bilivideo.com', label: '阿里云（海外）' },
  { host: 'upos-sz-mirrorcosov.bilivideo.com', label: '腾讯云（海外）' },
  { host: 'upos-hz-mirrorakam.akamaized.net', label: 'Akamai（海外）' }
]

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
  const t = Date.now()
  try {
    const res = await fetch(`https://${host}/`, { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs) })
    await res.body?.cancel()
    return Date.now() - t
  } catch {
    return null
  }
}
