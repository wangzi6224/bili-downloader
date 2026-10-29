import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assetKey, compareVersions, parseManifest } from '../../src/main/update/manifest'
import { PACKAGES, assetName, buildManifest, isPrerelease, manifestAsset, parseChangelog } from './release.mjs'

const CHANGELOG = `# 更新日志

## 未发布

- 还没发的改动

## 1.2.0 - 2026-10-01

- 新功能

### 修复

- 修了一个问题

## v1.1.0-beta.2 – 2026-09-01
- 预发布

## 1.0.0
第一版

# 附录

不算任何版本
`

describe('parseChangelog', () => {
  it('按“## 版本号 - 日期”分段，三级标题留在正文里', () => {
    const notes = parseChangelog(CHANGELOG)
    expect(notes.map((n) => n.version)).toEqual(['1.2.0', '1.1.0-beta.2', '1.0.0'])
    expect(notes[0]).toEqual({ version: '1.2.0', date: '2026-10-01', body: '- 新功能\n\n### 修复\n\n- 修了一个问题' })
  })

  it('接受 v 前缀和长破折号，没有日期时为空', () => {
    const notes = parseChangelog(CHANGELOG)
    expect(notes[1]).toMatchObject({ version: '1.1.0-beta.2', date: '2026-09-01', body: '- 预发布' })
    expect(notes[2]).toMatchObject({ version: '1.0.0', date: '' })
  })

  it('“未发布”和一级标题会结束当前段，内容不算进任何版本', () => {
    const notes = parseChangelog(CHANGELOG)
    expect(notes[2].body).toBe('第一版')
    expect(notes.some((n) => n.body.includes('还没发'))).toBe(false)
  })

  it('不是版本号的二级标题不算', () => {
    expect(parseChangelog('## 1.0\n\nx\n\n## 1.0.0 - 2026-01-01 补充说明\n')).toEqual([])
  })

  it('项目里的 CHANGELOG.md 每个版本号都是应用能比较的格式', () => {
    const notes = parseChangelog(readFileSync('CHANGELOG.md', 'utf8'))
    expect(notes.length).toBeGreaterThan(0)
    for (const n of notes) expect(() => compareVersions(n.version, '0.0.0')).not.toThrow()
  })
})

describe('assetName / isPrerelease', () => {
  it('安装包按版本和架构命名', () => {
    expect(assetName('1.2.0', 'arm64', 'zip')).toBe('bili-downloader-1.2.0-arm64.zip')
    expect(PACKAGES.map((p) => assetName('1.2.0', p.arch, p.ext))).toEqual([
      'bili-downloader-1.2.0-arm64.zip',
      'bili-downloader-1.2.0-arm64.dmg',
      'bili-downloader-1.2.0-x64.zip',
      'bili-downloader-1.2.0-x64.dmg',
      'bili-downloader-1.2.0-x86_64.AppImage',
      'bili-downloader-1.2.0-amd64.deb'
    ])
  })

  it('能自动更新的包在 update.json 里的键，正是各系统上应用去取的那个', () => {
    expect(PACKAGES.filter((p) => p.updateKey).map((p) => [p.ext, p.updateKey])).toEqual([
      ['zip', assetKey('darwin', 'arm64')],
      ['zip', assetKey('darwin', 'x64')],
      ['AppImage', assetKey('linux', 'x64')]
    ])
  })

  it('带后缀的是预发布版本', () => {
    expect(isPrerelease('1.0.0-beta.1')).toBe(true)
    expect(isPrerelease('1.0.0')).toBe(false)
  })
})

describe('manifestAsset / buildManifest', () => {
  const data = Buffer.from('zip 内容')

  it('下载地址指向 Release，文件名做 URL 编码，sha512 是 base64', () => {
    const f = manifestAsset('me/repo', '1.2.0', 'bili downloader+.zip', data)
    expect(f.url).toBe('https://github.com/me/repo/releases/download/v1.2.0/bili%20downloader%2B.zip')
    expect(f.sha512).toBe(createHash('sha512').update(data).digest('base64'))
    expect(f.size).toBe(data.length)
  })

  it('生成的 update.json 能通过应用里的校验', () => {
    const files = Object.fromEntries(
      PACKAGES.filter((p) => p.updateKey).map((p) => [p.updateKey, manifestAsset('me/repo', '1.2.0', assetName('1.2.0', p.arch, p.ext), data)])
    )
    const notes = parseChangelog(CHANGELOG)
    const manifest = buildManifest({ repo: 'me/repo', version: '1.2.0', date: '2026-10-01T00:00:00.000Z', notes, files })
    expect(manifest.page).toBe('https://github.com/me/repo/releases/tag/v1.2.0')
    // 和写进 dist/update.json 一样经过一次 JSON 序列化
    const parsed = parseManifest(JSON.parse(JSON.stringify(manifest)))
    expect(parsed.version).toBe('1.2.0')
    expect(parsed.files.arm64).toEqual(files.arm64)
    expect(parsed.files['linux-x64']).toEqual(files['linux-x64'])
    expect(parsed.notes.map((n) => n.version)).toEqual(['1.2.0', '1.1.0-beta.2', '1.0.0'])
  })
})
