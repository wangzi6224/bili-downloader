import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeOptions } from '@shared/options'
import type { DownloadOptions, Settings, TaskInfo } from '@shared/types'
import { UnsupportedError } from '../../bili/http'
import { MOBILE_UA } from '../../douyin/share'
import type { DouyinService } from '../../douyin/service'
import type { DyAweme, DyBitRate } from '../../douyin/types'
import { dyHeaders } from '../../douyin/ua'
import type { FetchFileOptions } from '../fetchFile'
import { AbortError, DownloadError } from '../errors'
import type { AvAcquired, DriverContext, FilesAcquired } from './types'

vi.mock('../../douyin/extras', async (o) => ({
  ...(await o<typeof import('../../douyin/extras')>()),
  prepareDyExtras: vi.fn(async () => ({ subtitles: [], notes: ['附加内容'] }))
}))
vi.mock('../fetchFile', () => ({ fetchFile: vi.fn() }))
const { prepareDyExtras } = await import('../../douyin/extras')
const { fetchFile } = await import('../fetchFile')
const { createDouyinDriver } = await import('./douyin')

const ID = '700000000000000001'
const rate = (side: number, over: Partial<DyBitRate> = {}): DyBitRate => ({
  gear_name: `normal_${side}`,
  bit_rate: side * 1000,
  FPS: 30,
  format: 'mp4',
  play_addr: {
    uri: `uri-${side}`,
    url_list: [`https://cdn.example/${side}.mp4`, `https://cdn2.example/${side}.mp4`],
    width: side,
    height: Math.round((side * 16) / 9),
    data_size: side * 10
  },
  ...over
})
const VIDEO: DyAweme = {
  aweme_id: ID,
  desc: '测试作品',
  video: { play_addr: { uri: 'uri-plain', url_list: ['https://cdn.example/plain.mp4'] }, bit_rate: [rate(1080), rate(720)], duration: 10_000 }
}
const IMAGES: DyAweme = {
  aweme_id: ID,
  images: [1, 2, 3, 4, 5].map((n) => ({ url_list: [`https://cdn.example/${n}.webp`] })),
  music: { play_url: { uri: 'music-uri', url_list: ['https://cdn.example/music.mp3'] } }
}

let tmp = ''
let threads = 4
let progress: [number, number][]

const write = async (o: FetchFileOptions): Promise<void> => {
  writeFileSync(o.dest, 'abc')
}

beforeEach(() => {
  tmp = join(mkdtempSync(join(tmpdir(), 'dy-driver-')), 'task')
  threads = 4
  progress = []
  vi.mocked(prepareDyExtras).mockClear()
  vi.mocked(fetchFile).mockReset().mockImplementation(write)
})
afterEach(() => rmSync(join(tmp, '..'), { recursive: true, force: true }))

function fakeService(aweme: DyAweme = VIDEO) {
  const service = {
    hold: vi.fn<(account: string | null) => 'login' | 'verify' | 'cooling' | undefined>(),
    aweme: vi.fn(async (_id: string, _o: object) => aweme),
    danmaku: vi.fn(async () => [{ text: '好看' }])
  }
  return { service, driver: createDouyinDriver(() => service as unknown as DouyinService) }
}

const task = (over: Partial<TaskInfo> = {}, o: Partial<DownloadOptions> = {}): TaskInfo => ({
  id: 't1',
  title: '作品标题',
  groupTitle: '作品标题',
  item: { key: `dy:${ID}`, kind: 'douyin', title: '作品标题', index: 1, cid: 0, dyId: ID },
  options: { ...normalizeOptions({}), qn: 0, ...o },
  relBase: '作品标题',
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
    settings: () => ({ threads }) as Settings,
    withAccount: (fn) => fn(),
    onPlanned: vi.fn(),
    onProgress: (d, t) => progress.push([d, t])
  }
  return ctx
}

describe('hold', () => {
  it('按任务绑定的账号问服务；没有账号时按匿名', () => {
    const { service, driver } = fakeService()
    service.hold.mockReturnValueOnce('verify')
    expect(driver.hold!(task({ dyAccount: 'acc' }))).toBe('verify')
    expect(driver.hold!(task())).toBeUndefined()
    expect(service.hold.mock.calls).toEqual([['acc'], [null]])
  })
})

