import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({}))
const { describeError, stopsBatch } = await import('./format')
const { YtLoginRequiredError, YtRateLimitError } = await import('../youtube/errors')
const { DyApiError, DyCooldownError, DyError, DyLoginError, DyUnavailableError, DyVerifyError } = await import('../douyin/errors')
const { t } = await import('@shared/i18n')

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

describe('describeError 的抖音错误', () => {
  it('要手动验证的归为 VERIFY_REQUIRED，提示打开验证窗口', () => {
    expect(describeError(new DyVerifyError())).toEqual({ code: 'VERIFY_REQUIRED', message: t('dy.errVerify'), hint: t('mcpDouyin.verifyHint') })
    expect(t('mcpDouyin.verifyHint')).toContain('douyin_open_verification')
  })

  it('要登录的归为 NOT_LOGGED_IN，提示用抖音的登录工具', () => {
    expect(describeError(new DyLoginError())).toEqual({ code: 'NOT_LOGGED_IN', message: t('dy.errLogin'), hint: t('mcpDouyin.loginHint') })
    expect(describeError(new DyLoginError('登录已失效'))).toMatchObject({ code: 'NOT_LOGGED_IN', message: '登录已失效' })
    expect(t('mcpDouyin.loginHint')).toContain('douyin_start_login')
  })

  it('限流冷却归为 RATE_LIMITED', () => {
    expect(describeError(new DyCooldownError(180_000, 0))).toEqual({
      code: 'RATE_LIMITED',
      message: t('dy.errCooldown', { minutes: 3 }),
      hint: t('mcpDouyin.rateLimitedHint')
    })
  })

  it('网络、接口和作品不可用的错误仍是 FAILED', () => {
    for (const e of [new DyError('网络错误'), new DyApiError('参数不对', 5), new DyUnavailableError('作品没了')]) {
      expect(describeError(e)).toEqual({ code: 'FAILED', message: e.message })
    }
  })
})

describe('stopsBatch', () => {
  it('要验证、要登录、被限流时批量处理应当停下', () => {
    for (const e of [new DyVerifyError(), new DyLoginError(), new DyCooldownError(1000, 0)]) expect(stopsBatch(e)).toBe(true)
  })

  it('单个条目的错误不停', () => {
    for (const e of [new DyError('网络错误'), new DyApiError('参数不对', 5), new DyUnavailableError('作品没了'), 'x']) expect(stopsBatch(e)).toBe(false)
  })
})
