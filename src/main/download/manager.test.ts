import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TEMPLATES } from '@shared/naming'
import { normalizeOptions } from '@shared/options'
import type { DownloadOptions, EnqueueRequest, MediaItem, Settings, TaskInfo } from '@shared/types'
import { WM_MARK, WM_NOTE } from '@shared/watermark'
import type { DashStream, PlayInfo } from '../bili/playurl'
import type { PreparedExtras } from './extras'
import { activeScope, authScope, inAuthScope, setActiveScope } from '../auth/scope'

vi.mock('electron', () => ({}))
vi.mock('../bili/playurl', async (o) => ({ ...(await o<typeof import('../bili/playurl')>()), getPlayInfo: vi.fn() }))
vi.mock('../bili/audio', () => ({ getAudioStream: vi.fn() }))
vi.mock('./fetchFile', () => ({ fetchFile: vi.fn() }))
vi.mock('./mux', () => ({ mux: vi.fn() }))
vi.mock('./extras', () => ({ prepareExtras: vi.fn(), placeSidecars: vi.fn() }))
vi.mock('../watermark/auto', () => ({ autoRemove: vi.fn(), detectOnly: vi.fn(), ensureModel: vi.fn() }))
vi.mock('../watermark/manual', async (o) => ({ ...(await o<typeof import('../watermark/manual')>()), replaceVideo: vi.fn() }))
const ai = vi.hoisted(() => ({ ready: vi.fn(() => true), refine: vi.fn() }))
vi.mock('../watermark/ai', () => ({ aiModel: () => ({ ready: ai.ready }), spawnHost: () => ({}) }))
vi.mock('../watermark/ai/refine', () => ({ refineVideo: ai.refine }))
// 透传，只为了能模拟改名时文件被占用
vi.mock('node:fs', async (o) => {
  const fs = await o<typeof import('node:fs')>()
  return { ...fs, renameSync: vi.fn(fs.renameSync), rmSync: vi.fn(fs.rmSync) }
})

const { getPlayInfo } = await import('../bili/playurl')
const { getAudioStream } = await import('../bili/audio')
const { fetchFile } = await import('./fetchFile')
const { mux } = await import('./mux')
const { prepareExtras, placeSidecars } = await import('./extras')
const { AuthExpiredError, UnsupportedError } = await import('../bili/http')
const { AbortError, DownloadError, FfmpegError } = await import('./errors')
const { DownloadManager } = await import('./manager')
const { autoRemove, detectOnly, ensureModel } = await import('../watermark/auto')
const { replaceVideo } = await import('../watermark/manual')
const { renameSync, rmSync: rmSyncMock } = await import('node:fs')

// fake timers 也会接管 setImmediate，先留一份真的用来等 promise 链跑完
const realSetImmediate = setImmediate
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise<void>((r) => realSetImmediate(r))
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

/** 像真实的 fetchFile / mux 一样，中止时以 AbortError 结束 */
const untilAbort = (signal?: AbortSignal): Promise<never> =>
  new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new AbortError()), { once: true }))

const CDN_URL = 'https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/'
const avc = (over: Partial<DashStream> = {}): DashStream => ({
  id: 80,
  codecid: 7,
  codecs: 'avc1.640032',
  bandwidth: 8000,
  baseUrl: `${CDN_URL}v.m4s`,
  ...over
})
const play = (video: DashStream = avc()): PlayInfo => ({
  quality: 80,
  support_formats: [{ quality: 80, new_description: '1080P 高清' }],
  dash: { video: [video], audio: [{ id: 30280, codecs: 'mp4a.40.2', bandwidth: 192000, baseUrl: `${CDN_URL}a.m4s` }] }
})
const PLAY = play()

const item = (n: number, over: Partial<MediaItem> = {}): MediaItem => ({
  key: `ugc:BV${n}:1`,
  kind: 'ugc',
  title: `视频${n}`,
  index: n,
  cid: n,
  bvid: `BV${n}`,
  duration: 10,
  ...over
})

const req = (items: MediaItem[], over: Partial<EnqueueRequest> = {}): EnqueueRequest => ({
  title: items.length === 1 ? items[0].title : '合集',
  cover: 'https://i0.hdslb.com/cover.jpg',
  kind: 'ugc',
  items,
  options: normalizeOptions({}),
  ...over
})

const task = (over: Partial<TaskInfo>): TaskInfo => ({
  id: 't1',
  title: '视频1',
  groupTitle: '视频1',
  item: item(1),
  options: normalizeOptions({}),
  relBase: '视频1',
  status: 'paused',
  downloaded: 0,
  total: 0,
  speed: 0,
  createdAt: 0,
  ...over
})

let root = ''
let dl = ''
let settings: Settings
const stateFile = (): string => join(root, 'state.json')
const seed = (tasks: TaskInfo[]): void => writeFileSync(stateFile(), JSON.stringify(tasks))
const make = (): InstanceType<typeof DownloadManager> => new DownloadManager(join(root, 'tmp'), stateFile(), () => settings)
const statuses = (m: InstanceType<typeof DownloadManager>): string[] => m.list().map((t) => t.status)
const tmpOf = (id: string, name = ''): string => join(root, 'tmp', id, name)

beforeEach(() => {
  vi.useFakeTimers()
  root = mkdtempSync(join(tmpdir(), 'manager-'))
  dl = join(root, 'dl')
  settings = {
    concurrency: 2,
    threads: 4,
    autoRetry: 3,
    cdn: '',
    downloadDir: dl,
    naming: { ...DEFAULT_TEMPLATES },
    danmaku: { fontSize: 25, opacity: 0.8, duration: 8 }
  } as Settings
  vi.mocked(getPlayInfo).mockReset().mockResolvedValue(PLAY)
  vi.mocked(getAudioStream).mockReset()
  vi.mocked(fetchFile)
    .mockReset()
    .mockImplementation(async (o) => writeFileSync(o.dest, Buffer.alloc(100)))
  vi.mocked(mux)
    .mockReset()
    .mockImplementation(async (o) => {
      writeFileSync(o.out, 'muxed')
      return true
    })
  vi.mocked(prepareExtras).mockReset().mockResolvedValue({ subtitles: [], notes: [] })
  vi.mocked(placeSidecars).mockReset().mockResolvedValue([])
})

afterEach(async () => {
  await settle()
  vi.useRealTimers()
  rmSync(root, { recursive: true, force: true })
})

describe('构造时恢复', () => {
  it('未完成的任务改为暂停，已结束的保持原状态，清掉速度和重试时间', () => {
    seed([
      task({ id: 'a', status: 'downloading', speed: 999 }),
      task({ id: 'b', status: 'merging' }),
      task({ id: 'c', status: 'queued' }),
      task({ id: 'd', status: 'waitingAuth' }),
      task({ id: 'e', status: 'done' }),
      task({ id: 'f', status: 'error', retryAt: 123 }),
      task({ id: 'g', status: 'unsupported' }),
      task({ id: 'h', status: 'paused' })
    ])
    const m = make()
    expect(statuses(m)).toEqual(['paused', 'paused', 'paused', 'paused', 'done', 'error', 'unsupported', 'paused'])
    expect(m.list().every((t) => t.speed === 0 && t.retryAt === undefined)).toBe(true)
    expect(m.pendingCount()).toBe(0)
  })

  it('旧版选项经过规范化', () => {
    seed([task({ options: { codec: 'hevc', audioOnly: true } as unknown as DownloadOptions })])
    const o = make().list()[0].options
    expect(o.codecOrder).toEqual(['hevc', 'avc', 'av1'])
    expect(o.output).toBe('audio')
    expect(o.qn).toBe(127)
    expect('codec' in o).toBe(false)
  })

  it('状态文件缺失或损坏时得到空列表', () => {
    expect(make().list()).toEqual([])
    writeFileSync(stateFile(), '{坏掉的')
    expect(make().list()).toEqual([])
  })

  it('状态文件不是数组、或有残缺的条目时不崩溃（回归）', () => {
    writeFileSync(stateFile(), '{}')
    expect(make().list()).toEqual([])
    writeFileSync(stateFile(), JSON.stringify([null, 3, { id: 'x' }, task({ id: 'ok' })]))
    expect(make().list().map((t) => t.id)).toEqual(['ok'])
  })

  it('flush 之后新实例把未完成的任务恢复为暂停', () => {
    vi.mocked(getPlayInfo).mockReturnValue(new Promise(() => {}))
    const m = make()
    m.enqueue(req([item(1)]))
    expect(statuses(m)).toEqual(['fetching'])
    m.flush()
    const restored = make().list()
    expect(restored).toHaveLength(1)
    expect(restored[0]).toMatchObject({ id: m.list()[0].id, title: '视频1', status: 'paused' })
  })

  it('有变化后 1 秒内自动落盘', async () => {
    const m = make()
    m.enqueue(req([item(1)]))
    await settle()
    expect(existsSync(stateFile())).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(JSON.parse(readFileSync(stateFile(), 'utf8'))[0].status).toBe('done')
  })
})

