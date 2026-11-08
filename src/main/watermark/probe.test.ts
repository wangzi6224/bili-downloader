import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('./ffmpegJob', () => ({ ffmpegCapture: h.capture }))
const { parseProbe, probeMedia } = await import('./probe')
const { FfmpegError } = await import('../download/errors')

// 以下夹具是随包 ffmpeg 的真实输出：9.0.2 是 darwin-arm64（martin-riedl），6.1.1 是 darwin-x64（evermeet）

/** 9.0.2：项目合并出的 MP4，带封面、mov_text 字幕、章节（章节会多出一条 Data 流） */
const MP4_FULL_9 = `[in#0 @ 0x136607fb0] stream 0, timescale not set
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'full.mp4':
  Metadata:
    major_brand     : isom
    minor_version   : 512
    compatible_brands: isomiso2avc1mp41
    title           : T
    encoder         : Lavf63.1.102
  Duration: 00:00:06.00, start: 0.000000, bitrate: 3175 kb/s
  Chapters:
    Chapter #0:0: start 0.000000, end 3.000000
      Metadata:
        title           : 一
    Chapter #0:1: start 3.000000, end 6.000000
      Metadata:
        title           : 二
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1280x720 [SAR 1:1 DAR 16:9], 3083 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
    Metadata:
      handler_name    : VideoHandler
      encoder         : Lavc63.1.102 libx264
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 69 kb/s (default)
    Metadata:
      handler_name    : SoundHandler
  Stream #0:2[0x4](chi): Subtitle: mov_text (tx3g / 0x67337874), 0 kb/s (default)
    Metadata:
      handler_name    : 中文
  Stream #0:3[0x5](eng): Data: bin_data (text / 0x74786574), 0 kb/s
    Metadata:
      handler_name    : SubtitleHandler
  Stream #0:4[0x0]: Video: mjpeg (Baseline), yuvj444p(pc, bt470bg/unknown/unknown), 320x180 [SAR 1:1 DAR 16:9], 90k tbr, 90k tbn (attached pic)
At least one output file must be specified
`

/** 6.1.1：MKV，封面用 -attach 挂上，ffmpeg 把它显示成带 (attached pic) 的视频流 */
const MKV_FULL_6 = `Input #0, matroska,webm, from 'full.mkv':
  Metadata:
    title           : T
    COMPATIBLE_BRANDS: isomiso2avc1mp41
    MAJOR_BRAND     : isom
    MINOR_VERSION   : 512
    ENCODER         : Lavf63.1.102
  Duration: 00:00:06.02, start: -0.023000, bitrate: 3156 kb/s
  Chapters:
    Chapter #0:0: start 0.000000, end 3.000000
      Metadata:
        title           : 一
    Chapter #0:1: start 3.000000, end 6.000000
      Metadata:
        title           : 二
  Stream #0:0: Video: h264 (High), yuv420p(progressive), 1280x720 [SAR 1:1 DAR 16:9], 30 fps, 30 tbr, 1k tbn (default)
    Metadata:
      HANDLER_NAME    : VideoHandler
      ENCODER         : Lavc63.1.102 libx264
      DURATION        : 00:00:06.000000000
  Stream #0:1: Audio: aac (LC), 44100 Hz, mono, fltp (default)
    Metadata:
      HANDLER_NAME    : SoundHandler
      DURATION        : 00:00:06.023000000
  Stream #0:2(chi): Subtitle: subrip
    Metadata:
      ENCODER         : Lavc63.1.102 srt
      DURATION        : 00:00:05.000000000
  Stream #0:3: Video: mjpeg (Baseline), yuvj444p(pc, bt470bg/unknown/unknown), 320x180 [SAR 1:1 DAR 16:9], 90k tbr, 90k tbn (attached pic)
    Metadata:
      filename        : cover.jpg
      mimetype        : image/jpeg
At least one output file must be specified
`

