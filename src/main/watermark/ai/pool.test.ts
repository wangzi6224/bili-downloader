import { afterEach, describe, expect, it, vi } from 'vitest'
import { AbortError } from '../../download/errors'
import type { HostReply, HostRequest } from './hostCore'
import { HostError, InferenceHost, InferencePool, type HostChannel } from './pool'

/** 假的推理进程：behave 决定怎么回 run 请求 */
class FakeChannel implements HostChannel {
  sent: HostRequest[] = []
  killed = false
  private msg: ((r: HostReply) => void)[] = []
  private exit: ((code: number | null) => void)[] = []
  constructor(public behave: (m: HostRequest, ch: FakeChannel) => void = autoReply) {}
  send(m: HostRequest): void {
    this.sent.push(m)
    this.behave(m, this)
  }
  onMessage(cb: (r: HostReply) => void): void {
    this.msg.push(cb)
  }
  onExit(cb: (code: number | null) => void): void {
    this.exit.push(cb)
  }
  kill(): void {
    this.killed = true
  }
  reply(r: HostReply): void {
    for (const cb of this.msg) cb(r)
  }
  die(code: number | null): void {
    for (const cb of this.exit) cb(code)
  }
}

function autoReply(m: HostRequest, ch: FakeChannel): void {
  queueMicrotask(() => {
    if (m.type === 'init') ch.reply({ type: 'ready', backend: m.backend, ms: 5 })
    else ch.reply({ type: 'result', id: m.id, output: m.image.map((v) => v * 2), ms: 3 })
  })
}

const start = (ch: FakeChannel, timeoutMs = 1000): Promise<InferenceHost> =>
  InferenceHost.start(() => ch, { model: 'm', backend: 'cpu', threads: 1, timeoutMs })

const img = (v: number): Float32Array => new Float32Array([v])

afterEach(() => {
  vi.useRealTimers()
})

describe('InferenceHost', () => {
  it('启动、推理，结果按 id 对上', async () => {
    const ch = new FakeChannel()
    const h = await start(ch)
    expect(ch.sent[0]).toEqual({ type: 'init', model: 'm', backend: 'cpu', threads: 1 })
    const [a, b] = await Promise.all([h.run(img(1), img(0), 1, 1, 1000), h.run(img(2), img(0), 1, 1, 1000)])
    expect([a.output[0], b.output[0]]).toEqual([2, 4])
    expect(h.alive).toBe(true)
    // 不认识的回复不影响
    ch.reply({ type: 'result', id: 99, output: img(0), ms: 1 })
    ch.reply({ type: 'ready', backend: 'cpu', ms: 1 })
  })

  it('加载失败、进程退出、超时都会结束进程并报 HostError', async () => {
    const fail = new FakeChannel((_m, ch) => queueMicrotask(() => ch.reply({ type: 'error', message: '没有 GPU' })))
    await expect(start(fail)).rejects.toThrow(new HostError('没有 GPU'))
    expect(fail.killed).toBe(true)

    const crash = new FakeChannel((_m, ch) => queueMicrotask(() => ch.die(3)))
    await expect(start(crash)).rejects.toThrow('推理进程意外退出（代码 3）')

    vi.useFakeTimers()
    const silent = new FakeChannel(() => {})
    const p = start(silent, 500)
    vi.advanceTimersByTime(500)
    await expect(p).rejects.toThrow('加载模型超时')
    expect(silent.killed).toBe(true)
  })

  it('推理出错只影响这一帧；超时、退出让进程作废，没回来的都失败', async () => {
    const ch = new FakeChannel()
    const h = await start(ch)
    ch.behave = (m, c) => m.type === 'run' && queueMicrotask(() => c.reply({ type: 'error', id: m.id, message: '坏帧' }))
    await expect(h.run(img(1), img(0), 1, 1, 1000)).rejects.toThrow('坏帧')
    expect(h.alive).toBe(true)

    vi.useFakeTimers()
    ch.behave = () => {}
    const a = h.run(img(1), img(0), 1, 1, 100)
    const b = h.run(img(2), img(0), 1, 1, 10_000)
    vi.advanceTimersByTime(100)
    await expect(a).rejects.toThrow('推理超时')
    await expect(b).rejects.toThrow('推理超时')
    expect(ch.killed).toBe(true)
    expect(h.alive).toBe(false)
    await expect(h.run(img(1), img(0), 1, 1, 100)).rejects.toThrow('推理超时')

    const ch2 = new FakeChannel()
    const h2 = await start(ch2)
    ch2.behave = () => {}
    const c = h2.run(img(1), img(0), 1, 1, 10_000)
    ch2.die(null)
    await expect(c).rejects.toThrow('推理进程意外退出（代码 未知）')
  })

  it('kill：没回来的按取消处理', async () => {
    const ch = new FakeChannel()
    const h = await start(ch)
    ch.behave = () => {}
    const p = h.run(img(1), img(0), 1, 1, 10_000)
    h.kill()
    await expect(p).rejects.toBeInstanceOf(AbortError)
    expect(ch.killed).toBe(true)
  })
})

