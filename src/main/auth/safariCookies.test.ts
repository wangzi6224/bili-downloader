import { describe, expect, it } from 'vitest'
import { parseBinaryCookies } from './safariCookies'

interface Row {
  domain: string
  name: string
  path?: string
  value: string
  flags?: number
  /** unix 秒 */
  expires?: number
}

const MAC_EPOCH = 978307200

/** 按真实布局造一条记录：56 字节的头，后面跟各个字符串 */
function record(r: Row): Buffer {
  const strings = [r.domain, r.name, r.path ?? '/', r.value].map((s) => Buffer.from(`${s}\0`))
  const head = Buffer.alloc(56)
  let at = head.length
  const offsets = strings.map((s) => {
    const here = at
    at += s.length
    return here
  })
  head.writeUInt32LE(at, 0)
  head.writeUInt32LE(r.flags ?? 0, 8)
  offsets.forEach((o, i) => head.writeUInt32LE(o, 16 + i * 4))
  head.writeDoubleLE((r.expires ?? 1_800_000_000) - MAC_EPOCH + 0.5, 40)
  return Buffer.concat([head, ...strings])
}

function page(rows: Row[]): Buffer {
  const records = rows.map(record)
  const head = Buffer.alloc(8 + rows.length * 4)
  head.writeUInt32BE(0x00000100, 0)
  head.writeUInt32LE(rows.length, 4)
  let at = head.length
  records.forEach((r, i) => {
    head.writeUInt32LE(at, 8 + i * 4)
    at += r.length
  })
  return Buffer.concat([head, ...records])
}

function file(pages: Row[][]): Buffer {
  const bodies = pages.map(page)
  const head = Buffer.alloc(8 + pages.length * 4)
  head.write('cook', 0, 'latin1')
  head.writeUInt32BE(pages.length, 4)
  bodies.forEach((b, i) => head.writeUInt32BE(b.length, 8 + i * 4))
  // 结尾的校验和、属性列表不用解析
  return Buffer.concat([head, ...bodies, Buffer.from('checksum')])
}

describe('parseBinaryCookies', () => {
  it('逐字段读出，flags 里第 1 位是 secure、第 3 位是 httpOnly，过期时间取整', () => {
    expect(
      parseBinaryCookies(
        file([[{ domain: '.bilibili.com', name: 'SESSDATA', value: 'a%2Cb', path: '/x', flags: 5, expires: 1_800_000_000 }]])
      )
    ).toEqual([
      {
        domain: '.bilibili.com',
        name: 'SESSDATA',
        value: 'a%2Cb',
        path: '/x',
        secure: true,
        httpOnly: true,
        expires: 1_800_000_000,
        sameSite: 'unspecified'
      }
    ])
  })

  it('跨页读取，每页多条', () => {
    const c = parseBinaryCookies(
      file([
        [
          { domain: 'a.bilibili.com', name: 'a', value: '1' },
          { domain: 'b.bilibili.com', name: 'b', value: '2', flags: 1 }
        ],
        [{ domain: 'c.example.com', name: 'c', value: '中文' }]
      ])
    )
    expect(c.map((x) => [x.domain, x.name, x.value, x.secure, x.httpOnly])).toEqual([
      ['a.bilibili.com', 'a', '1', false, false],
      ['b.bilibili.com', 'b', '2', true, false],
      ['c.example.com', 'c', '中文', false, false]
    ])
  })

  it('没有 Cookie 的文件', () => {
    expect(parseBinaryCookies(file([]))).toEqual([])
    expect(parseBinaryCookies(file([[]]))).toEqual([])
  })

  it('不是这种文件时报错', () => {
    expect(() => parseBinaryCookies(Buffer.from('not cookies'))).toThrow('不是 Safari 的 Cookie 文件')
  })

  it('页标记不对时报错', () => {
    const f = file([[{ domain: 'x', name: 'y', value: 'z' }]])
    f.writeUInt32BE(0xdeadbeef, 12)
    expect(() => parseBinaryCookies(f)).toThrow('Safari Cookie 文件已损坏')
  })

  it('字符串偏移越界时报错，不读出乱码', () => {
    const f = file([[{ domain: 'x', name: 'y', value: 'z' }]])
    // 文件头 12 字节 + 页头 12 字节 + DOMAIN 字段的位置
    f.writeUInt32LE(100_000, 12 + 12 + 16)
    expect(() => parseBinaryCookies(f)).toThrow('Safari Cookie 文件已损坏')
  })
})
