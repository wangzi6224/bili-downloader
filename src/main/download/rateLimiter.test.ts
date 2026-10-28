import { getEventListeners } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AbortError } from './errors'
import { RateLimiter } from './rateLimiter'

describe('RateLimiter', () => {
  it('does not wait when unlimited', async () => {
    const l = new RateLimiter()
    const t = Date.now()
    await l.consume(10 * 1024 * 1024)
    expect(Date.now() - t).toBeLessThan(20)
  })

  it('throttles to the configured rate', async () => {
    const l = new RateLimiter()
    l.setLimit(100) // 100 KB/s
    const t = Date.now()
    // 桶从 0 开始，30 KB 约需 300ms
    for (let i = 0; i < 3; i++) await l.consume(10 * 1024)
    const elapsed = Date.now() - t
    expect(elapsed).toBeGreaterThanOrEqual(250)
    expect(elapsed).toBeLessThan(600)
  })

  it('rejects when aborted while waiting', async () => {
    const l = new RateLimiter()
    l.setLimit(1)
    const ac = new AbortController()
    const p = l.consume(100 * 1024, ac.signal)
    ac.abort()
    await expect(p).rejects.toThrow('aborted')
  })
})

describe('RateLimiter 边界', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /** 不推进时间，只看 promise 是否已经结束 */
  const state = async (p: Promise<unknown>): Promise<unknown> => {
    let r: unknown = 'pending'
    p.then(
      () => (r = 'resolved'),
      (e: unknown) => (r = e)
    )
    for (let i = 0; i < 5; i++) await Promise.resolve()
    return r
  }

  it('限速设为 0 或负数时不限速', async () => {
    vi.useFakeTimers()
    const l = new RateLimiter()
    l.setLimit(100)
    l.setLimit(0)
    expect(await state(l.consume(10 * 1024 * 1024))).toBe('resolved')
    l.setLimit(-5)
    expect(await state(l.consume(10 * 1024 * 1024))).toBe('resolved')
  })

  it('令牌最多攒 1 秒的额度', async () => {
    vi.useFakeTimers()
    const l = new RateLimiter()
    l.setLimit(100)
    // 空闲 10 秒也只攒下 100 KB
    vi.advanceTimersByTime(10_000)
    expect(await state(l.consume(100 * 1024))).toBe('resolved')
    const p = l.consume(100 * 1024)
    expect(await state(p)).toBe('pending')
    vi.advanceTimersByTime(999)
    expect(await state(p)).toBe('pending')
    vi.advanceTimersByTime(1)
    expect(await state(p)).toBe('resolved')
  })

  it('传入已经中止的 signal 时立即拒绝，不等计时器', async () => {
    vi.useFakeTimers()
    const l = new RateLimiter()
    l.setLimit(1)
    const ac = new AbortController()
    ac.abort()
    expect(await state(l.consume(100 * 1024, ac.signal))).toBeInstanceOf(AbortError)
  })

  it('正常等完后移除 abort 监听', async () => {
    vi.useFakeTimers()
    const l = new RateLimiter()
    l.setLimit(100)
    const ac = new AbortController()
    const p = l.consume(10 * 1024, ac.signal)
    expect(getEventListeners(ac.signal, 'abort')).toHaveLength(1)
    vi.advanceTimersByTime(100)
    expect(await state(p)).toBe('resolved')
    expect(getEventListeners(ac.signal, 'abort')).toHaveLength(0)
  })
})
