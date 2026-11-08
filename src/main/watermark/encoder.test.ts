import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ capture: vi.fn(), path: 'ffmpeg-a' }))
vi.mock('./ffmpegJob', () => ({ ffmpegCapture: h.capture }))
vi.mock('../download/mux', () => ({ ffmpegPath: () => h.path }))
const ORIGINAL_PLATFORM = Object.getOwnPropertyDescriptor(process, 'platform')!

const setPlatform = (p: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', { value: p, configurable: true })
}

/** 试编码结果和失效名单是模块级状态，每次重新导入一份 */
async function load(): Promise<typeof import('./encoder') & typeof import('../download/errors')> {
  vi.resetModules()
  return { ...(await import('./encoder')), ...(await import('../download/errors')) }
}

/** 让名单里的编码器试编码成功，其余失败；返回被试过的编码器 */
function usable(...names: string[]): string[] {
  const tried: string[] = []
  h.capture.mockImplementation(async (args: string[]) => {
    const name = args[args.indexOf('-c:v:0') + 1]
    tried.push(name)
    return { code: names.includes(name) ? 0 : 1, stdout: Buffer.alloc(0), stderr: '' }
  })
  return tried
}

const HD = { width: 1920, height: 1080 }
const UHD8K = { width: 7680, height: 4320 }

beforeEach(() => {
  h.capture.mockReset()
  h.path = 'ffmpeg-a'
})

afterEach(() => Object.defineProperty(process, 'platform', ORIGINAL_PLATFORM))

describe('softwareEncoder', () => {
  it('一般用 libx264，超过 4K 用 libx265', async () => {
    const { softwareEncoder } = await load()
    expect(softwareEncoder(HD)).toEqual({ name: 'libx264', codec: 'h264', hw: false })
    expect(softwareEncoder({ width: 4096, height: 2160 })).toEqual({ name: 'libx264', codec: 'h264', hw: false })
    expect(softwareEncoder(UHD8K)).toEqual({ name: 'libx265', codec: 'hevc', hw: false })
    expect(softwareEncoder({ width: 2160, height: 4320 })).toEqual({ name: 'libx265', codec: 'hevc', hw: false })
  })
})

