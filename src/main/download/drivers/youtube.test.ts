import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeOptions } from '@shared/options'
import type { DownloadOptions, Settings, TaskInfo } from '@shared/types'
import { UnsupportedError } from '../../bili/http'
import { AbortError } from '../errors'
import type { YoutubeService } from '../../youtube/service'
import type { YtFormat, YtVideoInfo } from '../../youtube/types'
import type { DriverContext } from './types'

vi.mock('../../youtube/extras', () => ({ prepareYtExtras: vi.fn(async () => ({ subtitles: [], notes: ['附加内容'] })) }))
const { prepareYtExtras } = await import('../../youtube/extras')
const { createYoutubeDriver } = await import('./youtube')

const VIDEO = JSON.parse(readFileSync(join(__dirname, '../../youtube/__fixtures__/video.json'), 'utf8')) as YtVideoInfo
const fmt = (id: string): YtFormat => VIDEO.formats!.find((f) => f.format_id === id)!
const V137 = fmt('137')
const A140 = fmt('140')

let tmp = ''
let settings: Settings
beforeEach(() => {
  tmp = join(mkdtempSync(join(tmpdir(), 'yt-driver-')), 'task')
  settings = { speedLimit: 0, concurrency: 3, threads: 4, youtube: { concurrency: 2 } } as Settings
  vi.mocked(prepareYtExtras).mockClear()
})
afterEach(() => {
  rmSync(join(tmp, '..'), { recursive: true, force: true })
})

const progress = (o: Record<string, unknown>): string => `@@P${JSON.stringify(o)}`

type ExecFn = YoutubeService['exec']
/** 假的服务：info 返回夹具；exec 在 -P 目录里按 format_id.ext 写出文件，并发出进度行 */
function fakeService(info: YtVideoInfo = VIDEO, lines: (dir: string) => string[] = () => [], files?: string[]) {
  const exec = vi.fn<ExecFn>(async (args, o = {}) => {
    // 下字幕这类调用不写文件
    if (!args.includes('-f')) return { stdout: '', stderr: '' }
    const dir = args[args.indexOf('-P') + 1]
    const spec = args[args.indexOf('-f') + 1]
    const names = files ?? spec.split(',').map((id) => {
      const f = info.formats!.find((x) => x.format_id === id)!
      return `${f.format_id}.${f.ext}`
    })
    for (const n of names) writeFileSync(join(dir, n), n)
    for (const l of lines(dir)) o.onLine?.(l)
    return { stdout: '', stderr: '' }
  })
  const service = { info: vi.fn(async () => info), exec }
  return { service, exec, yt: () => service as unknown as YoutubeService }
}

const task = (over: Partial<TaskInfo> = {}, o: Partial<DownloadOptions> = {}): TaskInfo => ({
  id: 't1',
  title: '视频标题',
  groupTitle: '视频标题',
  item: { key: 'yt:dQw4w9WgXcQ', kind: 'youtube', title: '视频标题', index: 1, cid: 0, ytId: 'dQw4w9WgXcQ', duration: 100 },
  options: { ...normalizeOptions({}), qn: 1080, ...o },
  relBase: '视频标题',
  status: 'fetching',
  downloaded: 0,
  total: 0,
  speed: 0,
  createdAt: 0,
  ...over
})

const ctxOf = (signal = new AbortController().signal) => {
  const ctx: DriverContext = {
    tmp,
    signal,
    settings: () => settings,
    withAccount: (fn) => fn(),
    onPlanned: vi.fn(),
    onProgress: vi.fn()
  }
  return ctx
}

