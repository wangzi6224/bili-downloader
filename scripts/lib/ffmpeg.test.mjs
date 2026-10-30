import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { binaryName, isUpToDate, licenseText, verifySha256 } from './ffmpeg.mjs'

const SHA = 'a'.repeat(64)
let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ffmpeg-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('isUpToDate', () => {
  it('ffmpeg 和校验值记录都在、校验值一致才算最新', () => {
    expect(isUpToDate(dir, SHA)).toBe(false)
    writeFileSync(join(dir, 'ffmpeg'), '')
    expect(isUpToDate(dir, SHA)).toBe(false)
    writeFileSync(join(dir, '.sha256'), 'b'.repeat(64))
    expect(isUpToDate(dir, SHA)).toBe(false)
    writeFileSync(join(dir, '.sha256'), SHA)
    expect(isUpToDate(dir, SHA)).toBe(true)
  })

  it('只有校验值记录、没有 ffmpeg 时要重新下载', () => {
    writeFileSync(join(dir, '.sha256'), SHA)
    expect(isUpToDate(dir, SHA)).toBe(false)
  })

  it('Windows 使用 ffmpeg.exe，并按 Windows 二进制判断缓存', () => {
    writeFileSync(join(dir, 'ffmpeg.exe'), '')
    writeFileSync(join(dir, '.sha256'), SHA)
    expect(isUpToDate(dir, SHA, 'ffmpeg.exe')).toBe(true)
  })
})

describe('binaryName', () => {
  it('Windows 使用 .exe，其他系统保留 ffmpeg 文件名', () => {
    expect(binaryName('win32')).toBe('ffmpeg.exe')
    expect(binaryName('darwin')).toBe('ffmpeg')
    expect(binaryName('linux')).toBe('ffmpeg')
  })
})

describe('verifySha256', () => {
  const data = Buffer.from('ffmpeg')
  const sha = createHash('sha256').update(data).digest('hex')

  it('一致时不报错', () => {
    expect(() => verifySha256(data, sha, 'ffmpeg arm64')).not.toThrow()
  })

  it('不一致时报出期望值和实际值', () => {
    expect(() => verifySha256(data, SHA, 'ffmpeg x64')).toThrow(`ffmpeg x64 校验失败：期望 ${SHA}，实际 ${sha}`)
  })
})

describe('licenseText', () => {
  it('说明在前，许可证原文在后', () => {
    expect(licenseText('说明\n', [Buffer.from('GPL'), Buffer.from('LGPL')])).toBe('说明\n\nGPL\nLGPL')
  })

  it('没有说明时只有许可证', () => {
    expect(licenseText(undefined, [Buffer.from('GPL')])).toBe('GPL')
  })
})
