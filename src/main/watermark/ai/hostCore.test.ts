import { describe, expect, it, vi } from 'vitest'
import { createHost, sessionOptions, type HostReply, type OrtLike } from './hostCore'

class FakeTensor {
  constructor(
    readonly type: string,
    readonly data: Float32Array,
    readonly dims: number[]
  ) {}
}

function fakeOrt(run: (feeds: Record<string, FakeTensor>) => Promise<Record<string, { data: unknown }>>): { ort: OrtLike; create: ReturnType<typeof vi.fn> } {
  const create = vi.fn(async () => ({ run: (f: Record<string, unknown>) => run(f as Record<string, FakeTensor>) }))
  return { ort: { Tensor: FakeTensor as unknown as OrtLike['Tensor'], InferenceSession: { create } }, create }
}

const input = { type: 'run' as const, id: 1, image: new Float32Array(3 * 4), mask: new Float32Array(4), height: 2, width: 2 }

describe('sessionOptions', () => {
  it('各后端的执行方式', () => {
    expect(sessionOptions('webgpu', 1).executionProviders).toEqual(['webgpu', 'cpu'])
    expect(sessionOptions('coreml', 1).executionProviders).toEqual([{ name: 'coreml', coreMlFlags: 0x10 }, 'cpu'])
    expect(sessionOptions('cpu', 2)).toMatchObject({ executionProviders: ['cpu'], intraOpNumThreads: 2, interOpNumThreads: 1 })
    expect(sessionOptions('cpu', 0).intraOpNumThreads).toBe(1)
  })
})

describe('createHost', () => {
  it('加载模型后推理，输入按 NCHW 包成张量', async () => {
    const out = new Float32Array(12).fill(7)
    const { ort, create } = fakeOrt(async (feeds) => {
      expect(feeds.image.dims).toEqual([1, 3, 2, 2])
      expect(feeds.mask.dims).toEqual([1, 1, 2, 2])
      return { output: { data: out } }
    })
    const sent: HostReply[] = []
    const load = vi.fn(async () => ort)
    const handle = createHost(load, (r) => sent.push(r))
    await handle({ type: 'init', model: '/m.onnx', backend: 'cpu', threads: 2 })
    await handle({ type: 'init', model: '/m.onnx', backend: 'webgpu', threads: 1 })
    expect(load).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith('/m.onnx', expect.objectContaining({ intraOpNumThreads: 2 }))
    await handle(input)
    expect(sent[0]).toMatchObject({ type: 'ready', backend: 'cpu' })
    expect(sent[2]).toMatchObject({ type: 'result', id: 1, output: out })
  })

  it('加载失败、还没加载、推理出错、输出不对都报回去', async () => {
    const sent: HostReply[] = []
    const bad = createHost(async () => {
      throw new Error('找不到 onnxruntime')
    }, (r) => sent.push(r))
    await bad({ type: 'init', model: 'm', backend: 'cpu', threads: 1 })
    await bad(input)
    expect(sent).toEqual([
      { type: 'error', message: '找不到 onnxruntime' },
      { type: 'error', id: 1, code: 'notLoaded', message: 'notLoaded' }
    ])

    sent.length = 0
    let mode = 0
    const { ort } = fakeOrt(async () => {
      if (mode === 0) throw 'GPU lost'
      return { output: { data: [1, 2] } }
    })
    const h = createHost(async () => ort, (r) => sent.push(r))
    await h({ type: 'init', model: 'm', backend: 'webgpu', threads: 1 })
    await h(input)
    mode = 1
    await h(input)
    expect(sent.slice(1)).toEqual([
      { type: 'error', id: 1, message: 'GPU lost' },
      { type: 'error', id: 1, code: 'noImage', message: 'noImage' }
    ])
  })
})
