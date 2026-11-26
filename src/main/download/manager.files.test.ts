// 多文件作品落盘，以及驱动让任务等待（验证、登录、冷却）时队列的行为
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TEMPLATES } from '@shared/naming'
import { normalizeOptions } from '@shared/options'
import type { EnqueueRequest, MediaItem, Settings, TaskInfo, WaitReason } from '@shared/types'
import type { DriverContext, PlatformDriver } from './drivers'

vi.mock('electron', () => ({}))
vi.mock('./mux', () => ({ mux: vi.fn() }))
const driver = vi.hoisted(() => ({
  acquire: vi.fn<PlatformDriver['acquire']>(),
  extras: vi.fn(),
  sourceUrl: vi.fn(),
  hold: vi.fn<NonNullable<PlatformDriver['hold']>>()
}))
vi.mock('./drivers', () => ({ driverFor: () => driver }))

const { mux } = await import('./mux')
const { CooldownError, NeedsUserError } = await import('./errors')
const { DownloadManager } = await import('./manager')

let root = ''
let dl = ''
let settings: Settings
type Manager = InstanceType<typeof DownloadManager>
const make = (): Manager => new DownloadManager(join(root, 'tmp'), join(root, 'state.json'), () => settings)

const item = (n: number): MediaItem => ({ key: `ugc:BV${n}:1`, kind: 'ugc', title: `图文${n}`, index: n, cid: n, images: 2 })
const req = (items: MediaItem[], over: Partial<EnqueueRequest> = {}): EnqueueRequest => ({
  title: items[0].title,
  cover: '',
  kind: 'ugc',
  items,
  options: normalizeOptions({}),
  ...over
})

/** 在任务临时目录里写出两张图，返回多文件结果 */
const images = async (_t: TaskInfo, ctx: DriverContext) => {
  mkdirSync(ctx.tmp, { recursive: true })
  const files = ['01.jpg', '02.jpg'].map((name, i) => {
    const path = join(ctx.tmp, name)
    writeFileSync(path, Buffer.alloc(10 * (i + 1)))
    return { path, name }
  })
  ctx.onPlanned({ qualityLabel: '2 张图' })
  return { files, qualityLabel: '2 张图', quality: '', codec: '', notes: ['备注一', '备注二'] }
}