describe('acquire', () => {
  it('后台取作品数据、选画质、直链下载带抖音请求头', async () => {
    const { service, driver } = fakeService()
    const ctx = ctxOf()
    const got = (await driver.acquire(task(), ctx)) as AvAcquired
    expect(service.aweme).toHaveBeenCalledWith(ID, { account: null, signal: ctx.signal, background: true, fresh: false })
    expect(ctx.onPlanned).toHaveBeenCalledWith({ qualityLabel: '1080p · AVC', videoQn: 1080, lock: 'normal_1080|mp4' })
    expect(fetchFile).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetchFile).mock.calls[0][0]).toMatchObject({
      urls: ['https://cdn.example/1080.mp4', 'https://cdn2.example/1080.mp4'],
      dest: join(tmp, 'video.mp4'),
      headers: dyHeaders(),
      threads: 4
    })
    expect(got).toEqual({
      video: join(tmp, 'video.mp4'),
      audio: undefined,
      muxed: true,
      format: 'mp4',
      qualityLabel: '1080p · AVC',
      quality: '1080p',
      codec: 'AVC',
      notes: [],
      hevc: false,
      dolbyVision: false
    })
  })

  it('用任务绑定的账号；重试时不用缓存的作品数据', async () => {
    const { service, driver } = fakeService()
    await driver.acquire(task({ dyAccount: 'acc', retries: 2 }), ctxOf())
    expect(service.aweme).toHaveBeenCalledWith(ID, expect.objectContaining({ account: 'acc', fresh: true }))
  })

  it('长视频分开下画面和声音，各自指到对应的文件', async () => {
    const long: DyAweme = {
      aweme_id: ID,
      video: {
        bit_rate: [rate(1080, { format: 'dash' })],
        bit_rate_audio: [{ audio_meta: { bitrate: 128, size: 5, url_list: { main_url: 'https://cdn.example/audio.m4a' } } }]
      }
    }
    const got = (await fakeService(long).driver.acquire(task(), ctxOf())) as AvAcquired
    expect(got).toMatchObject({ video: join(tmp, 'video.mp4'), audio: join(tmp, 'audio.m4a') })
    expect(got.muxed).toBeUndefined()
    expect(fetchFile).toHaveBeenCalledTimes(2)
  })

  it('只要音频时没有视频文件，也不记画质档位高度', async () => {
    const { driver } = fakeService()
    const ctx = ctxOf()
    const got = (await driver.acquire(task({}, { output: 'audio' }), ctx)) as AvAcquired
    expect(got).toMatchObject({ video: undefined, audio: join(tmp, 'video.mp4'), format: 'm4a' })
    expect(ctx.onPlanned).toHaveBeenCalledWith(expect.objectContaining({ videoQn: undefined, lock: 'audio' }))
  })

  it('图文：返回所有文件和成品里的文件名，同时最多下 3 个', async () => {
    let running = 0
    let peak = 0
    vi.mocked(fetchFile).mockImplementation(async (o) => {
      peak = Math.max(peak, ++running)
      await new Promise((r) => setTimeout(r, 2))
      running--
      writeFileSync(o.dest, 'abc')
    })
    const ctx = ctxOf()
    const got = (await fakeService(IMAGES).driver.acquire(task(), ctx)) as FilesAcquired
    expect(peak).toBe(3)
    expect(got.files).toEqual(['01.webp', '02.webp', '03.webp', '04.webp', '05.webp', 'music.mp3'].map((name) => ({ path: join(tmp, name), name })))
    expect(got).toMatchObject({ qualityLabel: '图文 5 张', quality: '', codec: '', notes: [] })
    expect(got).not.toHaveProperty('video')
    expect(ctx.onPlanned).toHaveBeenCalledWith({ qualityLabel: '图文 5 张', videoQn: undefined, lock: 'images' })
    expect(progress.at(-1)).toEqual([18, 18])
  })

  it('分享页拿到的作品用移动端请求头下载', async () => {
    const shared: DyAweme = { ...VIDEO, fromShare: true }
    await fakeService(shared).driver.acquire(task(), ctxOf())
    expect(vi.mocked(fetchFile).mock.calls[0][0].headers).toEqual(dyHeaders(MOBILE_UA))
  })

  it('分段下载失败时改单连接再试', async () => {
    vi.mocked(fetchFile).mockRejectedValueOnce(new DownloadError('断了'))
    await fakeService().driver.acquire(task(), ctxOf())
    expect(vi.mocked(fetchFile).mock.calls.map((c) => c[0].threads)).toEqual([4, 1])
  })

  it('续传时沿用上次的画质档，保留下了一半的', async () => {
    mkdirSync(tmp, { recursive: true })
    writeFileSync(join(tmp, 'video.mp4.part'), 'half')
    const ctx = ctxOf()
    await fakeService().driver.acquire(task({ dyFormat: 'normal_720|mp4' }), ctx)
    expect(ctx.onPlanned).toHaveBeenCalledWith(expect.objectContaining({ lock: 'normal_720|mp4', videoQn: 720 }))
    expect(readFileSync(join(tmp, 'video.mp4.part'), 'utf8')).toBe('half')
  })

  it('上次的画质档这次没有了：清掉临时目录重新下', async () => {
    mkdirSync(tmp, { recursive: true })
    writeFileSync(join(tmp, 'video.mp4'), 'old')
    writeFileSync(join(tmp, 'video.mp4.part'), 'half')
    await fakeService().driver.acquire(task({ dyFormat: 'gone|mp4' }), ctxOf())
    expect(existsSync(join(tmp, 'video.mp4.part'))).toBe(false)
    expect(readFileSync(join(tmp, 'video.mp4'), 'utf8')).toBe('abc')
  })

  it('不可用的条目、没有作品 id 的条目报无法下载', async () => {
    const { service, driver } = fakeService()
    await expect(driver.acquire(task({ item: { ...task().item, unavailable: '作品已删除' } }), ctxOf())).rejects.toThrow(
      new UnsupportedError('作品已删除')
    )
    await expect(driver.acquire(task({ item: { ...task().item, dyId: undefined } }), ctxOf())).rejects.toThrow(new UnsupportedError('作品标题'))
    expect(service.aweme).not.toHaveBeenCalled()
  })

  it('取作品数据期间被中止时不再继续', async () => {
    const { service, driver } = fakeService()
    const ac = new AbortController()
    service.aweme.mockImplementationOnce(async () => {
      ac.abort()
      return VIDEO
    })
    const ctx = ctxOf(ac.signal)
    await expect(driver.acquire(task(), ctx)).rejects.toBeInstanceOf(AbortError)
    expect(ctx.onPlanned).not.toHaveBeenCalled()
    expect(fetchFile).not.toHaveBeenCalled()
  })
})

