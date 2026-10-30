import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  app: { isPackaged: false, getAppPath: () => '/app' },
  spawn: vi.fn(),
  existsSync: vi.fn<(p: string) => boolean>()
}))
vi.mock('electron', () => ({ app: h.app }))
vi.mock('node:child_process', () => ({ spawn: h.spawn }))
vi.mock('node:fs', async (o) => ({ ...(await o<typeof import('node:fs')>()), existsSync: h.existsSync }))
const { buildMuxArgs, explainFfmpegError } = await import('./mux')
const ORIGINAL_PLATFORM = Object.getOwnPropertyDescriptor(process, 'platform')!

/** 假的 ffmpeg 进程：测试里手动 emit stderr / close / error */
class FakeProc extends EventEmitter {
  stderr = new EventEmitter()
  kill = vi.fn(() => true)
}
let procs: FakeProc[] = []

/** ffmpeg 路径缓存和运行队列是模块级状态，每次重新导入一份 */
async function load(): Promise<typeof import('./mux') & typeof import('./errors')> {
  vi.resetModules()
  return { ...(await import('./mux')), ...(await import('./errors')) }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

beforeEach(() => {
  Object.defineProperty(process, 'platform', ORIGINAL_PLATFORM)
  procs = []
  h.spawn.mockReset().mockImplementation(() => {
    const p = new FakeProc()
    procs.push(p)
    return p
  })
  h.existsSync.mockReset().mockReturnValue(false)
  h.app.isPackaged = false
})

afterEach(() => Object.defineProperty(process, 'platform', ORIGINAL_PLATFORM))

describe('buildMuxArgs', () => {
  it('muxes hevc into mp4 with cover, subtitles and chapters', () => {
    const args = buildMuxArgs({
      video: 'v.m4s',
      audio: 'a.m4s',
      out: 'o.tmp',
      format: 'mp4',
      title: 'T',
      hevc: true,
      cover: 'c.jpg',
      subtitles: [{ path: 's.srt', language: 'chi', title: '中文' }],
      chapters: 'ch.txt'
    })
    expect(args.join(' ')).toBe(
      [
        '-i v.m4s -i a.m4s -i c.jpg -i s.srt -f ffmetadata -i ch.txt',
        '-map 0:v:0 -map 1:a:0 -map 2:v:0 -map 3:s:0 -map_chapters 4',
        '-c copy -c:s mov_text -disposition:v:1 attached_pic',
        '-metadata:s:s:0 language=chi -metadata:s:s:0 title=中文 -metadata:s:s:0 handler_name=中文',
        '-tag:v:0 hvc1 -metadata title=T -movflags +faststart -f mp4 o.tmp'
      ].join(' ')
    )
  })

  it('attaches the cover and copies srt into mkv', () => {
    const args = buildMuxArgs({
      video: 'v.m4s',
      audio: 'a.m4s',
      out: 'o.tmp',
      format: 'mkv',
      title: 'T',
      hevc: true,
      cover: 'c.png',
      subtitles: [{ path: 's.srt', language: 'eng', title: 'English' }]
    }).join(' ')
    expect(args).toContain('-c:s srt')
    expect(args).toContain('-attach c.png -metadata:s:t:0 mimetype=image/png')
    expect(args).not.toContain('hvc1')
    expect(args).toContain('-f matroska')
  })

  it('writes m4a through the mp4 muxer with an attached cover', () => {
    const args = buildMuxArgs({ audio: 'a.m4s', out: 'o.tmp', format: 'm4a', title: 'T', cover: 'c.jpg' }).join(' ')
    expect(args).toBe(
      '-i a.m4s -i c.jpg -map 0:a:0 -map 1:v:0 -c copy -disposition:v:0 attached_pic -metadata title=T -movflags +faststart -f mp4 o.tmp'
    )
  })

  it('ignores subtitles for audio-only output', () => {
    const args = buildMuxArgs({ audio: 'a.m4s', out: 'o.tmp', format: 'flac', title: 'T', subtitles: [{ path: 's', language: 'chi', title: 'x' }] })
    expect(args.join(' ')).not.toContain('s.srt')
    expect(args).not.toContain('-c:s')
  })

  it('杜比视界写 dvh1 标签', () => {
    const args = buildMuxArgs({ video: 'v', audio: 'a', out: 'o', format: 'mp4', title: 'T', hevc: true, dolbyVision: true }).join(' ')
    expect(args).toContain('-tag:v:0 dvh1 -strict unofficial')
    expect(args).not.toContain('hvc1')
  })

  it('flac 用 flac 封装器，不加 faststart', () => {
    expect(buildMuxArgs({ audio: 'a', out: 'o', format: 'flac', title: 'T', cover: 'c.jpg' }).join(' ')).toBe(
      '-i a -i c.jpg -map 0:a:0 -map 1:v:0 -c copy -disposition:v:0 attached_pic -metadata title=T -f flac o'
    )
  })

  it('mkv 的 jpg 封面作为附件', () => {
    expect(buildMuxArgs({ video: 'v', out: 'o', format: 'mkv', title: 'T', cover: 'c.jpg' }).join(' ')).toBe(
      '-i v -map 0:v:0 -c copy -attach c.jpg -metadata:s:t:0 mimetype=image/jpeg -metadata:s:t:0 filename=cover.jpg -metadata title=T -f matroska o'
    )
  })

  it('多条字幕按顺序映射和命名，mkv 不写 handler_name', () => {
    const args = buildMuxArgs({
      video: 'v',
      audio: 'a',
      out: 'o',
      format: 'mkv',
      title: 'T',
      subtitles: [
        { path: 'zh.srt', language: 'chi', title: '中文' },
        { path: 'en.srt', language: 'eng', title: 'English' }
      ]
    }).join(' ')
    expect(args).toBe(
      [
        '-i v -i a -i zh.srt -i en.srt -map 0:v:0 -map 1:a:0 -map 2:s:0 -map 3:s:0 -c copy -c:s srt',
        '-metadata:s:s:0 language=chi -metadata:s:s:0 title=中文 -metadata:s:s:1 language=eng -metadata:s:s:1 title=English',
        '-metadata title=T -f matroska o'
      ].join(' ')
    )
  })

  it('只写有值的元数据', () => {
    const args = buildMuxArgs({ video: 'v', out: 'o', format: 'mkv', title: 'T', metadata: { artist: 'UP', album: undefined, comment: '' } })
    expect(args.join(' ')).toBe('-i v -map 0:v:0 -c copy -metadata title=T -metadata artist=UP -f matroska o')
  })
})

describe('explainFfmpegError', () => {
  it('maps common failures to readable messages', () => {
    expect(explainFfmpegError('...: No space left on device', 1)).toBe('合并失败：磁盘空间不足')
    expect(explainFfmpegError('moov atom not found', 1)).toContain('重新下载')
  })

  it('其余几类常见错误', () => {
    expect(explainFfmpegError('o.tmp: Permission denied', 1)).toBe('合并失败：没有写入目标目录的权限')
    expect(explainFfmpegError('Operation not permitted', 1)).toBe('合并失败：没有写入目标目录的权限')
    expect(explainFfmpegError('Invalid data found when processing input', 1)).toBe('合并失败：下载的文件已损坏，请点“重新下载”')
    expect(explainFfmpegError('Error while decoding stream #0:0', 1)).toBe('合并失败：下载的文件已损坏，请点“重新下载”')
    expect(explainFfmpegError('Could not find tag for codec flac in stream #1', 1)).toBe(
      '合并失败：这种编码放不进当前封装格式，请在设置里改用 MKV'
    )
    expect(explainFfmpegError('codec not supported in container', 1)).toContain('MKV')
  })

  it('认不出的错误带上退出码和最后一行', () => {
    expect(explainFfmpegError('first\nsecond line\n', 234)).toBe('合并失败（ffmpeg 退出码 234）：second line')
    expect(explainFfmpegError('', null)).toBe('合并失败（ffmpeg 退出码 null）：')
  })
})

describe('ffmpegPath', () => {
  it('开发时依次找 Homebrew、/usr/local，找到后缓存', async () => {
    const { ffmpegPath } = await load()
    h.existsSync.mockImplementation((p) => p === '/usr/local/bin/ffmpeg')
    expect(ffmpegPath()).toBe('/usr/local/bin/ffmpeg')
    expect(h.existsSync.mock.calls.map(([p]) => p)).toEqual(['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'])
    h.existsSync.mockClear()
    expect(ffmpegPath()).toBe('/usr/local/bin/ffmpeg')
    expect(h.existsSync).not.toHaveBeenCalled()
  })

  it('系统里没有时用项目 resources 里的，再没有就交给 PATH', async () => {
    const bundled = join(
      '/app',
      'resources',
      'ffmpeg',
      `${process.platform}-${process.arch}`,
      process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    )
    h.existsSync.mockImplementation((p) => p === bundled)
    expect((await load()).ffmpegPath()).toBe(bundled)
    h.existsSync.mockReturnValue(false)
    expect((await load()).ffmpegPath()).toBe('ffmpeg')
  })

  it('打包后只看随包的 ffmpeg', async () => {
    h.app.isPackaged = true
    Object.assign(process, { resourcesPath: '/Res' })
    try {
      h.existsSync.mockReturnValue(true)
      expect((await load()).ffmpegPath()).toBe(join('/Res', 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'))
      expect(h.existsSync).toHaveBeenCalledTimes(1)
    } finally {
      delete (process as { resourcesPath?: string }).resourcesPath
    }
  })

  it('Windows 打包资源使用 ffmpeg.exe', async () => {
    Object.defineProperty(process, 'platform', { ...ORIGINAL_PLATFORM, value: 'win32' })
    h.app.isPackaged = true
    Object.assign(process, { resourcesPath: '/Res' })
    try {
      h.existsSync.mockReturnValue(true)
      expect((await load()).ffmpegPath()).toBe(join('/Res', 'ffmpeg', 'ffmpeg.exe'))
    } finally {
      delete (process as { resourcesPath?: string }).resourcesPath
    }
  })
})

describe('runFfmpeg', () => {
  it('带固定参数启动，退出码 0 时成功', async () => {
    const { runFfmpeg } = await load()
    const p = runFfmpeg(['-i', 'a'])
    await flush()
    expect(h.spawn).toHaveBeenCalledWith('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', 'a'])
    procs[0].emit('close', 0, null)
    await expect(p).resolves.toBeUndefined()
  })

  it('退出码非 0 时抛 FfmpegError，stderr 只保留最后 4000 字', async () => {
    const { runFfmpeg, FfmpegError } = await load()
    const p = runFfmpeg([])
    await flush()
    // 开头的权限错误被截掉了，只能按最后一行报
    procs[0].stderr.emit('data', Buffer.from('Permission denied\n'))
    procs[0].stderr.emit('data', 'x'.repeat(4000))
    procs[0].emit('close', 1, null)
    const e = await p.catch((err: unknown) => err)
    expect(e).toBeInstanceOf(FfmpegError)
    expect((e as Error).message).toBe(`合并失败（ffmpeg 退出码 1）：${'x'.repeat(4000)}`)
  })

  it('stderr 能看出原因时翻译成中文', async () => {
    const { runFfmpeg } = await load()
    const p = runFfmpeg([])
    await flush()
    procs[0].stderr.emit('data', 'av_interleaved_write_frame(): No space left on device\n')
    procs[0].emit('close', 1, null)
    await expect(p).rejects.toThrow('合并失败：磁盘空间不足')
  })

  it('启动失败时报无法运行', async () => {
    const { runFfmpeg, FfmpegError } = await load()
    const p = runFfmpeg([])
    await flush()
    procs[0].emit('error', new Error('spawn ffmpeg ENOENT'))
    await expect(p).rejects.toBeInstanceOf(FfmpegError)
    await expect(p).rejects.toThrow('无法运行 ffmpeg：spawn ffmpeg ENOENT')
  })

  it('中止时 kill 进程并抛 AbortError', async () => {
    const { runFfmpeg, AbortError } = await load()
    const ac = new AbortController()
    const p = runFfmpeg([], ac.signal)
    await flush()
    ac.abort()
    expect(procs[0].kill).toHaveBeenCalledWith('SIGKILL')
    procs[0].emit('close', null, 'SIGKILL')
    await expect(p).rejects.toBeInstanceOf(AbortError)
  })

  it('已经中止时不启动进程', async () => {
    const { runFfmpeg, AbortError } = await load()
    const ac = new AbortController()
    ac.abort()
    await expect(runFfmpeg([], ac.signal)).rejects.toBeInstanceOf(AbortError)
    expect(h.spawn).not.toHaveBeenCalled()
  })

  it('30 分钟没结束就 kill，报超时', async () => {
    const { runFfmpeg } = await load()
    vi.useFakeTimers()
    try {
      const p = runFfmpeg([])
      await flush()
      vi.advanceTimersByTime(30 * 60_000 - 1)
      expect(procs[0].kill).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(procs[0].kill).toHaveBeenCalledWith('SIGKILL')
      procs[0].emit('close', null, 'SIGKILL')
      await expect(p).rejects.toThrow('合并超时，ffmpeg 没有响应')
    } finally {
      vi.useRealTimers()
    }
  })

  it('结束后清掉看门狗和 abort 监听', async () => {
    const { runFfmpeg } = await load()
    vi.useFakeTimers()
    try {
      const ac = new AbortController()
      const p = runFfmpeg([], ac.signal)
      await flush()
      procs[0].emit('close', 0, null)
      await p
      ac.abort()
      vi.advanceTimersByTime(60 * 60_000)
      expect(procs[0].kill).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('同一时间只跑一个，前一个失败不影响后面的', async () => {
    const { runFfmpeg, FfmpegError } = await load()
    const a = runFfmpeg(['a'])
    const b = runFfmpeg(['b'])
    await flush()
    expect(h.spawn).toHaveBeenCalledTimes(1)
    procs[0].emit('close', 1, null)
    await expect(a).rejects.toBeInstanceOf(FfmpegError)
    await flush()
    expect(h.spawn).toHaveBeenCalledTimes(2)
    expect(h.spawn.mock.calls[1][1]).toContain('b')
    procs[1].emit('close', 0, null)
    await expect(b).resolves.toBeUndefined()
  })
})

describe('mux', () => {
  const base = { video: 'v.m4s', audio: 'a.m4s', out: 'o.tmp', format: 'mp4' as const, title: 'T' }
  const extras = { cover: 'c.jpg', subtitles: [{ path: 's.srt', language: 'chi', title: '中文' }], chapters: 'ch.txt' }

  it('成功时返回 true', async () => {
    const { mux } = await load()
    const p = mux(base)
    await flush()
    procs[0].emit('close', 0, null)
    await expect(p).resolves.toBe(true)
  })

  it('带附加内容失败后，去掉附加内容重试一次，返回 false', async () => {
    const { mux } = await load()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const p = mux({ ...base, ...extras })
      await flush()
      expect(h.spawn.mock.calls[0][1]).toContain('c.jpg')
      procs[0].emit('close', 1, null)
      await flush()
      expect(h.spawn).toHaveBeenCalledTimes(2)
      const retry = h.spawn.mock.calls[1][1].join(' ')
      for (const f of ['c.jpg', 's.srt', 'ch.txt']) expect(retry).not.toContain(f)
      procs[1].emit('close', 0, null)
      await expect(p).resolves.toBe(false)
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('重试也失败时抛出', async () => {
    const { mux, FfmpegError } = await load()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const p = mux({ ...base, cover: 'c.jpg' })
      await flush()
      procs[0].emit('close', 1, null)
      await flush()
      procs[1].emit('close', 1, null)
      await expect(p).rejects.toBeInstanceOf(FfmpegError)
    } finally {
      warn.mockRestore()
    }
  })

  it('没有附加内容时失败直接抛出', async () => {
    const { mux, FfmpegError } = await load()
    const p = mux(base)
    await flush()
    procs[0].emit('close', 1, null)
    await expect(p).rejects.toBeInstanceOf(FfmpegError)
    expect(h.spawn).toHaveBeenCalledTimes(1)
  })

  it('中止后不再重试', async () => {
    const { mux, AbortError } = await load()
    const ac = new AbortController()
    const p = mux({ ...base, ...extras }, ac.signal)
    await flush()
    ac.abort()
    procs[0].emit('close', null, 'SIGKILL')
    await expect(p).rejects.toBeInstanceOf(AbortError)
    await flush()
    expect(h.spawn).toHaveBeenCalledTimes(1)
  })
})