describe('pickEncoder', () => {
  it('macOS：H.264 源用 h264_videotoolbox', async () => {
    setPlatform('darwin')
    const { pickEncoder } = await load()
    const tried = usable('h264_videotoolbox', 'hevc_videotoolbox')
    expect(await pickEncoder({ srcCodec: 'h264', ...HD })).toEqual({ name: 'h264_videotoolbox', codec: 'h264', hw: true })
    expect(tried).toEqual(['h264_videotoolbox'])
  })

  it('macOS：HEVC、AV1 源优先 HEVC 硬件编码，不能用时退到 H.264', async () => {
    setPlatform('darwin')
    const { pickEncoder } = await load()
    usable('h264_videotoolbox', 'hevc_videotoolbox')
    expect((await pickEncoder({ srcCodec: 'hevc', ...HD })).name).toBe('hevc_videotoolbox')
    expect((await pickEncoder({ srcCodec: 'AV1', ...HD })).name).toBe('hevc_videotoolbox')

    const again = await load()
    // Intel Mac 上 hevc_videotoolbox 打不开
    const tried = usable('h264_videotoolbox')
    expect(await again.pickEncoder({ srcCodec: 'hevc', ...HD })).toEqual({ name: 'h264_videotoolbox', codec: 'h264', hw: true })
    expect(tried).toEqual(['hevc_videotoolbox', 'h264_videotoolbox'])
  })

  it('超过 4K 只用 HEVC，硬件不行就 libx265', async () => {
    setPlatform('darwin')
    const { pickEncoder } = await load()
    const tried = usable('h264_videotoolbox')
    expect(await pickEncoder({ srcCodec: 'h264', ...UHD8K })).toEqual({ name: 'libx265', codec: 'hevc', hw: false })
    expect(tried).toEqual(['hevc_videotoolbox'])
  })

  it('硬件编码都不能用时回退 libx264', async () => {
    setPlatform('darwin')
    const { pickEncoder } = await load()
    usable()
    expect(await pickEncoder({ ...HD })).toEqual({ name: 'libx264', codec: 'h264', hw: false })
  })

  it('Windows：按 NVENC、QSV、AMF 的顺序试', async () => {
    setPlatform('win32')
    const { pickEncoder } = await load()
    let tried = usable('h264_amf')
    expect((await pickEncoder({ srcCodec: 'hevc', ...HD })).name).toBe('h264_amf')
    expect(tried).toEqual(['hevc_nvenc', 'hevc_qsv', 'hevc_amf', 'h264_nvenc', 'h264_qsv', 'h264_amf'])

    const again = await load()
    tried = usable('h264_qsv')
    expect((await again.pickEncoder({ srcCodec: 'h264', ...HD })).name).toBe('h264_qsv')
    expect(tried).toEqual(['h264_nvenc', 'h264_qsv'])
  })

  it('Linux：随包的 ffmpeg 没有硬件编码器，直接软件编码，不试', async () => {
    setPlatform('linux')
    const { pickEncoder } = await load()
    expect(await pickEncoder({ srcCodec: 'hevc', ...HD })).toEqual({ name: 'libx264', codec: 'h264', hw: false })
    expect(await pickEncoder({ ...UHD8K })).toEqual({ name: 'libx265', codec: 'hevc', hw: false })
    expect(h.capture).not.toHaveBeenCalled()
  })

  it('试编码用真实参数编几帧测试画面，不传 signal，结果按 ffmpeg 路径缓存', async () => {
    setPlatform('darwin')
    const { pickEncoder, encoderArgs } = await load()
    usable('h264_videotoolbox')
    const ac = new AbortController()
    await pickEncoder({ ...HD }, ac.signal)
    await pickEncoder({ ...HD })
    expect(h.capture).toHaveBeenCalledTimes(1)
    expect(h.capture).toHaveBeenCalledWith(
      [
        '-f',
        'lavfi',
        '-i',
        'color=c=gray:s=640x360:r=30:d=0.2',
        '-frames:v',
        '5',
        ...encoderArgs({ name: 'h264_videotoolbox', codec: 'h264', hw: true }, 2000),
        '-f',
        'null',
        '-'
      ],
      { timeoutMs: 20_000 }
    )
    // 换了一个 ffmpeg（例如开发时）要重新试
    h.path = 'ffmpeg-b'
    await pickEncoder({ ...HD })
    expect(h.capture).toHaveBeenCalledTimes(2)
  })

  it('试编码本身出错（超时、启动不了）算不能用', async () => {
    setPlatform('darwin')
    const { pickEncoder } = await load()
    h.capture.mockRejectedValue(new Error('timeout'))
    expect((await pickEncoder({ ...HD })).name).toBe('libx264')
  })

  it('运行时失败过的硬件编码器不再选', async () => {
    setPlatform('darwin')
    const { pickEncoder, markBroken } = await load()
    usable('h264_videotoolbox', 'hevc_videotoolbox')
    markBroken({ name: 'hevc_videotoolbox', codec: 'hevc', hw: true })
    expect((await pickEncoder({ srcCodec: 'hevc', ...HD })).name).toBe('h264_videotoolbox')
    markBroken({ name: 'h264_videotoolbox', codec: 'h264', hw: true })
    expect((await pickEncoder({ srcCodec: 'hevc', ...HD })).name).toBe('libx264')
  })

  it('中止时抛 AbortError', async () => {
    setPlatform('darwin')
    const { pickEncoder, AbortError } = await load()
    usable()
    const ac = new AbortController()
    ac.abort()
    await expect(pickEncoder({ ...HD }, ac.signal)).rejects.toBeInstanceOf(AbortError)
    expect(h.capture).not.toHaveBeenCalled()

    // 试编码期间被中止
    const ac2 = new AbortController()
    h.capture.mockImplementation(async () => {
      ac2.abort()
      return { code: 1, stdout: Buffer.alloc(0), stderr: '' }
    })
    await expect(pickEncoder({ ...HD }, ac2.signal)).rejects.toBeInstanceOf(AbortError)
  })
})