it('同一视频不分账号只下一份，切号后原任务继续取字幕，过期和重登只影响原账号', async () => {
  const original = activeScope()
  const a = { mid: 1, partition: 'a' }
  const b = { mid: 2, partition: 'b' }
  const status = new Map([[1, 'ready' as const], [2, 'ready' as const]]) as Map<number, 'ready' | 'expired'>
  const accounts = {
    run: <T>(mid: number | undefined, fn: () => Promise<T>) =>
      status.get(mid!) === 'ready' ? inAuthScope(mid === 1 ? a : b, fn) : Promise.reject(new AuthExpiredError()),
    partition: (mid: number) => mid === 1 ? a.partition : b.partition,
    status: (mid: number) => status.get(mid) ?? 'removed' as const
  }
  const manager = new DownloadManager(join(root, 'tmp'), stateFile(), () => settings, accounts)
  const stream = deferred<PlayInfo>()
  const owners: Array<number | undefined> = []
  vi.mocked(getPlayInfo).mockImplementation(async () => {
    expect([1, 2]).toContain(authScope().mid)
    return authScope().mid === 1 ? stream.promise : PLAY
  })
  vi.mocked(prepareExtras).mockImplementation(async (task) => {
    owners.push(authScope().mid)
    if (task.accountMid === 1 && status.get(1) === 'expired') throw new AuthExpiredError()
    return { subtitles: [], notes: [] }
  })
  try {
    setActiveScope(a)
    const options = normalizeOptions({ subtitle: true })
    const first = manager.enqueue(req([item(1)], { accountMid: 1, options }))
    setActiveScope(b)
    expect(manager.enqueue(req([item(1)], { accountMid: 1, options }))).toMatchObject({
      created: [], skipped: [{ taskId: first.created[0].id }]
    })
    // 别的账号正在下同一个视频：跳过，指向已有的任务
    expect(manager.enqueue(req([item(1)], { accountMid: 2, options }))).toMatchObject({
      created: [], skipped: [{ taskId: first.created[0].id }]
    })
    manager.enqueue(req([item(2)], { accountMid: 2, options }))
    await settle()
    expect(statuses(manager)).toEqual(['fetching', 'done'])
    status.set(1, 'expired')
    manager.accountChanged(1, 'expired')
    stream.resolve(PLAY)
    await settle()
    expect(statuses(manager)).toEqual(['waitingAuth', 'done'])

    status.set(1, 'ready')
    manager.accountChanged(1, 'ready')
    await settle()
    expect(statuses(manager)).toEqual(['done', 'done'])
    expect(owners).toEqual([2, 1])
    const outputs = manager.list().map((task) => task.outputPath!)
    expect(new Set(outputs).size).toBe(2)
    expect(outputs.every((file) => existsSync(file))).toBe(true)
    expect(activeScope()).toBe(b)
  } finally {
    setActiveScope(original)
  }
})

describe('enqueue', () => {
  it('同 key 未完成的任务去重，已完成的可以再加', async () => {
    const m = make()
    m.blockForAuth()
    m.enqueue(req([item(1)]))
    m.enqueue(req([item(1), item(2)]))
    expect(m.list().map((t) => t.item.key)).toEqual(['ugc:BV1:1', 'ugc:BV2:1'])
    expect(m.pendingCount()).toBe(2)
    m.unblockAuth()
    await settle()
    expect(statuses(m)).toEqual(['done', 'done'])
    m.enqueue(req([item(1)]))
    expect(m.list()).toHaveLength(3)
  })

  it('单条用 single，多条用 multi，番剧和课程用 pgc', () => {
    settings.naming = { single: 'S {title}', multi: 'M {title}', pgc: 'P {title}' }
    const m = make()
    m.blockForAuth()
    m.enqueue(req([item(1)]))
    m.enqueue(req([item(2), item(3)]))
    m.enqueue(req([item(4, { key: 'pgc:4', kind: 'pgc' }), item(5, { key: 'pgc:5', kind: 'pgc' })], { kind: 'pgc' }))
    m.enqueue(req([item(6, { key: 'c:6', kind: 'cheese' }), item(7, { key: 'c:7', kind: 'cheese' })], { kind: 'cheese' }))
    m.enqueue(req([item(8, { key: 'pgc:8', kind: 'pgc' })], { kind: 'pgc' }))
    expect(m.list().map((t) => [t.template, t.series])).toEqual([
      ['S {title}', false],
      ['M {title}', false],
      ['M {title}', false],
      ['P {title}', true],
      ['P {title}', true],
      ['P {title}', true],
      ['P {title}', true],
      ['S {title}', false]
    ])
    expect(m.list()[0].relBase).toBe('S 视频1')
    expect(m.list()[3].nameValues?.type).toBe('番剧影视')
  })

  it('批次没有 meta 时用视频自己的作者和简介，批次的 meta 优先', () => {
    const m = make()
    m.blockForAuth()
    m.enqueue(req([item(1, { owner: '作者', ownerMid: 9, pubdate: 200, desc: '简介' })]))
    m.enqueue(req([item(2, { owner: '作者', bvid: undefined })]))
    m.enqueue(req([item(3)]))
    m.enqueue(req([item(4, { owner: '作者' })], { meta: { owner: 'UP' } }))
    const [a, b, c, d] = m.list()
    expect(a.meta).toEqual({ owner: '作者', ownerMid: 9, pubdate: 200, desc: '简介', url: 'https://www.bilibili.com/video/BV1' })
    expect(b.meta).toMatchObject({ owner: '作者', url: undefined })
    expect(c.meta).toBeUndefined()
    expect(d.meta).toEqual({ owner: 'UP' })
  })

  it('series 和 owner 的取值，下载目录按入队时快照', async () => {
    const meta = { owner: 'UP', ownerMid: 1, pubdate: 100 }
    const m = make()
    m.blockForAuth()
    m.enqueue(req([item(1, { owner: '作者', ownerMid: 9, pubdate: 200 })], { meta }))
    m.enqueue(req([item(2)], { title: '总标题', meta }))
    m.enqueue(req([item(3), item(4)], { meta }))
    const [a, b, c] = m.list()
    expect(a.nameValues).toMatchObject({ series: '', owner: '作者', owner_mid: 9, pubdate: 200, type: '视频', bvid: 'BV1' })
    expect(a.relBase).toBe('视频1')
    expect(b.nameValues).toMatchObject({ series: '总标题', owner: 'UP', owner_mid: 1, pubdate: 100 })
    expect(b.relBase).toBe('总标题 - 视频2')
    expect(c.relBase).toBe('合集/03 - 视频3')
    expect(c.seriesCover).toBe('https://i0.hdslb.com/cover.jpg')

    settings.downloadDir = join(root, 'other')
    m.unblockAuth()
    await settle()
    expect(a.dir).toBe(dl)
    expect(a.outputPath).toBe(join(dl, '视频1.mp4'))
    expect(existsSync(join(root, 'other'))).toBe(false)
  })

  it('返回新建的任务和已在队列里被跳过的条目', () => {
    const m = make()
    m.blockForAuth()
    const first = m.enqueue(req([item(1)]))
    expect(first.created.map((t) => t.item.key)).toEqual(['ugc:BV1:1'])
    expect(first.skipped).toEqual([])
    const second = m.enqueue(req([item(1), item(2)]))
    expect(second.created.map((t) => t.item.key)).toEqual(['ugc:BV2:1'])
    expect(second.skipped).toEqual([{ key: 'ugc:BV1:1', taskId: first.created[0].id }])
    expect(second.created[0]).toBe(m.list()[1])
  })

  it('批次 id、指定目录，以及分几次加入时按整批选模板', async () => {
    settings.naming = { single: 'S {title}', multi: 'M {title}', pgc: 'P {title}' }
    const m = make()
    m.blockForAuth()
    m.enqueue(req([item(1)], { batchId: 'b1', dir: join(dl, '合集A'), multi: true }))
    m.enqueue(req([item(2)]))
    m.enqueue(req([item(3)], { paused: true }))
    const [a, b, c] = m.list()
    expect(c.status).toBe('paused')
    expect(a).toMatchObject({ batchId: 'b1', dir: join(dl, '合集A'), template: 'M {title}' })
    expect(b.batchId).toBeUndefined()
    expect(b).toMatchObject({ dir: dl, template: 'S {title}' })
    m.unblockAuth()
    await settle()
    expect(a.outputPath).toBe(join(dl, '合集A', 'M 视频1.mp4'))
    expect(a.videoQn).toBe(80)
  })
})

