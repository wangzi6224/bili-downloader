import { DATE_LOCALE, getLanguage, t } from '@shared/i18n'
import { extractInputs, parseInput } from '@shared/parseUrl'
import type { AudioPref, CodecPref, DownloadOptions, StreamInfo, UpdateState } from '@shared/types'

export type EditableOptions = Omit<DownloadOptions, 'qn'>

/** 前三项是 getter，读取时才按当前语言取 */
export const AUDIO_LABEL: Record<AudioPref, string> = {
  get best() {
    return t('view.audioBest')
  },
  get flac() {
    return t('view.audioFlac')
  },
  get dolby() {
    return t('view.audioDolby')
  },
  '192k': '192K',
  '132k': '132K',
  '64k': '64K'
}

/** 底部“这次会下载什么”的标签，避免下完才发现没有声音 */
export function summaryTags(o: EditableOptions, info?: StreamInfo | null): string[] {
  const tags: string[] = []
  const hasAudio = !info || info.hasAudio
  if (o.output !== 'audio') tags.push(t('view.tagVideo', { container: o.container.toUpperCase() }))
  if (o.output !== 'video' && hasAudio) tags.push(t('view.tagAudio', { audio: AUDIO_LABEL[o.audio] }))
  if (o.output === 'video') tags.push(t('view.tagMuted'))
  if (o.embedCover || o.cover) tags.push(t('view.tagCover'))
  if (o.output !== 'audio') {
    if (o.embedSubtitle || o.subtitle) tags.push(t('view.tagSubtitle'))
    if (o.chapters) tags.push(t('view.tagChapters'))
    if (o.danmaku) tags.push(t('view.tagDanmaku'))
    if (o.watermark === 'auto') tags.push(t('view.tagWatermark'))
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

function updateText(u: Exclude<UpdateState, { status: 'error' }>): string {
  switch (u.status) {
    case 'idle':
      return t('view.updateIdle')
    case 'checking':
      return t('view.updateChecking')
    case 'latest':
      if (!u.checkedAt) return t('view.updateLatest')
      return t('view.updateLatestAt', {
        time: new Date(u.checkedAt).toLocaleTimeString(DATE_LOCALE[getLanguage()], { hour: '2-digit', minute: '2-digit' })
      })
    case 'available':
      return t(u.info.skipped ? 'view.updateAvailableSkipped' : 'view.updateAvailable', { version: u.info.version })
    case 'downloading':
      return t('view.updateDownloading', { version: u.info.version })
    case 'ready':
      return t('view.updateReady', { version: u.info.version })
    case 'installing':
      return t('view.updateInstalling')
  }
}

/** 设置页“当前版本”下面的说明；error 为 true 时显示成红字 */
export function updateHint(u: UpdateState | null): { text: string; error: boolean } | null {
  if (!u) return null
  if (u.status === 'error') return { text: u.error, error: true }
  return { text: updateText(u), error: false }
}

export type UpdateIcon = 'available' | 'loading' | 'restart' | 'error'

/** 侧边栏的更新入口：有新版本（没跳过）、下载中、待重启、安装中、出错时显示 */
export function updateEntry(u: UpdateState | null): { icon: UpdateIcon; label: string } | null {
  if (!u || !('info' in u) || !u.info) return null
  switch (u.status) {
    case 'available':
      return u.info.skipped ? null : { icon: 'available', label: t('view.entryAvailable', { version: u.info.version }) }
    case 'downloading':
      return { icon: 'loading', label: t('view.entryDownloading', { pct: u.total ? Math.floor((u.done / u.total) * 100) : 0 }) }
    case 'ready':
      return { icon: 'restart', label: t('view.entryRestart') }
    case 'installing':
      return { icon: 'loading', label: t('view.entryInstalling') }
    case 'error':
      return { icon: 'error', label: t('view.entryError') }
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

export const pingLabel = (ms: number | null | undefined): string => (ms === null ? t('view.pingFailed') : `${ms} ms`)

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