describe('acquire', () => {
  it('取信息、选格式、写 info.json，交给 yt-dlp 下载，返回实际的文件', async () => {
    const { service, exec, yt } = fakeService()
    const driver = createYoutubeDriver(yt)
    const ctx = ctxOf()
    const got = await driver.acquire(task(), ctx)
    expect(service.info).toHaveBeenCalledWith('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { account: null, signal: ctx.signal, fresh: false })
    expect(ctx.onPlanned).toHaveBeenCalledWith({ qualityLabel: '1080p · AVC', videoQn: 1080, lock: '137,140' })
    expect(JSON.parse(readFileSync(join(tmp, 'info.json'), 'utf8')).id).toBe('dQw4w9WgXcQ')
    expect(exec).toHaveBeenCalledWith(
      [
        '--load-info-json', join(tmp, 'info.json'),
        '-f', '137,140',
        '-P', tmp,
        '-o', '%(format_id)s.%(ext)s',
        '--concurrent-fragments', '4',
        '--no-mtime',
        '--newline', '--progress-template', 'download:@@P%(progress)j', '--progress-delta', '0.5'
      ],
      { account: null, signal: ctx.signal, onLine: expect.any(Function) }
    )
    expect(got).toEqual({
      video: join(tmp, '137.mp4'),
      audio: join(tmp, '140.m4a'),
      format: 'mp4',
      qualityLabel: '1080p · AVC',
      quality: '1080p',
      codec: 'AVC',
      notes: [],
      hevc: false,
      dolbyVision: false
    })
  })

  it('用任务绑定的账号；重试时不用缓存的信息', async () => {
    const { service, exec, yt } = fakeService()
    await createYoutubeDriver(yt).acquire(task({ ytAccount: 'acc', retries: 1 }), ctxOf())
    expect(service.info).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ account: 'acc', fresh: true }))
    expect(exec.mock.calls[0][1]).toMatchObject({ account: 'acc' })
  })

  it('进度按两个文件汇总：先用估算大小，拿到真实大小后替换，下完按总大小算', async () => {
    const lines = (dir: string): string[] => [
      '[download] 不是进度行',
      progress({ status: 'downloading', downloaded_bytes: 1, total_bytes: 9 }),
      progress({ status: 'downloading', downloaded_bytes: 5, filename: join(dir, 'other.mp4') }),
      progress({ status: 'downloading', downloaded_bytes: 100, total_bytes: 1000, filename: join(dir, '137.mp4.part') }),
      progress({ status: 'downloading', downloaded_bytes: 50, filename: `C:\\x\\140.m4a` }),
      progress({ status: 'finished', downloaded_bytes: 0, filename: join(dir, '137.mp4') })
    ]
    const { yt } = fakeService(VIDEO, lines)
    const ctx = ctxOf()
    await createYoutubeDriver(yt).acquire(task(), ctx)
    const est = V137.filesize! + A140.filesize!
    expect(vi.mocked(ctx.onProgress).mock.calls).toEqual([
      [0, est],
      [100, 1000 + A140.filesize!],
      [150, 1000 + A140.filesize!],
      [1050, 1000 + A140.filesize!],
      [1000 + A140.filesize!, 1000 + A140.filesize!]
    ])
  })

  it('只给码率的格式按码率和时长估算大小', async () => {
    const info: YtVideoInfo = {
      id: 'x',
      title: 'x',
      formats: [
        { format_id: 'v', ext: 'mp4', vcodec: 'avc1.4d401f', acodec: 'none', height: 720, tbr: 8 },
        { format_id: 'a', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 1.6 }
      ]
    }
    const { yt } = fakeService(info)
    const ctx = ctxOf()
    await createYoutubeDriver(yt).acquire(task({ item: { ...task().item, duration: 10 } }), ctx)
    expect(vi.mocked(ctx.onProgress).mock.calls[0]).toEqual([0, 10_000 + 2_000])

    // filesize_approx；什么都没有、也不知道时长时算 0
    const info2: YtVideoInfo = {
      id: 'x',
      title: 'x',
      formats: [
        { format_id: 'v', ext: 'mp4', vcodec: 'avc1.4d401f', acodec: 'none', height: 720, filesize_approx: 700 },
        { format_id: 'a', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2' }
      ]
    }
    const ctx2 = ctxOf()
    await createYoutubeDriver(fakeService(info2).yt).acquire(task({ item: { ...task().item, duration: undefined } }), ctx2)
    expect(vi.mocked(ctx2.onProgress).mock.calls[0]).toEqual([0, 700])
  })

  it('限速平均分给同时下载的 YouTube 任务', async () => {
    const limitOf = async (): Promise<string | undefined> => {
      const { exec, yt } = fakeService()
      await createYoutubeDriver(yt).acquire(task(), ctxOf())
      const args = exec.mock.calls[0][0]
      const i = args.indexOf('--limit-rate')
      return i < 0 ? undefined : args[i + 1]
    }
    expect(await limitOf()).toBeUndefined()
    settings.speedLimit = 1000
    expect(await limitOf()).toBe('500K')
    settings.youtube.concurrency = 5
    expect(await limitOf()).toBe('333K')
    settings.speedLimit = 1
    expect(await limitOf()).toBe('1K')
    settings.speedLimit = 10
    settings.concurrency = 0
    expect(await limitOf()).toBe('10K')
  })

  it('格式变了时清空临时目录；没变时保留下了一半的', async () => {
    mkdirSync(tmp, { recursive: true })
    writeFileSync(join(tmp, 'old.part'), 'x')
    await createYoutubeDriver(fakeService().yt).acquire(task({ ytFormat: '137,140' }), ctxOf())
    expect(existsSync(join(tmp, 'old.part'))).toBe(true)
    // 上次的格式这次没有了
    await createYoutubeDriver(fakeService().yt).acquire(task({ ytFormat: 'gone,140' }), ctxOf())
    expect(existsSync(join(tmp, 'old.part'))).toBe(false)
    expect(existsSync(join(tmp, '137.mp4'))).toBe(true)
  })

  it('续传时沿用上次的格式', async () => {
    const { exec, yt } = fakeService()
    const ctx = ctxOf()
    await createYoutubeDriver(yt).acquire(task({ ytFormat: '136,251' }), ctx)
    expect(exec.mock.calls[0][0]).toContain('136,251')
    expect(ctx.onPlanned).toHaveBeenCalledWith(expect.objectContaining({ lock: '136,251', videoQn: 720 }))
  })

  it('扩展名变了时找实际的文件，跳过没下完的和 info.json；都找不到时返回原定的名字', async () => {
    const { yt } = fakeService(VIDEO, () => [], ['137.mp4.part', '137.mkv', '140.m4a.ytdl'])
    const got = await createYoutubeDriver(yt).acquire(task(), ctxOf())
    expect(got.video).toBe(join(tmp, '137.mkv'))
    expect(got.audio).toBe(join(tmp, '140.m4a'))
  })

  it('只要音频时只下音频', async () => {
    const { exec, yt } = fakeService()
    const ctx = ctxOf()
    const got = await createYoutubeDriver(yt).acquire(task({}, { output: 'audio' }), ctx)
    expect(exec.mock.calls[0][0]).toContain('140')
    expect(got).toMatchObject({ video: undefined, audio: join(tmp, '140.m4a'), format: 'm4a' })
    expect(ctx.onPlanned).toHaveBeenCalledWith(expect.objectContaining({ videoQn: undefined, lock: '140' }))
  })

  it('不可用的条目、没有视频 id 的条目报无法下载', async () => {
    const { service, yt } = fakeService()
    const driver = createYoutubeDriver(yt)
    await expect(driver.acquire(task({ item: { ...task().item, unavailable: '私享视频' } }), ctxOf())).rejects.toThrow(new UnsupportedError('私享视频'))
    await expect(driver.acquire(task({ item: { ...task().item, ytId: undefined } }), ctxOf())).rejects.toThrow(new UnsupportedError('视频标题'))
    expect(service.info).not.toHaveBeenCalled()
  })

  it('取信息期间被中止时不再继续', async () => {
    const { service, exec, yt } = fakeService()
    const ac = new AbortController()
    service.info.mockImplementationOnce(async () => {
      ac.abort()
      return VIDEO
    })
    const ctx = ctxOf(ac.signal)
    await expect(createYoutubeDriver(yt).acquire(task(), ctx)).rejects.toBeInstanceOf(AbortError)
    expect(ctx.onPlanned).not.toHaveBeenCalled()
    expect(exec).not.toHaveBeenCalled()
  })
})

