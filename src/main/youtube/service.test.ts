import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@shared/i18n'
import type { MediaItem } from '@shared/types'
import { AbortError } from '../download/errors'
import { YtEngineError, YtLoginRequiredError } from './errors'
import type { YtFlatEntry, YtPlaylistInfo, YtVideoInfo } from './types'

vi.mock('./run', async (o) => ({ ...(await o<typeof import('./run')>()), runYtdlp: vi.fn() }))
const { runYtdlp } = await import('./run')
const { setYoutube, youtube, YoutubeService } = await import('./service')
type Deps = ConstructorParameters<typeof YoutubeService>[0]

const fixture = <T>(name: string): T => JSON.parse(readFileSync(join(__dirname, '__fixtures__', name), 'utf8')) as T
const VIDEO = fixture<YtVideoInfo>('video.json')
const PLAYLIST = fixture<YtPlaylistInfo>('playlist.json')

const ok = (v: unknown): { stdout: string; stderr: string } => ({ stdout: `[debug] 前面的行\n${JSON.stringify(v)}\n`, stderr: '' })

/** 假的 yt-dlp：按参数返回结果，记下每次调用的环境和参数 */
function setup(over: Partial<Deps> & { respond?: (args: string[]) => unknown } = {}) {
  const done = vi.fn(async () => undefined)
  const clock = { now: 1_000_000 }
  const respond = over.respond ?? ((args: string[]) => (args.includes('--flat-playlist') ? PLAYLIST : VIDEO))
  const run = vi.fn(async (_env: unknown, args: string[], _o?: unknown) => ok(await respond(args)))
  const deps: Deps = {
    useEngine: async (fn) => fn('/bin/yt-dlp'),
    env: async () => ({ jsRuntime: '/bin/node', ffmpeg: '/bin/ffmpeg', proxy: '', cacheDir: '/cache' }),
    cookies: vi.fn(async (account: string | undefined) => (account ? { file: `/tmp/${account}.txt`, done } : undefined)),
    currentAccount: () => 'cur',
    run: run as unknown as Deps['run'],
    now: () => clock.now,
    ...over
  }
  return { service: new YoutubeService(deps), run, done, deps, clock }
}

const entry = (id: string, over: Partial<YtFlatEntry> = {}): YtFlatEntry => ({ id, title: id, url: `https://www.youtube.com/watch?v=${id}`, ...over })
const lazyList = (id: string, over: Partial<MediaItem> = {}): MediaItem => ({
  key: `ytpl:${id}`,
  kind: 'youtube',
  title: id,
  index: 1,
  cid: 0,
  lazy: true,
  owner: '频道主',
  ...over
})

afterEach(() => {
  setYoutube(undefined)
})

