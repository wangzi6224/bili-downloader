import type { PlainCookie } from './session'

/**
 * 解析 Safari 的 Cookies.binarycookies。文件开头的页数、页大小是大端，页里面的内容都是小端：
 *   文件：'cook' + 页数 + 每页大小 + 各页
 *   页：00 00 01 00 + Cookie 条数 + 每条相对页开头的偏移
 *   记录：大小、未知、flags、未知、domain/name/path/value 相对记录开头的偏移、8 字节未知、过期时间、创建时间
 */

const MAGIC = 'cook'
const PAGE_MAGIC = 0x00000100
const SECURE = 0x1
const HTTP_ONLY = 0x4
/** 过期时间从 2001-01-01 UTC 算起 */
const MAC_EPOCH = 978307200

const FLAGS = 8
const DOMAIN = 16
const NAME = 20
const PATH = 24
const VALUE = 28
const EXPIRES = 40

/** 从 start 读到 \0 为止；越界说明文件坏了，抛错而不是读出乱码 */
function cString(buf: Buffer, start: number): string {
  const end = buf.indexOf(0, start)
  if (start >= buf.length || end < 0) throw new Error('Safari Cookie 文件已损坏')
  return buf.toString('utf8', start, end)
}

function parseRecord(rec: Buffer): PlainCookie {
  const flags = rec.readUInt32LE(FLAGS)
  const expires = Math.floor(rec.readDoubleLE(EXPIRES) + MAC_EPOCH)
  return {
    domain: cString(rec, rec.readUInt32LE(DOMAIN)),
    name: cString(rec, rec.readUInt32LE(NAME)),
    value: cString(rec, rec.readUInt32LE(VALUE)),
    path: cString(rec, rec.readUInt32LE(PATH)),
    secure: Boolean(flags & SECURE),
    httpOnly: Boolean(flags & HTTP_ONLY),
    expires,
    // 文件里记的 SameSite 含义没有公开文档，不猜
    sameSite: 'unspecified'
  }
}

function parsePage(page: Buffer): PlainCookie[] {
  if (page.readUInt32BE(0) !== PAGE_MAGIC) throw new Error('Safari Cookie 文件已损坏')
  const count = page.readUInt32LE(4)
  const out: PlainCookie[] = []
  for (let i = 0; i < count; i++) {
    const start = page.readUInt32LE(8 + i * 4)
    const size = page.readUInt32LE(start)
    out.push(parseRecord(page.subarray(start, start + size)))
  }
  return out
}

export function parseBinaryCookies(file: Buffer): PlainCookie[] {
  if (file.toString('latin1', 0, 4) !== MAGIC) throw new Error('不是 Safari 的 Cookie 文件')
  const pages = file.readUInt32BE(4)
  const out: PlainCookie[] = []
  let offset = 8 + pages * 4
  for (let i = 0; i < pages; i++) {
    const size = file.readUInt32BE(8 + i * 4)
    out.push(...parsePage(file.subarray(offset, offset + size)))
    offset += size
  }
  return out
}