describe('调度', () => {
  it('同时运行的任务不超过并发上限', async () => {
    const gates = [deferred<PlayInfo>(), deferred<PlayInfo>(), deferred<PlayInfo>()]
    let n = 0
    vi.mocked(getPlayInfo).mockImplementation(() => gates[n++].promise)
    const m = make()
    m.enqueue(req([item(1), item(2), item(3)]))
    await settle()
    expect(statuses(m)).toEqual(['fetching', 'fetching', 'queued'])
    gates[0].resolve(PLAY)
    await settle()
    expect(statuses(m)).toEqual(['done', 'fetching', 'fetching'])
    gates[1].resolve(PLAY)
    gates[2].resolve(PLAY)
    await settle()
    expect(statuses(m)).toEqual(['done', 'done', 'done'])
  })

  it('按首选 CDN 改写地址，原地址留作备用', async () => {
    settings.cdn = 'upos-sz-mirrorali.bilivideo.com'
    const m = make()
    m.enqueue(req([item(1)]))
    await settle()
    const [video, audio] = vi.mocked(fetchFile).mock.calls.map(([o]) => o)
    expect(video).toMatchObject({
      urls: ['https://upos-sz-mirrorali.bilivideo.com/upgcxcode/v.m4s', `${CDN_URL}v.m4s`],
      dest: tmpOf(m.list()[0].id, 'video.m4s'),
      fingerprint: '80-avc1.640032-8000',
      threads: 4
    })
    expect(audio.dest).toBe(tmpOf(m.list()[0].id, 'audio.m4s'))
    // 成功后临时目录清掉
    expect(existsSync(tmpOf(m.list()[0].id))).toBe(false)
  })

  it('按分片汇总进度，速度按秒平滑', async () => {
    const seen: number[][] = []
    const m = make()
    const snap = (): void => {
      const t = m.list()[0]
      seen.push([t.downloaded, t.total, t.speed])
    }
    vi.mocked(fetchFile).mockImplementation(async (o) => {
      if (o.dest.endsWith('video.m4s')) {
        o.onProgress(0, 1000)
        snap()
        vi.setSystemTime(Date.now() + 1000)
        o.onProgress(500, 1000)
        snap()
        // 不到 1 秒不更新速度；total 为 0 时沿用之前的大小
        o.onProgress(600, 0)
        snap()
        vi.setSystemTime(Date.now() + 2000)
        o.onProgress(1000, 1000)
        snap()
      }
      writeFileSync(o.dest, Buffer.alloc(o.dest.endsWith('video.m4s') ? 1000 : 200))
    })
    m.enqueue(req([item(1)]))
    await settle()
    // 音频还没拿到大小时按码率 × 时长估算：192000 × 10 / 8
    expect(seen).toEqual([
      [0, 241000, 0],
      [500, 241000, 500],
      [600, 241000, 500],
      [1000, 241000, 400]
    ])
    expect(m.list()[0]).toMatchObject({ status: 'done', speed: 0, downloaded: 5, total: 5 })
  })
})

describe('暂停', () => {
  it('排队中的任务暂停后不再启动', async () => {
    settings.concurrency = 1
    const gate = deferred<PlayInfo>()
    vi.mocked(getPlayInfo).mockReturnValueOnce(gate.promise)
    const m = make()
    m.enqueue(req([item(1), item(2)]))
    const [a, b] = m.list()
    m.pause(b.id)
    expect(b.status).toBe('paused')
    gate.resolve(PLAY)
    await settle()
    expect(a.status).toBe('done')
    expect(b.status).toBe('paused')
    expect(getPlayInfo).toHaveBeenCalledTimes(1)
  })

  it('合并中的任务：删掉合并到一半的 .tmp，保留已下载的分片', async () => {
    vi.mocked(mux).mockImplementationOnce((o, signal) => {
      writeFileSync(o.out, 'half')
      return untilAbort(signal)
    })
    const m = make()
    m.enqueue(req([item(1)]))
    await settle()
    const t = m.list()[0]
    expect(t.status).toBe('merging')
    const half = t.tmpOutput!
    expect(half).toBe(join(dl, '视频1.mp4.tmp'))
    expect(existsSync(half)).toBe(true)

    m.pause(t.id)
    await settle()
    expect(t).toMatchObject({ status: 'paused', tmpOutput: undefined })
    expect(existsSync(half)).toBe(false)
    expect(readdirSync(tmpOf(t.id)).sort()).toEqual(['audio.m4s', 'video.m4s'])
  })

  it('等待自动重试的任务：清掉重试计时器', async () => {
    vi.mocked(getPlayInfo).mockRejectedValueOnce(new DownloadError('连接中断'))
    const m = make()
    m.enqueue(req([item(1)]))
    await settle()
    const t = m.list()[0]
    expect(t.status).toBe('error')
    expect(t.retryAt).toBeDefined()
    // 先让节流的 update / 落盘计时器走完，剩下的只有重试计时器
    await vi.advanceTimersByTimeAsync(2000)
    expect(vi.getTimerCount()).toBe(1)
    m.pause(t.id)
    expect(t.status).toBe('paused')
    expect(t.retryAt).toBeUndefined()
    await vi.advanceTimersByTimeAsync(2000)
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(300_000)
    expect(t.status).toBe('paused')
    expect(getPlayInfo).toHaveBeenCalledTimes(1)
  })
})

describe('继续', () => {
  it('resume 接受完成和运行中以外的状态，resumeMany / resumeAll 只接受暂停和出错', () => {
    seed([
      task({ id: 'done', status: 'done' }),
      task({ id: 'unsup', status: 'unsupported', error: 'DRM' }),
      task({ id: 'paused', status: 'paused' }),
      task({ id: 'err', status: 'error', error: '连接中断', retries: 2 })
    ])
    const m = make()
    m.blockForAuth()
    m.resumeAll()
    expect(statuses(m)).toEqual(['done', 'unsupported', 'queued', 'queued'])
    expect(m.list()[3]).toMatchObject({ error: undefined, retries: 0 })

    m.resume('done')
    m.resume('unsup')
    m.resume('不存在')
    expect(statuses(m)).toEqual(['done', 'queued', 'queued', 'queued'])
    expect(m.list()[1].error).toBeUndefined()

    m.pauseAll()
    expect(statuses(m)).toEqual(['done', 'paused', 'paused', 'paused'])
    m.resumeMany(['paused'])
    expect(statuses(m)).toEqual(['done', 'paused', 'queued', 'paused'])
  })

  it('运行中的任务 resume 不做处理', () => {
    vi.mocked(getPlayInfo).mockReturnValue(new Promise(() => {}))
    const m = make()
    m.enqueue(req([item(1)]))
    m.resume(m.list()[0].id)
    expect(statuses(m)).toEqual(['fetching'])
    expect(getPlayInfo).toHaveBeenCalledTimes(1)
  })

  it('已存在的分片不再下载', async () => {
    seed([task({ id: 't1', dir: dl })])
    mkdirSync(tmpOf('t1'), { recursive: true })
    writeFileSync(tmpOf('t1', 'video.m4s'), Buffer.alloc(500))
    const m = make()
    m.resume('t1')
    await settle()
    expect(fetchFile).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetchFile).mock.calls[0][0].dest).toBe(tmpOf('t1', 'audio.m4s'))
    expect(m.list()[0].status).toBe('done')
  })
})

describe('redownload', () => {
  it('已完成的任务：旧成品不删，新文件加 (1) 后缀', async () => {
    const m = make()
    m.enqueue(req([item(1)]))
    await settle()
    const t = m.list()[0]
    const first = t.outputPath!
    m.redownload(t.id)
    await settle()
    expect(t.status).toBe('done')
    expect(t.outputPath).toBe(join(dl, '视频1 (1).mp4'))
    expect(existsSync(first)).toBe(true)
    expect(fetchFile).toHaveBeenCalledTimes(4)
  })

  it('运行中的任务：取消后清掉分片，重新排队下载', async () => {
    let hang = true
    vi.mocked(fetchFile).mockImplementation(async (o) => {
      if (hang && o.dest.endsWith('audio.m4s')) await untilAbort(o.signal)
      writeFileSync(o.dest, Buffer.alloc(100))
    })
    const m = make()
    m.enqueue(req([item(1)]))
    await settle()
    const t = m.list()[0]
    expect(t.status).toBe('downloading')
    expect(existsSync(tmpOf(t.id, 'video.m4s'))).toBe(true)

    hang = false
    m.redownload(t.id)
    expect(t.status).toBe('queued')
    await settle()
    expect(t.status).toBe('done')
    expect(getPlayInfo).toHaveBeenCalledTimes(2)
    // 分片被清掉了，视频也要重新下载
    expect(vi.mocked(fetchFile).mock.calls.filter(([o]) => o.dest.endsWith('video.m4s'))).toHaveLength(2)
  })

  it('没在运行的任务：删掉分片和合并半成品后重新开始', async () => {
    const half = join(dl, '视频1.mp4.tmp')
    mkdirSync(dl, { recursive: true })
    writeFileSync(half, 'half')
    mkdirSync(tmpOf('t1'), { recursive: true })
    writeFileSync(tmpOf('t1', 'video.m4s'), 'old')
    seed([task({ id: 't1', tmpOutput: half, dir: dl, error: '合并失败', note: '旧提示' })])
    const m = make()
    m.redownload('t1')
    expect(existsSync(half)).toBe(false)
    expect(existsSync(tmpOf('t1'))).toBe(false)
    expect(m.list()[0]).toMatchObject({ error: undefined, note: undefined, tmpOutput: undefined })
    await settle()
    expect(m.list()[0].status).toBe('done')
    expect(fetchFile).toHaveBeenCalledTimes(2)
  })

  it('无法下载的任务和不存在的 id 不处理', () => {
    seed([task({ id: 'u', status: 'unsupported' })])
    const m = make()
    m.redownload('u')
    m.redownload('不存在')
    expect(statuses(m)).toEqual(['unsupported'])
  })
})

