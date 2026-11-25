import { deflateRawSync } from 'node:zlib'

export interface ZipSpec {
  name: string
  data?: string
  method?: 0 | 8
  mode?: number
  /** 不是 unix 创建的（例如 Windows 上打的包），没有权限位 */
  dos?: boolean
  utf8?: boolean
  encrypted?: boolean
  badSize?: boolean
}

/** 拼一个最小的 zip：本地文件头 + 数据，再加中央目录和结尾记录 */
export function makeZip(specs: ZipSpec[], comment = ''): Buffer {
  const locals: Buffer[] = []
  const cens: Buffer[] = []
  let offset = 0
  for (const s of specs) {
    const name = Buffer.from(s.name, s.utf8 === false ? 'latin1' : 'utf8')
    const raw = Buffer.from(s.data ?? '')
    const method = s.method ?? 8
    const body = method === 8 ? deflateRawSync(raw) : raw
    const flags = (s.utf8 === false ? 0 : 0x800) | (s.encrypted ? 1 : 0)
    const loc = Buffer.alloc(30)
    loc.writeUInt32LE(0x04034b50, 0)
    loc.writeUInt16LE(flags, 6)
    loc.writeUInt16LE(method, 8)
    loc.writeUInt32LE(body.length, 18)
    loc.writeUInt32LE(raw.length, 22)
    loc.writeUInt16LE(name.length, 26)
    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0)
    cen.writeUInt16LE(((s.dos ? 0 : 3) << 8) | 20, 4)
    cen.writeUInt16LE(flags, 8)
    cen.writeUInt16LE(method, 10)
    cen.writeUInt32LE(body.length, 20)
    cen.writeUInt32LE(raw.length + (s.badSize ? 1 : 0), 24)
    cen.writeUInt16LE(name.length, 28)
    const mode = s.mode ?? (s.name.endsWith('/') ? 0o40755 : 0o100644)
    cen.writeUInt32LE(s.dos ? 0 : (mode << 16) >>> 0, 38)
    cen.writeUInt32LE(offset, 42)
    locals.push(loc, name, body)
    cens.push(cen, name)
    offset += loc.length + name.length + body.length
  }
  const cenBuf = Buffer.concat(cens)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(specs.length, 8)
  end.writeUInt16LE(specs.length, 10)
  end.writeUInt32LE(cenBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(comment.length, 20)
  return Buffer.concat([...locals, cenBuf, end, Buffer.from(comment)])
}
