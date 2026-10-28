// 主进程和界面预览共用，不能依赖 Node 的 Buffer

/** APFS 文件名上限 255 字节，留出扩展名、序号和 .part 等后缀的空间 */
const MAX_BYTES = 180
const encoder = new TextEncoder()
const byteLength = (s: string): number => encoder.encode(s).length

export function sanitize(name: string): string {
  let s = name
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\//g, '／')
    .replace(/:/g, '：')
    .replace(/[\\*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.-]+/, '')
    .replace(/[. ]+$/, '')
  if (!s) s = '未命名'
  while (byteLength(s) > MAX_BYTES) s = [...s].slice(0, -1).join('')
  return s.trim()
}