describe('remove', () => {
  it('运行中删除：等它结束后删掉已经合并出的成品，不算完成', async () => {
    const gate = deferred<string[]>()
    vi.mocked(placeSidecars).mockReturnValue(gate.promise)
    const m = make()
    const done = vi.fn()
    m.on('done', done)
    m.enqueue(req([item(1)]))
    await settle()
    const t = m.list()[0]
    const out = join(dl, '视频1.mp4')
    expect(existsSync(out)).toBe(true)

    m.remove([t.id], false)
    expect(m.list()).toEqual([])
    gate.resolve([])
    await settle()
    expect(existsSync(out)).toBe(false)
    expect(existsSync(tmpOf(t.id))).toBe(false)
    expect(done).not.toHaveBeenCalled()
    expect(t.status).not.toBe('done')
  })

  it('deleteFiles 时删掉已完成任务的文件并触发 purged', async () => {
    const m = make()
    m.enqueue(req([item(1), item(2)]))
    await settle()
    const [a, b] = m.list()
    const purged = vi.fn()
    m.on('purged', purged)
    m.remove([a.id], false)
    expect(existsSync(a.outputPath!)).toBe(true)
    expect(purged).not.toHaveBeenCalled()
    m.remove([b.id], true)
    expect(existsSync(b.outputPath!)).toBe(false)
    expect(purged).toHaveBeenCalledWith([b])
    expect(m.list()).toEqual([])
  })

  it('有文件删不掉时抛错并列出路径', async () => {
    const m = make()
    m.enqueue(req([item(1)]))
    await settle()
    const t = m.list()[0]
    const out = t.outputPath!
    // 成品的位置换成目录，rmSync 不带 recursive 删不掉
    rmSync(out)
    mkdirSync(out)
    const purged = vi.fn()
    m.on('purged', purged)
    expect(() => m.remove([t.id], true)).toThrow(`有 1 个文件没能删除：${out}`)
    expect(m.list()).toEqual([])
    expect(purged).toHaveBeenCalledWith([t])
  })

  it('没在运行的任务删掉临时分片；clearFinished 只清已完成和无法下载的', () => {
    mkdirSync(tmpOf('p'), { recursive: true })
    seed([
      task({ id: 'd', status: 'done' }),
      task({ id: 'u', status: 'unsupported' }),
      task({ id: 'p', status: 'paused' }),
      task({ id: 'e', status: 'error' })
    ])
    const m = make()
    m.clearFinished(false)
    expect(m.list().map((t) => t.id)).toEqual(['p', 'e'])
    m.remove(['p'], false)
    expect(existsSync(tmpOf('p'))).toBe(false)
    expect(m.list().map((t) => t.id)).toEqual(['e'])
  })
})

describe('失败处理', () => {
  it('登录过期：转为等待登录并阻止新任务，unblockAuth 后恢复', async () => {
    settings.concurrency = 1
    vi.mocked(getPlayInfo).mockRejectedValueOnce(new AuthExpiredError())
    const m = make()
    m.enqueue(req([item(1)]))
    await settle()
    expect(statuses(m)).toEqual(['waitingAuth'])
    expect(m.pendingCount()).toBe(1)

    m.enqueue(req([item(2)]))
    await settle()
    expect(statuses(m)).toEqual(['waitingAuth', 'queued'])
    expect(getPlayInfo).toHaveBeenCalledTimes(1)

    m.unblockAuth()
    await settle()
    expect(statuses(m)).toEqual(['done', 'done'])
  })

  it('UnsupportedError：标记为无法下载，计入失败数，不重试', async () => {
    vi.mocked(getPlayInfo).mockRejectedValueOnce(new UnsupportedError('该内容使用了 DRM 加密'))
    const m = make()
    const idle = vi.fn()
    m.on('idle', idle)
    m.enqueue(req([item(1)]))
    await settle()
    expect(m.list()[0]).toMatchObject({ status: 'unsupported', error: '该内容使用了 DRM 加密' })
    expect(m.list()[0].retryAt).toBeUndefined()
    expect(idle).toHaveBeenCalledWith({ done: 0, failed: 1 })
  })

  it('网络错误按 30 秒起翻倍自动重试，次数用完后失败', async () => {
    settings.autoRetry = 2
    vi.mocked(getPlayInfo).mockRejectedValue(new DownloadError('连接中断'))
    const m = make()
    const idle = vi.fn()
    m.on('idle', idle)
    m.enqueue(req([item(1)]))
    await settle()
    const t = m.list()[0]
    expect(t).toMatchObject({ status: 'error', error: '连接中断' })
    expect(t.retryAt).toBe(Date.now() + 30_000)

    await vi.advanceTimersByTimeAsync(29_999)
    expect(getPlayInfo).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await settle()
    expect(t.retries).toBe(1)
    expect(t.retryAt).toBe(Date.now() + 60_000)

    await vi.advanceTimersByTimeAsync(60_000)
    await settle()
    expect(t).toMatchObject({ status: 'error', retries: 2 })
    expect(t.retryAt).toBeUndefined()
    expect(getPlayInfo).toHaveBeenCalledTimes(3)
    expect(idle).toHaveBeenCalledTimes(1)
    expect(idle).toHaveBeenCalledWith({ done: 0, failed: 1 })
  })

  it('autoRetry 为 0 时直接失败', async () => {
    settings.autoRetry = 0
    vi.mocked(getPlayInfo).mockRejectedValueOnce(new TypeError('fetch failed'))
    const m = make()
    m.enqueue(req([item(1)]))
    await settle()
    expect(m.list()[0]).toMatchObject({ status: 'error', error: 'fetch failed' })
    expect(m.list()[0].retryAt).toBeUndefined()
  })

  it('不是 Error 的异常也转成文字', async () => {
    vi.mocked(getPlayInfo).mockRejectedValueOnce('奇怪的错误')
    const m = make()
    m.enqueue(req([item(1)]))
    await settle()
    expect(m.list()[0]).toMatchObject({ status: 'error', error: '奇怪的错误' })
    expect(m.list()[0].retryAt).toBeUndefined()
  })

  it('磁盘错误不重试', async () => {
    // 下载目录的位置是个文件，建目录时报 EEXIST
    const file = join(root, 'file')
    writeFileSync(file, '')
    settings.downloadDir = file
    const m = make()
    m.enqueue(req([item(1)]))
    await settle()
    const t = m.list()[0]
    expect(t.status).toBe('error')
    expect(t.retryAt).toBeUndefined()
    expect(t.error).toBe(`写入文件失败（EEXIST）：${file}`)
  })

  it('ffmpeg 合并失败不重试，删掉半成品', async () => {
    vi.mocked(mux).mockImplementationOnce(async (o) => {
      writeFileSync(o.out, 'half')
      throw new FfmpegError('合并失败：下载的文件已损坏，请点“重新下载”')
    })
    const m = make()
    m.enqueue(req([item(1)]))
    await settle()
    expect(m.list()[0]).toMatchObject({
      status: 'error',
      error: '合并失败：下载的文件已损坏，请点“重新下载”',
      tmpOutput: undefined
    })
    expect(m.list()[0].retryAt).toBeUndefined()
    expect(readdirSync(dl)).toEqual([])
  })
})

describe('事件', () => {
  it('idle 统计本轮完成和失败数，之后重新计数；active 只在翻转时触发', async () => {
    vi.mocked(getPlayInfo).mockResolvedValueOnce(PLAY).mockRejectedValueOnce(new UnsupportedError('x'))
    const m = make()
    const idle = vi.fn()
    const active = vi.fn()
    m.on('idle', idle)
    m.on('active', active)
    m.enqueue(req([item(1), item(2), item(3)]))
    await settle()
    expect(statuses(m)).toEqual(['done', 'unsupported', 'done'])
    expect(idle.mock.calls).toEqual([[{ done: 2, failed: 1 }]])
    expect(active.mock.calls).toEqual([[true], [false]])

    m.enqueue(req([item(4)]))
    await settle()
    expect(idle.mock.calls).toEqual([[{ done: 2, failed: 1 }], [{ done: 1, failed: 0 }]])
    expect(active.mock.calls).toEqual([[true], [false], [true], [false]])
  })

  it('有待重试的任务时不触发 idle', async () => {
    vi.mocked(getPlayInfo).mockRejectedValueOnce(new DownloadError('连接中断'))
    const m = make()
    const idle = vi.fn()
    const active = vi.fn()
    m.on('idle', idle)
    m.on('active', active)
    m.enqueue(req([item(1)]))
    await settle()
    expect(active.mock.calls).toEqual([[true], [false]])
    expect(idle).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(30_000)
    await settle()
    expect(m.list()[0].status).toBe('done')
    expect(idle).toHaveBeenCalledWith({ done: 1, failed: 0 })
  })

  it('done 带上完成的任务，update 节流到 250ms 一次', async () => {
    const m = make()
    const done = vi.fn()
    const update = vi.fn()
    m.on('done', done)
    m.on('update', update)
    m.enqueue(req([item(1)]))
    await settle()
    expect(done).toHaveBeenCalledWith(m.list()[0])
    expect(update).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(250)
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(m.list())
  })
})

