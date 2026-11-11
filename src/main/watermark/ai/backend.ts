// 选推理后端并开好进程池。
// 实测（水印长条 432×144）：WebGPU 最快（M5 Pro 80ms、RTX 5070 92ms、Intel iMac 的 Radeon 192ms），再开进程也不会更快；
// CoreML 在 Apple 芯片上可用（121ms），在 Intel Mac 上会卡死；DirectML 跑不了这个模型。
// CPU 单个会话加线程几乎没用（模型由几千个小算子组成），要开多个进程，每个约占 0.6GB 内存
import { t } from '@shared/i18n'
import { AbortError } from '../../download/errors'
import type { Backend } from './hostCore'
import { HostError, InferenceHost, InferencePool, type SpawnHost } from './pool'

export function backendOrder(platform: string = process.platform, arch: string = process.arch): Backend[] {
  if (platform === 'darwin' && arch === 'arm64') return ['webgpu', 'coreml', 'cpu']
  return ['webgpu', 'cpu']
}

/** 每个 CPU 推理进程大约占的内存 */
const CPU_HOST_BYTES = 0.7 * 1024 ** 3
/** 最多拿出总内存的这么多给推理进程 */
const MEM_SHARE = 0.35
const MAX_CPU_HOSTS = 8

/**
 * CPU 推理开几个进程、每个几个线程。logical 是逻辑核数；x64 一般有超线程，物理核按一半算。
 * 留一个核给解码、编码和界面
 */
export function cpuPlan(o: { logical: number; arch: string; totalMem: number }): { hosts: number; threads: number } {
  const physical = Math.max(1, o.arch === 'arm64' ? o.logical : Math.floor(o.logical / 2))
  const byCores = Math.max(1, physical - 1)
  const byMem = Math.max(1, Math.floor((o.totalMem * MEM_SHARE) / CPU_HOST_BYTES))
  const hosts = Math.min(MAX_CPU_HOSTS, byCores, byMem)
  // 内存不够开满时，每个进程多给一个线程，多少能快一点
  const threads = hosts * 2 <= byCores ? 2 : 1
  return { hosts, threads }
}

/** 多个 CPU 进程同时跑会互相抢内存带宽，实测 4 个约 0.73、8 个约 0.54 的效率 */
export const cpuEfficiency = (hosts: number): number => 1 / (1 + 0.12 * (hosts - 1))

export interface Sample {
  image: Float32Array
  mask: Float32Array
  height: number
  width: number
}

/** 输出是有限值，没被掩码盖住的地方和输入基本一样（模型会原样保留它们）；GPU 驱动出错时常见全 0 或 NaN */
export function validOutput(out: Float32Array, s: Sample): boolean {
  const n = s.height * s.width
  if (out.length !== 3 * n) return false
  let diff = 0
  let count = 0
  for (let i = 0; i < out.length; i++) {
    if (!Number.isFinite(out[i])) return false
    if (s.mask[i % n]) continue
    diff += Math.abs(out[i] - s.image[i] * 255)
    count++
  }
  return count === 0 || diff / count < 6
}

/** 这次运行里出过问题的后端，后面的任务不再试 */
const broken = new Map<Backend, string>()

export function markBroken(b: Backend, reason: string): void {
  broken.set(b, reason)
}

/** 测试用 */
export function resetBroken(): void {
  broken.clear()
}

const INIT_TIMEOUT: Record<Backend, number> = { webgpu: 90_000, coreml: 180_000, cpu: 90_000 }
/** 第一次推理要编译着色器、分配显存，慢得多 */
const WARMUP_TIMEOUT = 120_000

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export interface OpenPoolInput {
  spawn: SpawnHost
  model: string
  sample: Sample
  signal?: AbortSignal
  order?: Backend[]
  cpu?: { hosts: number; threads: number }
  /** 正在试哪个后端，界面上显示 */
  onTry?: (b: Backend) => void
}

async function startHost(o: OpenPoolInput, b: Backend, threads: number): Promise<{ host: InferenceHost; ms: number }> {
  const host = await InferenceHost.start(o.spawn, { model: o.model, backend: b, threads, timeoutMs: INIT_TIMEOUT[b] })
  try {
    const s = o.sample
    await host.run(s.image, s.mask, s.height, s.width, WARMUP_TIMEOUT)
    const r = await host.run(s.image, s.mask, s.height, s.width, WARMUP_TIMEOUT)
    if (!validOutput(r.output, s)) throw new HostError(t('wm.badInference'))
    return { host, ms: r.ms }
  } catch (e) {
    host.kill()
    throw e
  }
}

/**
 * 按顺序试后端：能加载、试跑两次结果正常的就用。GPU 用一个进程；CPU 按 cpu 计划再开几个。
 * 都不行时报错，说明各自的原因
 */
export async function openPool(o: OpenPoolInput): Promise<InferencePool> {
  const errors: string[] = []
  const cpu = o.cpu ?? { hosts: 1, threads: 1 }
  for (const b of o.order ?? backendOrder()) {
    if (o.signal?.aborted) throw new AbortError()
    const known = broken.get(b)
    if (known) {
      errors.push(`${b}：${known}`)
      continue
    }
    o.onTry?.(b)
    let first: { host: InferenceHost; ms: number }
    try {
      first = await startHost(o, b, b === 'cpu' ? cpu.threads : 1)
    } catch (e) {
      if (o.signal?.aborted) throw new AbortError()
      markBroken(b, message(e))
      errors.push(`${b}：${message(e)}`)
      continue
    }
    const hosts = [first.host]
    if (b === 'cpu' && cpu.hosts > 1) {
      const more = await Promise.allSettled(Array.from({ length: cpu.hosts - 1 }, () => startHost(o, b, cpu.threads)))
      for (const r of more) if (r.status === 'fulfilled') hosts.push(r.value.host)
    }
    if (o.signal?.aborted) {
      for (const h of hosts) h.kill()
      throw new AbortError()
    }
    return new InferencePool(hosts, b, first.ms, o.sample.mask, o.sample.height, o.sample.width)
  }
  throw new Error(t('wm.noAiBackend', { errors: errors.join('；') }))
}