describe('extras', () => {
  it('用 acquire 取到的作品数据准备附加内容，用完就丢；弹幕用任务的账号在后台取', async () => {
    const { service, driver } = fakeService()
    const t = task({ dyAccount: 'acc' })
    const ctx = ctxOf()
    await driver.acquire(t, ctx)
    expect(await driver.extras(t, ctx)).toEqual({ subtitles: [], notes: ['附加内容'] })
    const [t0, aweme, dir, settings, signal, deps] = vi.mocked(prepareDyExtras).mock.calls[0]
    expect([t0, aweme, dir, settings, signal]).toEqual([t, VIDEO, tmp, { threads: 4 }, ctx.signal])
    expect(await deps.danmaku(32_000, 90_000)).toEqual([{ text: '好看' }])
    expect(service.danmaku).toHaveBeenCalledWith(ID, 32_000, 90_000, { account: 'acc', signal: ctx.signal, background: true })
    expect(await driver.extras(t, ctx)).toEqual({ subtitles: [], notes: [] })
    expect(prepareDyExtras).toHaveBeenCalledTimes(1)
  })

  it('没有 acquire 过的任务返回空', async () => {
    expect(await fakeService().driver.extras(task(), ctxOf())).toEqual({ subtitles: [], notes: [] })
    expect(prepareDyExtras).not.toHaveBeenCalled()
  })
})

describe('sourceUrl', () => {
  it('有作品 id 时用作品页地址，否则用元数据里的地址', () => {
    const { driver } = fakeService()
    const noId = { ...task().item, dyId: undefined }
    expect(driver.sourceUrl(task())).toBe(`https://www.douyin.com/video/${ID}`)
    expect(driver.sourceUrl(task({ item: noId, meta: { url: 'https://v.douyin.com/test/' } }))).toBe('https://v.douyin.com/test/')
    expect(driver.sourceUrl(task({ item: noId }))).toBeUndefined()
  })
})