describe('extras', () => {
  it('用 acquire 存下的信息准备附加内容，用完就丢', async () => {
    const { exec, yt } = fakeService()
    const driver = createYoutubeDriver(yt)
    const t = task({ ytAccount: 'acc' })
    const ctx = ctxOf()
    await driver.acquire(t, ctx)
    expect(await driver.extras(t, ctx)).toEqual({ subtitles: [], notes: ['附加内容'] })
    const [t0, dir, info, infoPath, deps] = vi.mocked(prepareYtExtras).mock.calls[0]
    expect([t0, dir, info.id, infoPath, deps.signal]).toEqual([t, tmp, 'dQw4w9WgXcQ', join(tmp, 'info.json'), ctx.signal])
    // 字幕用任务的账号下载
    const signal = new AbortController().signal
    await deps.exec(['--skip-download'], signal)
    expect(exec).toHaveBeenLastCalledWith(['--skip-download'], { account: 'acc', signal })
    expect(await driver.extras(t, ctx)).toEqual({ subtitles: [], notes: [] })
    expect(prepareYtExtras).toHaveBeenCalledTimes(1)
  })

  it('没有 acquire 过的任务返回空', async () => {
    expect(await createYoutubeDriver(fakeService().yt).extras(task(), ctxOf())).toEqual({ subtitles: [], notes: [] })
    expect(prepareYtExtras).not.toHaveBeenCalled()
  })
})

describe('sourceUrl', () => {
  it('有视频 id 时用观看地址，否则用元数据里的地址', () => {
    const driver = createYoutubeDriver(fakeService().yt)
    expect(driver.sourceUrl(task())).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(driver.sourceUrl(task({ item: { ...task().item, ytId: undefined }, meta: { url: 'https://youtu.be/x' } }))).toBe('https://youtu.be/x')
    expect(driver.sourceUrl(task({ item: { ...task().item, ytId: undefined } }))).toBeUndefined()
  })
})
