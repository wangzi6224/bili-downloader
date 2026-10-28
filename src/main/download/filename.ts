import { existsSync } from 'node:fs'

/** APFS 文件名上限 255 字节，留出扩展名、序号和 .part 等后缀的空间 */
const MAX_BYTES = 180

export function sanitize(name: string): string {
  let s = name
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/\//g, '／')
    .replace(/:/g, '：')
    .replace(/[\\*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
  if (!s) s = '未命名'
  while (Buffer.byteLength(s) > MAX_BYTES) s = [...s].slice(0, -1).join('')
  return s.trim()
}

/** 多选时放进以标题命名的文件夹，序号补零便于排序 */
export function buildRelBase(
  title: string,
  item: { title: string; index: number },
  multi: boolean,
  maxIndex: number
): string {
  if (multi) {
    const width = Math.max(2, String(maxIndex).length)
    return `${sanitize(title)}/${String(item.index).padStart(width, '0')} - ${sanitize(item.title)}`
  }
  return item.title === title ? sanitize(title) : sanitize(`${title} - ${item.title}`)
}

/** 目标已存在时追加 (1)、(2)… */
export function uniquePath(base: string, ext: string): string {
  let p = `${base}${ext}`
  for (let i = 1; existsSync(p); i++) p = `${base} (${i})${ext}`
  return p
}