/** 9.0.2：HDR10（10 bit + PQ） */
const HDR_9 = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'hdr.mp4':
  Metadata:
    major_brand     : isom
    minor_version   : 512
    compatible_brands: isomiso2mp41
    encoder         : Lavf63.1.102
  Duration: 00:00:03.00, start: 0.000000, bitrate: 2133 kb/s
  Stream #0:0[0x1](und): Video: hevc (Main 10) (hvc1 / 0x31637668), yuv420p10le(tv, bt2020nc/bt2020/smpte2084, progressive), 1280x720 [SAR 1:1 DAR 16:9], 2121 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
    Metadata:
      handler_name    : VideoHandler
      encoder         : Lavc63.1.102 libx265
At least one output file must be specified
`

/** 9.0.2：8 bit 但传递函数是 HLG */
const HLG8_9 = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'hlg8.mp4':
  Duration: 00:00:03.00, start: 0.000000, bitrate: 3142 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt2020nc/bt2020/arib-std-b67, progressive), 1280x720 [SAR 1:1 DAR 16:9], 3130 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
At least one output file must be specified
`

/** 6.1.1 的旋转写法是小写 displaymatrix */
const ROT_6 = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'rot.mp4':
  Metadata:
    major_brand     : isom
    minor_version   : 512
    compatible_brands: isomiso2avc1mp41
    encoder         : Lavf63.1.102
  Duration: 00:00:06.00, start: 0.000000, bitrate: 3087 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1280x720 [SAR 1:1 DAR 16:9], 3083 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
    Metadata:
      handler_name    : VideoHandler
      vendor_id       : [0][0][0][0]
      encoder         : Lavc63.1.102 libx264
    Side data:
      displaymatrix: rotation of 90.00 degrees
At least one output file must be specified
`

/** 9.0.2 写成 Display Matrix */
const ROT_9 = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'rot.mp4':
  Duration: 00:00:06.00, start: 0.000000, bitrate: 3087 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1280x720 [SAR 1:1 DAR 16:9], 3083 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
    Metadata:
      handler_name    : VideoHandler
    Side data:
      Display Matrix: rotation of -90.00 degrees
At least one output file must be specified
`

/** 6.1.1 的 AV1：SAR 挪到了码率后面；开头还有一行 libdav1d 的版本信息 */
const AV1_6 = `[libdav1d @ 0x7fcacb305540] libdav1d 1.3.0-22-g746ab8b
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'av1.mp4':
  Metadata:
    major_brand     : isom
    minor_version   : 512
    compatible_brands: isomav01iso2mp41
    encoder         : Lavf63.1.102
  Duration: 00:00:03.00, start: 0.000000, bitrate: 3162 kb/s
  Stream #0:0[0x1](und): Video: av1 (Main) (av01 / 0x31307661), yuv420p(tv, progressive), 1280x720, 3158 kb/s, SAR 1:1 DAR 16:9, 30 fps, 30 tbr, 15360 tbn (default)
    Metadata:
      handler_name    : VideoHandler
      vendor_id       : [0][0][0][0]
      encoder         : Lavc63.1.102 libsvtav1
At least one output file must be specified
`

/** 9.0.2：MKV 里的 PNG 封面 */
const PNG_COVER_9 = `Input #0, matroska,webm, from 'pngcov.mkv':
  Duration: 00:00:06.02, start: 0.000000, bitrate: 3148 kb/s
  Stream #0:0: Video: h264 (High), yuv420p(progressive), 1280x720 [SAR 1:1 DAR 16:9], 30 fps, 30 tbr, 1k tbn (default)
  Stream #0:1: Audio: aac (LC), 44100 Hz, mono, fltp (default)
  Stream #0:2: Video: png, rgb24(pc, gbr/unknown/unknown), 320x180 [SAR 1:1 DAR 16:9], 90k tbr, 90k tbn (attached pic)
    Metadata:
      filename        : cover.png
      mimetype        : image/png
At least one output file must be specified
`

/** B站杜比视界的分片 m4s（按 ffmpeg 的输出格式构造）：时长、码率未知，靠 side data 和 dvh1 识别 */
const DOVI = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'video.m4s':
  Duration: N/A, start: 0.000000, bitrate: N/A
  Stream #0:0[0x1](und): Video: hevc (Main 10) (dvh1 / 0x31687664), yuv420p10le(tv, bt2020nc/bt2020/smpte2084), 3840x2160 [SAR 1:1 DAR 16:9], 15000 kb/s, 25 fps, 25 tbr, 16k tbn (default)
    Side data:
      DOVI configuration record: version: 1.0, profile: 8, level: 6, rpu flag: 1, el flag: 0, bl flag: 1, compatibility id: 1
