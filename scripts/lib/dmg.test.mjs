import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { compressDmg, dmgFormat } from './dmg.mjs'

// 真的用 hdiutil 建一个小 dmg 来转，只能在 macOS 上跑
describe.runIf(process.platform === 'darwin')('compressDmg', () => {
  let base
  let source
  let dir
  let dmg

  // CI 的 macOS 上建一次镜像要好几秒，只建一次，每个用例复制一份
  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), 'bili-dmg-'))
    const src = join(base, 'src')
    mkdirSync(join(src, 'B站下载器.app/Contents'), { recursive: true })
    // 放点内容，转换后核对是否一样
    writeFileSync(join(src, 'B站下载器.app/Contents/payload'), Buffer.alloc(512 * 1024, 'bili downloader '))
    writeFileSync(join(src, '.background'), 'layout')
    source = join(base, 'source.dmg')
    execFileSync('hdiutil', ['create', '-quiet', '-srcfolder', src, '-volname', 'B站下载器 1.0.0', '-format', 'UDZO', source])
  }, 60_000)
  afterAll(() => rmSync(base, { recursive: true, force: true }))

  beforeEach(() => {
    dir = mkdtempSync(join(base, 'case-'))
    dmg = join(dir, 'bili-downloader-1.0.0-arm64.dmg')
    copyFileSync(source, dmg)
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  /** 挂载后列出内容并读出 payload，确认转换前后文件一样 */
  function contents(file) {
    const mount = join(dir, 'mnt')
    mkdirSync(mount, { recursive: true })
    execFileSync('hdiutil', ['attach', '-quiet', '-nobrowse', '-readonly', '-mountpoint', mount, file])
    try {
      return {
        files: readdirSync(mount, { recursive: true }).filter((n) => !n.startsWith('.fseventsd')).sort(),
        payload: readFileSync(join(mount, 'B站下载器.app/Contents/payload'))
      }
    } finally {
      execFileSync('hdiutil', ['detach', '-quiet', mount])
    }
  }

  it('转成 ULMO，内容不变，不留临时文件', () => {
    expect(dmgFormat(dmg)).toBe('UDZO')
    const before = contents(dmg)
    expect(compressDmg(dmg)).toBe(true)
    expect(dmgFormat(dmg)).toBe('ULMO')
    expect(contents(dmg)).toEqual(before)
    expect(readdirSync(dir).filter((n) => n.endsWith('.dmg'))).toEqual(['bili-downloader-1.0.0-arm64.dmg'])
  }, 60_000)

  it('已经是 ULMO 的不再转', () => {
    compressDmg(dmg)
    expect(compressDmg(dmg)).toBe(false)
    expect(dmgFormat(dmg)).toBe('ULMO')
  }, 60_000)

  it('不是 dmg 时报错，原文件不动，也不留临时文件', () => {
    const bad = join(dir, 'bad.dmg')
    writeFileSync(bad, 'not a disk image')
    expect(() => compressDmg(bad)).toThrow()
    expect(readFileSync(bad, 'utf8')).toBe('not a disk image')
    expect(existsSync(join(dir, 'bad.ulmo.dmg'))).toBe(false)
  })
})
