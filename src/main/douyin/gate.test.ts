import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@shared/i18n'
import { AbortError } from '../download/errors'
import { DyCooldownError, DyLoginError, DyVerifyError } from './errors'
import { DouyinGate, type GateDeps } from './gate'
import type { DyRequest } from './transport/types'

const MINUTE = 60_000
const PROBE: DyRequest = { endpoint: 'detail', query: { aweme_id: '7000000000000000001' } }

function setup(over: GateDeps = {}) {
  const clock = { now: 1_000_000 }
  const sleep = vi.fn(async (ms: number) => {
    clock.now += ms
  })
  const onChange = vi.fn()
  const gate = new DouyinGate({ now: () => clock.now, sleep, random: () => 0.5, onChange, ...over })
  return { gate, clock, sleep, onChange }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('请求间隔', () => {
  it('第一个请求立刻发，之后按间隔加随机量等待', async () => {
    const { gate, sleep, clock } = setup()
    await gate.run('a', async () => 1)
    expect(sleep).not.toHaveBeenCalled()
    clock.now += 500
    await expect(gate.run('a', async () => 2)).resolves.toBe(2)
    expect(sleep).toHaveBeenCalledWith(2000)
  })

  it('间隔和随机量可以配置，已经隔得够久就不等', async () => {
    const { gate, sleep, clock } = setup({ interval: 100, jitter: 20 })
    await gate.run('a', async () => 1)
    await gate.run('a', async () => 2)
    expect(sleep.mock.calls).toEqual([[110]])
    clock.now += 1000
    await gate.run('a', async () => 3)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('各账号分开计时，匿名也单独算', async () => {
    const { gate, sleep } = setup()
    await gate.run('a', async () => 1)
    await gate.run('b', async () => 1)
    await gate.run(null, async () => 1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('缺省用系统时钟、定时器和随机数', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    const gate = new DouyinGate()
    await gate.run('a', async () => 1)
    const task = vi.fn(async () => 2)
    const second = gate.run('a', task)
    await vi.advanceTimersByTimeAsync(1999)
    expect(task).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await expect(second).resolves.toBe(2)
    random.mockRestore()
  })
})

describe('排队', () => {
  it('同一账号一次只跑一个，界面请求插到后台任务前面', async () => {
    const { gate } = setup()
    const block = deferred()
    const order: string[] = []
    const task = (name: string) => async (): Promise<void> => {
      order.push(name)
    }
    const first = gate.run('a', () => block.promise)
    const rest = [
      gate.run('a', task('后台1'), { background: true }),
      gate.run('a', task('后台2'), { background: true }),
      gate.run('a', task('界面1')),
      gate.run('a', task('界面2'))
    ]
    await vi.advanceTimersByTimeAsync(0)
    expect(order).toEqual([])
    block.resolve()
    await Promise.all([first, ...rest])
    expect(order).toEqual(['界面1', '界面2', '后台1', '后台2'])
  })

  it('任务抛错后让出位置', async () => {
    const { gate } = setup()
    await expect(
      gate.run('a', async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
    await expect(gate.run('a', async () => 'ok')).resolves.toBe('ok')
  })

  it('调用前就取消的请求不排队，也不占位置', async () => {
    const { gate } = setup()
    const task = vi.fn(async () => 1)
    await expect(gate.run('a', task, { signal: AbortSignal.abort() })).rejects.toBeInstanceOf(AbortError)
    expect(task).not.toHaveBeenCalled()
    await expect(gate.run('a', async () => 2)).resolves.toBe(2)
  })

  it('排队中取消的请求从队列里拿掉，其余照常', async () => {
    const { gate } = setup()
    const block = deferred()
    const controller = new AbortController()
    const cancelled = vi.fn(async () => 1)
    const first = gate.run('a', () => block.promise)
    const second = gate.run('a', cancelled, { signal: controller.signal })
    const third = gate.run('a', async () => 3)
    controller.abort()
    await expect(second).rejects.toBeInstanceOf(AbortError)
    block.resolve()
    await first
    await expect(third).resolves.toBe(3)
    expect(cancelled).not.toHaveBeenCalled()
  })

  it('轮到之后再取消不影响队列', async () => {
    const { gate } = setup()
    const block = deferred()
    const hold = deferred()
    const controller = new AbortController()
    const first = gate.run('a', () => block.promise)
    const second = gate.run('a', () => hold.promise.then(() => 2), { signal: controller.signal })
    block.resolve()
    await first
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    hold.resolve()
    await expect(second).resolves.toBe(2)
    await expect(gate.run('a', async () => 3)).resolves.toBe(3)
  })

  it('等间隔时取消就不发请求', async () => {
    const controller = new AbortController()
    const { gate } = setup({
      sleep: async () => controller.abort()
    })
    await gate.run('a', async () => 1)
    const task = vi.fn(async () => 2)
    await expect(gate.run('a', task, { signal: controller.signal })).rejects.toBeInstanceOf(AbortError)
    expect(task).not.toHaveBeenCalled()
    await expect(gate.run('a', async () => 3)).resolves.toBe(3)
  })

  it('排队期间账号状态变了，轮到时直接按新状态拒绝，后面的也一样', async () => {
    const { gate } = setup()
    const block = deferred()
    const first = gate.run('a', () => block.promise)
    const task = vi.fn(async () => 1)
    const second = gate.run('a', task)
    const third = gate.run('a', task)
    const results = Promise.allSettled([second, third])
    await vi.advanceTimersByTimeAsync(0)
    gate.requireVerify('a', PROBE)
    block.resolve()
    await first
    expect((await results).map((r) => r.status === 'rejected' && r.reason instanceof DyVerifyError)).toEqual([true, true])
    expect(task).not.toHaveBeenCalled()
  })
})

describe('账号状态', () => {
  it('要验证时挡住请求，错误带上触发验证的请求', async () => {
    const { gate, onChange } = setup()
    gate.requireVerify('a', PROBE)
    expect(gate.snapshot('a')).toEqual({ state: 'verify' })
    expect(gate.probe('a')).toBe(PROBE)
    expect(onChange).toHaveBeenCalledWith('a', { state: 'verify' })
    const error = await gate.run('a', async () => 1).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DyVerifyError)
    expect((error as DyVerifyError).probe).toBe(PROBE)
    expect(gate.snapshot('b')).toEqual({ state: 'ok' })
  })

  it('登录失效时挡住请求并丢掉验证请求', () => {
    const { gate, onChange } = setup()
    gate.requireVerify('a', PROBE)
    gate.expire('a')
    expect(gate.snapshot('a')).toEqual({ state: 'expired' })
    expect(gate.probe('a')).toBeUndefined()
    expect(onChange).toHaveBeenLastCalledWith('a', { state: 'expired' })
    expect(() => gate.check('a')).toThrow(DyLoginError)
    expect(() => gate.check('a')).toThrow(t('dy.errExpired'))
  })

  it('连续限流依次冷却 5、15、60 分钟，之后一直 60 分钟', () => {
    const { gate, clock } = setup()
    const lengths = [0, 1, 2, 3].map(() => (gate.cool('a') - clock.now) / MINUTE)
    expect(lengths).toEqual([5, 15, 60, 60])
  })

  it('冷却中挡住请求并报还要多久，到时间自动放行', () => {
    const { gate, clock, onChange } = setup()
    const until = gate.cool(null)
    expect(gate.snapshot(null)).toEqual({ state: 'cooling', until })
    expect(onChange).toHaveBeenLastCalledWith(null, { state: 'cooling', until })
    clock.now += 2 * MINUTE
    expect(() => gate.check(null)).toThrow(DyCooldownError)
    expect(() => gate.check(null)).toThrow(t('dy.errCooldown', { minutes: 3 }))
    clock.now = until
    expect(gate.snapshot(null)).toEqual({ state: 'ok' })
    expect(() => gate.check(null)).not.toThrow()
  })

  it('冷却结束时通知一次', () => {
    const { gate, onChange } = setup()
    gate.cool('a')
    onChange.mockClear()
    vi.advanceTimersByTime(5 * MINUTE - 1)
    expect(onChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onChange.mock.calls).toEqual([['a', { state: 'ok' }]])
  })

  it('冷却期间状态被改掉后，原来的定时通知作废', () => {
    const { gate, onChange } = setup()
    gate.cool('a')
    gate.reset('a')
    onChange.mockClear()
    vi.advanceTimersByTime(60 * MINUTE)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('成功请求把限流等级归零', () => {
    const { gate, clock, onChange } = setup()
    gate.cool('a')
    clock.now += 5 * MINUTE
    onChange.mockClear()
    gate.ok('a')
    expect(onChange).toHaveBeenCalledWith('a', { state: 'ok' })
    expect((gate.cool('a') - clock.now) / MINUTE).toBe(5)
  })

  it('本来就正常时成功请求不发通知；验证状态下成功会恢复', () => {
    const { gate, onChange } = setup()
    gate.ok('a')
    expect(onChange).not.toHaveBeenCalled()
    gate.requireVerify('a', PROBE)
    gate.ok('a')
    expect(gate.snapshot('a')).toEqual({ state: 'ok' })
    expect(gate.probe('a')).toBeUndefined()
  })

  it('reset 清掉状态和限流等级', () => {
    const { gate, clock } = setup()
    gate.cool('a')
    gate.cool('a')
    gate.reset('a')
    expect(gate.snapshot('a')).toEqual({ state: 'ok' })
    expect((gate.cool('a') - clock.now) / MINUTE).toBe(5)
  })

  it('没有 onChange，定时器也没有 unref 时照常工作', () => {
    const callbacks: (() => void)[] = []
    vi.stubGlobal('setTimeout', (fn: () => void) => callbacks.push(fn))
    vi.stubGlobal('clearTimeout', () => undefined)
    const gate = new DouyinGate({ now: () => 0 })
    expect(gate.cool('a')).toBe(5 * MINUTE)
    expect(() => callbacks[0]()).not.toThrow()
  })
})