describe('exec', () => {
  it('带上当前账号的 cookie 运行，结束后收回 cookie', async () => {
    const { service, run, done, deps } = setup()
    const onLine = vi.fn()
    const signal = new AbortController().signal
    await service.exec(['--version'], { signal, onLine })
    expect(deps.cookies).toHaveBeenCalledWith('cur')
    expect(run).toHaveBeenCalledWith(
      { jsRuntime: '/bin/node', ffmpeg: '/bin/ffmpeg', proxy: '', cacheDir: '/cache', exe: '/bin/yt-dlp', cookies: '/tmp/cur.txt' },
      ['--version'],
      { signal, onLine }
    )
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('指定账号时用它；null 表示不登录', async () => {
    const { service, run, deps } = setup()
    await service.exec(['a'], { account: 'other' })
    await service.exec(['b'], { account: null })
    expect(vi.mocked(deps.cookies).mock.calls).toEqual([['other'], [undefined]])
    expect(run.mock.calls[1][0]).toMatchObject({ cookies: undefined })
  })

  it('出错时也收回 cookie；组件问题触发一次更新检查', async () => {
    const onEngineError = vi.fn()
    const { service, run, done } = setup({ onEngineError })
    run.mockRejectedValueOnce(new YtEngineError('n challenge'))
    await expect(service.exec(['x'])).rejects.toThrow('n challenge')
    expect(onEngineError).toHaveBeenCalledTimes(1)
    expect(done).toHaveBeenCalledTimes(1)
    run.mockRejectedValueOnce(new Error('别的错误'))
    await expect(service.exec(['x'])).rejects.toThrow('别的错误')
    expect(onEngineError).toHaveBeenCalledTimes(1)
    expect(done).toHaveBeenCalledTimes(2)
  })

  it('没传 onEngineError 时组件问题照常抛出', async () => {
    const { service, run } = setup()
    run.mockRejectedValueOnce(new YtEngineError('signature'))
    await expect(service.exec(['x'])).rejects.toBeInstanceOf(YtEngineError)
  })

  it('没注入 run 时用 runYtdlp，没注入 now 时用当前时间', async () => {
    vi.mocked(runYtdlp).mockResolvedValue(ok(VIDEO))
    const { service } = setup({ run: undefined, now: undefined })
    expect((await service.info('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).id).toBe('dQw4w9WgXcQ')
    expect(runYtdlp).toHaveBeenCalledWith(expect.objectContaining({ exe: '/bin/yt-dlp' }), ['-J', '--no-playlist', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'], expect.any(Object))
  })
})

describe('info', () => {
  const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

  it('取输出的最后一行解析成 JSON', async () => {
    const { service, run } = setup()
    expect((await service.info(URL)).title).toBe(VIDEO.title)
    expect(run.mock.calls[0][1]).toEqual(['-J', '--no-playlist', URL])
  })

  it('输出不是 JSON 时报错，带上输出内容；空输出也报错', async () => {
    const { service, run } = setup()
    run.mockResolvedValueOnce({ stdout: 'not json', stderr: '' })
    await expect(service.info(URL)).rejects.toThrow(t('yt.errOther', { reason: 'not json' }))
    run.mockResolvedValueOnce({ stdout: '', stderr: '' })
    await expect(service.info(URL, { fresh: true })).rejects.toThrow(t('yt.errOther', { reason: 'empty output' }))
  })

  it('运行期间被中止时抛 AbortError', async () => {
    const { service, run } = setup()
    const ac = new AbortController()
    run.mockImplementationOnce(async () => {
      ac.abort()
      return ok(VIDEO)
    })
    await expect(service.info(URL, { signal: ac.signal })).rejects.toBeInstanceOf(AbortError)
  })

  it('5 分钟内同一账号、同一链接只请求一次；换账号、fresh、过期后重新请求', async () => {
    const { service, run, clock } = setup()
    const a = service.info(URL)
    expect(service.info(URL)).toBe(a)
    await a
    expect(run).toHaveBeenCalledTimes(1)
    await service.info(URL, { account: null })
    expect(run).toHaveBeenCalledTimes(2)
    await service.info(URL, { fresh: true })
    expect(run).toHaveBeenCalledTimes(3)
    clock.now += 5 * 60_000 - 1
    await service.info(URL)
    expect(run).toHaveBeenCalledTimes(3)
    clock.now += 1
    await service.info(URL)
    expect(run).toHaveBeenCalledTimes(4)
  })

  it('失败的不缓存', async () => {
    const { service, run } = setup()
    run.mockRejectedValueOnce(new Error('网络错误'))
    await expect(service.info(URL)).rejects.toThrow('网络错误')
    await service.info(URL)
    expect(run).toHaveBeenCalledTimes(2)
    await service.info(URL)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('失败时缓存已被新的请求替换：保留新的', async () => {
    const { service, run } = setup()
    let fail!: (e: Error) => void
    run.mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)))
    const first = service.info(URL)
    const second = service.info(URL, { fresh: true })
    await second
    fail(new Error('第一次失败'))
    await expect(first).rejects.toThrow('第一次失败')
    expect(service.info(URL)).toBe(second)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('超过 50 条时淘汰最早的', async () => {
    const { service, run } = setup()
    for (let i = 0; i <= 50; i++) await service.info(`${URL}&n=${i}`)
    expect(run).toHaveBeenCalledTimes(51)
    await service.info(`${URL}&n=50`)
    await service.info(`${URL}&n=1`)
    expect(run).toHaveBeenCalledTimes(51)
    await service.info(`${URL}&n=0`)
    expect(run).toHaveBeenCalledTimes(52)
  })
})

describe('flat、parse、loadPage', () => {
  it('flat 按页取一段列表', async () => {
    const { service, run } = setup()
    await service.flat('https://www.youtube.com/playlist?list=PL1', 3)
    expect(run.mock.calls[0][1]).toEqual(['--flat-playlist', '-J', '--playlist-items', '101:150', 'https://www.youtube.com/playlist?list=PL1'])
  })

  it('不是 YouTube 链接时返回空', async () => {
    const { service, run } = setup()
    expect(await service.parse('https://www.bilibili.com/video/BV1xx411c7mD')).toBeUndefined()
    expect(run).not.toHaveBeenCalled()
  })

  it('单个视频走 info', async () => {
    const { service, run } = setup()
    const r = (await service.parse('https://youtu.be/dQw4w9WgXcQ'))!
    expect(run.mock.calls[0][1]).toEqual(['-J', '--no-playlist', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'])
    expect(r.title).toBe(VIDEO.title)
    expect(r.defaultSelected).toEqual(['yt:dQw4w9WgXcQ'])
  })

  it('播放列表、频道走 flat 第一页', async () => {
    const { service, run } = setup()
    const r = (await service.parse('https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI'))!
    expect(run.mock.calls[0][1]).toEqual(['--flat-playlist', '-J', '--playlist-items', '1:50', 'https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI'])
    expect(r.groups[0].items).toHaveLength(PLAYLIST.entries!.length)
    expect(r.paging).toMatchObject({ source: { type: 'yt', url: 'https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI' }, page: 1 })
  })

  it('个人列表（订阅、稍后观看、喜欢的视频）没账号时要求登录', async () => {
    const { service, run } = setup({ currentAccount: () => undefined })
    for (const input of ['https://www.youtube.com/feed/subscriptions', 'https://www.youtube.com/playlist?list=WL', 'https://www.youtube.com/playlist?list=LL']) {
      await expect(service.parse(input)).rejects.toThrow(new YtLoginRequiredError(t('yt.listNeedsLogin')))
    }
    await expect(service.parseTarget({ type: 'playlist', id: 'WL' })).rejects.toBeInstanceOf(YtLoginRequiredError)
    expect(run).not.toHaveBeenCalled()
  })

  it('有当前账号时可以解析个人列表；明确不登录时仍要求登录', async () => {
    const { service, run } = setup()
    const r = await service.parseTarget({ type: 'feed', feed: 'watchlater' })
    expect(run.mock.calls[0][1].at(-1)).toBe('https://www.youtube.com/playlist?list=WL')
    expect(r.groups[0].title).toBe(t('yt.groupFeed'))
    await expect(service.parseTarget({ type: 'feed', feed: 'liked' }, { account: null })).rejects.toBeInstanceOf(YtLoginRequiredError)
  })

  it('loadPage 取第 page 页', async () => {
    const { service, run } = setup()
    const r = await service.loadPage('https://www.youtube.com/playlist?list=PL1', 2)
    expect(run.mock.calls[0][1]).toContain('51:100')
    expect(r.page).toBe(2)
    expect(r.items[0].index).toBe(51)
    expect(r.total).toBe(PLAYLIST.playlist_count)
  })
})

describe('streamInfo', () => {
  it('普通视频直接取格式', async () => {
    const { service, run } = setup()
    const s = await service.streamInfo({ key: 'yt:dQw4w9WgXcQ', kind: 'youtube', title: 'x', index: 1, cid: 0, ytId: 'dQw4w9WgXcQ' }, { account: 'a' })
    expect(run.mock.calls[0][1]).toEqual(['-J', '--no-playlist', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'])
    expect(s.qualities[0].qn).toBe(2160)
    expect(s.yt?.subtitles.map((x) => x.lang)).toEqual(['en', 'ja'])
  })

  it('播放列表项取第一个可用的视频', async () => {
    const { service, run } = setup({
      respond: (args) =>
        args.includes('--flat-playlist')
          ? { id: 'PL1', playlist_count: 3, entries: [entry('aaaaaaaaaaa', { live_status: 'is_upcoming' }), entry('bbbbbbbbbbb'), entry('ccccccccccc')] }
          : VIDEO
    })
    await service.streamInfo(lazyList('PL1'))
    expect(run.mock.calls[0][1].at(-1)).toBe('https://www.youtube.com/playlist?list=PL1')
    expect(run.mock.calls[1][1]).toEqual(['-J', '--no-playlist', 'https://www.youtube.com/watch?v=bbbbbbbbbbb'])
  })

  it('播放列表是空的时报错', async () => {
    const { service } = setup({ respond: () => ({ id: 'PL1', playlist_count: 0, entries: [] }) })
    await expect(service.streamInfo(lazyList('PL1'))).rejects.toThrow(t('yt.playlistEmpty'))
  })

  it('没有视频 id 时报错', async () => {
    const { service, run } = setup()
    await expect(service.streamInfo({ key: 'yt:x', kind: 'youtube', title: 'x', index: 1, cid: 0 })).rejects.toThrow(t('yt.noFormats'))
    expect(run).not.toHaveBeenCalled()
  })
})

describe('expand', () => {
  const video: MediaItem = { key: 'yt:zzzzzzzzzzz', kind: 'youtube', title: 'v', index: 1, cid: 0, ytId: 'zzzzzzzzzzz' }

  it('播放列表项展开成全部视频（多页），其他项原样保留，带上账号', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => entry(`v${String(i).padStart(10, '0')}`))
    const { service, run } = setup({
      respond: (args) => {
        const range = args[args.indexOf('--playlist-items') + 1]
        if (range === '1:50') return { id: 'PL1', channel: '列表作者', playlist_count: 52, entries: page1 }
        // 第二页里的播放列表项（没有视频 id）不要
        return { id: 'PL1', playlist_count: 52, entries: [entry('w0000000001', { channel: '自己的频道' }), entry('PLsub', { ie_key: 'YoutubeTab' })] }
      }
    })
    const notLazy = lazyList('PL9', { lazy: false })
    const out = await service.expand([video, lazyList('PL1'), notLazy], { account: 'acc' })
    expect(run).toHaveBeenCalledTimes(2)
    expect(run.mock.calls[0][1]).toEqual(['--flat-playlist', '-J', '--playlist-items', '1:50', 'https://www.youtube.com/playlist?list=PL1'])
    expect(run.mock.calls[1][1]).toContain('51:100')
    expect((run.mock.calls[0][0] as { cookies?: string }).cookies).toBe('/tmp/acc.txt')
    expect(out).toHaveLength(1 + 50 + 1 + 1)
    expect(out[0]).toBe(video)
    expect(out[1]).toMatchObject({ ytId: 'v0000000000', owner: '列表作者' })
    expect(out[51]).toMatchObject({ ytId: 'w0000000001', index: 51, owner: '自己的频道' })
    expect(out[52]).toBe(notLazy)
  })

  it('列表和条目都没有作者时用播放列表项的', async () => {
    const { service } = setup({ respond: () => ({ id: 'PL1', playlist_count: 1, entries: [entry('aaaaaaaaaaa')] }) })
    const out = await service.expand([lazyList('PL1')])
    expect(out).toEqual([expect.objectContaining({ ytId: 'aaaaaaaaaaa', owner: '频道主' })])
  })

  it('不知道总数时，取到空页就停', async () => {
    const { service, run } = setup({
      respond: (args) => (args.includes('1:50') ? { id: 'PL1', entries: Array.from({ length: 50 }, (_, i) => entry(`a${String(i).padStart(10, '0')}`)) } : { id: 'PL1', entries: [] })
    })
    expect(await service.expand([lazyList('PL1')])).toHaveLength(50)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('展开失败的以 unavailable 返回，不影响其他项', async () => {
    const { service, run } = setup({
      respond: (args) => {
        if (args.at(-1)!.endsWith('PL1')) throw new Error('播放列表不存在')
        if (args.at(-1)!.endsWith('PL2')) throw '字符串错误'
        return { id: 'PL3', playlist_count: 1, entries: [entry('ccccccccccc')] }
      }
    })
    const out = await service.expand([lazyList('PL1'), lazyList('PL2'), lazyList('PL3')])
    expect(run).toHaveBeenCalledTimes(3)
    expect(out).toEqual([
      { ...lazyList('PL1'), lazy: false, unavailable: '播放列表不存在' },
      { ...lazyList('PL2'), lazy: false, unavailable: '字符串错误' },
      expect.objectContaining({ ytId: 'ccccccccccc' })
    ])
  })

  it('中止时直接抛出', async () => {
    const { service, run } = setup()
    run.mockRejectedValueOnce(new AbortError())
    await expect(service.expand([lazyList('PL1'), lazyList('PL2')])).rejects.toBeInstanceOf(AbortError)
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('youtube()', () => {
  it('没设置时报错，设置后返回同一个实例', () => {
    expect(() => youtube()).toThrow('YouTube service not ready')
    const { service } = setup()
    setYoutube(service)
    expect(youtube()).toBe(service)
  })
})