`

describe('parseProbe', () => {
  it('9.0.2 的 MP4：主视频、封面、各路流', () => {
    expect(parseProbe(MP4_FULL_9)).toEqual({
      duration: 6,
      bitrate: 3175,
      video: {
        index: 0,
        codec: 'h264',
        pixFmt: 'yuv420p',
        width: 1280,
        height: 720,
        rotation: 0,
        bitrate: 3083,
        fps: 30,
        hdr: false,
        dolbyVision: false
      },
      cover: { index: 4, codec: 'mjpeg', mimetype: undefined, filename: undefined },
      streams: [
        { index: 0, type: 'video', codec: 'h264', attachedPic: false },
        { index: 1, type: 'audio', codec: 'aac', attachedPic: false },
        { index: 2, type: 'subtitle', codec: 'mov_text', attachedPic: false },
        { index: 3, type: 'data', codec: 'bin_data', attachedPic: false },
        { index: 4, type: 'video', codec: 'mjpeg', attachedPic: true }
      ]
    })
  })

  it('6.1.1 的 MKV：封面带文件名和 MIME 类型，流没有码率时不报', () => {
    const p = parseProbe(MKV_FULL_6)!
    expect(p.duration).toBeCloseTo(6.02)
    expect(p.cover).toEqual({ index: 3, codec: 'mjpeg', mimetype: 'image/jpeg', filename: 'cover.jpg' })
    expect(p.video).toMatchObject({ index: 0, width: 1280, height: 720, fps: 30, bitrate: undefined })
    expect(p.streams.map((s) => s.type)).toEqual(['video', 'audio', 'subtitle', 'video'])
  })

  it('PNG 封面', () => {
    expect(parseProbe(PNG_COVER_9)!.cover).toEqual({ index: 2, codec: 'png', mimetype: 'image/png', filename: 'cover.png' })
  })

  it('10 bit、PQ 和 HLG 都算 HDR', () => {
    expect(parseProbe(HDR_9)!.video).toMatchObject({ codec: 'hevc', pixFmt: 'yuv420p10le', hdr: true, dolbyVision: false })
    expect(parseProbe(HLG8_9)!.video).toMatchObject({ pixFmt: 'yuv420p', hdr: true })
  })

  it('杜比视界：side data 或 dvh1 标签；时长、码率未知', () => {
    const p = parseProbe(DOVI)!
    expect(p.duration).toBeUndefined()
    expect(p.bitrate).toBeUndefined()
    expect(p.video).toMatchObject({ width: 3840, height: 2160, bitrate: 15000, fps: 25, hdr: true, dolbyVision: true })
    const tagOnly = DOVI.split('\n').slice(0, 3).join('\n')
    expect(parseProbe(tagOnly)!.video!.dolbyVision).toBe(true)
  })

  it('旋转 ±90° 时宽高对调，两种写法都认', () => {
    expect(parseProbe(ROT_6)!.video).toMatchObject({ width: 720, height: 1280, rotation: 90 })
    expect(parseProbe(ROT_9)!.video).toMatchObject({ width: 720, height: 1280, rotation: -90 })
    const r180 = ROT_9.replace('-90.00', '180.00')
    expect(parseProbe(r180)!.video).toMatchObject({ width: 1280, height: 720, rotation: 180 })
  })

  it('SAR 在码率后面的写法；不把 fourcc 当成宽高', () => {
    expect(parseProbe(AV1_6)!.video).toMatchObject({ codec: 'av1', width: 1280, height: 720, bitrate: 3158, fps: 30 })
  })

  it('不是媒体文件时返回 null', () => {
    expect(parseProbe('[in#0 @ 0x1] Error opening input: Invalid data found when processing input\n')).toBeNull()
    expect(parseProbe('')).toBeNull()
  })

  it('只看 Input #0 这一段；没有 Duration 行也能解析', () => {
    const s = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'a.m4a':
  Stream #0:0[0x1](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 128 kb/s (default)
Output #0, null, to 'pipe:':
  Duration: 00:01:00.00, start: 0.000000, bitrate: 1 kb/s
  Stream #0:0: Video: wrapped_avframe, yuv420p, 640x360, q=2-31, 200 kb/s, 30 fps
`
    expect(parseProbe(s)).toEqual({ streams: [{ index: 0, type: 'audio', codec: 'aac', attachedPic: false }] })
  })

  it('没有尺寸的视频流、附件、未知类型、只有一个流名的行', () => {
    const s = `Input #0, matroska,webm, from 'x.mkv':
  Duration: 00:00:10.00, start: 0.000000, bitrate: N/A
  Stream #0:0: Video: none

  Stream #0:1: Video: h264, 640x360
  Stream #0:2: Video: vp9, yuv420p(tv), 320x240
  Stream #0:3: Attachment: ttf
    Metadata:
      filename        : a.ttf
  Stream #0:4: Unknown: none
  Stream #0:5: Data
  Stream #0:6: Video: (attached pic)
  Stream #0:7: Video: png, rgb24, 64x64 (attached pic)
`
    const p = parseProbe(s)!
    expect(p.duration).toBe(10)
    expect(p.bitrate).toBeUndefined()
    // 第一条视频流解析不出尺寸，后面第一条有尺寸的才是主视频
    expect(p.video).toMatchObject({ index: 1, codec: 'h264', pixFmt: undefined, width: 640, height: 360 })
    expect(p.cover).toEqual({ index: 6, codec: '', mimetype: undefined, filename: undefined })
    expect(p.streams.map((x) => `${x.index}:${x.type}:${x.codec}`)).toEqual([
      '0:video:none',
      '1:video:h264',
      '2:video:vp9',
      '3:attachment:ttf',
      '4:other:none',
      '5:data:undefined',
      '6:video:undefined',
      '7:video:png'
    ])
  })

  it('像素格式那一段缺失或认不出时不报', () => {
    const s = `Input #0, matroska,webm, from 'x.mkv':
  Stream #0:0: Video: h264, 640x360, 25 fps
`
    expect(parseProbe(s)!.video).toMatchObject({ codec: 'h264', pixFmt: undefined, width: 640, height: 360, fps: 25, hdr: false })
    const odd = `Input #0, matroska,webm, from 'x.mkv':
  Stream #0:0: Video: [0][0][0][0] / 0x0000, Yuv(?), 640x360
`
    expect(parseProbe(odd)!.video).toMatchObject({ codec: 'unknown', pixFmt: undefined, width: 640 })
  })
})

