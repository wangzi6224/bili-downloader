import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProcessingInfo } from '@shared/types'
import { AbortError, FfmpegError } from '../download/errors'
import type { Encoder } from './encoder'

vi.mock('./encoder', () => ({ pickEncoder: vi.fn(), markBroken: vi.fn(), softwareEncoder: vi.fn() }))
vi.mock('./ffmpegJob', () => ({ runTranscode: vi.fn() }))

const { pickEncoder, markBroken, softwareEncoder } = await import('./encoder')
const { runTranscode } = await import('./ffmpegJob')
const { encodeWithFallback } = await import('./transcode')

const HW: Encoder = { name: 'h264_videotoolbox', codec: 'h264', hw: true }
const SOFT: Encoder = { name: 'libx264', codec: 'h264', hw: false }
const ENC_FAIL = '[h264_videotoolbox] cannot create compression session: -12908'

let stages: ProcessingInfo[]
const job = (over: Partial<Parameters<typeof encodeWithFallback>[0]> = {}) => ({
  srcCodec: 'avc1',
  width: 1920,
  height: 1080,
  build: (e: Encoder) => ['-c:v:0', e.name],
  durationSec: 60,
  signal: new AbortController().signal,
  onStage: (p: ProcessingInfo) => stages.push(p),
  ...over
})

beforeEach(() => {
  stages = []
  vi.mocked(pickEncoder).mockReset().mockResolvedValue(HW)
  vi.mocked(markBroken).mockReset()
  vi.mocked(softwareEncoder).mockReset().mockReturnValue(SOFT)
  vi.mocked(runTranscode)
    .mockReset()
    .mockImplementation(async (_args, o) => {
      o?.onStart?.()
      o?.onProgress?.({ pct: 50, eta: 30 })
    })
})

describe('encodeWithFallback', () => {
  it('先排队，开始后报进度；按选中的编码器拼参数', async () => {
    const signal = new AbortController().signal
    expect(await encodeWithFallback(job({ signal }))).toBe(HW)
    expect(pickEncoder).toHaveBeenCalledWith({ srcCodec: 'avc1', width: 1920, height: 1080 }, signal)
    expect(vi.mocked(runTranscode).mock.calls[0][0]).toEqual(['-c:v:0', 'h264_videotoolbox'])
    expect(vi.mocked(runTranscode).mock.calls[0][1]).toMatchObject({ signal, durationSec: 60 })
    expect(stages).toEqual([{ stage: 'queue' }, { stage: 'encode', pct: 0 }, { stage: 'encode', pct: 50, eta: 30 }])
  })

  it('手动发起的带上 manual 标记', async () => {
    await encodeWithFallback(job({ manual: true }))
    expect(stages.every((s) => s.manual)).toBe(true)
  })

  it('硬件编码器跑起来失败：标记不可用，换软件编码重来', async () => {
    vi.mocked(runTranscode).mockRejectedValueOnce(new FfmpegError('去水印失败：编码器不可用', ENC_FAIL))
    expect(await encodeWithFallback(job())).toBe(SOFT)
    expect(markBroken).toHaveBeenCalledWith(HW)
    expect(softwareEncoder).toHaveBeenCalledWith(expect.objectContaining({ width: 1920, height: 1080 }))
    expect(vi.mocked(runTranscode).mock.calls.map((c) => c[0])).toEqual([
      ['-c:v:0', 'h264_videotoolbox'],
      ['-c:v:0', 'libx264']
    ])
  })

  it('硬件编码中途出了别的错（例如睡眠醒来后编码会话失效、卡住被看门狗结束）：换软件编码重来，但不拉黑硬件编码器', async () => {
    vi.mocked(runTranscode)
      .mockRejectedValueOnce(new FfmpegError('去水印失败（ffmpeg 退出码 187）', '[h264_videotoolbox] Error encoding frame: -12903'))
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new FfmpegError('去水印超时：ffmpeg 长时间没有进展'))
    expect(await encodeWithFallback(job())).toBe(SOFT)
    expect(await encodeWithFallback(job())).toBe(SOFT)
    expect(markBroken).not.toHaveBeenCalled()
  })

  it.each([
    ['磁盘满了', HW, new FfmpegError('去水印失败：磁盘空间不足', 'No space left on device')],
    ['没有写入权限', HW, new FfmpegError('去水印失败', 'out.tmp: Permission denied')],
    ['区域超出画面', HW, new FfmpegError('去水印失败', '[Parsed_delogo_0] Logo area is outside of the frame.')],
    ['源文件坏了', HW, new FfmpegError('去水印失败', 'Invalid data found when processing input')],
    ['本来就是软件编码', SOFT, new FfmpegError('去水印失败', ENC_FAIL)],
    ['不是 ffmpeg 报错', HW, new Error('别的')],
    ['被中止', HW, new AbortError()]
  ])('%s：直接抛出', async (_name, enc, err) => {
    vi.mocked(pickEncoder).mockResolvedValue(enc)
    vi.mocked(runTranscode).mockRejectedValueOnce(err)
    await expect(encodeWithFallback(job())).rejects.toBe(err)
    expect(markBroken).not.toHaveBeenCalled()
  })

  it('已经中止时即使是编码器报错也不重试', async () => {
    const ac = new AbortController()
    const err = new FfmpegError('去水印失败', ENC_FAIL)
    vi.mocked(runTranscode).mockImplementationOnce(async () => {
      ac.abort()
      throw err
    })
    await expect(encodeWithFallback(job({ signal: ac.signal }))).rejects.toBe(err)
    expect(runTranscode).toHaveBeenCalledTimes(1)
  })
})
