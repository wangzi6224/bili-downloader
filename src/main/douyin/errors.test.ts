import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@shared/i18n'
import { UnsupportedError } from '../bili/http'
import { CooldownError, DownloadError, isRetryable, NeedsUserError } from '../download/errors'
import { DyApiError, DyCooldownError, DyError, DyLoginError, DyUnavailableError, DyVerifyError } from './errors'

afterEach(() => {
  vi.useRealTimers()
})

describe('抖音错误', () => {
  it('要验证：等用户操作，带上触发验证的请求', () => {
    const probe = { endpoint: 'self' as const }
    const e = new DyVerifyError(probe)
    expect(e).toBeInstanceOf(NeedsUserError)
    expect(e).toMatchObject({ reason: 'verify', probe, message: t('dy.errVerify') })
    expect(new DyVerifyError().probe).toBeUndefined()
  })

  it('要登录：缺省提示可以换掉', () => {
    expect(new DyLoginError()).toMatchObject({ reason: 'login', message: t('dy.errLogin') })
    expect(new DyLoginError('换一句').message).toBe('换一句')
    expect(new DyLoginError()).toBeInstanceOf(NeedsUserError)
  })

  it('限流：按剩余时间向上取整，至少说 1 分钟', () => {
    const e = new DyCooldownError(300_001, 0)
    expect(e).toBeInstanceOf(CooldownError)
    expect(e.until).toBe(300_001)
    expect(e.message).toBe(t('dy.errCooldown', { minutes: 6 }))
    expect(new DyCooldownError(0, 1000).message).toBe(t('dy.errCooldown', { minutes: 1 }))
  })

  it('限流缺省按当前时间算', () => {
    vi.useFakeTimers({ now: 1_000_000 })
    expect(new DyCooldownError(1_000_000 + 15 * 60_000).message).toBe(t('dy.errCooldown', { minutes: 15 }))
  })

  it('按能不能重试分类', () => {
    expect(new DyError('x')).toBeInstanceOf(DownloadError)
    expect(isRetryable(new DyError('x'))).toBe(true)
    expect(isRetryable(new DyApiError('参数不对', 5))).toBe(false)
    expect(new DyUnavailableError('没了')).toBeInstanceOf(UnsupportedError)
    expect(isRetryable(new DyUnavailableError('没了'))).toBe(false)
  })

  it('业务错误带状态码', () => {
    expect(new DyApiError('参数不对', 5)).toMatchObject({ code: 5, message: t('dy.errApi', { reason: '参数不对' }) })
  })
})
