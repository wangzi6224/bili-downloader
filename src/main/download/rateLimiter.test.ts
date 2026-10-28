import { describe, expect, it } from 'vitest'
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
