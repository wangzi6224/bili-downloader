import { beforeEach, describe, expect, it } from 'vitest'
import { AbortError } from '../../download/errors'
import { backendOrder, cpuEfficiency, cpuPlan, markBroken, openPool, resetBroken, validOutput, type Sample } from './backend'
import type { Backend, HostReply, HostRequest } from './hostCore'
import type { HostChannel } from './pool'

const sample: Sample = { image: new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]), mask: new Float32Array([0, 1]), height: 1, width: 2 }
/** 合格的输出：没盖住的像素和输入一样，盖住的随便 */
const good = (): Float32Array => new Float32Array([25.5, 99, 76.5, 99, 127.5, 99])

type Plan = Partial<Record<Backend, 'ok' | 'fail' | 'garbage' | 'crash'>>

/** 按后端决定表现的假进程；记录启动了哪些 */
function spawner(plan: Plan, started: Backend[] = []): () => HostChannel {
  return () => {
    let msg: (r: HostReply) => void = () => {}
    let exit: (c: number | null) => void = () => {}
    let backend: Backend = 'cpu'
    return {
      send: (m: HostRequest) =>
        queueMicrotask(() => {
          if (m.type === 'init') {
            backend = m.backend
            started.push(m.backend)
            const how = plan[m.backend] ?? 'ok'
            if (how === 'fail') return msg({ type: 'error', message: `${m.backend} 加载失败` })
            return msg({ type: 'ready', backend: m.backend, ms: 1 })
          }
          const how = plan[backend] ?? 'ok'
          if (how === 'crash') return exit(9)
          msg({ type: 'result', id: m.id, output: how === 'garbage' ? new Float32Array(6).fill(Number.NaN) : good(), ms: backend === 'cpu' ? 300 : 80 })
        }),
      onMessage: (cb) => (msg = cb),
      onExit: (cb) => (exit = cb),
      kill: () => {}
    }
  }
}

beforeEach(() => resetBroken())

describe('backendOrder', () => {
  it('Apple 芯片多一个 CoreML，Intel Mac 不用（会卡死）', () => {
    expect(backendOrder('darwin', 'arm64')).toEqual(['webgpu', 'coreml', 'cpu'])
    expect(backendOrder('darwin', 'x64')).toEqual(['webgpu', 'cpu'])
    expect(backendOrder('win32', 'x64')).toEqual(['webgpu', 'cpu'])
    expect(backendOrder('linux', 'x64')).toEqual(['webgpu', 'cpu'])
    expect(backendOrder().length).toBeGreaterThan(1)
  })
})

describe('cpuPlan', () => {
  const GB = 1024 ** 3
  it('按物理核和内存决定进程数，最多 8 个', () => {
    expect(cpuPlan({ logical: 18, arch: 'arm64', totalMem: 48 * GB })).toEqual({ hosts: 8, threads: 2 })
    expect(cpuPlan({ logical: 32, arch: 'x64', totalMem: 32 * GB })).toEqual({ hosts: 8, threads: 1 })
    expect(cpuPlan({ logical: 8, arch: 'x64', totalMem: 16 * GB })).toEqual({ hosts: 3, threads: 1 })
    expect(cpuPlan({ logical: 8, arch: 'arm64', totalMem: 8 * GB })).toEqual({ hosts: 4, threads: 1 })
    expect(cpuPlan({ logical: 2, arch: 'x64', totalMem: 2 * GB })).toEqual({ hosts: 1, threads: 1 })
    expect(cpuPlan({ logical: 12, arch: 'arm64', totalMem: 4 * GB })).toEqual({ hosts: 2, threads: 2 })
  })

  it('多进程的效率', () => {
    expect(cpuEfficiency(1)).toBe(1)
    expect(cpuEfficiency(4)).toBeCloseTo(0.735, 2)
    expect(cpuEfficiency(8)).toBeCloseTo(0.54, 2)
  })
})

