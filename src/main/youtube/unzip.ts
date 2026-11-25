// 解开 yt-dlp 的单目录压缩包。项目里没有 zip 依赖，这里只支持它用到的：不压缩和 deflate、不分卷、不加密、非 zip64
import { chmod, mkdir, open, writeFile } from 'node:fs/promises'
import { isAbsolute, join, normalize, sep } from 'node:path'
import { promisify } from 'node:util'
import { inflateRaw } from 'node:zlib'

const inflate = promisify(inflateRaw)

export interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  size: number
  /** 本地文件头的位置 */
  offset: number
  /** unix 权限位；压缩包没记录时为空 */
  mode?: number
  dir: boolean
}

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50
const LOC_SIG = 0x04034b50

/** 从中央目录读出全部条目 */
export function readEntries(buf: Buffer): ZipEntry[] {
  // 中央目录结尾记录在最后 22 字节加可能的注释（最长 64KB）里
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('不是 zip 文件')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  if (count === 0xffff || p === 0xffffffff) throw new Error('不支持 zip64')
  const entries: ZipEntry[] = []
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) throw new Error('zip 中央目录损坏')
    const flags = buf.readUInt16LE(p + 8)
    const method = buf.readUInt16LE(p + 10)
    const compressedSize = buf.readUInt32LE(p + 20)
    const size = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const madeBy = buf.readUInt16LE(p + 4) >> 8
    const external = buf.readUInt32LE(p + 38)
    const offset = buf.readUInt32LE(p + 42)
    const name = buf.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nameLen)
    if (flags & 1) throw new Error(`不支持加密的条目：${name}`)
    // 3 是 unix 创建的，高 16 位是 st_mode
    const mode = madeBy === 3 ? (external >>> 16) & 0o777 : undefined
    entries.push({ name, method, compressedSize, size, offset, mode: mode || undefined, dir: name.endsWith('/') })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

/** 条目要解到的位置；带 .. 或绝对路径、会写到目标目录外面的条目拒绝 */
export function safeTarget(root: string, name: string): string {
  const rel = normalize(name.replace(/\\/g, '/'))
  if (!rel || rel === '.' || isAbsolute(rel) || /^[A-Za-z]:/.test(rel) || rel === '..' || rel.startsWith(`..${sep}`) || rel.split(sep).includes('..')) {
    throw new Error(`压缩包里有不安全的路径：${name}`)
  }
  return join(root, rel)
}

/** 解出一个条目的内容 */
export async function entryData(buf: Buffer, e: ZipEntry): Promise<Buffer> {
  if (buf.readUInt32LE(e.offset) !== LOC_SIG) throw new Error(`zip 条目损坏：${e.name}`)
  const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28)
  const raw = buf.subarray(start, start + e.compressedSize)
  let data: Buffer
  if (e.method === 0) data = raw
  else if (e.method === 8) data = await inflate(raw)
  else throw new Error(`不支持的压缩方式 ${e.method}：${e.name}`)
  if (data.length !== e.size) throw new Error(`zip 条目大小不对：${e.name}`)
  return data
}

/** 把压缩包解到 dest（目录要不存在或为空）；返回顶层的文件名 */
export async function unzip(file: string, dest: string, signal?: AbortSignal): Promise<string[]> {
  const fh = await open(file, 'r')
  let buf: Buffer
  try {
    buf = await fh.readFile()
  } finally {
    await fh.close()
  }
  const entries = readEntries(buf)
  await mkdir(dest, { recursive: true })
  const top = new Set<string>()
  for (const e of entries) {
    if (signal?.aborted) throw signal.reason
    const target = safeTarget(dest, e.name)
    const first = e.name.replace(/\\/g, '/').split('/')[0]
    if (e.dir) {
      await mkdir(target, { recursive: true })
      continue
    }
    if (!e.name.includes('/')) top.add(first)
    await mkdir(join(target, '..'), { recursive: true })
    await writeFile(target, await entryData(buf, e))
    if (e.mode && process.platform !== 'win32') await chmod(target, e.mode)
  }
  return [...top]
}
