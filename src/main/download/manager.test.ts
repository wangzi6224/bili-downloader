import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TEMPLATES } from '@shared/naming'
import { normalizeOptions } from '@shared/options'
import type { DownloadOptions, EnqueueRequest, MediaItem, Settings, TaskInfo } from '@shared/types'
import type { DashStream, PlayInfo } from '../bili/playurl'
import type { PreparedExtras } from './extras'

vi.mock('electron', () => ({}))
vi.mock('../bili/playurl', async (o) => ({ ...(await o<typeof import('../bili/playurl')>()), getPlayInfo: vi.fn() }))
vi.mock('../bili/audio', () => ({ getAudioStream: vi.fn() }))
vi.mock('./fetchFile', () => ({ fetchFile: vi.fn() }))
vi.mock('./mux', () => ({ mux: vi.fn() }))
vi.mock('./extras', () => ({ prepareExtras: vi.fn(), placeSidecars: vi.fn() }))

const { getPlayInfo } = await import('../bili/playurl')
const { getAudioStream } = await import('../bili/audio')
const { fetchFile } = await import('./fetchFile')
const { mux } = await import('./mux')
const { prepareExtras, placeSidecars } = await import('./extras')
const { AuthExpiredError, UnsupportedError } = await import('../bili/http')
const { AbortError, DownloadError, FfmpegError } = await import('./errors')
const { DownloadManager } = await import('./manager')

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
    vi.mocked(getAudioStream).mockResolvedValue({ urls: ['https://au/1.flac'], size: 3000, label: '无损', flac: true })
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
    vi.mocked(getAudioStream).mockResolvedValue({ urls: ['https://au/1.m4a'], size: 3000, label: '320K', flac: false })
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
