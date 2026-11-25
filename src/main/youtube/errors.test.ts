import { describe, expect, it } from 'vitest'
import { UnsupportedError } from '../bili/http'
import { DiskError, DownloadError } from '../download/errors'
import { classifyYtError, lastError, YtEngineError, YtLoginRequiredError, YtRateLimitError } from './errors'

const err = (msg: string): string => `[youtube] Extracting URL\nERROR: [youtube] dQw4w9WgXcQ: ${msg}\n`

describe('lastError', () => {
  it('取最后一条 ERROR，去掉提取器和视频 id 前缀', () => {
    const stderr = 'WARNING: x\r\nERROR: [youtube] dQw4w9WgXcQ: 第一条\r\nERROR: [youtube:tab] 第二条 \r\n'
    expect(lastError(stderr)).toBe('第二条')
  })

  it('没有提取器前缀、没有 id 时也能去掉 ERROR:', () => {
    expect(lastError('ERROR: unable to open for writing')).toBe('unable to open for writing')
  })

  it('没有 ERROR 行时返回空', () => {
    expect(lastError('WARNING: a\nsomething')).toBeUndefined()
    expect(lastError('')).toBeUndefined()
  })
})

describe('classifyYtError', () => {
  it('机器人验证排在登录前面：提示里带 --cookies 也归为风控', () => {
    const e = classifyYtError(err('Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies for the authentication.'), 1)
    expect(e).toBeInstanceOf(YtRateLimitError)
    expect(e).toBeInstanceOf(DownloadError)
    expect(e.message).toContain('验证不是机器人')
    expect(e.message).toContain('Sign in to confirm you’re not a bot')
  })

  it.each([
    "Sign in to confirm you're not a bot",
    'Please confirm you are not a bot',
    'HTTP Error 429: Too Many Requests',
    'rate-limited by YouTube'
  ])('风控：%s', (msg) => {
    expect(classifyYtError(err(msg), 1)).toBeInstanceOf(YtRateLimitError)
  })

  it.each<[string, string, string]>([
    ['Sign in to confirm your age. This video may be inappropriate for some users.', '年龄限制', 'confirm your age'],
    ['This video is age-restricted', '年龄限制', 'age-restricted'],
    ['Join this channel to get access to members-only content like this video, and other exclusive perks.', '会员专享', 'members-only'],
    ["This video is available to this channel's members on level: Tier 1", '会员专享', 'Tier 1'],
    ["Private video. Sign in if you've been granted access to this video", '要登录 YouTube 才能下载', 'Private video'],
    ['The playlist is private', '要登录 YouTube 才能下载', 'playlist is private'],
    ['This playlist does not exist', '要登录 YouTube 才能下载', 'does not exist'],
    ['You need to log in to access this', '要登录 YouTube 才能下载', 'need to log in'],
    ['This feed requires authentication. Use --cookies', '要登录 YouTube 才能下载', 'requires authentication']
  ])('要登录：%s', (msg, text, reason) => {
    const e = classifyYtError(err(msg), 1)
    expect(e).toBeInstanceOf(YtLoginRequiredError)
    expect(e).not.toBeInstanceOf(DownloadError)
    expect(e.message).toContain(text)
    expect(e.message).toContain(reason)
  })

  it.each<[string, string]>([
    ['This video is only available to Music Premium members', 'Premium 专享'],
    ['This video is DRM protected', '版权保护'],
    ['The uploader has not made this video available in your country', '当前地区不可用'],
    ['This video is not available in your country', '当前地区不可用'],
    ['Video is geo restricted', '当前地区不可用'],
    ['Premieres in 2 hours', '还没开始'],
    ['This live event will begin in a few moments.', '还没开始'],
    ['Video unavailable. This video has been removed by the uploader', '视频不可用'],
    ['This video is no longer available because the YouTube account has been terminated.', '视频不可用'],
    ['Incomplete YouTube ID abc', '视频不可用'],
    ['Unsupported URL: https://example.com', '视频不可用']
  ])('无法下载：%s', (msg, text) => {
    const e = classifyYtError(err(msg), 1)
    expect(e).toBeInstanceOf(UnsupportedError)
    expect(e.message).toContain(text)
    expect(e.message).toContain(msg)
  })

  it('DRM 区分大小写：小写的 drm 不算', () => {
    expect(classifyYtError(err('drm something'), 1)).not.toBeInstanceOf(UnsupportedError)
  })

  it('磁盘满', () => {
    for (const msg of ['unable to write data: [Errno 28] No space left on device', 'No space left on device']) {
      const e = classifyYtError(err(msg), 1)
      expect(e).toBeInstanceOf(DiskError)
      expect(e.message).toContain('磁盘')
    }
  })

  it.each([
    'n challenge solving failed: Some formats may be missing',
    'Signature extraction failed: Some formats may be missing',
    'No supported JavaScript runtime could be found',
    'Unable to extract initial player response',
    'Only images are available for download. use --list-formats to see them',
    'Requested format is not available. Use --list-formats for a list of available formats'
  ])('组件问题：%s', (msg) => {
    const e = classifyYtError(err(msg), 1)
    expect(e).toBeInstanceOf(YtEngineError)
    expect(e).toBeInstanceOf(DownloadError)
    expect(e.message).toContain('可能需要更新')
    expect(e.message).toContain(msg)
  })

  it.each([
    'unable to download video data: HTTP Error 403: Forbidden',
    'HTTP Error 503: Service Unavailable',
    'Unable to download webpage: <urlopen error [Errno 104] Connection reset by peer>',
    'The read operation timed out',
    '[Errno 8] nodename nor servname provided, or not known (getaddrinfo failed)',
    'SSL: CERTIFICATE_VERIFY_FAILED',
    'IncompleteRead(1024 bytes read)',
    'Unable to connect to proxy'
  ])('网络：%s', (msg) => {
    const e = classifyYtError(err(msg), 1)
    expect(e).toBeInstanceOf(DownloadError)
    expect(e).not.toBeInstanceOf(YtRateLimitError)
    expect(e).not.toBeInstanceOf(YtEngineError)
    expect(e.message).toContain('连接 YouTube 失败')
    expect(e.message).toContain(msg)
  })

  it('认不出的归为普通错误，带上原因', () => {
    const e = classifyYtError(err('Postprocessing: something odd'), 1)
    expect(e.constructor).toBe(Error)
    expect(e.message).toBe('YouTube 下载失败：Postprocessing: something odd')
  })

  it('没有 ERROR 行时用最后一行（最多 300 字）', () => {
    expect(classifyYtError('line 1\nTraceback: boom\n', 1).message).toBe('YouTube 下载失败：Traceback: boom')
    const long = classifyYtError(`x\n${'a'.repeat(400)}`, 1).message
    expect(long).toBe(`YouTube 下载失败：${'a'.repeat(300)}`)
    // 最后一行也能参与分类
    expect(classifyYtError('Got error: HTTP Error 429', 1)).toBeInstanceOf(YtRateLimitError)
  })

  it('stderr 为空时用退出码', () => {
    expect(classifyYtError('', 2).message).toBe('YouTube 下载失败：YouTube 组件异常退出（代码 2）')
    expect(classifyYtError('  \n', null).message).toContain('代码 null')
  })
})
