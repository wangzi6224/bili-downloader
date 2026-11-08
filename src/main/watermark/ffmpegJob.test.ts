import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: h.spawn }))
vi.mock('../download/mux', async (o) => ({ ...(await o<typeof import('../download/mux')>()), ffmpegPath: () => 'ffmpeg' }))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '/app' } }))

/** 假的 ffmpeg 进程：测试里手动 emit stdout / stderr / close / error */
class FakeProc extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  kill = vi.fn(() => true)
}
let procs: FakeProc[] = []

/** 转码队列是模块级状态，每次重新导入一份 */
async function load(): Promise<
  typeof import('./ffmpegJob') & typeof import('../download/errors') & { runFfmpeg: typeof import('../download/mux').runFfmpeg }
> {
  vi.resetModules()
  const mux = await import('../download/mux')
  return { ...(await import('./ffmpegJob')), ...(await import('../download/errors')), runFfmpeg: mux.runFfmpeg }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

/** 一块 -progress 输出 */
const block = (o: Record<string, string | number>, end = false): string =>
  Object.entries(o)
    .map(([k, v]) => `${k}=${v}\n`)
    .join('') + `progress=${end ? 'end' : 'continue'}\n`

beforeEach(() => {
  procs = []
  h.spawn.mockReset().mockImplementation(() => {
    const p = new FakeProc()
    procs.push(p)
    return p
  })
})

afterEach(() => vi.useRealTimers())

describe('ffmpegCapture', () => {
  it('带固定前缀运行，收集 stdout 和 stderr，非 0 退出码照常返回', async () => {
    const { ffmpegCapture } = await load()
    const p = ffmpegCapture(['-i', 'a.mp4'], { loglevel: 'info' })
    expect(h.spawn).toHaveBeenCalledWith('ffmpeg', ['-hide_banner', '-loglevel', 'info', '-nostdin', '-i', 'a.mp4'])
    procs[0].stdout.emit('data', Buffer.from('ab'))
    procs[0].stdout.emit('data', Buffer.from('c'))
    procs[0].stderr.emit('data', 'Input #0\n')
    procs[0].stderr.emit('data', Buffer.from('At least one output file must be specified\n'))
    procs[0].emit('close', 1, null)
    const r = await p
    expect(r.code).toBe(1)
    expect(r.stdout.toString()).toBe('abc')
    expect(r.stderr).toBe('Input #0\nAt least one output file must be specified\n')
  })

  it('默认 loglevel 是 error，stderr 只保留最后 100 万字', async () => {
    const { ffmpegCapture } = await load()
    const p = ffmpegCapture([])
    expect(h.spawn.mock.calls[0][1]).toEqual(['-hide_banner', '-loglevel', 'error', '-nostdin'])
    procs[0].stderr.emit('data', 'x'.repeat(1_000_000))
    procs[0].stderr.emit('data', 'yz')
    procs[0].emit('close', 0, null)
    const r = await p
    expect(r.stderr.length).toBe(1_000_000)
    expect(r.stderr.endsWith('xyz')).toBe(true)
  })

  it('stdout 超过上限时结束进程并报错，之后的数据不再收', async () => {
    const { ffmpegCapture, FfmpegError } = await load()
    const p = ffmpegCapture([], { maxBytes: 3 })
    procs[0].stdout.emit('data', Buffer.from('ab'))
    procs[0].stdout.emit('data', Buffer.from('cd'))
    procs[0].stdout.emit('data', Buffer.from('ef'))
    expect(procs[0].kill).toHaveBeenCalledTimes(1)
    expect(procs[0].kill).toHaveBeenCalledWith('SIGKILL')
    procs[0].emit('close', null, 'SIGKILL')
    const e = await p.catch((err: unknown) => err)
    expect(e).toBeInstanceOf(FfmpegError)
    expect((e as Error).message).toBe('ffmpeg 输出的数据超出预期')
  })

  it('超时就结束进程，报没有响应并带上 stderr', async () => {
    vi.useFakeTimers()
    const { ffmpegCapture } = await load()
    const p = ffmpegCapture([], { timeoutMs: 1000 })
    procs[0].stderr.emit('data', 'slow')
    vi.advanceTimersByTime(999)
    expect(procs[0].kill).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(procs[0].kill).toHaveBeenCalledWith('SIGKILL')
    procs[0].emit('close', null, 'SIGKILL')
    const e = (await p.catch((err: unknown) => err)) as Error & { stderr?: string }
    expect(e.message).toBe('ffmpeg 没有响应')
    expect(e.stderr).toBe('slow')
  })

  it('默认 60 秒超时', async () => {
    vi.useFakeTimers()
    const { ffmpegCapture } = await load()
    const p = ffmpegCapture([])
    vi.advanceTimersByTime(59_999)
    expect(procs[0].kill).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    procs[0].emit('close', null, 'SIGKILL')
    await expect(p).rejects.toThrow('ffmpeg 没有响应')
  })

  it('中止时结束进程并抛 AbortError；已经中止时不启动进程', async () => {
    const { ffmpegCapture, AbortError } = await load()
    const ac = new AbortController()
    const p = ffmpegCapture([], { signal: ac.signal })
    ac.abort()
    expect(procs[0].kill).toHaveBeenCalledWith('SIGKILL')
    procs[0].emit('close', null, 'SIGKILL')
    await expect(p).rejects.toBeInstanceOf(AbortError)
    await expect(ffmpegCapture([], { signal: ac.signal })).rejects.toBeInstanceOf(AbortError)
    expect(h.spawn).toHaveBeenCalledTimes(1)
  })

  it('启动失败时报无法运行', async () => {
    const { ffmpegCapture, FfmpegError } = await load()
    const p = ffmpegCapture([])
    procs[0].emit('error', new Error('spawn ffmpeg ENOENT'))
    await expect(p).rejects.toBeInstanceOf(FfmpegError)
    await expect(p).rejects.toThrow('无法运行 ffmpeg：spawn ffmpeg ENOENT')
  })

  it('结束后清掉超时和中止监听', async () => {
    vi.useFakeTimers()
    const { ffmpegCapture } = await load()
    const ac = new AbortController()
    const p = ffmpegCapture([], { signal: ac.signal, timeoutMs: 1000 })
    procs[0].emit('close', 0, null)
    await p
    ac.abort()
    vi.advanceTimersByTime(5000)
    expect(procs[0].kill).not.toHaveBeenCalled()
  })
})

describe('progressParser', () => {
  it('换算百分比和剩余时间，进度块可以被拆进两个 chunk', async () => {
    const { progressParser } = await load()
    const cb = vi.fn()
    const feed = progressParser(100, cb)
    const text = block({ frame: 750, out_time_us: 25_000_000, out_time_ms: 25_000_000, speed: '  5x' })
    feed(text.slice(0, 17))
    expect(cb).not.toHaveBeenCalled()
    feed(Buffer.from(text.slice(17)))
    expect(cb).toHaveBeenCalledWith({ pct: 25, eta: 15 })
  })

  it('N/A、负数忽略；没有 out_time_us 时用 out_time_ms（单位同样是微秒）', async () => {
    const { progressParser } = await load()
    const cb = vi.fn()
    const feed = progressParser(10, cb)
    feed(block({ frame: 0, out_time_us: 'N/A', out_time_ms: 'N/A', speed: 'N/A' }))
    feed(block({ out_time_us: -33_333, speed: '1x' }))
    expect(cb).not.toHaveBeenCalled()
    feed(block({ out_time_ms: 2_500_000, speed: 'N/A' }))
    expect(cb).toHaveBeenLastCalledWith({ pct: 25 })
    feed(block({ out_time_us: 5_000_000, speed: '0x' }))
    expect(cb).toHaveBeenLastCalledWith({ pct: 50 })
  })

  it('超过时长时封顶 99.9，剩余时间不为负；结束时给 99.9', async () => {
    const { progressParser } = await load()
    const cb = vi.fn()
    const feed = progressParser(10, cb)
    feed(block({ out_time_us: 12_000_000, speed: '2x' }))
    expect(cb).toHaveBeenLastCalledWith({ pct: 99.9, eta: 0 })
    feed(block({ out_time_us: 12_000_000 }, true))
    expect(cb).toHaveBeenLastCalledWith({ pct: 99.9, eta: 0 })
  })

  it('不知道时长时只报结束；忽略空行、没有等号的行，兼容 \\r\\n', async () => {
    const { progressParser } = await load()
    const cb = vi.fn()
    const feed = progressParser(undefined, cb)
    feed('frame=10\r\n\r\ngarbage\r\n=x\r\nout_time_us=1000000\r\nprogress=continue\r\n')
    expect(cb).not.toHaveBeenCalled()
    feed('progress=end\n')
    expect(cb).toHaveBeenCalledWith({ pct: 99.9, eta: 0 })
    progressParser(0, cb)(block({ out_time_us: 1 }))
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

const PREFIX = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-nostats', '-progress', 'pipe:1']

describe('runTranscode', () => {
  it('带固定前缀启动，转发进度，退出码 0 时成功', async () => {
    const { runTranscode } = await load()
    const onStart = vi.fn()
    const onProgress = vi.fn()
    const p = runTranscode(['-i', 'a'], { durationSec: 10, onStart, onProgress })
    await flush()
    expect(h.spawn).toHaveBeenCalledWith('ffmpeg', [...PREFIX, '-i', 'a'])
    expect(onStart).toHaveBeenCalledTimes(1)
    procs[0].stdout.emit('data', block({ frame: 30, out_time_us: 1_000_000, speed: '2x' }))
    expect(onProgress).toHaveBeenCalledWith({ pct: 10, eta: 5 })
    procs[0].emit('close', 0, null)
    await expect(p).resolves.toBeUndefined()
  })

  it('不传选项也能跑', async () => {
    const { runTranscode } = await load()
    const p = runTranscode([])
    await flush()
    procs[0].stdout.emit('data', block({ out_time_us: 1 }, true))
    procs[0].emit('close', 0, null)
    await expect(p).resolves.toBeUndefined()
  })

  it('失败时按“去水印失败”翻译，并带上 stderr 末尾', async () => {
    const { runTranscode, FfmpegError } = await load()
    const p = runTranscode([])
    await flush()
    procs[0].stderr.emit('data', 'y'.repeat(5000))
    procs[0].stderr.emit('data', '\n[Parsed_delogo_0] Logo area is outside of the frame.\n')
    procs[0].emit('close', 234, null)
    const e = (await p.catch((err: unknown) => err)) as InstanceType<typeof FfmpegError>
    expect(e).toBeInstanceOf(FfmpegError)
    expect(e.message).toBe('去水印失败：水印位置超出了画面')
    expect(e.stderr?.length).toBe(4000)
  })

  it('启动失败时报无法运行', async () => {
    const { runTranscode } = await load()
    const p = runTranscode([])
    await flush()
    procs[0].emit('error', new Error('spawn ffmpeg EACCES'))
    await expect(p).rejects.toThrow('无法运行 ffmpeg：spawn ffmpeg EACCES')
  })

  it('运行中中止时结束进程并抛 AbortError', async () => {
    const { runTranscode, AbortError } = await load()
    const ac = new AbortController()
    const p = runTranscode([], { signal: ac.signal })
    await flush()
    ac.abort()
    expect(procs[0].kill).toHaveBeenCalledWith('SIGKILL')
    procs[0].emit('close', null, 'SIGKILL')
    await expect(p).rejects.toBeInstanceOf(AbortError)
  })

  it('已经中止时不启动进程', async () => {
    const { runTranscode, AbortError } = await load()
    const ac = new AbortController()
    ac.abort()
    await expect(runTranscode([], { signal: ac.signal })).rejects.toBeInstanceOf(AbortError)
    await flush()
    expect(h.spawn).not.toHaveBeenCalled()
  })

  it('同一时间只跑一个，前一个失败不影响后面的', async () => {
    const { runTranscode } = await load()
    const onStart = vi.fn()
    const a = runTranscode(['a'])
    const b = runTranscode(['b'], { onStart })
    await flush()
    expect(h.spawn).toHaveBeenCalledTimes(1)
    expect(onStart).not.toHaveBeenCalled()
    procs[0].emit('close', 1, null)
    await expect(a).rejects.toThrow('去水印失败（ffmpeg 退出码 1）')
    await flush()
    expect(h.spawn).toHaveBeenCalledTimes(2)
    expect(h.spawn.mock.calls[1][1]).toContain('b')
    expect(onStart).toHaveBeenCalledTimes(1)
    procs[1].emit('close', 0, null)
    await expect(b).resolves.toBeUndefined()
  })

  it('排队中被中止立刻结束，轮到时也不启动，后面的照常排队', async () => {
    const { runTranscode, AbortError } = await load()
    const a = runTranscode(['a'])
    const ac = new AbortController()
    const b = runTranscode(['b'], { signal: ac.signal })
    const c = runTranscode(['c'])
    await flush()
    ac.abort()
    await expect(b).rejects.toBeInstanceOf(AbortError)
    expect(h.spawn).toHaveBeenCalledTimes(1)
    procs[0].emit('close', 0, null)
    await a
    await flush()
    expect(h.spawn).toHaveBeenCalledTimes(2)
    expect(h.spawn.mock.calls[1][1]).toContain('c')
    procs[1].emit('close', 0, null)
    await expect(c).resolves.toBeUndefined()
  })

  it('排队到一半被中止的任务，轮到它时不启动', async () => {
    const { runTranscode } = await load()
    const ac = new AbortController()
    const a = runTranscode(['a'])
    // 中止监听已经撤掉、还没启动进程的那一刻被中止
    const b = runTranscode(['b'], { signal: ac.signal })
    await flush()
    const remove = vi.spyOn(ac.signal, 'removeEventListener').mockImplementation(() => {
      ac.abort()
    })
    procs[0].emit('close', 0, null)
    await a
    await expect(b).rejects.toThrow()
    await flush()
    remove.mockRestore()
    expect(h.spawn).toHaveBeenCalledTimes(1)
  })

  it('和合并的队列互不阻塞', async () => {
    const { runTranscode, runFfmpeg } = await load()
    const t = runTranscode(['t'])
    const m = runFfmpeg(['m'])
    await flush()
    expect(h.spawn).toHaveBeenCalledTimes(2)
    procs[0].emit('close', 0, null)
    procs[1].emit('close', 0, null)
    await Promise.all([t, m])
  })

  it('进度有增长就重新计时，长时间没增长就结束进程报超时', async () => {
    vi.useFakeTimers()
    const { runTranscode, FfmpegError } = await load()
    const p = runTranscode([], { idleMs: 1000 })
    await flush()
    vi.advanceTimersByTime(900)
    procs[0].stdout.emit('data', block({ frame: 0, out_time_us: 'N/A' }))
    vi.advanceTimersByTime(900)
    procs[0].stdout.emit('data', block({ frame: 0, out_time_us: 1000 }))
    vi.advanceTimersByTime(900)
    procs[0].stdout.emit('data', block({ frame: 5, out_time_us: 1000 }))
    vi.advanceTimersByTime(900)
    // 数值没变：卡住的编码线程照样打印进度块
    procs[0].stdout.emit('data', block({ frame: 5, out_time_us: 1000 }))
    expect(procs[0].kill).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(procs[0].kill).toHaveBeenCalledWith('SIGKILL')
    procs[0].stderr.emit('data', 'stuck')
    procs[0].emit('close', null, 'SIGKILL')
    const e = (await p.catch((err: unknown) => err)) as InstanceType<typeof FfmpegError>
    expect(e).toBeInstanceOf(FfmpegError)
    expect(e.message).toBe('去水印超时：ffmpeg 长时间没有进展')
    expect(e.stderr).toBe('stuck')
  })

  it('默认 2 分钟没有进展视为卡死', async () => {
    vi.useFakeTimers()
    const { runTranscode } = await load()
    const p = runTranscode([])
    await flush()
    vi.advanceTimersByTime(119_999)
    expect(procs[0].kill).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(procs[0].kill).toHaveBeenCalledWith('SIGKILL')
    procs[0].emit('close', null, 'SIGKILL')
    await expect(p).rejects.toThrow('去水印超时')
  })

  it('结束后清掉看门狗和中止监听', async () => {
    vi.useFakeTimers()
    const { runTranscode } = await load()
    const ac = new AbortController()
    const p = runTranscode([], { signal: ac.signal, idleMs: 1000 })
    await flush()
    procs[0].emit('close', 0, null)
    await p
    ac.abort()
    vi.advanceTimersByTime(5000)
    expect(procs[0].kill).not.toHaveBeenCalled()
  })
})

describe('系统睡眠', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('AwakeClock：心跳间隔太长的那段算睡着，不计入', async () => {
    const { AwakeClock } = await load()
    const c = new AwakeClock(0)
    c.tick(1000)
    c.tick(2000)
    expect(c.elapsed(3000)).toBe(3000)
    // 3 秒后睡了 10 分钟：只多算一个心跳间隔
    expect(c.elapsed(603_000)).toBe(4000)
    c.tick(604_000)
    expect(c.elapsed(604_000)).toBe(5000)
    c.reset(700_000)
    expect(c.elapsed(701_000)).toBe(1000)
  })

  it('计时器在睡醒后到期（Windows 的计时器会把睡眠算进去）：扣掉睡眠，补够醒着的时间再判超时', async () => {
    vi.useFakeTimers()
    const { awakeTimer } = await load()
    let now = 0
    const expire = vi.fn()
    const t = awakeTimer(5000, expire, () => now)
    now = 1000
    vi.advanceTimersByTime(1000)
    // 睡了 10 分钟，醒来时计时器以为已经过了 5 秒
    now = 601_000
    vi.advanceTimersByTime(4000)
    expect(expire).not.toHaveBeenCalled()
    // 醒着又过了 3 秒，加上睡前的 1 秒和醒来的 1 个心跳，才算满
    now = 604_000
    vi.advanceTimersByTime(3000)
    expect(expire).toHaveBeenCalledTimes(1)
    t.stop()
  })

  it('转码时系统睡了一觉：醒来不会被看门狗误杀', async () => {
    vi.useFakeTimers()
    const { runTranscode } = await load()
    const p = runTranscode([], { idleMs: 120_000 })
    await flush()
    vi.advanceTimersByTime(60_000)
    // 系统时间跳了 1 小时（睡眠），计时器没走
    vi.setSystemTime(Date.now() + 3_600_000)
    vi.advanceTimersByTime(59_000)
    expect(procs[0].kill).not.toHaveBeenCalled()
    procs[0].emit('close', 0, null)
    await p
  })

  it('读信息、抽帧的超时同样不算睡眠', async () => {
    vi.useFakeTimers()
    const { ffmpegCapture } = await load()
    const p = ffmpegCapture([], { timeoutMs: 10_000 })
    vi.advanceTimersByTime(5000)
    vi.setSystemTime(Date.now() + 3_600_000)
    vi.advanceTimersByTime(4000)
    expect(procs[0].kill).not.toHaveBeenCalled()
    procs[0].emit('close', 0, null)
    await expect(p).resolves.toMatchObject({ code: 0 })
  })
})