describe('输出', () => {
  it('带画质、编码的模板按实际选到的流重新渲染', async () => {
    settings.naming.single = '{title} [{quality} {codec}]'
    const m = make()
    m.enqueue(req([item(1)]))
    await settle()
    const t = m.list()[0]
    expect(t.relBase).toBe('视频1 [1080P 高清 AVC]')
    expect(t.outputPath).toBe(join(dl, '视频1 [1080P 高清 AVC].mp4'))
    expect(t.qualityLabel).toBe('1080P 高清 · AVC')
  })

  it('旧任务没有 template 时沿用 relBase', async () => {
    seed([task({ relBase: '旧目录/旧名字', dir: dl })])
    const m = make()
    m.resume('t1')
    await settle()
    expect(m.list()[0].outputPath).toBe(join(dl, '旧目录', '旧名字.mp4'))
  })

  it('同名文件已存在时加序号', async () => {
    mkdirSync(dl, { recursive: true })
    writeFileSync(join(dl, '视频1.mp4'), '别的文件')
    const m = make()
    m.enqueue(req([item(1)]))
    await settle()
    expect(m.list()[0].outputPath).toBe(join(dl, '视频1 (1).mp4'))
    expect(readFileSync(join(dl, '视频1.mp4'), 'utf8')).toBe('别的文件')
  })

  it('同名的任务同时合并时各用各的文件名，不会互相覆盖（回归）', async () => {
    const gates = [deferred<void>(), deferred<void>()]
    let n = 0
    vi.mocked(mux).mockImplementation(async (o) => {
      await gates[n++].promise
      writeFileSync(o.out, o.out)
      return true
    })
    const m = make()
    m.enqueue(req([item(1, { title: '同名' })]))
    m.enqueue(req([item(2, { title: '同名' })]))
    await settle()
    expect(vi.mocked(mux).mock.calls.map(([o]) => o.out)).toEqual([join(dl, '同名.mp4.tmp'), join(dl, '同名 (1).mp4.tmp')])
    // 后开始的先合并完
    gates[1].resolve()
    await settle()
    gates[0].resolve()
    await settle()
    expect(m.list().map((t) => t.outputPath)).toEqual([join(dl, '同名.mp4'), join(dl, '同名 (1).mp4')])
    expect(readFileSync(join(dl, '同名.mp4'), 'utf8')).toBe(join(dl, '同名.mp4.tmp'))
    expect(readdirSync(dl).sort()).toEqual(['同名 (1).mp4', '同名.mp4'])
  })

  it('合并失败后释放占用的文件名', async () => {
    vi.mocked(mux).mockRejectedValueOnce(new FfmpegError('坏了'))
    const m = make()
    m.enqueue(req([item(1, { title: '同名' })]))
    await settle()
    expect(m.list()[0].status).toBe('error')
    m.enqueue(req([item(2, { title: '同名' })]))
    await settle()
    expect(m.list()[1].outputPath).toBe(join(dl, '同名.mp4'))
  })

  it('选流、附加内容、旁路文件的提示用“；”拼接', async () => {
    vi.mocked(prepareExtras).mockResolvedValue({ subtitles: [], notes: ['没有 CC 字幕'] })
    vi.mocked(placeSidecars).mockResolvedValue(['弹幕保存失败：EACCES'])
    const m = make()
    m.enqueue(req([item(1)], { options: normalizeOptions({ codecOrder: ['hevc', 'avc', 'av1'] }) }))
    await settle()
    expect(m.list()[0].note).toBe('该清晰度没有 HEVC，已改用 AVC；没有 CC 字幕；弹幕保存失败：EACCES')
  })

  it('传给 mux 的路径、附加内容和元数据', async () => {
    const extras: PreparedExtras = {
      cover: '/x/cover.jpg',
      subtitles: [{ path: '/x/sub.zh.srt', lan: 'zh', language: 'chi', title: '中文' }],
      chapters: '/x/chapters.txt',
      notes: []
    }
    vi.mocked(prepareExtras).mockResolvedValue(extras)
    const m = make()
    m.enqueue(req([item(1, { pubdate: 1704067200, desc: '分P简介' })], { meta: { owner: 'UP', url: 'https://b23.tv/x', desc: '总简介' } }))
    await settle()
    const t = m.list()[0]
    expect(t.note).toBeUndefined()
    const [o, signal] = vi.mocked(mux).mock.calls[0]
    expect(o).toEqual({
      video: tmpOf(t.id, 'video.m4s'),
      audio: tmpOf(t.id, 'audio.m4s'),
      out: join(dl, '视频1.mp4.tmp'),
      format: 'mp4',
      title: '视频1',
      hevc: false,
      dolbyVision: false,
      cover: '/x/cover.jpg',
      subtitles: undefined,
      chapters: '/x/chapters.txt',
      metadata: {
        artist: 'UP',
        album: undefined,
        date: '2024-01-01',
        comment: 'https://www.bilibili.com/video/BV1',
        description: '分P简介'
      }
    })
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(prepareExtras).toHaveBeenCalledWith(t, tmpOf(t.id), settings)
    expect(placeSidecars).toHaveBeenCalledWith(t, extras, join(dl, '视频1'), true)
  })

  it('番剧：album 用总标题，comment 用链接，标记 HEVC 和杜比视界', async () => {
    vi.mocked(getPlayInfo).mockResolvedValue(play(avc({ codecid: 12, codecs: 'dvh1.05.06' })))
    const extras: PreparedExtras = {
      cover: '/x/cover.jpg',
      subtitles: [{ path: '/x/sub.zh.srt', lan: 'zh', language: 'chi', title: '中文' }],
      notes: []
    }
    vi.mocked(prepareExtras).mockResolvedValue(extras)
    const m = make()
    const pgc = (n: number): MediaItem => item(n, { key: `pgc:${n}`, kind: 'pgc', bvid: undefined, epId: n })
    m.enqueue(
      req([pgc(1), pgc(2)], {
        title: '番剧',
        kind: 'pgc',
        meta: { url: 'https://www.bilibili.com/bangumi/play/ss1', desc: '剧情' },
        options: normalizeOptions({ embedCover: false, embedSubtitle: true })
      })
    )
    await settle()
    const o = vi.mocked(mux).mock.calls[0][0]
    expect(o).toMatchObject({ hevc: true, dolbyVision: true, cover: undefined, subtitles: extras.subtitles })
    expect(o.metadata).toEqual({
      album: '番剧',
      comment: 'https://www.bilibili.com/bangumi/play/ss1',
      description: '剧情'
    })
  })
})

describe('纯音频', () => {
  it('音频区只有一个分片，无损输出 flac，合并时没有视频', async () => {
    vi.mocked(getAudioStream).mockResolvedValue({ urls: ['https://au/1.flac'], size: 3000, label: '无损', text: '无损', flac: true })
    const m = make()
    m.enqueue(req([item(1, { key: 'audio:1', kind: 'audio', bvid: undefined })], { kind: 'audio' }))
    await settle()
    const t = m.list()[0]
    expect(getAudioStream).toHaveBeenCalledWith(1, 'best')
    expect(getPlayInfo).not.toHaveBeenCalled()
    expect(fetchFile).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetchFile).mock.calls[0][0]).toMatchObject({
      urls: ['https://au/1.flac'],
      dest: tmpOf(t.id, 'audio.m4s'),
      fingerprint: 'au-无损-3000'
    })
    const o = vi.mocked(mux).mock.calls[0][0]
    expect(o).toMatchObject({ video: undefined, audio: tmpOf(t.id, 'audio.m4s'), format: 'flac', hevc: false })
    expect(t).toMatchObject({ status: 'done', qualityLabel: '音频 无损', outputPath: join(dl, '视频1.flac') })
    expect(t.nameValues?.type).toBe('音频')
  })

  it('有损音频输出 m4a', async () => {
    vi.mocked(getAudioStream).mockResolvedValue({ urls: ['https://au/1.m4a'], size: 3000, label: '320K', text: '320K', flac: false })
    const m = make()
    m.enqueue(req([item(1, { key: 'audio:1', kind: 'audio', bvid: undefined })], { kind: 'audio' }))
    await settle()
    expect(m.list()[0].outputPath).toBe(join(dl, '视频1.m4a'))
  })

  it('视频只要音频时只下载音轨', async () => {
    const m = make()
    m.enqueue(req([item(1)], { options: normalizeOptions({ output: 'audio' }) }))
    await settle()
    expect(vi.mocked(fetchFile).mock.calls.map(([o]) => o.dest)).toEqual([tmpOf(m.list()[0].id, 'audio.m4s')])
    expect(vi.mocked(mux).mock.calls[0][0]).toMatchObject({ video: undefined, format: 'm4a' })
    expect(m.list()[0].outputPath).toBe(join(dl, '视频1.m4a'))
  })
})