describe('probeMedia', () => {
  beforeEach(() => {
    h.capture.mockReset()
  })

  it('用 info 级别跑 ffmpeg -i，退出码 1 也照常解析', async () => {
    h.capture.mockResolvedValue({ code: 1, stdout: Buffer.alloc(0), stderr: MP4_FULL_9 })
    const ac = new AbortController()
    const p = await probeMedia('/v/a.mp4', ac.signal)
    expect(h.capture).toHaveBeenCalledWith(['-i', '/v/a.mp4'], { signal: ac.signal, loglevel: 'info' })
    expect(p.video?.index).toBe(0)
  })

  it('文件不存在', async () => {
    const stderr = "[in#0 @ 0x1] Error opening input: No such file or directory\nError opening input file nope.mp4.\n"
    h.capture.mockResolvedValue({ code: 254, stdout: Buffer.alloc(0), stderr })
    const e = (await probeMedia('nope.mp4').catch((err: unknown) => err)) as InstanceType<typeof FfmpegError>
    expect(e).toBeInstanceOf(FfmpegError)
    expect(e.message).toBe('无法读取视频信息：文件不存在')
    expect(e.stderr).toBe(stderr)
  })

  it('读不出信息', async () => {
    h.capture.mockResolvedValue({ code: 1, stdout: Buffer.alloc(0), stderr: 'Invalid data found when processing input' })
    await expect(probeMedia('a.txt')).rejects.toThrow(/^无法读取视频信息$/)
  })
})
