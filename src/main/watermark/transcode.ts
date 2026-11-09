import type { ProcessingInfo } from '@shared/types'
import { FfmpegError } from '../download/errors'
import { isEncoderFailure } from '../download/mux'
import { markBroken, pickEncoder, softwareEncoder, type Encoder } from './encoder'
import { runTranscode } from './ffmpegJob'

/** 换编码器也没用的错误：磁盘满、没权限、区域超出画面、源文件坏了 */
export const HOPELESS = /no space left|permission denied|operation not permitted|logo area is outside|invalid data found|moov atom not found/i

export interface EncodeJob {
  srcCodec?: string
  width: number
  height: number
  /** 按编码器拼出完整的 ffmpeg 参数 */
  build: (enc: Encoder) => string[]
  durationSec?: number
  signal: AbortSignal
  /** 手动发起的任务，进度上带 manual 标记 */
  manual?: boolean
  onStage: (p: ProcessingInfo) => void
}

/**
 * 选编码器并转码：先排队（同一时间只转一个），开始后报进度。
 * 硬件编码器探测时能用、真跑起来失败时（显存不够、驱动问题、系统睡眠醒来后编码会话失效、卡住被看门狗结束），
 * 换软件编码再来一次；确认是编码器本身打不开的，这次运行里不再用它。返回实际用的编码器
 */
export async function encodeWithFallback(job: EncodeJob): Promise<Encoder> {
  const manual = job.manual ? { manual: true } : {}
  const run = (enc: Encoder): Promise<void> => {
    job.onStage({ ...manual, stage: 'queue' })
    return runTranscode(job.build(enc), {
      signal: job.signal,
      durationSec: job.durationSec,
      onStart: () => job.onStage({ ...manual, stage: 'encode', pct: 0 }),
      onProgress: (p) => job.onStage({ ...manual, stage: 'encode', ...p })
    })
  }
  const enc = await pickEncoder({ srcCodec: job.srcCodec, width: job.width, height: job.height }, job.signal)
  try {
    await run(enc)
    return enc
  } catch (e) {
    if (!(e instanceof FfmpegError) || !enc.hw || job.signal.aborted || HOPELESS.test(e.stderr ?? '')) throw e
    if (isEncoderFailure(e.stderr)) markBroken(enc)
    const soft = softwareEncoder(job)
    await run(soft)
    return soft
  }
}