const finished = (m: Manager, id: string): Promise<void> =>
  vi.waitFor(() => {
    expect(m.list().find((t) => t.id === id)!.status).not.toMatch(/queued|fetching|downloading|merging/)
  })

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'manager-files-'))
  dl = join(root, 'dl')
  settings = { concurrency: 1, autoRetry: 3, downloadDir: dl, naming: { ...DEFAULT_TEMPLATES } } as Settings
  driver.acquire.mockReset().mockImplementation(images)
  driver.extras.mockReset()
  driver.hold.mockReset()
  vi.mocked(mux).mockReset()
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('多文件作品', () => {
  it('整个放进按命名模板起名的目录；不合并、不取附加内容', async () => {
    const m = make()
    const done: TaskInfo[] = []
    m.on('done', (t) => done.push(t))
    const [task] = m.enqueue(req([item(1)])).created
    await finished(m, task.id)
    const dir = join(dl, '图文1')
    expect(task).toMatchObject({
      status: 'done',
      outputPath: join(dir, '01.jpg'),
      extraPaths: [join(dir, '02.jpg')],
      downloaded: 30,
      total: 30,
      note: '备注一；备注二',
      tmpOutput: undefined
    })
    expect(readdirSync(dir)).toEqual(['01.jpg', '02.jpg'])
    expect(readdirSync(dl)).toEqual(['图文1'])
    expect(existsSync(join(root, 'tmp', task.id))).toBe(false)
    expect(done).toHaveLength(1)
    expect(driver.extras).not.toHaveBeenCalled()
    expect(mux).not.toHaveBeenCalled()
  })

  it('同名目录已经存在时另起一个；没有备注时不写', async () => {
    mkdirSync(join(dl, '图文1'), { recursive: true })
    driver.acquire.mockImplementation(async (t, ctx) => ({ ...(await images(t, ctx)), notes: [] }))
    const m = make()
    const [task] = m.enqueue(req([item(1)])).created
    await finished(m, task.id)
    expect(task.outputPath).toBe(join(dl, '图文1 (1)', '01.jpg'))
    expect(task.note).toBeUndefined()
  })

  it('保存时出错：任务失败，暂存目录删干净', async () => {
    driver.acquire.mockImplementation(async (t, ctx) => {
      const plan = await images(t, ctx)
      return { ...plan, files: [...plan.files, { path: join(ctx.tmp, 'missing.jpg'), name: '03.jpg' }] }
    })
    const m = make()
    const [task] = m.enqueue(req([item(1)])).created
    await finished(m, task.id)
    expect(task.status).toBe('error')
    expect(readdirSync(dl)).toEqual([])
    expect(task.tmpOutput).toBeUndefined()
  })

  it('上次中断留下的暂存目录先删掉', async () => {
    const stale = join(dl, 'stale.tmp')
    mkdirSync(stale, { recursive: true })
    writeFileSync(join(stale, 'a'), 'x')
    const m = make()
    driver.hold.mockReturnValueOnce('cooling')
    const [task] = m.enqueue(req([item(1)])).created
    task.tmpOutput = stale
    m.schedule()
    await finished(m, task.id)
    expect(existsSync(stale)).toBe(false)
    expect(task.status).toBe('done')
  })

  it('保存期间被删除：成品一起删掉，不记完成', async () => {
    const m = make()
    const done: TaskInfo[] = []
    m.on('done', (t) => done.push(t))
    let id = ''
    // 第一次进入 merging 状态时删除任务
    m.on('update', () => undefined)
    driver.acquire.mockImplementation(async (t, ctx) => {
      const plan = await images(t, ctx)
      id = t.id
      queueMicrotask(() => queueMicrotask(() => m.remove([id], false)))
      return plan
    })
    const [task] = m.enqueue(req([item(1)])).created
    await vi.waitFor(() => expect(m.list()).toHaveLength(0))
    await vi.waitFor(() => expect(existsSync(join(root, 'tmp', task.id))).toBe(false))
    expect(done).toHaveLength(0)
    expect(existsSync(dl) ? readdirSync(dl) : []).toEqual([])
  })

  it('删除任务连文件：只删记录下来的文件，用户自己放的保留', async () => {
    const m = make()
    const [task] = m.enqueue(req([item(1)])).created
    await finished(m, task.id)
    const mine = join(dl, '图文1', '我的笔记.jpg')
    writeFileSync(mine, 'x')
    m.remove([task.id], true)
    expect(readdirSync(join(dl, '图文1'))).toEqual(['我的笔记.jpg'])
  })

  it('删除任务连文件：目录删空后一起删掉', async () => {
    const m = make()
    const [task] = m.enqueue(req([item(1)])).created
    await finished(m, task.id)
    m.remove([task.id], true)
    expect(readdirSync(dl)).toEqual([])
  })

  it('重新下载时清掉记录的成品路径', async () => {
    const m = make()
    const [task] = m.enqueue(req([item(1)])).created
    await finished(m, task.id)
    driver.hold.mockReturnValue('cooling')
    m.redownload(task.id)
    expect(task).toMatchObject({ status: 'queued', outputPath: undefined, extraPaths: undefined })
  })
})

describe('等待用户和冷却', () => {
  const held = (reason: WaitReason | 'cooling') => {
    driver.hold.mockReturnValue(reason)
    const m = make()
    const [task] = m.enqueue(req([item(1)])).created
    return { m, task }
  }

  it('要验证或登录：转为等待，记下原因，不开始下载', () => {
    expect(held('verify').task).toMatchObject({ status: 'waitingAuth', waitReason: 'verify' })
    expect(held('login').task).toMatchObject({ status: 'waitingAuth', waitReason: 'login' })
    expect(driver.acquire).not.toHaveBeenCalled()
  })

  it('冷却中：留在队列里，冷却结束重新调度后开始，等待原因清掉', async () => {
    const { m, task } = held('cooling')
    expect(task.status).toBe('queued')
    expect(driver.acquire).not.toHaveBeenCalled()
    task.waitReason = 'verify'
    driver.hold.mockReturnValue(undefined)
    m.schedule()
    await finished(m, task.id)
    expect(task).toMatchObject({ status: 'done', waitReason: undefined })
  })

  it('下载中要求验证：只让这个任务等待', async () => {
    driver.acquire.mockRejectedValue(new NeedsUserError('请完成验证', 'verify'))
    const m = make()
    const [task] = m.enqueue(req([item(1)])).created
    await finished(m, task.id)
    expect(task).toMatchObject({ status: 'waitingAuth', waitReason: 'verify', error: '请完成验证' })
  })

  it('缺省原因是登录', () => {
    expect(new NeedsUserError('x').reason).toBe('login')
  })

  it('平台限流：按它给的时间自动重试', async () => {
    const until = Date.now() + 3_600_000
    driver.acquire.mockRejectedValue(new CooldownError('限流', until))
    const m = make()
    const [task] = m.enqueue(req([item(1)])).created
    await finished(m, task.id)
    expect(task).toMatchObject({ status: 'error', error: '限流', retryAt: until })
    m.pause(task.id)
  })
})
