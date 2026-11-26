// 抖音任务在队列里的行为：账号字段、锁定的画质档，以及账号变化、通过验证后怎么接着排队
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TEMPLATES } from '@shared/naming'
import { normalizeOptions } from '@shared/options'
import type { EnqueueRequest, MediaItem, MediaKind, Settings, TaskInfo, WaitReason } from '@shared/types'
import type { PlatformDriver } from './drivers'

vi.mock('electron', () => ({}))
vi.mock('./mux', () => ({ mux: vi.fn() }))
const driver = vi.hoisted(() => ({
  acquire: vi.fn<PlatformDriver['acquire']>(),
  extras: vi.fn(),
  sourceUrl: vi.fn(),
  hold: vi.fn<NonNullable<PlatformDriver['hold']>>()
}))
vi.mock('./drivers', () => ({ driverFor: () => driver }))

const { DownloadManager } = await import('./manager')

let root = ''
let settings: Settings
type Manager = InstanceType<typeof DownloadManager>
const stateFile = (): string => join(root, 'state.json')
const make = (): Manager => new DownloadManager(join(root, 'tmp'), stateFile(), () => settings)
const saved = (): TaskInfo[] => JSON.parse(readFileSync(stateFile(), 'utf8'))

let n = 0
const item = (kind: MediaKind = 'douyin'): MediaItem => {
  const id = `70000000000000000${++n}`
  return {
    key: `${kind}:${id}`,
    kind,
    title: `作品${n}`,
    index: n,
    cid: 0,
    ...(kind === 'douyin' ? { dyId: id } : kind === 'youtube' ? { ytId: `yt${n}` } : { bvid: `BVtest${n}` })
  }
}
const add = (m: Manager, kind: MediaKind = 'douyin', over: Partial<EnqueueRequest> = {}): TaskInfo => {
  const i = item(kind)
  return m.enqueue({ title: i.title, cover: '', kind, items: [i], options: normalizeOptions({}), ...over }).created[0]
}
/** 加一个因为要用户处理而等着的任务 */
const waiting = (m: Manager, reason: WaitReason, over: Partial<EnqueueRequest> = {}, kind: MediaKind = 'douyin'): TaskInfo => {
  driver.hold.mockReturnValueOnce(reason)
  return add(m, kind, over)
}

