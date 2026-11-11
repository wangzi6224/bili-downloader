// 去水印对话框里的 AI 精修：估算处理时间、预览一帧的效果。
// 同一个任务、同一个框只分析、加载一次；推理进程留着给后面的预览用，对话框关掉或闲置一会儿就释放
import { availableParallelism, totalmem } from 'node:os'
import { t } from '@shared/i18n'
import type { AiEstimate, WatermarkRegion } from '@shared/types'
import { clampRegion } from '@shared/watermark'
import { FfmpegError } from '../../download/errors'
import { ffmpegCapture } from '../ffmpegJob'
import { probeMedia } from '../probe'
import { analyze, estimateReuse, makeCodec, type Analysis } from './analysis'
import { rateValue } from './args'
import { cpuPlan, openPool } from './backend'
import { estimateSeconds } from './estimate'
import type { AiModel } from './model'
import type { StripCodec } from './pixels'
import type { InferencePool, SpawnHost } from './pool'
import { recordCalibration } from '../speed'
import { backendLabel, grabFrame } from './refine'

/** 闲置这么久就结束推理进程 */
const IDLE_MS = 3 * 60_000

interface Prepared {
  a: Analysis
  codec: StripCodec
  pool: InferencePool
  duration: number
  /** 真正处理时开几个推理进程（CPU 时可能不止一个） */
  hosts: number
  reuse?: Promise<number>
}

interface Session {
  path: string
  key: string
  ready: Promise<Prepared>
  timer?: NodeJS.Timeout
}

/** 把一帧 yuv420p 转成界面用的 JPEG（data URL） */
export async function frameJpeg(frame: Uint8Array, a: Analysis, maxWidth = 1280): Promise<string> {
  const range = a.color.full ? 'pc' : 'tv'
  const space = a.color.matrix === 'bt709' ? 'bt709' : 'smpte170m'
  const r = await ffmpegCapture(
    [
      ...['-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', `${a.width}x${a.height}`, '-color_range', range, '-colorspace', space, '-i', 'pipe:0'],
      ...['-frames:v', '1', '-vf', `scale='min(${maxWidth},iw)':-2`, '-c:v', 'mjpeg', '-q:v', '4', '-f', 'image2pipe', 'pipe:1']
    ],
    { stdin: frame, maxBytes: 32 * 1024 * 1024 }
  )
  if (r.stdout.length < 2 || r.stdout[0] !== 0xff || r.stdout[1] !== 0xd8) throw new FfmpegError(t('wm.previewFailed'), r.stderr)
  return `data:image/jpeg;base64,${r.stdout.toString('base64')}`
}

export class AiSessions {
  private readonly sessions = new Map<string, Session>()

  constructor(
    private readonly model: AiModel,
    private readonly spawn: SpawnHost
  ) {}

  private async prepare(path: string, region: WatermarkRegion): Promise<Prepared> {
    const probe = await probeMedia(path)
    const v = probe.video
    if (!v) throw new Error(t('wm.noVideoInFile'))
    if (v.hdr || v.dolbyVision) throw new Error(t('wm.hdrUnsupported'))
    const r = clampRegion(region, v.width, v.height)
    if (!r) throw new Error(t('wm.regionTooSmall'))
    const duration = probe.duration ?? 0
    const a = await analyze({ path, v, duration, region: r })
    const codec = makeCodec(a)
    const model = await this.model.fixed(a.strip.mh, a.strip.mw)
    const frame = await grabFrame(path, a, duration * 0.5)
    const plan = cpuPlan({ logical: availableParallelism(), arch: process.arch, totalMem: totalmem() })
    // 预览只要一个进程；CPU 的话正式处理时会按计划多开几个
    const pool = await openPool({
      spawn: this.spawn,
      model,
      sample: { image: codec.toTensor(frame), mask: codec.maskTensor, height: a.strip.mh, width: a.strip.mw },
      cpu: { hosts: 1, threads: plan.threads }
    })
    const hosts = pool.backend === 'cpu' ? plan.hosts : 1
    recordCalibration(backendLabel(pool.backend, hosts), pool.msPerFrame, hosts)
    return { a, codec, pool, duration, hosts }
  }

  private session(taskId: string, path: string, region: WatermarkRegion): Session {
    const key = JSON.stringify([region.x, region.y, region.w, region.h])
    let s = this.sessions.get(taskId)
    if (s && (s.key !== key || s.path !== path)) {
      this.release(taskId)
      s = undefined
    }
    if (!s) {
      const created: Session = { path, key, ready: this.prepare(path, region) }
      // 准备失败的不留着，下次重新来
      created.ready.catch(() => this.sessions.get(taskId) === created && this.release(taskId))
      this.sessions.set(taskId, created)
      s = created
    }
    clearTimeout(s.timer)
    s.timer = setTimeout(() => this.release(taskId), IDLE_MS)
    s.timer.unref?.()
    return s
  }

  async estimate(taskId: string, path: string, region: WatermarkRegion): Promise<AiEstimate> {
    const p = await this.session(taskId, path, region).ready
    p.reuse ??= estimateReuse({ path, a: p.a, duration: p.duration })
    const reuse = await p.reuse
    const frames = Math.round(p.duration * rateValue(p.a.rate))
    const seconds = estimateSeconds({
      frames,
      reuse,
      msPerFrame: p.pool.msPerFrame,
      backend: p.pool.backend,
      hosts: p.hosts,
      width: p.a.width,
      height: p.a.height
    })
    return {
      seconds,
      backend: p.pool.backend,
      label: backendLabel(p.pool.backend, p.hosts),
      frames,
      reuse,
      fallback: p.a.fallback
    }
  }

  async preview(taskId: string, path: string, time: number, region: WatermarkRegion): Promise<string> {
    const p = await this.session(taskId, path, region).ready
    const at = Math.min(Math.max(0, Number.isFinite(time) ? time : 0), Math.max(0, p.duration - 0.1))
    const frame = await grabFrame(path, p.a, at)
    const out = await p.pool.run(p.codec.toTensor(frame))
    p.codec.apply(frame, p.codec.render(out))
    return frameJpeg(frame, p.a)
  }

  /** 释放推理进程：对话框关掉、开始正式处理时调用 */
  release(taskId: string): void {
    const s = this.sessions.get(taskId)
    if (!s) return
    this.sessions.delete(taskId)
    clearTimeout(s.timer)
    s.ready.then(
      (p) => p.pool.close(),
      () => {}
    )
  }

  closeAll(): void {
    for (const id of [...this.sessions.keys()]) this.release(id)
  }
}
