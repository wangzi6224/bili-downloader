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

/** B站图片加尺寸参数，减小缩略图体积 */
export const thumb = (url: string | undefined, w: number): string | undefined =>
  url ? `${url.replace(/^http:/, 'https:')}@${w}w.webp` : undefined
