import { AbortError } from '../download/errors'
import { ffmpegPath } from '../download/mux'
import { ffmpegCapture } from './ffmpegJob'

export interface Encoder {
  name: string
  codec: 'h264' | 'hevc'
  /** 硬件编码器：要试编码确认能用，运行时失败了改用软件编码 */
  hw: boolean
}

const hw = (name: string): Encoder => ({ name, codec: name.startsWith('hevc') ? 'hevc' : 'h264', hw: true })

/** 各系统可能有的硬件编码器；Linux 随包的静态 ffmpeg 没带硬件编码器 */
const HW_CANDIDATES: Partial<Record<NodeJS.Platform, Encoder[]>> = {
  darwin: ['hevc_videotoolbox', 'h264_videotoolbox'].map(hw),
  win32: ['hevc_nvenc', 'h264_nvenc', 'hevc_qsv', 'h264_qsv', 'hevc_amf', 'h264_amf'].map(hw)
}

/** 超过 4K 时 H.264 硬件编码器普遍不支持，改用 HEVC */
const isBig = (o: { width: number; height: number }): boolean => Math.max(o.width, o.height) > 4096

export function softwareEncoder(o: { width: number; height: number }): Encoder {
  return isBig(o) ? { name: 'libx265', codec: 'hevc', hw: false } : { name: 'libx264', codec: 'h264', hw: false }
}

/** 运行时失败过的硬件编码器，本次运行不再选 */
const broken = new Set<string>()
/** 试编码的结果：编码器列表里有不代表能用（Intel Mac 上 hevc_videotoolbox 打不开、没有 N 卡的机器上 nvenc） */
const probes = new Map<string, Promise<boolean>>()

export function markBroken(enc: Encoder): void {
  broken.add(enc.name)
}

function works(enc: Encoder): Promise<boolean> {
  const key = `${ffmpegPath()}\n${enc.name}`
  let p = probes.get(key)
  if (!p) {
    // 用调用方真实的参数编几帧测试画面；不传 signal，结果要给后面的任务共用
    p = ffmpegCapture(
      ['-f', 'lavfi', '-i', 'color=c=gray:s=640x360:r=30:d=0.2', '-frames:v', '5', ...encoderArgs(enc, 2000), '-f', 'null', '-'],
      { timeoutMs: 20_000 }
    ).then(
      (r) => r.code === 0,
      () => false
    )
    probes.set(key, p)
  }
  return p
}

/**
 * 选编码器：源是 HEVC、AV1 时优先 HEVC 硬件编码（码率相同画质更好），超过 4K 只用 HEVC；
 * 否则用 H.264 硬件编码，都不能用时回退 libx264 / libx265
 */
export async function pickEncoder(
  o: { srcCodec?: string; width: number; height: number },
  signal?: AbortSignal
): Promise<Encoder> {
  const big = isBig(o)
  const preferHevc = big || /^(?:hevc|h265|av1)/i.test(o.srcCodec ?? '')
  const all = (HW_CANDIDATES[process.platform] ?? []).filter((e) => !broken.has(e.name))
  const hevc = all.filter((e) => e.codec === 'hevc')
  const h264 = all.filter((e) => e.codec === 'h264')
  const order = big ? hevc : preferHevc ? [...hevc, ...h264] : h264
  for (const enc of order) {
    if (signal?.aborted) throw new AbortError()
    if (await works(enc)) return enc
  }
  if (signal?.aborted) throw new AbortError()
  return softwareEncoder(o)
}

const k = (v: number): string => `${Math.round(v)}k`

/**
 * 编码参数。全部带 :v:0：成品里的封面也是一路视频流，不带流序号的参数会套到复制的封面上，ffmpeg 直接报错。
 * 硬件编码器统一按码率控制（Intel Mac 的 VideoToolbox 不支持 -q:v）；软件编码用 CRF，再用 maxrate 封顶，体积不至于比原视频大太多
 */
export function encoderArgs(enc: Encoder, kbps: number): string[] {
  const profile = enc.codec === 'hevc' ? 'main' : 'high'
  const rate = ['-b:v:0', k(kbps), '-maxrate:v:0', k(kbps * 1.5)]
  const cap = ['-maxrate:v:0', k(kbps * 1.5), '-bufsize:v:0', k(kbps * 2)]
  const head = ['-c:v:0', enc.name]
  if (enc.name.endsWith('_videotoolbox')) return [...head, ...rate, '-profile:v:0', profile, '-pix_fmt:v:0', 'yuv420p']
  if (enc.name.endsWith('_nvenc')) {
    return [...head, '-preset:v:0', 'p5', '-rc:v:0', 'vbr', ...rate, '-bufsize:v:0', k(kbps * 2), '-profile:v:0', profile, '-pix_fmt:v:0', 'yuv420p']
  }
  // QSV、AMF 吃 nv12，给 yuv420p 会报像素格式不兼容
  if (enc.name.endsWith('_qsv')) return [...head, '-preset:v:0', 'medium', ...rate, '-pix_fmt:v:0', 'nv12']
  if (enc.name.endsWith('_amf')) return [...head, '-quality:v:0', 'balanced', '-rc:v:0', 'vbr_peak', ...rate, '-pix_fmt:v:0', 'nv12']
  if (enc.name === 'libx265') {
    return [...head, '-preset:v:0', 'fast', '-crf:v:0', '20', ...cap, '-pix_fmt:v:0', 'yuv420p', '-x265-params:v:0', 'log-level=error']
  }
  return [...head, '-preset:v:0', 'veryfast', '-crf:v:0', '18', ...cap, '-profile:v:0', 'high', '-pix_fmt:v:0', 'yuv420p']
}

/**
 * 目标码率（kb/s）：原视频的 1.5 倍，重新编码不至于明显变糊；
 * 再按分辨率、帧率给一个下限，原视频码率很低或不知道时也有基本画质
 */
export function targetKbps(srcKbps: number | undefined, w: number, h: number, fps?: number): number {
  const f = fps && fps > 0 ? Math.min(fps, 60) : 30
  const floor = (w * h * f * 0.06) / 1000
  if (!srcKbps || srcKbps <= 0) return Math.round(floor * 1.5)
  return Math.round(Math.max(srcKbps * 1.5, floor))
}
