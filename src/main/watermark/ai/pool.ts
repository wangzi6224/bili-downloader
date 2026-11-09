// 推理子进程和进程池：每个子进程一个会话，空闲的进程取下一帧；超时或进程退出都会报 HostError，
// 调用方据此换后端（比如 GPU 驱动出问题时改用 CPU）
import { AbortError } from '../../download/errors'
import type { Backend, HostReply, HostRequest } from './hostCore'

export interface HostChannel {
  send(m: HostRequest): void
  onMessage(cb: (r: HostReply) => void): void
  onExit(cb: (code: number | null) => void): void
  kill(): void
}

export type SpawnHost = () => HostChannel

/** 推理进程出了问题（加载失败、超时、崩溃）：换个后端可能就好 */
export class HostError extends Error {}

interface Pending {
  resolve: (r: { output: Float32Array; ms: number }) => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout
}

export class InferenceHost {
  private seq = 0
  private readonly pending = new Map<number, Pending>()
  private dead: Error | undefined

  private constructor(
    private readonly ch: HostChannel,
    readonly backend: Backend
  ) {
    ch.onMessage((r) => {
      if (r.type === 'ready' || r.id === undefined) return
      const p = this.pending.get(r.id)
      if (!p) return
      this.pending.delete(r.id)
      clearTimeout(p.timer)
      if (r.type === 'result') p.resolve({ output: r.output, ms: r.ms })
      else p.reject(new HostError(r.message))
    })
    ch.onExit((code) => this.fail(new HostError(`推理进程意外退出（代码 ${code ?? '未知'}）`)))
  }

  /** 启动子进程并加载模型；超时、出错都会结束子进程 */
  static start(spawn: SpawnHost, o: { model: string; backend: Backend; threads: number; timeoutMs: number }): Promise<InferenceHost> {
    const ch = spawn()
    return new Promise((resolve, reject) => {
      let settled = false
      const done = (e?: Error): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (e) {
          ch.kill()
          reject(e)
        } else resolve(new InferenceHost(ch, o.backend))
      }
      const timer = setTimeout(() => done(new HostError('加载模型超时')), o.timeoutMs)
      ch.onMessage((r) => {
        if (r.type === 'ready') done()
        else if (r.type === 'error' && r.id === undefined) done(new HostError(r.message))
      })
      ch.onExit((code) => done(new HostError(`推理进程意外退出（代码 ${code ?? '未知'}）`)))
      ch.send({ type: 'init', model: o.model, backend: o.backend, threads: o.threads })
    })
  }

  get alive(): boolean {
    return !this.dead
  }

  run(image: Float32Array, mask: Float32Array, height: number, width: number, timeoutMs: number): Promise<{ output: Float32Array; ms: number }> {
    if (this.dead) return Promise.reject(this.dead)
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      // 卡住的会话（驱动挂起）不会自己恢复，直接结束进程
      const timer = setTimeout(() => {
        this.fail(new HostError('推理超时'))
        this.ch.kill()
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.ch.send({ type: 'run', id, image, mask, height, width })
    })
  }

  private fail(e: Error): void {
    this.dead ??= e
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(this.dead)
    }
    this.pending.clear()
  }

  kill(): void {
    this.fail(new AbortError())
    this.ch.kill()
  }
}

interface Job {
  image: Float32Array
  resolve: (out: Float32Array) => void
  reject: (e: Error) => void
}

/** 几个同样的推理进程，按空闲分派；尺寸和掩码对整段视频都一样 */
export class InferencePool {
  private readonly queue: Job[] = []
  private readonly idle: InferenceHost[]
  private closed = false

  constructor(
    readonly hosts: InferenceHost[],
    readonly backend: Backend,
    /** 单个进程推理一帧的毫秒数（试跑测得） */
    readonly msPerFrame: number,
    private readonly mask: Float32Array,
    private readonly height: number,
    private readonly width: number
  ) {
    this.idle = [...hosts]
  }

  /** 超时：正常耗时的 20 倍，至少 30 秒（系统繁忙、显卡被别的程序占用时会慢很多） */
  private get timeoutMs(): number {
    return Math.max(30_000, this.msPerFrame * 20)
  }

  run(image: Float32Array): Promise<Float32Array> {
    if (this.closed) return Promise.reject(new AbortError())
    return new Promise((resolve, reject) => {
      this.queue.push({ image, resolve, reject })
      this.pump()
    })
  }

  private pump(): void {
    while (this.queue.length && this.idle.length) {
      const host = this.idle.shift()!
      const job = this.queue.shift()!
      host.run(job.image, this.mask, this.height, this.width, this.timeoutMs).then(
        (r) => {
          job.resolve(r.output)
          if (host.alive && !this.closed) this.idle.push(host)
          this.pump()
        },
        (e: Error) => {
          job.reject(e)
          // 坏掉的进程不再用；一个都不剩时，排着的也都失败
          if (host.alive && !this.closed) this.idle.push(host)
          if (!this.hosts.some((h) => h.alive)) this.failQueued(e)
          this.pump()
        }
      )
    }
  }

  private failQueued(e: Error): void {
    for (const j of this.queue.splice(0)) j.reject(e)
  }

  close(): void {
    this.closed = true
    this.failQueued(new AbortError())
    for (const h of this.hosts) h.kill()
  }
}
