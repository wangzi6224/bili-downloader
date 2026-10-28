import { describe, expect, it } from 'vitest'
import { compareVersions, notesSince, parseManifest } from './manifest'

describe('compareVersions', () => {
  it('按数字比较各段', () => {
    expect(compareVersions('0.2.0', '0.1.9')).toBe(1)
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('v1.2.3', '1.2.4')).toBe(-1)
  })

  it('预发布版本比正式版小', () => {
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1)
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBe(1)
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.10')).toBe(-1)
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1)
    expect(compareVersions('1.0.0-beta', '1.0.0-beta.1')).toBe(-1)
  })

  it('格式不对时报错', () => {
    expect(() => compareVersions('1.0', '1.0.0')).toThrow('1.0')
  })
})

const valid = {
  version: '0.3.0',
  date: '2026-11-01T00:00:00.000Z',
  page: 'https://github.com/o/r/releases/tag/v0.3.0',
  notes: [
    { version: '0.1.0', date: '2026-10-01', body: '首个版本' },
    { version: '0.3.0', date: '2026-11-01', body: '- 新增应用内更新' },
    { version: '0.2.0', date: '2026-10-15', body: '- 修复若干问题' },
    { version: 'bad', body: '版本号不对，丢掉' },
    { version: '0.2.5' }
  ],
  files: {
    arm64: { url: 'https://github.com/o/r/releases/download/v0.3.0/a.zip', sha512: 'abc', size: 100 }
  }
}

describe('parseManifest', () => {
  it('解析合法的清单，丢掉无效的说明', () => {
    const m = parseManifest(valid)
    expect(m.version).toBe('0.3.0')
    expect(m.files.arm64?.size).toBe(100)
    expect(m.notes.map((n) => n.version)).toEqual(['0.1.0', '0.3.0', '0.2.0'])
  })

  it('拒绝不完整或不安全的清单', () => {
    expect(() => parseManifest(null)).toThrow('不是 JSON 对象')
    expect(() => parseManifest({ ...valid, version: 'latest' })).toThrow('version')
    expect(() => parseManifest({ ...valid, page: 'http://example.com' })).toThrow('page')
    expect(() =>
      parseManifest({ ...valid, files: { x64: { url: 'http://example.com/a.zip', sha512: 'abc', size: 1 } } })
    ).toThrow('files.x64.url')
    expect(() =>
      parseManifest({ ...valid, files: { x64: { url: 'https://example.com/a.zip', sha512: '', size: 1 } } })
    ).toThrow('files.x64.sha512')
    expect(() =>
      parseManifest({ ...valid, files: { x64: { url: 'https://example.com/a.zip', sha512: 'abc', size: 0 } } })
    ).toThrow('files.x64.size')
  })

  it('只有本地测试时才接受本机 http 地址', () => {
    const local = {
      ...valid,
      page: 'http://127.0.0.1:8765/',
      files: { arm64: { url: 'http://127.0.0.1:8765/a.zip', sha512: 'abc', size: 1 } }
    }
    expect(() => parseManifest(local)).toThrow('page')
    expect(parseManifest(local, true).files.arm64?.url).toBe('http://127.0.0.1:8765/a.zip')
    expect(() => parseManifest({ ...local, page: 'http://evil.com/' }, true)).toThrow('page')
  })
})

describe('notesSince', () => {
  it('只要当前版本之后、最新版本及以前的，新的在前', () => {
    const { notes } = parseManifest(valid)
    expect(notesSince(notes, '0.1.0', '0.3.0').map((n) => n.version)).toEqual(['0.3.0', '0.2.0'])
    expect(notesSince(notes, '0.2.0', '0.2.0')).toEqual([])
  })
})
