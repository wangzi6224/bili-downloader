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

describe('compareVersions 剩余分支', () => {
  it('主版本、次版本不同时直接决定大小', () => {
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1)
    expect(compareVersions(' 1.0.0 ', 'v1.0.0')).toBe(0)
  })

  it('预发布后缀逐段比较：数字按大小，文字按字典序，段多的更大', () => {
    expect(compareVersions('1.0.0-beta.1', '1.0.0-beta')).toBe(1)
    expect(compareVersions('1.0.0-rc.1', '1.0.0-beta.9')).toBe(1)
    expect(compareVersions('1.0.0-beta.1', '1.0.0-beta.1')).toBe(0)
    expect(compareVersions('1.0.0-1', '1.0.0-alpha')).toBe(-1)
    expect(compareVersions('0.9.0-beta', '1.0.0')).toBe(-1)
  })

  it('报错信息指出格式不对的那一个', () => {
    expect(() => compareVersions('1.0.0', 'x')).toThrow('版本号格式不对：x')
    expect(() => compareVersions('y', '1.0.0')).toThrow('版本号格式不对：y')
  })
})

describe('parseManifest 剩余分支', () => {
  const file = { url: 'https://example.com/a.zip', sha512: 'abc', size: 1 }

  it('files 缺失或条目为空时报错', () => {
    expect(() => parseManifest({ ...valid, files: undefined })).toThrow('files')
    expect(() => parseManifest({ ...valid, files: 'x' })).toThrow('files')
    expect(() => parseManifest({ ...valid, files: { arm64: null } })).toThrow('files.arm64.url')
    expect(() => parseManifest({ ...valid, files: { arm64: { ...file, url: 1 } } })).toThrow('files.arm64.url')
    expect(() => parseManifest({ ...valid, files: { arm64: { ...file, sha512: 1 } } })).toThrow('files.arm64.sha512')
    expect(() => parseManifest({ ...valid, files: { arm64: { ...file, size: '1' } } })).toThrow('files.arm64.size')
    expect(() => parseManifest({ ...valid, version: 1 })).toThrow('version')
    expect(() => parseManifest('str')).toThrow('不是 JSON 对象')
  })

  it('本地测试模式也不接受伪装成本机的域名', () => {
    const at = (page: string) => () => parseManifest({ ...valid, page }, true)
    expect(at('http://localhost.evil.com/')).toThrow('page')
    expect(at('http://127.0.0.1.evil.com/')).toThrow('page')
    expect(at('http://localhost:8080')).toThrow('page')
    expect(parseManifest({ ...valid, page: 'http://localhost:8080/r' }, true).page).toBe('http://localhost:8080/r')
    expect(parseManifest({ ...valid, page: 'http://localhost/r' }, true).page).toBe('http://localhost/r')
  })

  it('notes 不是数组时当作没有说明', () => {
    expect(parseManifest({ ...valid, notes: 'x' }).notes).toEqual([])
    expect(parseManifest({ ...valid, notes: { version: '0.3.0', body: 'b' } }).notes).toEqual([])
    expect(parseManifest({ ...valid, notes: undefined }).notes).toEqual([])
  })

  it('丢掉空的说明，缺日期时补空字符串', () => {
    const m = parseManifest({ ...valid, notes: [null, { version: '0.3.0', body: 'b', date: 1 }] })
    expect(m.notes).toEqual([{ version: '0.3.0', date: '', body: 'b' }])
  })

  it('date 不是字符串时置空，只保留需要的字段', () => {
    const m = parseManifest({ ...valid, date: 123, files: { x64: { ...file, extra: 'x' } } })
    expect(m.date).toBe('')
    expect(m.files).toEqual({ x64: file })
  })
})

describe('notesSince 预发布版本', () => {
  it('预发布版本按版本号排序和截取', () => {
    const notes = [
      { version: '1.0.0', date: '', body: '' },
      { version: '1.0.0-beta.2', date: '', body: '' },
      { version: '1.0.0-beta.1', date: '', body: '' },
      { version: '1.0.0-beta.10', date: '', body: '' }
    ]
    expect(notesSince(notes, '1.0.0-beta.1', '1.0.0').map((n) => n.version)).toEqual(['1.0.0', '1.0.0-beta.10', '1.0.0-beta.2'])
    expect(notesSince(notes, '0.9.0', '1.0.0-beta.2').map((n) => n.version)).toEqual(['1.0.0-beta.2', '1.0.0-beta.1'])
  })
})