describe('暂停后立刻继续（回归）', () => {
  it('旧 run 结算前不会再启动第二个 run，之后新 run 仍能暂停', async () => {
    const gates = [deferred<PlayInfo>(), deferred<PlayInfo>()]
    let n = 0
    vi.mocked(getPlayInfo).mockImplementation(() => gates[n++].promise)
    const m = make()
    const active = vi.fn()
    m.on('active', active)
    m.enqueue(req([item(1)]))
    const t = m.list()[0]
    expect(t.status).toBe('fetching')

    // 旧 run 卡在取流里，不接收 signal
    m.pause(t.id)
    m.resume(t.id)
    await settle()
    expect(t.status).toBe('queued')
    expect(getPlayInfo).toHaveBeenCalledTimes(1)

    // 旧 run 结算后新 run 才启动
    gates[0].resolve(PLAY)
    await settle()
    expect(getPlayInfo).toHaveBeenCalledTimes(2)
    expect(t.status).toBe('fetching')

    // 新 run 的控制器没被旧 run 删掉，还能暂停
    m.pause(t.id)
    gates[1].resolve(PLAY)
    await settle()
    expect(t.status).toBe('paused')
    expect(fetchFile).not.toHaveBeenCalled()
    expect(active.mock.calls).toEqual([[true], [false]])
  })

  it('暂停后旧 run 未结算时重新下载，别的任务触发调度也不会多跑一个', async () => {
    const gate = deferred<PlayInfo>()
    vi.mocked(getPlayInfo).mockReturnValueOnce(gate.promise)
    const m = make()
    m.enqueue(req([item(1)]))
    const t = m.list()[0]
    m.pause(t.id)
    m.redownload(t.id)
    expect(t.status).toBe('queued')

    m.enqueue(req([item(2)]))
    await settle()
    expect(getPlayInfo).toHaveBeenCalledTimes(2)
    expect(m.list()[1].status).toBe('done')
    expect(t.status).toBe('queued')

    gate.resolve(PLAY)
    await settle()
    expect(getPlayInfo).toHaveBeenCalledTimes(3)
    expect(t.status).toBe('done')
  })
})

describe('自动去水印', () => {
  const R = { x: 1700, y: 30, w: 200, h: 50 }
  const wmOptions = (over: Partial<DownloadOptions> = {}): DownloadOptions => normalizeOptions({ watermark: 'auto', ...over })

  beforeEach(() => {
    vi.mocked(autoRemove).mockReset()
  })

  it('选了 AI 精修：方式传 ai，带上模型、启动推理进程的方法和设置里的线程数', async () => {
    vi.mocked(autoRemove).mockResolvedValue({ note: '去水印：没有识别到水印' })
    const m = make()
    m.enqueue(req([item(1)], { options: wmOptions({ watermark: 'ai' }) }))
    await settle()
    expect(vi.mocked(autoRemove).mock.calls[0][0]).toMatchObject({ method: 'ai', ai: { model: { ready: ai.ready }, threads: settings.threads } })
    expect(typeof vi.mocked(autoRemove).mock.calls[0][0].ai!.spawn).toBe('function')
  })

  it('选项关闭时不处理', async () => {
    const m = make()
    m.enqueue(req([item(1)]))
    await settle()
    expect(statuses(m)).toEqual(['done'])
    expect(autoRemove).not.toHaveBeenCalled()
    expect(detectOnly).not.toHaveBeenCalled()
    expect(m.list()[0].watermark).toBeUndefined()
  })

  it('AI 助手提交的下载（有批次 id）没选去水印：合并前只识别，记下结果，不处理', async () => {
    const state = { width: 1920, height: 1080, detected: R, found: true }
    const m = make()
    const stages: string[] = []
    vi.mocked(detectOnly)
      .mockReset()
      .mockImplementation(async () => {
        const t = m.list()[0]
        stages.push(`${t.status}:${t.processing?.stage}`)
        return state
      })
    m.enqueue(req([item(1)], { batchId: 'b1' }))
    await settle()
    expect(statuses(m)).toEqual(['done'])
    expect(autoRemove).not.toHaveBeenCalled()
    expect(vi.mocked(detectOnly).mock.calls[0][0]).toMatchObject({ source: expect.stringMatching(/video\.m4s$/), durationHint: item(1).duration })
    expect(stages).toContain('processing:detect')
    expect(m.list()[0]).toMatchObject({ watermark: state, processing: undefined })

    // 只下音频的不识别
    vi.mocked(detectOnly).mockClear()
    const m2 = make()
    m2.enqueue(req([item(2)], { batchId: 'b1', options: normalizeOptions({ output: 'audio' }) }))
    await settle()
    expect(detectOnly).not.toHaveBeenCalled()
  })

  it('成功：附加内容之后去水印，合并用处理好的视频和实际编码，文件名和画质标签跟着变', async () => {
    settings.naming.single = '{title} [{codec}]'
    const seen: unknown[] = []
    let m!: InstanceType<typeof DownloadManager>
    vi.mocked(autoRemove).mockImplementation(async (i) => {
      const t = m.list()[0]
      i.onStage({ stage: 'encode', pct: 40, eta: 9 })
      seen.push({ status: t.status, processing: { ...t.processing } })
      const video = join(i.tmp, 'video.wm.mp4')
      writeFileSync(video, 'clean')
      return { video, codec: 'hevc', state: { width: 1920, height: 1080, detected: R, applied: R } }
    })
    m = make()
    m.enqueue(req([item(1)], { options: wmOptions() }))
    await settle()
    const t = m.list()[0]
    expect(seen).toEqual([{ status: 'processing', processing: { stage: 'encode', pct: 40, eta: 9 } }])
    expect(vi.mocked(autoRemove).mock.calls[0][0]).toMatchObject({
      tmp: tmpOf(t.id),
      source: tmpOf(t.id, 'video.m4s'),
      stream: { id: 80 },
      durationHint: 10,
      method: 'fast',
      ai: undefined
    })
    expect(vi.mocked(mux).mock.calls[0][0]).toMatchObject({
      video: tmpOf(t.id, 'video.wm.mp4'),
      hevc: true,
      dolbyVision: false
    })
    expect(t).toMatchObject({
      status: 'done',
      relBase: '视频1 [HEVC]',
      qualityLabel: '1080P 高清 · HEVC',
      watermark: { applied: R },
      processing: undefined,
      note: undefined
    })
  })

  it('AV1 源转成 H.264：标签和合并参数都按 AVC', async () => {
    vi.mocked(getPlayInfo).mockResolvedValue(play(avc({ codecid: 13, codecs: 'av01.0.08M.08' })))
    vi.mocked(autoRemove).mockImplementation(async (i) => {
      const video = join(i.tmp, 'video.wm.mp4')
      writeFileSync(video, 'clean')
      return { video, codec: 'h264', state: { width: 1920, height: 1080, detected: R, applied: R } }
    })
    const m = make()
    m.enqueue(req([item(1)], { options: wmOptions({ codecOrder: ['av1', 'avc', 'hevc'] }) }))
    await settle()
    expect(vi.mocked(mux).mock.calls[0][0]).toMatchObject({ hevc: false, dolbyVision: false })
    expect(m.list()[0].qualityLabel).toBe('1080P 高清 · AVC')
  })

  it('没识别到或处理失败：写进提示，用原视频合并', async () => {
    vi.mocked(autoRemove).mockResolvedValue({ note: '去水印：没有识别到水印', state: { width: 1920, height: 1080 } })
    const m = make()
    m.enqueue(req([item(1)], { options: wmOptions() }))
    await settle()
    const t = m.list()[0]
    expect(vi.mocked(mux).mock.calls[0][0]).toMatchObject({ video: tmpOf(t.id, 'video.m4s'), hevc: false })
    expect(t).toMatchObject({
      status: 'done',
      qualityLabel: '1080P 高清 · AVC',
      note: '去水印：没有识别到水印',
      watermark: { width: 1920, height: 1080 }
    })
  })

  it('只下音频时不处理', async () => {
    const m = make()
    m.enqueue(req([item(1)], { options: wmOptions({ output: 'audio' }) }))
    await settle()
    expect(statuses(m)).toEqual(['done'])
    expect(autoRemove).not.toHaveBeenCalled()
  })

  it('处理中暂停：变成暂停、清掉进度、保留分片；处理中删除：清掉临时目录', async () => {
    vi.mocked(autoRemove).mockImplementation((i) => {
      i.onStage({ stage: 'queue' })
      return untilAbort(i.signal)
    })
    const m = make()
    m.enqueue(req([item(1), item(2)], { options: wmOptions() }))
    await settle()
    const [a, b] = m.list()
    expect(statuses(m)).toEqual(['processing', 'processing'])
    expect(m.pendingCount()).toBe(2)

    m.pause(a.id)
    await settle()
    expect(a).toMatchObject({ status: 'paused', processing: undefined })
    expect(readdirSync(tmpOf(a.id)).sort()).toEqual(['audio.m4s', 'video.m4s'])

    m.remove([b.id], true)
    await settle()
    expect(existsSync(tmpOf(b.id))).toBe(false)
    expect(mux).not.toHaveBeenCalled()
  })

  it('重启后处理中的任务恢复为暂停', () => {
    seed([task({ id: 'a', status: 'processing', processing: { stage: 'encode', pct: 30 } })])
    expect(make().list()[0]).toMatchObject({ status: 'paused', processing: undefined })
  })
})