describe('validOutput', () => {
  it('没盖住的地方和输入一致、都是有限值才算正常', () => {
    expect(validOutput(good(), sample)).toBe(true)
    expect(validOutput(new Float32Array(5), sample)).toBe(false)
    expect(validOutput(new Float32Array(6), sample)).toBe(false)
    const nan = good()
    nan[1] = Number.NaN
    expect(validOutput(nan, sample)).toBe(false)
    expect(validOutput(new Float32Array(3), { ...sample, image: new Float32Array(3), mask: new Float32Array([1]), width: 1 })).toBe(true)
  })
})

describe('openPool', () => {
  it('第一个能用的后端：GPU 只开一个进程', async () => {
    const started: Backend[] = []
    const tried: Backend[] = []
    const p = await openPool({ spawn: spawner({}, started), model: 'm', sample, order: ['webgpu', 'cpu'], cpu: { hosts: 4, threads: 1 }, onTry: (b) => tried.push(b) })
    expect(p.backend).toBe('webgpu')
    expect(p.hosts.length).toBe(1)
    expect(p.msPerFrame).toBe(80)
    expect(started).toEqual(['webgpu'])
    expect(tried).toEqual(['webgpu'])
    p.close()
  })

  it('GPU 加载失败、结果异常、崩溃都换下一个，记住坏了的后端', async () => {
    for (const how of ['fail', 'garbage', 'crash'] as const) {
      resetBroken()
      const p = await openPool({ spawn: spawner({ webgpu: how }), model: 'm', sample, order: ['webgpu', 'cpu'] })
      expect(p.backend).toBe('cpu')
      p.close()
      const started: Backend[] = []
      const again = await openPool({ spawn: spawner({}, started), model: 'm', sample, order: ['webgpu', 'cpu'] })
      expect(started).toEqual(['cpu'])
      again.close()
    }
  })

  it('CPU 按计划开多个进程，开不起来的跳过', async () => {
    let n = 0
    const ok = spawner({})
    const bad = spawner({ cpu: 'fail' })
    markBroken('webgpu', '没有显卡')
    const p = await openPool({ spawn: () => (++n === 3 ? bad() : ok()), model: 'm', sample, order: ['webgpu', 'cpu'], cpu: { hosts: 3, threads: 1 } })
    expect(p.backend).toBe('cpu')
    expect(p.hosts.length).toBe(2)
    p.close()
  })

  it('都不能用时说明原因；中途取消', async () => {
    await expect(openPool({ spawn: spawner({ webgpu: 'fail', cpu: 'fail' }), model: 'm', sample, order: ['webgpu', 'cpu'] })).rejects.toThrow(
      '没有可用的 AI 推理方式（webgpu：webgpu 加载失败；cpu：cpu 加载失败）'
    )
    const ac = new AbortController()
    ac.abort()
    await expect(openPool({ spawn: spawner({}), model: 'm', sample, order: ['cpu'], signal: ac.signal })).rejects.toBeInstanceOf(AbortError)

    resetBroken()
    const ac2 = new AbortController()
    const failing = spawner({ webgpu: 'fail' })
    const p = openPool({
      spawn: () => {
        const ch = failing()
        queueMicrotask(() => ac2.abort())
        return ch
      },
      model: 'm',
      sample,
      order: ['webgpu', 'cpu'],
      signal: ac2.signal
    })
    await expect(p).rejects.toBeInstanceOf(AbortError)
  })

  it('CPU 开完进程后发现已取消：结束它们', async () => {
    const ac = new AbortController()
    const base = spawner({})
    let inits = 0
    const spawn = (): HostChannel => {
      const ch = base()
      const send = ch.send
      ch.send = (m) => {
        if (m.type === 'init' && ++inits === 2) ac.abort()
        send(m)
      }
      return ch
    }
    await expect(openPool({ spawn, model: 'm', sample, order: ['cpu'], cpu: { hosts: 2, threads: 1 }, signal: ac.signal })).rejects.toBeInstanceOf(AbortError)
  })
})
