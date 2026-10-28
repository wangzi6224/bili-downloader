export function fmtBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toFixed(i >= 2 ? 1 : 0)} ${units[i]}`
}

export const fmtSpeed = (n: number): string => `${fmtBytes(n)}/s`

export function fmtDuration(sec?: number): string {
  if (!sec) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const pad = (x: number): string => String(x).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** 剩余时间：超过一天的不显示，避免刚开始测速时出现离谱的数字 */
export function fmtEta(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0 || sec > 86400) return ''
  if (sec < 60) return `${Math.ceil(sec)} 秒`
  if (sec < 3600) return `${Math.floor(sec / 60)} 分 ${Math.floor(sec % 60)} 秒`
  return `${Math.floor(sec / 3600)} 小时 ${Math.floor((sec % 3600) / 60)} 分`
}

/** B站图片加尺寸参数，减小缩略图体积 */
export const thumb = (url: string | undefined, w: number): string | undefined =>
  url ? `${url.replace(/^http:/, 'https:')}@${w}w.webp` : undefined