describe('encoderArgs', () => {
  const enc = (name: string, codec: 'h264' | 'hevc' = 'h264', hw = true): { name: string; codec: 'h264' | 'hevc'; hw: boolean } => ({
    name,
    codec,
    hw
  })

  it('VideoToolbox 按码率控制', async () => {
    const { encoderArgs } = await load()
    expect(encoderArgs(enc('h264_videotoolbox'), 4000)).toEqual([
      '-c:v:0',
      'h264_videotoolbox',
      '-b:v:0',
      '4000k',
      '-maxrate:v:0',
      '6000k',
      '-profile:v:0',
      'high',
      '-pix_fmt:v:0',
      'yuv420p'
    ])
    expect(encoderArgs(enc('hevc_videotoolbox', 'hevc'), 3333.4)).toEqual([
      '-c:v:0',
      'hevc_videotoolbox',
      '-b:v:0',
      '3333k',
      '-maxrate:v:0',
      '5000k',
      '-profile:v:0',
      'main',
      '-pix_fmt:v:0',
      'yuv420p'
    ])
  })

  it('NVENC、QSV、AMF', async () => {
    const { encoderArgs } = await load()
    expect(encoderArgs(enc('hevc_nvenc', 'hevc'), 1000).join(' ')).toBe(
      '-c:v:0 hevc_nvenc -preset:v:0 p5 -rc:v:0 vbr -b:v:0 1000k -maxrate:v:0 1500k -bufsize:v:0 2000k -profile:v:0 main -pix_fmt:v:0 yuv420p'
    )
    expect(encoderArgs(enc('h264_qsv'), 1000).join(' ')).toBe(
      '-c:v:0 h264_qsv -preset:v:0 medium -b:v:0 1000k -maxrate:v:0 1500k -pix_fmt:v:0 nv12'
    )
    expect(encoderArgs(enc('h264_amf'), 1000).join(' ')).toBe(
      '-c:v:0 h264_amf -quality:v:0 balanced -rc:v:0 vbr_peak -b:v:0 1000k -maxrate:v:0 1500k -pix_fmt:v:0 nv12'
    )
  })

  it('软件编码用 CRF，再按码率封顶', async () => {
    const { encoderArgs } = await load()
    expect(encoderArgs(enc('libx264', 'h264', false), 1000).join(' ')).toBe(
      '-c:v:0 libx264 -preset:v:0 veryfast -crf:v:0 18 -maxrate:v:0 1500k -bufsize:v:0 2000k -profile:v:0 high -pix_fmt:v:0 yuv420p'
    )
    expect(encoderArgs(enc('libx265', 'hevc', false), 1000).join(' ')).toBe(
      '-c:v:0 libx265 -preset:v:0 fast -crf:v:0 20 -maxrate:v:0 1500k -bufsize:v:0 2000k -pix_fmt:v:0 yuv420p -x265-params:v:0 log-level=error'
    )
  })

  it('每个参数都带 :v:0，不会套到复制的封面流上', async () => {
    const { encoderArgs } = await load()
    const all = ['h264_videotoolbox', 'hevc_videotoolbox', 'h264_nvenc', 'hevc_qsv', 'hevc_amf', 'libx264', 'libx265']
    for (const name of all) {
      const opts = encoderArgs(enc(name, name.includes('265') || name.startsWith('hevc') ? 'hevc' : 'h264'), 2000).filter((a) =>
        a.startsWith('-')
      )
      expect(opts.length).toBeGreaterThan(3)
      for (const o of opts) expect(o, `${name} ${o}`).toMatch(/:v:0$/)
    }
  })
})

describe('targetKbps', () => {
  it('原视频码率的 1.5 倍，不低于按分辨率、帧率算的下限', async () => {
    const { targetKbps } = await load()
    // 1080p30 的下限是 1920*1080*30*0.06/1000 ≈ 3732
    expect(targetKbps(10_000, 1920, 1080, 30)).toBe(15_000)
    expect(targetKbps(2000, 1920, 1080, 30)).toBe(3732)
    expect(targetKbps(2000, 1920, 1080)).toBe(3732)
  })

  it('不知道原码率时取下限的 1.5 倍；帧率按 30 兜底、60 封顶', async () => {
    const { targetKbps } = await load()
    expect(targetKbps(undefined, 1920, 1080, 30)).toBe(5599)
    expect(targetKbps(0, 1920, 1080, 0)).toBe(5599)
    expect(targetKbps(undefined, 1920, 1080, 120)).toBe(targetKbps(undefined, 1920, 1080, 60))
    expect(targetKbps(undefined, 1280, 720, 60)).toBe(4977)
  })
})
