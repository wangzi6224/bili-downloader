import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeZip } from '../../test/zip'
import { entryData, readEntries, safeTarget, unzip } from './unzip'

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'unzip-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const write = (buf: Buffer): string => {
  const f = join(dir, 'a.zip')
  writeFileSync(f, buf)
  return f
}

describe('readEntries', () => {
  it('读出名字、压缩方式、大小和 unix 权限；结尾带注释也能找到', () => {
    const entries = readEntries(makeZip([
      { name: '_internal/', method: 0 },
      { name: 'yt-dlp_macos', data: 'bin', mode: 0o100755 },
      { name: 'win.txt', data: 'x', dos: true }
    ], 'comment'))
    expect(entries.map((e) => [e.name, e.method, e.size, e.mode, e.dir])).toEqual([
      ['_internal/', 0, 0, 0o755, true],
      ['yt-dlp_macos', 8, 3, 0o755, false],
      ['win.txt', 8, 1, undefined, false]
    ])
  })

  it('没打 UTF-8 标记的名字按 latin1 读', () => {
    expect(readEntries(makeZip([{ name: 'caf\u00e9', utf8: false }]))[0].name).toBe('café')
  })

  it('不是 zip、zip64、目录损坏、加密的条目都报错', () => {
    expect(() => readEntries(Buffer.alloc(40))).toThrow('不是 zip 文件')
    const z64 = makeZip([{ name: 'a' }])
    z64.writeUInt16LE(0xffff, z64.length - 12)
    expect(() => readEntries(z64)).toThrow('zip64')
    const broken = makeZip([{ name: 'a' }])
    broken.writeUInt32LE(broken.length, broken.length - 6)
    expect(() => readEntries(broken)).toThrow('中央目录损坏')
    expect(() => readEntries(makeZip([{ name: 'a', encrypted: true }]))).toThrow('加密')
  })
})

describe('safeTarget', () => {
  it.each(['../evil', 'a/../../evil', '/etc/passwd', 'C:\\evil', '..\\evil', ''])('拒绝 %s', (name) => {
    expect(() => safeTarget(dir, name)).toThrow('不安全的路径')
  })

  it('正常路径解到目标目录里，反斜杠当分隔符', () => {
    expect(safeTarget(dir, 'a/b.txt')).toBe(join(dir, 'a', 'b.txt'))
    expect(safeTarget(dir, 'a\\b.txt')).toBe(join(dir, 'a', 'b.txt'))
  })
})

describe('entryData', () => {
  it('不认识的压缩方式、大小对不上、本地头损坏都报错', async () => {
    const odd = makeZip([{ name: 'a', data: 'x', method: 0 }])
    const [e] = readEntries(odd)
    await expect(entryData(odd, { ...e, method: 12 })).rejects.toThrow('不支持的压缩方式 12')
    await expect(entryData(odd, { ...e, offset: 1 })).rejects.toThrow('条目损坏')
    const bad = makeZip([{ name: 'a', data: 'xy', badSize: true }])
    await expect(entryData(bad, readEntries(bad)[0])).rejects.toThrow('大小不对')
  })
})

describe('unzip', () => {
  it('解出目录和文件，还原可执行权限，返回顶层文件名', async () => {
    const top = await unzip(write(makeZip([
      { name: '_internal/', method: 0 },
      { name: '_internal/lib/x.so', data: 'so', method: 0 },
      { name: 'yt-dlp_macos', data: '#!bin', mode: 0o100755 },
      { name: 'LICENSE', data: 'u'.repeat(1000) }
    ])), join(dir, 'out'))
    expect(top.sort()).toEqual(['LICENSE', 'yt-dlp_macos'])
    expect(readFileSync(join(dir, 'out', '_internal', 'lib', 'x.so'), 'utf8')).toBe('so')
    expect(readFileSync(join(dir, 'out', 'LICENSE'), 'utf8')).toBe('u'.repeat(1000))
    if (process.platform !== 'win32') expect(statSync(join(dir, 'out', 'yt-dlp_macos')).mode & 0o777).toBe(0o755)
  })

  it('有不安全的路径时整个拒绝', async () => {
    await expect(unzip(write(makeZip([{ name: '../evil', data: 'x' }])), join(dir, 'out'))).rejects.toThrow('不安全')
  })

  it('中止时停下', async () => {
    const ac = new AbortController()
    ac.abort(new Error('stop'))
    await expect(unzip(write(makeZip([{ name: 'a', data: 'x' }])), join(dir, 'out'), ac.signal)).rejects.toThrow('stop')
  })
})
