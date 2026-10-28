import { extractInputs, parseInput } from '@shared/parseUrl'
import type { AudioPref, CodecPref, DownloadOptions, StreamInfo, UpdateState } from '@shared/types'

export type EditableOptions = Omit<DownloadOptions, 'qn'>

export const AUDIO_LABEL: Record<AudioPref, string> = {
  best: '最佳',
  flac: 'Hi-Res 无损',
  dolby: '杜比全景声',
  '192k': '192K',
  '132k': '132K',
  '64k': '64K'
}

/** 底部“这次会下载什么”的标签，避免下完才发现没有声音 */
export function summaryTags(o: EditableOptions, info?: StreamInfo | null): string[] {
  const tags: string[] = []
  const hasAudio = !info || info.hasAudio
  if (o.output !== 'audio') tags.push(`视频（${o.container.toUpperCase()}）`)
  if (o.output !== 'video' && hasAudio) tags.push(`音频（${AUDIO_LABEL[o.audio]}）`)
  if (o.output === 'video') tags.push('无声')
  if (o.embedCover || o.cover) tags.push('封面')
  if (o.output !== 'audio') {
    if (o.embedSubtitle || o.subtitle) tags.push('字幕')
    if (o.chapters) tags.push('章节')
    if (o.danmaku) tags.push('弹幕')
  }
  if (o.nfo) tags.push('NFO')
  return tags
}

/** 第 i 项和上一项交换；已经在最前面时返回 null */
export function moveUp<T>(list: T[], i: number): T[] | null {
  if (i === 0) return null
  const next = [...list]
  ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
  return next
}

/** 按优先级实际会下载的编码；不知道这个清晰度有哪些编码时返回 undefined */
export const actualCodec = (order: CodecPref[], available?: CodecPref[]): CodecPref | undefined =>
  available?.length ? order.find((c) => available.includes(c)) : undefined

/** 设置页“当前版本”下面的说明；error 为 true 时显示成红字 */
export function updateHint(u: UpdateState | null): { text: string; error: boolean } | null {
  if (!u) return null
  const info = 'info' in u ? u.info : undefined
  const at = u.checkedAt ? `（${new Date(u.checkedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 检查）` : ''
  if (u.status === 'error') return { text: u.error, error: true }
  const text = {
    idle: '还没有检查过',
    checking: '正在检查…',
    latest: `已是最新版本${at}`,
    available: `发现新版本 ${info?.version}${info?.skipped ? '（已跳过）' : ''}`,
    downloading: `正在下载 ${info?.version}`,
    ready: `${info?.version} 已下载，重启即可完成更新`,
    installing: '正在安装…'
  }[u.status]
  return { text, error: false }
}

export type UpdateIcon = 'available' | 'loading' | 'restart' | 'error'

/** 侧边栏的更新入口：有新版本（没跳过）、下载中、待重启、安装中、出错时显示 */
export function updateEntry(u: UpdateState | null): { icon: UpdateIcon; label: string } | null {
  if (!u || !('info' in u) || !u.info) return null
  switch (u.status) {
    case 'available':
      return u.info.skipped ? null : { icon: 'available', label: `新版本 ${u.info.version}` }
    case 'downloading':
      return { icon: 'loading', label: `下载更新 ${u.total ? Math.floor((u.done / u.total) * 100) : 0}%` }
    case 'ready':
      return { icon: 'restart', label: '重启以完成更新' }
    case 'installing':
      return { icon: 'loading', label: '正在安装更新…' }
    case 'error':
      return { icon: 'error', label: '更新失败' }
  }
}

/** MCP 服务的地址、客户端 JSON 配置和 Claude Code 命令 */
export function mcpClientConfig(port: number, token: string): { endpoint: string; json: string; command: string } {
  const endpoint = `http://127.0.0.1:${port}/mcp`
  const json = JSON.stringify(
    { mcpServers: { 'bili-downloader': { type: 'http', url: endpoint, headers: { Authorization: `Bearer ${token}` } } } },
    null,
    2
  )
  const command = `claude mcp add --transport http bili-downloader ${endpoint} --header "Authorization: Bearer ${token}"`
  return { endpoint, json, command }
}

export const pingLabel = (ms: number | null | undefined): string => (ms === null ? '不通' : `${ms} ms`)

/** CDN 测速结果按耗时从快到慢，不通的排最后 */
export function sortPings<H extends { host: string }>(
  hosts: H[],
  pings: Record<string, number | null>
): (H & { ms: number | null })[] {
  return hosts.map((h) => ({ ...h, ms: pings[h.host] })).sort((a, b) => (a.ms ?? 1e9) - (b.ms ?? 1e9))
}

/** 粘贴的内容：多个链接直接批量解析，单个链接立即解析，其它照常粘贴 */
export function classifyPaste(text: string): { type: 'batch'; inputs: string[] } | { type: 'single' } | { type: 'none' } {
  const inputs = extractInputs(text)
  if (inputs.length > 1) return { type: 'batch', inputs }
  return parseInput(text) ? { type: 'single' } : { type: 'none' }
}
