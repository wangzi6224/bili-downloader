import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('./ffmpegJob', () => ({ ffmpegCapture: h.capture }))
const { grabFrames, grabGray, grabJpeg, sampleTimes } = await import('./frames')
const { AbortError, FfmpegError } = await import('../download/errors')

const ok = (stdout: Buffer, stderr = ''): { code: number; stdout: Buffer; stderr: string } => ({ code: 0, stdout, stderr })

beforeEach(() => {
  h.capture.mockReset()
})

describe('sampleTimes', () => {
  it('在 5%-95% 之间均匀取点，保留 3 位小数', () => {
    expect(sampleTimes(100, 4)).toEqual([16.25, 38.75, 61.25, 83.75])
    expect(sampleTimes(10, 1)).toEqual([5])
    expect(sampleTimes(7, 3)).toEqual([1.4, 3.5, 5.6])
    expect(sampleTimes(1 / 3, 1)).toEqual([0.167])
  })

  it('时长不明或不取时返回空', () => {
    expect(sampleTimes(0, 4)).toEqual([])
    expect(sampleTimes(Number.NaN, 4)).toEqual([])
    expect(sampleTimes(10, 0)).toEqual([])
  })
})

describe('grabGray', () => {
  it('输入端定位后抽一帧缩放的灰度像素', async () => {
    h.capture.mockResolvedValue(ok(Buffer.alloc(6, 7)))
    const ac = new AbortController()
    const f = await grabGray('/v/a.m4s', 2, 12.3456, 3, 2, ac.signal)
    expect(h.capture).toHaveBeenCalledWith(
      ['-ss', '12.346', '-i', '/v/a.m4s', '-map', '0:2', '-frames:v', '1', '-vf', 'scale=3:2:flags=area,format=gray', '-f', 'rawvideo', 'pipe:1'],
      { signal: ac.signal, maxBytes: 12 }
    )
    expect(f).toBeInstanceOf(Uint8Array)
    expect([...f!]).toEqual([7, 7, 7, 7, 7, 7])
  })

  it('长度不对（时间超出片长时是 0 字节）返回 null', async () => {
    h.capture.mockResolvedValueOnce(ok(Buffer.alloc(0)))
    expect(await grabGray('a', 0, 99, 3, 2)).toBeNull()
    h.capture.mockResolvedValueOnce({ code: 1, stdout: Buffer.alloc(5), stderr: 'x' })
    expect(await grabGray('a', 0, 1, 3, 2)).toBeNull()
  })
})

describe('grabFrames', () => {
  it('最多 3 个同时抽，跳过取不到的，结果保持时间顺序', async () => {
    let inFlight = 0
    let peak = 0
    h.capture.mockImplementation(async (args: string[]) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      const t = Number(args[1])
      // 后面的帧先回来，检查顺序
      await new Promise((r) => setTimeout(r, 10 - t))
      inFlight--
      return ok(t === 3 ? Buffer.alloc(0) : Buffer.alloc(2, t))
    })
    const frames = await grabFrames('a', 0, [1, 2, 3, 4, 5], 2, 1)
    expect(peak).toBe(3)
    expect(frames.map((f) => f[0])).toEqual([1, 2, 4, 5])
    expect(h.capture).toHaveBeenCalledTimes(5)
  })

  it('一帧出错就不再抽剩下的，并把错误抛出去', async () => {
    h.capture.mockImplementation(async (args: string[]) => {
      if (args[1] === '1.000') throw new AbortError()
      await new Promise((r) => setTimeout(r, 5))
      return ok(Buffer.alloc(1))
    })
    await expect(grabFrames('a', 0, [1, 2, 3, 4, 5, 6], 1, 1)).rejects.toBeInstanceOf(AbortError)
    // 出错前已经发出去的 3 个之外，不再发新的
    expect(h.capture).toHaveBeenCalledTimes(3)
  })

  it('没有时间点时直接返回空', async () => {
    expect(await grabFrames('a', 0, [], 2, 2)).toEqual([])
    expect(h.capture).not.toHaveBeenCalled()
  })
})

describe('grabJpeg', () => {
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2])

  it('先去水印再缩放，返回 data URL', async () => {
    h.capture.mockResolvedValue(ok(JPEG))
    const ac = new AbortController()
    const url = await grabJpeg('/v/a.mp4', 0, 3, { region: { x: 10, y: 20, w: 30, h: 40 }, maxWidth: 640, signal: ac.signal })
    expect(h.capture).toHaveBeenCalledWith(
      [
        '-ss',
        '3.000',
        '-i',
        '/v/a.mp4',
        '-map',
        '0:0',
        '-frames:v',
        '1',
        '-vf',
        "delogo=x=10:y=20:w=30:h=40,scale='min(640,iw)':-2",
        '-c:v',
        'mjpeg',
        '-q:v',
        '4',
        '-f',
        'image2pipe',
        'pipe:1'
      ],
      { signal: ac.signal, maxBytes: 32 * 1024 * 1024 }
    )
    expect(url).toBe(`data:image/jpeg;base64,${JPEG.toString('base64')}`)
  })

  it('不带区域时只缩放，默认最宽 1280', async () => {
    h.capture.mockResolvedValue(ok(JPEG))
    await grabJpeg('a', 1, 0)
    const args = h.capture.mock.calls[0][0] as string[]
    expect(args[args.indexOf('-vf') + 1]).toBe("scale='min(1280,iw)':-2")
    expect(args).toContain('0:1')
  })

  it('取不到画面（超出片长、区域贴边报错）时抛 FfmpegError 并带上 stderr', async () => {
    h.capture.mockResolvedValueOnce(ok(Buffer.alloc(0)))
    await expect(grabJpeg('a', 0, 99)).rejects.toThrow('没能从视频里取出画面')
    h.capture.mockResolvedValueOnce({ code: 234, stdout: Buffer.from([0xff]), stderr: 'Logo area is outside of the frame.' })
    const e = (await grabJpeg('a', 0, 1).catch((err: unknown) => err)) as InstanceType<typeof FfmpegError>
    expect(e).toBeInstanceOf(FfmpegError)
    expect(e.stderr).toBe('Logo area is outside of the frame.')
    h.capture.mockResolvedValueOnce(ok(Buffer.from([0xff, 0x00, 1])))
    await expect(grabJpeg('a', 0, 1)).rejects.toThrow('没能从视频里取出画面')
    h.capture.mockResolvedValueOnce(ok(Buffer.from([0x00, 0xd8, 1])))
    await expect(grabJpeg('a', 0, 1)).rejects.toThrow('没能从视频里取出画面')
  })
})