describe('手动去水印', () => {
  const R = { x: 1700, y: 30, w: 200, h: 50 }
  let out = ''

  /** 一个已完成、文件还在的视频任务 */
  const seedDone = (over: Partial<TaskInfo> = {}): void => {
    mkdirSync(dl, { recursive: true })
    out = join(dl, '视频1.mp4')
    writeFileSync(out, 'orig')
    seed([task({ status: 'done', outputPath: out, dir: dl, total: 4, downloaded: 4, qualityLabel: '1080P 高清 · AV1', ...over })])
  }

  beforeEach(() => {
    vi.mocked(replaceVideo).mockReset()
    vi.mocked(renameSync).mockClear()
  })

  it('不能处理的任务、无效的区域、正在处理的直接报错', () => {
    seedDone()
    const m = make()
    expect(() => m.startWatermark('nope', R)).toThrow('任务不存在')
    expect(() => m.startWatermark('t1', { ...R, w: Number.NaN })).toThrow('水印区域无效')

    seed([task({ status: 'paused' })])
    expect(() => make().startWatermark('t1', R)).toThrow('只能处理已经下载完成的视频')
    seed([task({ status: 'done', outputPath: out, options: normalizeOptions({ output: 'audio' }) })])
    expect(() => make().startWatermark('t1', R)).toThrow('这个任务只有音频，没有画面')
    seed([task({ status: 'done', outputPath: join(dl, '没有.mp4') })])
    expect(() => make().startWatermark('t1', R)).toThrow('找不到视频文件')

    vi.mocked(replaceVideo).mockImplementation((o) => untilAbort(o.signal))
    m.startWatermark('t1', R)
    expect(() => m.startWatermark('t1', R)).toThrow('这个视频正在处理')
  })

  it('成功：状态保持已完成，替换原文件，更新大小、标签和提示，不发 done', async () => {
    seedDone({ note: '该清晰度没有 AVC；去水印：没有识别到水印' })
    const gate = deferred<void>()
    vi.mocked(replaceVideo).mockImplementation(async (o) => {
      o.onStage({ manual: true, stage: 'encode', pct: 50 })
      await gate.promise
      writeFileSync(o.output, 'clean video')
      return { codec: 'h264', width: 1920, height: 1080, region: R }
    })
    const m = make()
    const done = vi.fn()
    const active = vi.fn()
    m.on('done', done)
    m.on('active', active)
    m.startWatermark('t1', R)
    await settle()
    const t = m.list()[0]
    expect(t).toMatchObject({ status: 'done', processing: { manual: true, stage: 'encode', pct: 50 }, tmpOutput: `${out}.wm.tmp` })
    expect(vi.mocked(replaceVideo).mock.calls[0][0]).toMatchObject({
      input: out,
      output: `${out}.wm.tmp`,
      workDir: tmpOf('t1'),
      region: R,
      format: 'mp4',
      durationHint: 10
    })
    expect(m.isActive()).toBe(true)
    expect(m.pendingCount()).toBe(1)

    // 下载相关的操作碰不到它
    m.pauseAll()
    m.redownload('t1')
    expect(t.status).toBe('done')

    gate.resolve()
    await settle()
    expect(readFileSync(out, 'utf8')).toBe('clean video')
    expect(t).toMatchObject({
      status: 'done',
      total: 11,
      downloaded: 11,
      qualityLabel: '1080P 高清 · AVC',
      note: '该清晰度没有 AVC',
      watermark: { width: 1920, height: 1080, applied: R },
      processing: undefined,
      tmpOutput: undefined
    })
    expect(done).not.toHaveBeenCalled()
    expect(active.mock.calls).toEqual([[true], [false]])
    expect(m.isActive()).toBe(false)
  })

  it('AI 精修：交给 refineVideo，带上模型和启动推理进程的方法，其余和快速一样', async () => {
    seedDone()
    ai.refine.mockReset().mockImplementation(async (o: { output: string; onStage: (p: unknown) => void }) => {
      o.onStage({ manual: true, stage: 'refine', pct: 40, backend: 'GPU' })
      writeFileSync(o.output, 'ai video')
      return { codec: 'hevc', width: 1920, height: 1080, region: R }
    })
    const m = make()
    m.startWatermark('t1', R, 'ai')
    await settle()
    expect(replaceVideo).not.toHaveBeenCalled()
    expect(ai.refine.mock.calls[0][0]).toMatchObject({ input: out, output: `${out}.wm.tmp`, region: R, format: 'mp4', model: { ready: ai.ready } })
    expect(typeof ai.refine.mock.calls[0][0].spawn).toBe('function')
    expect(readFileSync(out, 'utf8')).toBe('ai video')
    expect(m.list()[0]).toMatchObject({ qualityLabel: '1080P 高清 · HEVC', watermark: { applied: R }, processing: undefined })
  })

  it('AI 精修缺模型：先下载（进度带手动标记）；下载好了照常精修', async () => {
    seedDone()
    ai.ready.mockReturnValueOnce(false)
    const m = make()
    const stages: unknown[] = []
    vi.mocked(ensureModel)
      .mockReset()
      .mockImplementation(async (_ai, _signal, onStage) => {
        onStage({ stage: 'model', pct: 30 })
        stages.push(m.list()[0].processing)
        return undefined
      })
    ai.refine.mockReset().mockImplementation(async (o: { output: string }) => {
      writeFileSync(o.output, 'ai video')
      return { codec: 'hevc', width: 1920, height: 1080, region: R }
    })
    m.startWatermark('t1', R, 'ai')
    await settle()
    expect(stages).toContainEqual({ stage: 'model', pct: 30, manual: true })
    expect(vi.mocked(ensureModel).mock.calls[0][0]).toMatchObject({ model: { ready: ai.ready }, threads: settings.threads })
    expect(ai.refine).toHaveBeenCalledTimes(1)
    expect(replaceVideo).not.toHaveBeenCalled()
    expect(m.list()[0].note).toBeUndefined()
  })

  it('AI 精修缺模型且下不下来、或精修失败：这次改用快速去除，写明原因', async () => {
    seedDone()
    const fast = async (o: { output: string }) => {
      writeFileSync(o.output, 'fast video')
      return { codec: 'h264' as const, width: 1920, height: 1080, region: R }
    }
    vi.mocked(replaceVideo).mockImplementation(fast)
    ai.ready.mockReturnValueOnce(false)
    vi.mocked(ensureModel).mockReset().mockResolvedValue('连不上模型的下载地址')
    const m = make()
    m.startWatermark('t1', R, 'ai')
    await settle()
    expect(ai.refine).not.toHaveBeenCalled()
    expect(readFileSync(out, 'utf8')).toBe('fast video')
    expect(m.list()[0]).toMatchObject({ note: WM_NOTE.aiFallback('连不上模型的下载地址'), watermark: { applied: R } })

    seedDone()
    ai.refine.mockReset().mockImplementation(async (o: { output: string }) => {
      writeFileSync(o.output, 'half')
      throw new Error('推理进程意外退出')
    })
    const m2 = make()
    m2.startWatermark('t1', R, 'ai')
    await settle()
    expect(readFileSync(out, 'utf8')).toBe('fast video')
    expect(m2.list()[0].note).toBe(WM_NOTE.aiFailed('推理进程意外退出'))

    // 不是 Error 的失败也说明原因
    seedDone()
    ai.refine.mockReset().mockRejectedValue('坏了')
    const m3 = make()
    m3.startWatermark('t1', R, 'ai')
    await settle()
    expect(m3.list()[0].note).toBe(WM_NOTE.aiFailed('坏了'))
  })

  it('AI 精修时被取消：不改用快速去除，原视频不变', async () => {
    seedDone()
    ai.refine.mockReset().mockImplementation((o: { signal: AbortSignal }) => untilAbort(o.signal))
    const m = make()
    m.startWatermark('t1', R, 'ai')
    await settle()
    m.cancelWatermark('t1')
    await settle()
    expect(replaceVideo).not.toHaveBeenCalled()
    expect(readFileSync(out, 'utf8')).toBe('orig')
    expect(m.list()[0].processing).toBeUndefined()
    expect(m.list()[0].note).toBeUndefined()
  })

  it('MKV 按 mkv 处理', async () => {
    seedDone()
    const mkv = join(dl, '视频1.MKV')
    writeFileSync(mkv, 'orig')
    seed([task({ status: 'done', outputPath: mkv })])
    vi.mocked(replaceVideo).mockRejectedValue(new Error('x'))
    make().startWatermark('t1', R)
    await settle()
    expect(vi.mocked(replaceVideo).mock.calls[0][0].format).toBe('mkv')
  })

  it('失败：原视频不变，写提示，删掉半成品和工作目录', async () => {
    seedDone()
    vi.mocked(replaceVideo).mockImplementation(async (o) => {
      writeFileSync(o.output, 'half')
      mkdirSync(o.workDir, { recursive: true })
      throw new FfmpegError('去水印失败：磁盘空间不足')
    })
    const m = make()
    m.startWatermark('t1', R)
    await settle()
    const t = m.list()[0]
    expect(readFileSync(out, 'utf8')).toBe('orig')
    expect(existsSync(`${out}.wm.tmp`)).toBe(false)
    expect(existsSync(tmpOf('t1'))).toBe(false)
    expect(t).toMatchObject({ status: 'done', note: `${WM_MARK}去水印失败：磁盘空间不足，已保留原视频`, processing: undefined })

    // 不是 Error 的异常也转成文字
    vi.mocked(replaceVideo).mockRejectedValue('坏了')
    m.startWatermark('t1', R)
    await settle()
    expect(t.note).toBe(`${WM_MARK}去水印失败：坏了，已保留原视频`)
  })

  it('原视频被占用、目录不能写时提示原因', async () => {
    seedDone()
    vi.mocked(replaceVideo).mockImplementation(async (o) => {
      writeFileSync(o.output, 'clean')
      return { codec: 'h264', width: 1920, height: 1080, region: R }
    })
    const m = make()
    const t = m.list()[0]
    // 开始时会同步写一次任务列表（也用 renameSync），之后才轮到替换原视频
    m.startWatermark('t1', R)
    vi.mocked(renameSync).mockImplementationOnce(() => {
      throw Object.assign(new Error('busy'), { code: 'EBUSY' })
    })
    await settle()
    expect(t.note).toBe(`${WM_MARK}去水印失败：原视频正被其他程序占用，没能替换，已保留原视频`)

    m.startWatermark('t1', R)
    vi.mocked(renameSync).mockImplementationOnce(() => {
      throw Object.assign(new Error('nospace'), { code: 'ENOSPC' })
    })
    await settle()
    expect(t.note).toBe(`${WM_MARK}去水印失败：磁盘空间不足，已保留原视频`)
    expect(readFileSync(out, 'utf8')).toBe('orig')
  })

  it('一开始就落盘：处理中崩溃，下次启动能清掉半成品', async () => {
    seedDone()
    vi.mocked(replaceVideo).mockImplementation(async (o) => {
      writeFileSync(o.output, 'half')
      return untilAbort(o.signal)
    })
    const m = make()
    m.startWatermark('t1', R)
    // 还没到 1 秒的节流落盘，就已经写进去了
    const saved = JSON.parse(readFileSync(stateFile(), 'utf8'))[0]
    expect(saved).toMatchObject({ status: 'done', tmpOutput: `${out}.wm.tmp`, processing: { manual: true } })
    await settle()
    // 模拟崩溃：不等作业结束，直接按落盘的状态重新启动
    const restored = make().list()[0]
    expect(existsSync(`${out}.wm.tmp`)).toBe(false)
    expect(restored).toMatchObject({ status: 'done', processing: undefined, tmpOutput: undefined })
    expect(readFileSync(out, 'utf8')).toBe('orig')
    m.cancelWatermark('t1')
    await settle()
  })

  it('处理期间原视频被删掉：不在原位置写回处理结果，结束后也落盘', async () => {
    seedDone()
    vi.mocked(replaceVideo).mockImplementation(async (o) => {
      writeFileSync(o.output, 'clean')
      rmSync(o.input)
      return { codec: 'h264', width: 1920, height: 1080, region: R }
    })
    const m = make()
    m.startWatermark('t1', R)
    await settle()
    expect(existsSync(out)).toBe(false)
    expect(existsSync(`${out}.wm.tmp`)).toBe(false)
    expect(m.list()[0].note).toBe(`${WM_MARK}去水印没有完成：处理期间原视频被移动或删除了`)
    const saved = JSON.parse(readFileSync(stateFile(), 'utf8'))[0]
    expect(saved.processing).toBeUndefined()
    expect(saved.tmpOutput).toBeUndefined()
  })

  it('半成品删不掉（Windows 上被崩溃留下的 ffmpeg 占着）：作业照样结束，不会卡在处理中', async () => {
    seedDone()
    vi.mocked(replaceVideo).mockImplementation(async () => {
      throw new FfmpegError('去水印失败：磁盘空间不足')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const busy = (p: unknown): void => {
      if (String(p).endsWith('.wm.tmp')) throw Object.assign(new Error('busy'), { code: 'EBUSY' })
    }
    vi.mocked(rmSyncMock).mockImplementation(busy)
    try {
      const m = make()
      m.startWatermark('t1', R)
      await settle()
      expect(m.isActive()).toBe(false)
      expect(m.list()[0]).toMatchObject({ status: 'done', processing: undefined, tmpOutput: undefined })
      // 重启时删不掉也照常启动
      seed([task({ status: 'done', outputPath: out, tmpOutput: `${out}.wm.tmp`, processing: { manual: true, stage: 'encode' } })])
      expect(make().list()[0]).toMatchObject({ status: 'done', processing: undefined })
      expect(warn).toHaveBeenCalled()
    } finally {
      vi.mocked(rmSyncMock).mockReset()
      const real = await vi.importActual<typeof import('node:fs')>('node:fs')
      vi.mocked(rmSyncMock).mockImplementation(real.rmSync)
      warn.mockRestore()
    }
  })

  it('开始前先删掉上次崩溃留下的同名半成品', async () => {
    seedDone()
    writeFileSync(`${out}.wm.tmp`, 'stale')
    let seen: boolean | undefined
    vi.mocked(replaceVideo).mockImplementation(async (o) => {
      seen = existsSync(o.output)
      throw new Error('x')
    })
    make().startWatermark('t1', R)
    await settle()
    expect(seen).toBe(false)
  })

  it('取消：原视频不变，不写提示；只对手动作业生效', async () => {
    seedDone()
    vi.mocked(replaceVideo).mockImplementation((o) => {
      writeFileSync(o.output, 'half')
      return untilAbort(o.signal)
    })
    const m = make()
    m.cancelWatermark('t1')
    m.cancelWatermark('nope')
    m.startWatermark('t1', R)
    await settle()
    m.cancelWatermark('t1')
    await settle()
    const t = m.list()[0]
    expect(readFileSync(out, 'utf8')).toBe('orig')
    expect(existsSync(`${out}.wm.tmp`)).toBe(false)
    expect(t).toMatchObject({ status: 'done', processing: undefined })
    expect(t.note).toBeUndefined()
  })

  it('replaceVideo 完成时恰好被中止：不替换', async () => {
    seedDone()
    let m!: InstanceType<typeof DownloadManager>
    vi.mocked(replaceVideo).mockImplementation(async (o) => {
      writeFileSync(o.output, 'clean')
      m.cancelWatermark('t1')
      return { codec: 'h264', width: 1920, height: 1080, region: R }
    })
    m = make()
    m.startWatermark('t1', R)
    await settle()
    expect(readFileSync(out, 'utf8')).toBe('orig')
    expect(m.list()[0].note).toBeUndefined()
  })

  it('处理中彻底删除：purged 立即发出，成品等作业结束后再删', async () => {
    seedDone()
    vi.mocked(replaceVideo).mockImplementation((o) => untilAbort(o.signal))
    const m = make()
    const t = m.list()[0]
    const purged = vi.fn()
    m.on('purged', purged)
    m.startWatermark('t1', R)
    await settle()
    m.remove(['t1'], true)
    expect(purged).toHaveBeenCalledWith([t])
    expect(m.list()).toEqual([])
    await settle()
    expect(existsSync(out)).toBe(false)
  })

  it('处理中只从列表移除：保留原视频', async () => {
    seedDone()
    vi.mocked(replaceVideo).mockImplementation((o) => untilAbort(o.signal))
    const m = make()
    m.startWatermark('t1', R)
    await settle()
    m.remove(['t1'], false)
    await settle()
    expect(readFileSync(out, 'utf8')).toBe('orig')
  })

  it('作业结束时删不掉成品只记日志', async () => {
    seedDone()
    vi.mocked(replaceVideo).mockImplementation((o) => untilAbort(o.signal))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const m = make()
    m.startWatermark('t1', R)
    await settle()
    // 成品的位置换成目录，删不掉
    rmSync(out)
    mkdirSync(out)
    m.remove(['t1'], true)
    await settle()
    expect(warn).toHaveBeenCalledWith('删除文件失败：', out)
    warn.mockRestore()
  })

  it('stopAll 中断所有任务，之后不再启动新任务', async () => {
    seedDone()
    vi.mocked(replaceVideo).mockImplementation((o) => untilAbort(o.signal))
    vi.mocked(getPlayInfo).mockImplementation(() => new Promise(() => {}))
    settings.concurrency = 1
    const m = make()
    m.startWatermark('t1', R)
    await settle()
    m.enqueue(req([item(2)]))
    m.stopAll()
    await settle()
    expect(m.isActive()).toBe(false)
    expect(m.list()[0].processing).toBeUndefined()
    expect(m.list()[1].status).toBe('queued')
    expect(getPlayInfo).not.toHaveBeenCalled()
  })

  it('重启后发现上次没做完：删掉半成品和工作目录，状态保持已完成并提示', () => {
    seedDone()
    writeFileSync(`${out}.wm.tmp`, 'half')
    mkdirSync(tmpOf('t1'), { recursive: true })
    seed([
      task({
        status: 'done',
        outputPath: out,
        note: '该清晰度没有 AVC',
        tmpOutput: `${out}.wm.tmp`,
        processing: { manual: true, stage: 'encode', pct: 20 }
      }),
      task({ id: 't2', status: 'done', processing: { manual: true, stage: 'queue' } })
    ])
    const [a, b] = make().list()
    expect(a).toMatchObject({
      status: 'done',
      processing: undefined,
      tmpOutput: undefined,
      note: `该清晰度没有 AVC；${WM_MARK}去水印没有完成（应用中途退出了），已保留原视频`
    })
    expect(b.note).toBe(`${WM_MARK}去水印没有完成（应用中途退出了），已保留原视频`)
    expect(existsSync(`${out}.wm.tmp`)).toBe(false)
    expect(existsSync(tmpOf('t1'))).toBe(false)
    expect(readFileSync(out, 'utf8')).toBe('orig')
  })
})
