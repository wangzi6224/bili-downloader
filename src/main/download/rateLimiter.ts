import { AbortError } from './errors'

/**
 * 全局限速（令牌桶）。所有下载连接共享同一个桶：每读到一块数据先扣令牌，
 * 令牌不够就按欠的字节数等待。桶容量为 1 秒的额度，避免长时间空闲后瞬间突发。
 */
export class RateLimiter {
  private rate = 0
  private tokens = 0
  private last = Date.now()

  /** KB/s，0 表示不限速 */
  setLimit(kbps: number): void {
    this.rate = Math.max(0, kbps) * 1024
    this.tokens = 0
    this.last = Date.now()
  }

  async consume(bytes: number, signal?: AbortSignal): Promise<void> {
    if (!this.rate) return
    const now = Date.now()
    this.tokens = Math.min(this.rate, this.tokens + ((now - this.last) / 1000) * this.rate)
    this.last = now
    this.tokens -= bytes
    if (this.tokens >= 0) return
    const waitMs = (-this.tokens / this.rate) * 1000
    // 已经中止的 signal 不会再触发 abort 事件，得先查一次
    if (signal?.aborted) throw new AbortError()
    await new Promise<void>((resolve, reject) => {
      const onAbort = (): void => {
        clearTimeout(timer)
        reject(new AbortError())
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }, waitMs)
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }
}

export const limiter = new RateLimiter()
