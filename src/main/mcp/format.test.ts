import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({}))
const { describeError } = await import('./format')
const { YtLoginRequiredError, YtRateLimitError } = await import('../youtube/errors')

describe('describeError 的 YouTube 错误', () => {
  it('要登录的归为 NOT_LOGGED_IN，提示用 YouTube 的登录工具', () => {
    const r = describeError(new YtLoginRequiredError('需要登录'))
    expect(r).toMatchObject({ code: 'NOT_LOGGED_IN', message: '需要登录' })
    expect(r.hint).toBeTruthy()
  })

  it('机器人验证、429 归为 RATE_LIMITED', () => {
    const r = describeError(new YtRateLimitError('机器人验证'))
    expect(r).toMatchObject({ code: 'RATE_LIMITED', message: '机器人验证' })
    expect(r.hint).toBeTruthy()
  })

  it('其他错误仍是 FAILED', () => {
    expect(describeError('坏了')).toEqual({ code: 'FAILED', message: '坏了' })
  })
})
