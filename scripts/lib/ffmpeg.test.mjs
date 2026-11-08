import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { binaryName, checkFfmpeg, isUpToDate, licenseText, verifySha256 } from './ffmpeg.mjs'

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

describe('checkFfmpeg', () => {
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
  const ok = (stdout = '') => ({ status: 0, stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout), stderr: '' })
  /** 按参数里的特征返回假结果，over 里可以替换某一项 */
  const fake = (over = {}) => (args) => {
    const s = args.join(' ')
    const pick = (key, value) => (key in over ? over[key] : value)
    if (s.includes('-filters')) return pick('filters', ok(' T. delogo            V->V       Remove logo from input video.'))
    if (s.includes('libx264')) return pick('encode', ok())
    if (s.includes('mjpeg')) return pick('jpeg', ok(JPEG))
    if (s.includes('format=gray')) return pick('gray', ok(Buffer.alloc(64 * 36)))
    if (s.includes('-decoders')) return pick('decoders', ok(' V....D libdav1d              dav1d AV1 decoder'))
    return pick('encoders', ok(' V....D h264_nvenc   NVIDIA\n V....D hevc_nvenc  NVIDIA\n V....D h264_nvenc dup\n V....D libx264'))
  }

  it('功能都在时没有错误，列出编进去的硬件编码器', () => {
    expect(checkFfmpeg(fake())).toEqual({ errors: [], warnings: [], hw: ['h264_nvenc', 'hevc_nvenc'] })
  })

  it('缺 delogo、编码失败、抽不出帧都算错误', () => {
    const r = checkFfmpeg(
      fake({
        filters: ok(' T. boxblur'),
        encode: { status: 1, stdout: Buffer.alloc(0), stderr: 'x\nUnknown encoder libx264\n' },
        jpeg: ok(Buffer.from([0x89, 0x50])),
        gray: ok(Buffer.alloc(10))
      })
    )
    expect(r.errors).toEqual(['没有 delogo 滤镜', 'delogo + libx264 编码失败：Unknown encoder libx264', '抽不出 JPEG 预览帧', '抽不出灰度帧'])
  })

  it('退出码不是 0 也算抽帧失败；不能解码 AV1 只提示；没有硬件编码器时为空', () => {
    const r = checkFfmpeg(
      fake({
        jpeg: { status: 1, stdout: JPEG, stderr: '' },
        gray: { status: 1, stdout: Buffer.alloc(64 * 36), stderr: '' },
        decoders: ok(' V....D h264'),
        encoders: ok(' V....D libx264')
      })
    )
    expect(r).toEqual({ errors: ['抽不出 JPEG 预览帧', '抽不出灰度帧'], warnings: ['不能解码 AV1，AV1 视频没法去水印'], hw: [] })
  })

  it('启动不了时只报这一条', () => {
    const r = checkFfmpeg(() => ({ status: null, stdout: Buffer.alloc(0), stderr: '', error: new Error('spawn Unknown system error -86') }))
    expect(r).toEqual({ errors: ['启动失败：spawn Unknown system error -86'], warnings: [], hw: [] })
  })
})
