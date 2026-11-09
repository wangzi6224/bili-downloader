// 推理子进程里的逻辑：收到 init 加载模型，收到 run 推理一次。
// onnxruntime 的 run 是同步的，会卡住所在线程，而且 GPU 驱动出问题时可能崩溃或卡死，
// 所以每个会话放在单独的子进程里，主进程随时可以结束它

export type Backend = 'webgpu' | 'coreml' | 'cpu'

export type HostRequest =
  | { type: 'init'; model: string; backend: Backend; threads: number }
  | { type: 'run'; id: number; image: Float32Array; mask: Float32Array; height: number; width: number }

export type HostReply =
  | { type: 'ready'; backend: Backend; ms: number }
  | { type: 'result'; id: number; output: Float32Array; ms: number }
  | { type: 'error'; id?: number; message: string }

/** 用到的那一小部分 onnxruntime-node 接口 */
export interface OrtLike {
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => unknown
  InferenceSession: {
    create(path: string, options: Record<string, unknown>): Promise<{
      run(feeds: Record<string, unknown>): Promise<Record<string, { data: unknown }>>
    }>
  }
}

/** CoreML 用 MLProgram 格式（COREML_FLAG_CREATE_MLPROGRAM），实测比旧格式快一倍且结果和 CPU 一致 */
const COREML_MLPROGRAM = 0x010

export function sessionOptions(backend: Backend, threads: number): Record<string, unknown> {
  const providers = backend === 'webgpu' ? ['webgpu', 'cpu'] : backend === 'coreml' ? [{ name: 'coreml', coreMlFlags: COREML_MLPROGRAM }, 'cpu'] : ['cpu']
  return {
    executionProviders: providers,
    intraOpNumThreads: Math.max(1, threads),
    interOpNumThreads: 1,
    executionMode: 'sequential',
    graphOptimizationLevel: 'all'
  }
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** 返回处理一条消息的函数；ort 在第一次 init 时才加载，加载失败也能报回去 */
export function createHost(loadOrt: () => Promise<OrtLike>, send: (r: HostReply) => void): (m: HostRequest) => Promise<void> {
  let ort: OrtLike | undefined
  let session: Awaited<ReturnType<OrtLike['InferenceSession']['create']>> | undefined
  return async (m) => {
    if (m.type === 'init') {
      try {
        const t = performance.now()
        ort ??= await loadOrt()
        session = await ort.InferenceSession.create(m.model, sessionOptions(m.backend, m.threads))
        send({ type: 'ready', backend: m.backend, ms: performance.now() - t })
      } catch (e) {
        send({ type: 'error', message: message(e) })
      }
      return
    }
    if (!session || !ort) return send({ type: 'error', id: m.id, message: '模型还没加载' })
    try {
      const t = performance.now()
      const out = await session.run({
        image: new ort.Tensor('float32', m.image, [1, 3, m.height, m.width]),
        mask: new ort.Tensor('float32', m.mask, [1, 1, m.height, m.width])
      })
      const data = Object.values(out)[0]?.data
      if (!(data instanceof Float32Array)) throw new Error('模型没有输出图像')
      send({ type: 'result', id: m.id, output: data, ms: performance.now() - t })
    } catch (e) {
      send({ type: 'error', id: m.id, message: message(e) })
    }
  }
}
