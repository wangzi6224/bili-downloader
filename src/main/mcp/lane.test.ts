import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({}))
const { BiliError } = await import('../bili/http')
const { Lane, TtlCache } = await import('./lane')

/** 注入的时钟：sleep 直接把时间往前拨，不用真的等，也不用假定时器 */
function clock() {
  const c = {
    t: 1000,
    slept: [] as number[],
    now: () => c.t,
    sleep: async (ms: number) => {
      c.slept.push(ms)
      c.t += ms
    }
  }
  return c
}

describe('Lane', () => {
  it('第一次请求不等，之后保持最小间隔', async () => {
    const c = clock()
    const lane = new Lane({ gapMs: 1000, now: c.now, sleep: c.sleep })
    expect(await lane.run(async () => 'a')).toBe('a')
    expect(c.slept).toEqual([])
    c.t += 300
    await lane.run(async () => 'b')
    expect(c.slept).toEqual([700])
    c.t += 5000
    await lane.run(async () => 'c')
    expect(c.slept).toEqual([700])
  })

  it('并行调用排成一队，一个完成后才开始下一个', async () => {
    const c = clock()
    const lane = new Lane({ gapMs: 0, now: c.now, sleep: c.sleep })
    const log: string[] = []
    let release = (): void => {}
    const first = lane.run(async () => {
      log.push('1 开始')
      await new Promise<void>((r) => (release = r))
      log.push('1 结束')
    })
    const second = lane.run(async () => {
      log.push('2 开始')
    })
    await vi.waitFor(() => expect(log).toEqual(['1 开始']))
    release()
    await Promise.all([first, second])
    expect(log).toEqual(['1 开始', '1 结束', '2 开始'])
  })

  it('一个失败不影响后面的，也不触发冷却', async () => {
    const lane = new Lane({ gapMs: 0 })
    const fail = lane.run(async () => {
      throw new Error('普通错误')
    })
    const ok = lane.run(async () => 'ok')
    await expect(fail).rejects.toThrow('普通错误')
    expect(await ok).toBe('ok')
  })

  it('触发风控后冷却：期间不发请求，结束后恢复', async () => {
    const c = clock()
    const lane = new Lane({ gapMs: 0, cooldownMs: 30_000, now: c.now, sleep: c.sleep })
    await expect(
      lane.run(async () => {
        throw new BiliError('被拦截', -412)
      })
    ).rejects.toThrow('被拦截')
    c.t += 10_000
    const fn = vi.fn(async () => 'x')
    await expect(lane.run(fn)).rejects.toMatchObject({ code: 'RATE_LIMITED', message: expect.stringContaining('20 秒') })
    expect(fn).not.toHaveBeenCalled()
    c.t += 20_000
    expect(await lane.run(fn)).toBe('x')
  })

  it('超时后放开通道，迟到的结果不影响后面的', async () => {
    const lane = new Lane({ gapMs: 0, timeoutMs: 5 })
    await expect(lane.run(() => new Promise(() => {}))).rejects.toMatchObject({ code: 'FAILED' })
    expect(await lane.run(async () => 'next')).toBe('next')
  })

  it('默认选项可以直接用', async () => {
    const lane = new Lane({ gapMs: 1 })
    await lane.run(async () => 1)
    expect(await lane.run(async () => 2)).toBe(2)
  })
})

describe('TtlCache', () => {
  it('过期前用缓存，过期后重新加载', async () => {
    let t = 0
    const cache = new TtlCache<number>(100, 10, () => t)
    const load = vi.fn(async () => t)
    expect(await cache.get('a', load)).toBe(0)
    t = 99
    expect(await cache.get('a', load)).toBe(0)
    expect(load).toHaveBeenCalledTimes(1)
    t = 100
    expect(await cache.get('a', load)).toBe(100)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('并行调用同一个 key 只加载一次', async () => {
    const cache = new TtlCache<string>(100, 10)
    const load = vi.fn(async () => 'v')
    expect(await Promise.all([cache.get('a', load), cache.get('a', load)])).toEqual(['v', 'v'])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('失败的不留下，下次重新加载', async () => {
    const cache = new TtlCache<string>(100, 10)
    await expect(cache.get('a', () => Promise.reject(new Error('坏了')))).rejects.toThrow('坏了')
    await new Promise((r) => setImmediate(r))
    expect(await cache.get('a', async () => 'v')).toBe('v')
  })

  it('过期后才失败的旧请求不会删掉新结果', async () => {
    let t = 0
    let fail = (_e: Error): void => {}
    const cache = new TtlCache<string>(100, 10, () => t)
    const old = cache.get('a', () => new Promise((_, reject) => (fail = reject)))
    t = 200
    const load = vi.fn(async () => 'new')
    await cache.get('a', load)
    fail(new Error('晚了'))
    await expect(old).rejects.toThrow('晚了')
    await new Promise((r) => setImmediate(r))
    await cache.get('a', load)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('delete 后重新加载', async () => {
    const cache = new TtlCache<string>(100, 10)
    const load = vi.fn(async () => 'v')
    await cache.get('a', load)
    cache.delete('a')
    await cache.get('a', load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('超出上限时丢掉最早的', async () => {
    const cache = new TtlCache<string>(100, 2)
    const load = vi.fn(async () => 'v')
    await cache.get('a', load)
    await cache.get('b', load)
    await cache.get('c', load)
    expect(load).toHaveBeenCalledTimes(3)
    await cache.get('b', load)
    expect(load).toHaveBeenCalledTimes(3)
    await cache.get('a', load)
    expect(load).toHaveBeenCalledTimes(4)
  })
})
