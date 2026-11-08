import type { WatermarkRegion } from '@shared/types'
import { delogoFilter } from '@shared/watermark'
import { FfmpegError } from '../download/errors'
import { ffmpegCapture } from './ffmpegJob'

/** 在 5%-95% 之间均匀取 k 个时间点（秒），避开片头片尾的黑场和字幕 */
export function sampleTimes(duration: number, k: number): number[] {
  if (!(duration > 0) || k < 1) return []
  return Array.from({ length: k }, (_, i) => Math.round(duration * (0.05 + (0.9 * (i + 0.5)) / k) * 1000) / 1000)
}

/** 输入端 -ss 快速定位到附近的关键帧再解码，抽一帧只要几十毫秒；不能用 -skip_frame nokey（只有一个关键帧的文件会抽不出东西） */
const seek = (time: number): string[] => ['-ss', time.toFixed(3)]

/** 抽一帧缩放后的灰度像素，供识别水印；时间超出片长（ffmpeg 输出 0 字节）或出错时返回 null */
export async function grabGray(
  path: string,
  streamIndex: number,
  time: number,
  w: number,
  h: number,
  signal?: AbortSignal
): Promise<Uint8Array | null> {
  const r = await ffmpegCapture(
    [...seek(time), '-i', path, '-map', `0:${streamIndex}`, '-frames:v', '1', '-vf', `scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', 'pipe:1'],
    { signal, maxBytes: w * h * 2 }
  )
  return r.stdout.length === w * h ? new Uint8Array(r.stdout) : null
}

/** 按时间点依次抽帧，最多 3 个同时进行；取不到的帧跳过，结果保持时间顺序 */
export async function grabFrames(
  path: string,
  streamIndex: number,
  times: number[],
  w: number,
  h: number,
  signal?: AbortSignal
): Promise<Uint8Array[]> {
  const out: (Uint8Array | null)[] = times.map(() => null)
  let next = 0
  let failed = false
  const worker = async (): Promise<void> => {
    while (!failed && next < times.length) {
      const i = next++
      try {
        out[i] = await grabGray(path, streamIndex, times[i], w, h, signal)
      } catch (e) {
        // 一帧出错（中止、超时）就不再抽剩下的
        failed = true
        throw e
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, times.length) }, worker))
  return out.filter((f): f is Uint8Array => f !== null)
}

/** 抽一帧 JPEG 给界面预览，带 region 时先去掉水印再缩放（坐标是原分辨率的） */
export async function grabJpeg(
  path: string,
  streamIndex: number,
  time: number,
  o: { region?: WatermarkRegion; maxWidth?: number; signal?: AbortSignal } = {}
): Promise<string> {
  const { region, maxWidth = 1280, signal } = o
  const vf = [region ? delogoFilter(region) : '', `scale='min(${maxWidth},iw)':-2`].filter(Boolean).join(',')
  const r = await ffmpegCapture(
    [...seek(time), '-i', path, '-map', `0:${streamIndex}`, '-frames:v', '1', '-vf', vf, '-c:v', 'mjpeg', '-q:v', '4', '-f', 'image2pipe', 'pipe:1'],
    { signal, maxBytes: 32 * 1024 * 1024 }
  )
  // JPEG 以 FF D8 开头
  if (r.stdout.length < 2 || r.stdout[0] !== 0xff || r.stdout[1] !== 0xd8) {
    throw new FfmpegError('没能从视频里取出画面', r.stderr)
  }
  return `data:image/jpeg;base64,${r.stdout.toString('base64')}`
}