beforeEach(() => {
  n = 0
  root = mkdtempSync(join(tmpdir(), 'manager-dy-'))
  settings = {
    concurrency: 5,
    autoRetry: 0,
    downloadDir: join(root, 'bili'),
    naming: { ...DEFAULT_TEMPLATES },
    youtube: { downloadDir: join(root, 'yt'), concurrency: 5 },
    douyin: { downloadDir: join(root, 'dy'), concurrency: 3 }
  } as Settings
  driver.acquire.mockReset().mockImplementation(() => new Promise<never>(() => undefined))
  driver.extras.mockReset()
  driver.hold.mockReset()
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('入队', () => {
  it('记下抖音账号，下载到抖音目录，命名模板的 {id} 是作品 id', () => {
    settings.naming = { ...DEFAULT_TEMPLATES, single: '{title} [{id}]' }
    driver.hold.mockReturnValue('cooling')
    const m = make()
    const task = add(m, 'douyin', { dyAccount: 'acc1' })
    expect(task).toMatchObject({ dyAccount: 'acc1', dir: join(root, 'dy'), relBase: '作品1 [700000000000000001]' })
    expect(task.nameValues!.id).toBe('700000000000000001')
    expect(add(m, 'youtube').nameValues!.id).toBe('yt2')
    expect(add(m, 'ugc').nameValues!.id).toBe('BVtest3')
    m.stopAll()
  })

  it('抖音按自己的同时下载上限', () => {
    settings.douyin.concurrency = 1
    const m = make()
    const first = add(m)
    const second = add(m)
    expect([first.status, second.status]).toEqual(['fetching', 'queued'])
    expect(add(m, 'youtube').status).toBe('fetching')
    m.stopAll()
  })
})

describe('B站账号变化', () => {
  it('退出 B站账号只让它名下运行中和排队的任务等待并中断，抖音任务照常', async () => {
    settings.concurrency = 2
    const accounts = { run: <T>(_mid: number | undefined, fn: () => Promise<T>) => fn(), status: () => 'ready' as const, partition: () => 'p' }
    const signals = new Map<string, AbortSignal>()
    driver.acquire.mockImplementation((t, ctx) => {
      signals.set(t.id, ctx.signal)
      return ctx.withAccount(() => new Promise<never>(() => undefined))
    })
    const m = new DownloadManager(join(root, 'tmp'), stateFile(), () => settings, accounts)
    const running = add(m, 'ugc', { accountMid: 1 })
    const other = add(m, 'douyin', { dyAccount: 'a' })
    const queued = add(m, 'ugc', { accountMid: 1 })
    await vi.waitFor(() => expect(signals.size).toBe(2))
    m.accountChanged(1, 'removed')
    expect([running.status, queued.status, other.status]).toEqual(['waitingAuth', 'waitingAuth', 'fetching'])
    expect(signals.get(running.id)!.aborted).toBe(true)
    expect(signals.get(other.id)!.aborted).toBe(false)
    m.stopAll()
  })
})

describe('锁定画质档', () => {
  const plan = async (kind: MediaKind, lock: string | undefined): Promise<{ task: TaskInfo; onDisk: TaskInfo }> => {
    let onDisk: TaskInfo | undefined
    driver.acquire.mockImplementation(async (t, ctx) => {
      ctx.onPlanned({ qualityLabel: '1080p', videoQn: 1080, lock })
      if (lock) onDisk = saved().find((x) => x.id === t.id)
      return new Promise<never>(() => undefined)
    })
    const m = make()
    const task = add(m, kind)
    await vi.waitFor(() => expect(task.status).toBe('downloading'))
    m.stopAll()
    return { task, onDisk: onDisk! }
  }

  it('抖音任务记在 dyFormat 上并马上落盘', async () => {
    const { task, onDisk } = await plan('douyin', 'normal_1080|mp4')
    expect(task).toMatchObject({ dyFormat: 'normal_1080|mp4', qualityLabel: '1080p', videoQn: 1080 })
    expect(task.ytFormat).toBeUndefined()
    expect(onDisk.dyFormat).toBe('normal_1080|mp4')
  })

  it('YouTube 任务记在 ytFormat 上', async () => {
    const { task } = await plan('youtube', '137,140')
    expect(task.ytFormat).toBe('137,140')
    expect(task.dyFormat).toBeUndefined()
  })

  it('B站任务不记；没有给出时不改', async () => {
    const bili = await plan('ugc', 'x')
    expect(bili.task.dyFormat).toBeUndefined()
    expect(bili.task.ytFormat).toBeUndefined()
    const plain = await plan('douyin', undefined)
    expect(plain.task).not.toHaveProperty('dyFormat')
  })
})

describe('平台账号变化', () => {
  it('登录或切换账号：这个平台等待中的任务换成新账号重新排队，别的不动', () => {
    const m = make()
    const login = waiting(m, 'login', { dyAccount: 'old' })
    const verify = waiting(m, 'verify')
    const yt = waiting(m, 'login', { ytAccount: 'y' }, 'youtube')
    driver.hold.mockReturnValue('cooling')
    const queued = add(m, 'douyin', { dyAccount: 'old' })
    login.error = '要登录'
    m.siteLoginChanged('douyin', 'new')
    for (const t of [login, verify]) {
      expect(t).toMatchObject({ status: 'queued', dyAccount: 'new', error: undefined, waitReason: undefined })
    }
    expect(yt).toMatchObject({ status: 'waitingAuth', ytAccount: 'y', waitReason: 'login' })
    expect(queued.dyAccount).toBe('old')
  })

  it('改选不登录时保留任务原来的账号；排上后立即开始', () => {
    const m = make()
    const task = waiting(m, 'login', { dyAccount: 'old' })
    m.siteLoginChanged('douyin', undefined)
    expect(task).toMatchObject({ status: 'fetching', dyAccount: 'old' })
    m.stopAll()
  })

  it('删除账号：它名下还没下完的任务改为不登录，下完的和别的账号不动', () => {
    driver.hold.mockReturnValue('cooling')
    const m = make()
    const done = add(m, 'douyin', { dyAccount: 'gone' })
    done.status = 'done'
    const pending = add(m, 'douyin', { dyAccount: 'gone' })
    const other = add(m, 'douyin', { dyAccount: 'kept' })
    const yt = add(m, 'youtube', { ytAccount: 'gone' })
    m.siteAccountRemoved('douyin', 'gone')
    expect(pending.dyAccount).toBeUndefined()
    expect(done.dyAccount).toBe('gone')
    expect(other.dyAccount).toBe('kept')
    expect(yt.ytAccount).toBe('gone')
    m.stopAll()
  })

  it('通过验证：只让这个账号因验证而等待的任务接着排队', () => {
    const m = make()
    const mine = waiting(m, 'verify', { dyAccount: 'a' })
    const other = waiting(m, 'verify', { dyAccount: 'b' })
    const anonymous = waiting(m, 'verify')
    const login = waiting(m, 'login', { dyAccount: 'a' })
    const yt = waiting(m, 'verify', { ytAccount: 'a' }, 'youtube')
    driver.hold.mockReturnValue('cooling')
    mine.error = '要验证'
    m.siteVerified('douyin', 'a')
    expect(mine).toMatchObject({ status: 'queued', error: undefined, waitReason: undefined, dyAccount: 'a' })
    expect([other, anonymous, login, yt].map((t) => t.status)).toEqual(['waitingAuth', 'waitingAuth', 'waitingAuth', 'waitingAuth'])
    m.siteVerified('douyin', null)
    expect(anonymous.status).toBe('queued')
    expect(other.status).toBe('waitingAuth')
  })

  it('通过验证后重新调度', () => {
    const m = make()
    const task = waiting(m, 'verify', { dyAccount: 'a' })
    m.siteVerified('douyin', 'a')
    expect(task.status).toBe('fetching')
    m.stopAll()
  })

  it('分账号时重启后，等待中的抖音任务改为暂停（没有可等的 B站账号）', () => {
    const waitingTask = { id: 'w', item: item(), options: normalizeOptions({}), status: 'waitingAuth', waitReason: 'verify', accountMid: 1 }
    writeFileSync(stateFile(), JSON.stringify([waitingTask]))
    const accounts = { run: vi.fn(), status: vi.fn(), partition: vi.fn() }
    expect(new DownloadManager(join(root, 'tmp'), stateFile(), () => settings, accounts as never).list()[0].status).toBe('paused')
  })
})
