import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({}))
const { AuthExpiredError, BiliError, UnsupportedError } = await import('../bili/http')
const { AbortError, DiskError, DownloadError, FfmpegError, isRetryable, retryDelay, toDiskError } = await import('./errors')

const fsError = (code?: string, message = 'boom'): Error => Object.assign(new Error(message), { code })

describe('toDiskError', () => {
  it.each([
    ['ENOSPC', '磁盘空间不足'],
    ['EACCES', '没有写入权限：/dl'],
    ['EPERM', '没有写入权限：/dl'],
    ['EROFS', '目标磁盘是只读的：/dl'],
    ['ENOENT', '下载目录不存在或外接磁盘已断开：/dl'],
    ['EIO', '写入文件失败（EIO）：/dl']
  ])('%s', (code, message) => {
    const e = toDiskError(fsError(code), '/dl')
    expect(e).toBeInstanceOf(DiskError)
    expect(e.message).toBe(message)
  })

  it('没有路径时不带后缀，没有错误码时用原始信息', () => {
    expect(toDiskError(fsError('EACCES')).message).toBe('没有写入权限')
    expect(toDiskError(fsError(undefined, '奇怪的错误')).message).toBe('写入文件失败（奇怪的错误）')
  })
})

describe('isRetryable', () => {
  it.each<[string, unknown, boolean]>([
    ['磁盘错误', new DiskError('x'), false],
    ['ffmpeg 错误', new FfmpegError('x'), false],
    ['中止', new AbortError(), false],
    ['下载错误', new DownloadError('x'), true],
    ['网络失败（code -1）', new BiliError('网络请求失败'), true],
    ['风控 412', new BiliError('x', 412), true],
    ['服务器 500', new BiliError('x', 500), true],
    ['服务器 503', new BiliError('x', 503), true],
    ['服务器 599', new BiliError('x', 599), true],
    ['业务错误', new BiliError('视频不存在', -404), false],
    // 业务错误码有的是很大的正数，不能当成 5xx
    ['很大的业务错误码', new BiliError('需要大会员', 6002003), false],
    ['业务错误码 600', new BiliError('x', 600), false],
    ['登录过期', new AuthExpiredError(), false],
    // 默认 code 也是 -1，但内容本身下不了，重试没有意义
    ['无法下载（默认 code）', new UnsupportedError('DRM'), false],
    ['无法下载（业务 code）', new UnsupportedError('地区限制', -10403), false],
    ['fetch 本身失败', new TypeError('fetch failed'), true],
    ['其他 Error', new Error('x'), false],
    ['非 Error', 'x', false]
  ])('%s → %s', (_, e, expected) => {
    expect(isRetryable(e)).toBe(expected)
  })
})

describe('retryDelay', () => {
  it('30 秒起翻倍，最长 5 分钟', () => {
    expect([0, 1, 2, 3, 4, 10].map(retryDelay)).toEqual([30_000, 60_000, 120_000, 240_000, 300_000, 300_000])
  })
})

describe('AbortError', () => {
  it('固定的名字和信息', () => {
    const e = new AbortError()
    expect(e.name).toBe('AbortError')
    expect(e.message).toBe('aborted')
  })
})