describe('InferencePool', () => {
  const pool = async (n: number): Promise<{ p: InferencePool; chs: FakeChannel[] }> => {
    const chs = Array.from({ length: n }, () => new FakeChannel())
    const hosts = await Promise.all(chs.map((c) => start(c)))
    return { p: new InferencePool(hosts, 'cpu', 10, img(0), 1, 1), chs }
  }

  it('空闲的进程依次取帧，同时最多每个进程一帧', async () => {
    const { p, chs } = await pool(2)
    const outs = await Promise.all([1, 2, 3, 4, 5].map((v) => p.run(img(v))))
    expect(outs.map((o) => o[0])).toEqual([2, 4, 6, 8, 10])
    const runs = chs.map((c) => c.sent.filter((m) => m.type === 'run').length)
    expect(runs[0] + runs[1]).toBe(5)
    expect(Math.min(...runs)).toBeGreaterThanOrEqual(2)
  })

  it('一个进程坏了，其他的接着干；都坏了，排着的也失败', async () => {
    const { p, chs } = await pool(2)
    chs[0].behave = (m, c) => m.type === 'run' && queueMicrotask(() => c.die(1))
    const results = await Promise.allSettled([1, 2, 3, 4].map((v) => p.run(img(v))))
    expect(results.filter((r) => r.status === 'rejected').length).toBe(1)
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(3)

    chs[1].behave = (m, c) => m.type === 'run' && queueMicrotask(() => c.die(1))
    const all = await Promise.allSettled([5, 6, 7].map((v) => p.run(img(v))))
    expect(all.every((r) => r.status === 'rejected')).toBe(true)
  })

  it('关闭后排着的和新的都按取消处理', async () => {
    const { p, chs } = await pool(1)
    chs[0].behave = () => {}
    const a = p.run(img(1))
    const b = p.run(img(2))
    p.close()
    await expect(a).rejects.toBeInstanceOf(AbortError)
    await expect(b).rejects.toBeInstanceOf(AbortError)
    await expect(p.run(img(3))).rejects.toBeInstanceOf(AbortError)
    expect(chs[0].killed).toBe(true)
  })

  it('超时按单帧耗时放宽，至少 30 秒', async () => {
    const ch = new FakeChannel()
    const h = await start(ch)
    const spy = vi.spyOn(h, 'run')
    const p1 = new InferencePool([h], 'webgpu', 80, img(0), 1, 1)
    await p1.run(img(1))
    const p2 = new InferencePool([h], 'cpu', 4000, img(0), 1, 1)
    await p2.run(img(1))
    expect(spy.mock.calls.map((c) => c[4])).toEqual([30_000, 80_000])
  })
})
