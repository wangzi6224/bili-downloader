import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeOptions } from '@shared/options'
import type { MediaItem } from '@shared/types'
import { FakeQueue, makeTask, mediaItem } from '../../test/fakeQueue'
import { BatchManager, type Batch, type NewBatch } from './batches'

vi.mock('electron', () => ({}))

let dir = ''
let file = ''
let queue: FakeQueue
let history: string[] = []
let managers: BatchManager[] = []
/** 默认把列表视频展开成一个分P */
const expand = vi.fn(async (items: MediaItem[]): Promise<MediaItem[]> =>
  items.map((i) => (i.lazy ? { ...i, key: `${i.key}:1`, lazy: false, cid: 1 } : i))
)
const make = (chunk = 2): BatchManager => {
  const m = new BatchManager(file, queue, expand, () => history, chunk)
  managers.push(m)
  return m
}
const lazy = (bv: string): MediaItem => mediaItem(`ugc:${bv}`, { lazy: true, bvid: bv, cid: 0 })
const plain = (bv: string): MediaItem => mediaItem(`ugc:${bv}:1`, { bvid: bv })
/** 写盘是节流的，先把所有实例写一遍 */
const saved = (): Batch[] => {
  managers.forEach((m) => m.flush())
  return JSON.parse(readFileSync(file, 'utf8'))
}

const request = (items: MediaItem[], over: Partial<NewBatch> = {}): NewBatch => ({
  fingerprint: 'fp',
  url: 'https://b23.tv/x',
  title: '合集',
  cover: 'c.jpg',
  kind: 'ugc',
  options: normalizeOptions({}, 80),
  dir: '/dl/合集',
  items,
  skipped: { downloaded: 1, unavailable: 2 },
  ...over
})

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

/** 等后台的展开链跑完 */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r))
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'batches-'))
  file = join(dir, 'batches.json')
  queue = new FakeQueue()
  history = []
  managers = []
  expand.mockClear()
})

afterEach(() => {
  // 先写完节流中的数据，免得删掉目录后定时器又把它建出来
  managers.forEach((m) => m.flush())
  vi.useRealTimers()
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

describe('提交', () => {
  it('不用展开的直接加入队列，带上批次 id、目录和整批的命名方式', () => {
    const m = make()
    const b = m.submit(request([plain('BV1'), plain('BV2')], { requestId: 'r1' }))
    expect(b).toMatchObject({ requestId: 'r1', state: 'ready', selected: 2, processed: 2, pending: [], multi: true })
    expect(b.skipped).toEqual({ downloaded: 1, unavailable: 2, queued: 0 })
    expect(expand).not.toHaveBeenCalled()
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ title: '合集', cover: 'c.jpg', batchId: b.id, dir: '/dl/合集', multi: true, items: [plain('BV1'), plain('BV2')] })
    )
    expect(m.tasksOf(b)).toHaveLength(2)
    expect(saved()[0]).toMatchObject({ id: b.id, state: 'ready' })
    expect(m.find(b.id)).toBe(b)
    expect(m.find('nope')).toBeUndefined()
  })

  it('有列表视频时立即返回，后台分段展开、加入队列，失败的记下来', async () => {
    expand.mockImplementation(async (items) =>
      items.map((i) => (i.key === 'ugc:BV3' ? { ...i, unavailable: '视频不见了' } : i.lazy ? { ...i, key: `${i.key}:1`, lazy: false } : i))
    )
    const m = make()
    const changes = vi.fn()
    m.on('change', changes)
    const b = m.submit(request([lazy('BV1'), lazy('BV2'), lazy('BV3'), plain('BV4')]))
    expect(b.state).toBe('expanding')
    expect(queue.enqueue).not.toHaveBeenCalled()
    await settle()
    expect(expand.mock.calls.map((c) => c[0].map((i) => i.key))).toEqual([
      ['ugc:BV1', 'ugc:BV2'],
      ['ugc:BV3', 'ugc:BV4:1']
    ])
    // 每段都按整批（多个条目）命名
    expect(queue.enqueue.mock.calls.map((c) => [c[0].items.map((i) => i.key), c[0].multi])).toEqual([
      [['ugc:BV1:1', 'ugc:BV2:1'], true],
      [['ugc:BV4:1'], true]
    ])
    expect(b).toMatchObject({ state: 'ready', processed: 4, pending: [] })
    expect(b.failed).toEqual([{ item: lazy('BV3'), reason: '视频不见了' }])
    expect(changes.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('展开整段出错时这一段都记为失败', async () => {
    expand.mockRejectedValueOnce(new Error('网络错误')).mockRejectedValueOnce('奇怪')
    const m = make(1)
    const b = m.submit(request([lazy('BV1'), lazy('BV2')]))
    await settle()
    expect(b.failed.map((f) => f.reason)).toEqual(['网络错误', '奇怪'])
    expect(b.state).toBe('ready')
  })

  it('多个批次排队依次展开', async () => {
    const gate = deferred<MediaItem[]>()
    expand.mockImplementationOnce(() => gate.promise)
    const m = make()
    const a = m.submit(request([lazy('BV1')], { fingerprint: 'a' }))
    const b = m.submit(request([lazy('BV2')], { fingerprint: 'b' }))
    await settle()
    expect(expand).toHaveBeenCalledTimes(1)
    expect([a.state, b.state]).toEqual(['expanding', 'expanding'])
    gate.resolve([{ ...lazy('BV1'), key: 'ugc:BV1:1', lazy: false }])
    await settle()
    expect(expand).toHaveBeenCalledTimes(2)
    expect([a.state, b.state]).toEqual(['ready', 'ready'])
  })

  it('处理时意外出错就标记为中断，不影响之后的批次', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    queue.enqueue.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const m = make()
    const a = m.submit(request([lazy('BV1')]))
    const b = m.submit(request([lazy('BV2')]))
    await settle()
    expect(a.state).toBe('interrupted')
    expect(console.error).toHaveBeenCalledWith('MCP 批次处理失败', expect.any(Error))
    expect(b.state).toBe('ready')
  })

  it('超过 50 个时删掉最早的、已经结束的批次；没结束的（展开中、中断、下载中）都保留', async () => {
    const gate = deferred<MediaItem[]>()
    expand.mockImplementationOnce(() => gate.promise)
    const m = make()
    const expanding = m.submit(request([lazy('BV0')], { title: '展开中' }))
    const interrupted = m.submit(request([plain('BV1')], { title: '中断' }))
    interrupted.state = 'interrupted'
    const active = m.submit(request([plain('BV2')], { title: '下载中' }))
    for (let i = 3; i < 50; i++) m.submit(request([plain(`BV${i}`)], { title: `完成${i}` }))
    // 已经下载完的
    for (const t of queue.tasks) if (t.item.key !== 'ugc:BV2:1') t.status = 'done'
    expect(m.list()).toHaveLength(50)
    const last = m.submit(request([plain('BV50')], { title: '最新' }))
    expect(m.list()).toHaveLength(50)
    expect(m.list().slice(0, 4)).toEqual([expanding, interrupted, active, expect.objectContaining({ title: '完成4' })])
    expect(m.list().at(-1)).toBe(last)
    // 全都没结束时超出上限也不删
    for (const t of queue.tasks) t.status = 'queued'
    m.submit(request([plain('BV51')]))
    expect(m.list()).toHaveLength(51)
    gate.resolve([])
    await settle()
  })

  it('写盘节流：一秒内的多次变化只写一次，flush 立即写', () => {
    vi.useFakeTimers()
    const m = make()
    m.submit(request([plain('BV1')]))
    m.submit(request([plain('BV2')]))
    expect(() => readFileSync(file, 'utf8')).toThrow()
    vi.advanceTimersByTime(1000)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(2)
    m.submit(request([plain('BV3')]))
    m.flush()
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(3)
  })

  it('只选了一个视频、展开后有多个分P时按多个条目命名', async () => {
    expand.mockImplementationOnce(async (items) => [1, 2].map((p) => ({ ...items[0], key: `ugc:BV1:${p}`, lazy: false })))
    const m = make()
    const b = m.submit(request([lazy('BV1')]))
    expect(b.multi).toBe(false)
    await settle()
    expect(b.multi).toBe(true)
    expect(queue.enqueue.mock.calls[0][0].multi).toBe(true)
  })

  it('展开后按每一P核对下载历史：只下过的那一P跳过，其余照样下载', async () => {
    history = ['ugc:BV1:1']
    expand.mockImplementationOnce(async (items) => [1, 2, 3].map((p) => ({ ...items[0], key: `ugc:BV1:${p}`, lazy: false })))
    const m = make()
    const b = m.submit(request([lazy('BV1')], { skipDownloaded: true }))
    await settle()
    expect(m.tasksOf(b).map((t) => t.item.key)).toEqual(['ugc:BV1:2', 'ugc:BV1:3'])
    // 提交时已经跳过的 1 个，加上展开后跳过的 1P
    expect(b.skipped.downloaded).toBe(2)

    // 都下载过时没有任务，提示已经下载过
    history = ['ugc:BV2:1']
    const c = m.submit(request([lazy('BV2')], { skipDownloaded: true, skipped: { downloaded: 0, unavailable: 0 } }))
    await settle()
    expect(m.tasksOf(c)).toEqual([])
    expect(m.report(c, new Set())).toMatchObject({ state: 'done', hint: '选中的条目都已经下载过' })
  })

  it('风控或登录失效时停下，这一段留着，继续后接着处理', async () => {
    const { BiliError } = await import('../bili/http')
    expand.mockImplementationOnce(async (items) => items.map((i) => ({ ...i, key: `${i.key}:1`, lazy: false })))
    expand.mockRejectedValueOnce(new BiliError('请求过于频繁', -799))
    const m = make()
    const b = m.submit(request([lazy('BV1'), lazy('BV2'), lazy('BV3'), lazy('BV4')]))
    await settle()
    expect(b).toMatchObject({ state: 'interrupted', error: '请求过于频繁', processed: 2 })
    expect(b.pending.map((i) => i.key)).toEqual(['ugc:BV3', 'ugc:BV4'])
    expect(expand).toHaveBeenCalledTimes(2)
    expect(m.report(b, new Set()).hint).toMatch(/获取视频分P时出错（请求过于频繁）.*还有 2 个条目/)
    expect(m.resume(b)).toBe(true)
    expect(b.error).toBeUndefined()
    await settle()
    expect(b).toMatchObject({ state: 'ready', processed: 4, pending: [] })
  })
})

describe('重启、重复提交、继续、重试、取消', () => {
  it('重启时还在展开的批次标记为中断，残缺的记录丢掉；继续后接着处理', async () => {
    const pending = [lazy('BV9')]
    writeFileSync(
      file,
      JSON.stringify([null, { id: 'x' }, { ...request([]), id: 'b1', state: 'expanding', pending, failed: [], skipped: {}, processed: 3, selected: 4 }])
    )
    const m = make()
    const [b] = m.list()
    expect(m.list()).toHaveLength(1)
    expect(b.state).toBe('interrupted')
    expect(m.resume(b)).toBe(true)
    await settle()
    expect(b).toMatchObject({ state: 'ready', processed: 4, pending: [] })
    expect(m.resume(b)).toBe(false)
  })

  it('按 request_id 或指纹识别重复提交；指纹只认还没结束的批次', () => {
    const m = make()
    const a = m.submit(request([plain('BV1')], { requestId: 'r1', fingerprint: 'fa' }))
    expect(m.findDuplicate('r1', 'other')).toBe(a)
    expect(m.findDuplicate('r2', 'fa')).toBeUndefined()
    expect(m.findDuplicate(undefined, 'fa')).toBe(a)
    queue.tasks[0].status = 'paused'
    expect(m.findDuplicate(undefined, 'fa')).toBe(a)
    // 全部下完了（或者任务都被移出列表）就不算重复，再提交可以下到新增的内容
    queue.tasks[0].status = 'done'
    expect(m.findDuplicate(undefined, 'fa')).toBeUndefined()
    expect(m.findDuplicate('r1', 'fa')).toBe(a)
    queue.remove(queue.list().map((t) => t.id), false)
    expect(m.findDuplicate(undefined, 'fa')).toBeUndefined()
    a.state = 'interrupted'
    expect(m.findDuplicate(undefined, 'fa')).toBe(a)
  })

  it('重试展开失败的条目；没有失败的返回 0；正在展开时不重复排队', async () => {
    expand.mockImplementationOnce(async (items) => items.map((i) => ({ ...i, unavailable: '风控' })))
    const m = make()
    const b = m.submit(request([lazy('BV1'), lazy('BV2')]))
    await settle()
    expect(b.failed).toHaveLength(2)
    expect(b.processed).toBe(2)
    expect(m.retryFailed(b)).toBe(2)
    expect(b).toMatchObject({ state: 'expanding', processed: 0, failed: [] })
    await settle()
    expect(b).toMatchObject({ state: 'ready', processed: 2 })
    expect(m.tasksOf(b).map((t) => t.item.key)).toEqual(['ugc:BV1:1', 'ugc:BV2:1'])
    expect(m.retryFailed(b)).toBe(0)

    // 展开过程中又有失败的要重试：接到 pending 后面，由正在跑的循环处理
    const gate = deferred<MediaItem[]>()
    expand.mockImplementationOnce(() => gate.promise)
    const c = m.submit(request([lazy('BV5')]))
    await settle()
    c.failed.push({ item: lazy('BV6'), reason: 'x' })
    c.processed = 1
    expect(m.retryFailed(c)).toBe(1)
    gate.resolve([{ ...lazy('BV5'), key: 'ugc:BV5:1', lazy: false }])
    await settle()
    expect(expand).toHaveBeenCalledTimes(4)
    expect(c).toMatchObject({ state: 'ready', processed: 2, pending: [] })
  })

  it('取消后正在展开的那一段也不再加入；中断的批次取消后算处理完', async () => {
    const gate = deferred<MediaItem[]>()
    expand.mockImplementationOnce(() => gate.promise)
    const m = make()
    const b = m.submit(request([lazy('BV1'), lazy('BV2'), lazy('BV3')]))
    await settle()
    expect(m.cancelPending(b)).toBe(3)
    gate.resolve([{ ...lazy('BV1'), key: 'ugc:BV1:1', lazy: false }])
    await settle()
    expect(queue.enqueue).not.toHaveBeenCalled()
    expect(b).toMatchObject({ state: 'ready', pending: [] })

    b.state = 'interrupted'
    b.pending = [lazy('BV4')]
    expect(m.cancelPending(b)).toBe(1)
    expect(b.state).toBe('ready')
  })

  it('按批次暂停后，之后加入的任务直接是暂停状态；继续后不再暂停', async () => {
    const m = make(1)
    const b = m.submit(request([lazy('BV0'), lazy('BV1')]))
    m.setPaused(b, true)
    await settle()
    expect(queue.enqueue.mock.calls.map((c) => c[0].paused)).toEqual([true, true])
    expect(m.tasksOf(b).map((t) => t.status)).toEqual(['paused', 'paused'])
    expect(queue.pauseMany).not.toHaveBeenCalled()
    expect(saved()[0].paused).toBe(true)
    m.setPaused(b, false)
    expect(b.paused).toBeUndefined()
  })

  it('已在别处排队的同一条目算跳过，但算进这个批次的进度；自己的不算跳过', async () => {
    queue.add(makeTask('old', { item: plain('BV1'), status: 'downloading' }))
    const m = make()
    const b = m.submit(request([plain('BV1'), plain('BV2')]))
    expect(b.skipped.queued).toBe(1)
    expect(b.linked).toEqual(['old'])
    expect(m.tasksOf(b).map((t) => t.id)).toEqual(['old', 't1'])
    expect(m.state(b)).toBe('downloading')
    // 同一批次再加一次（例如重启后接着处理）
    b.pending = [plain('BV2')]
    b.state = 'interrupted'
    m.resume(b)
    await settle()
    expect(b.skipped.queued).toBe(1)
    expect(b.linked).toEqual(['old'])
  })

  it('全部条目都已在别处下载时，批次跟着那些任务走，不会马上算完成', () => {
    queue.add(makeTask('a', { item: plain('BV1'), status: 'downloading' }), makeTask('b', { item: plain('BV2') }))
    const m = make()
    const b = m.submit(request([plain('BV1'), plain('BV2')]))
    expect(m.state(b)).toBe('downloading')
    expect(m.report(b, new Set()).counts.total).toBe(2)
  })
})

describe('状态和报告', () => {
  const setup = (statuses: Parameters<typeof makeTask>[1][], extra: Partial<Batch> = {}) => {
    const m = make()
    const b = m.submit(request([]))
    Object.assign(b, extra)
    queue.add(...statuses.map((s, i) => makeTask(`x${i}`, { batchId: b.id, ...s })))
    return { m, b }
  }

  it('按任务状态推出批次状态', () => {
    const state = (statuses: Parameters<typeof makeTask>[1][], extra: Partial<Batch> = {}) => {
      queue.tasks = []
      const { m, b } = setup(statuses, extra)
      return m.state(b)
    }
    expect(state([], { state: 'expanding' })).toBe('expanding')
    expect(state([], { state: 'interrupted' })).toBe('interrupted')
    expect(state([{ status: 'waitingAuth' }, { status: 'downloading' }])).toBe('waiting_auth')
    expect(state([{ status: 'merging' }, { status: 'paused' }])).toBe('downloading')
    expect(state([{ status: 'error', retryAt: 1 }, { status: 'paused' }])).toBe('queued')
    expect(state([{ status: 'queued' }])).toBe('queued')
    expect(state([{ status: 'paused' }, { status: 'error' }])).toBe('paused')
    expect(state([{ status: 'done' }, { status: 'unsupported' }])).toBe('done_with_errors')
    expect(state([{ status: 'done' }], { failed: [{ item: lazy('BV1'), reason: 'x' }] })).toBe('done_with_errors')
    expect(state([{ status: 'done' }])).toBe('done')
    expect(state([])).toBe('done')
  })

  it('报告进度、速度、剩余时间、清晰度和失败明细', () => {
    const { m, b } = setup(
      [
        { status: 'done', total: 100, downloaded: 100, qualityLabel: '1080P 高清 · AVC', videoQn: 80, outputPath: '/dl/a.mp4' },
        { status: 'done', total: 300, downloaded: 300, qualityLabel: '720P 准高清 · AVC', videoQn: 64, outputPath: '/dl/b.mp4' },
        { status: 'downloading', total: 1000, downloaded: 400, speed: 100, qualityLabel: '1080P 高清 · AVC', videoQn: 80 },
        { status: 'queued' },
        { status: 'error', error: '网络错误' },
        { status: 'error', error: '超时', retryAt: 1 },
        { status: 'unsupported', error: '需要大会员' }
      ],
      { failed: [{ item: lazy('BV9'), reason: '风控' }], pending: [lazy('BV8')], selected: 9, processed: 8 }
    )
    const r = m.report(b, new Set(['failed', 'files', 'running']))
    expect(r).toMatchObject({
      batch_id: b.id,
      state: 'downloading',
      expand: { done: 8, total: 9, failed: 1 },
      counts: { total: 7, done: 2, running: 1, queued: 1, failed: 1, retrying: 1, unsupported: 1 },
      // 剩余：正在下的 600 + 平均 200 ×（排队 1 + 等待重试 1 + 未加入 1）= 1200，速度 100
      progress: { bytes_done: 800, speed_bps: 100, eta_seconds: 12 },
      dir: '/dl/合集',
      quality: { requested_qn: 80, actual: { '1080P 高清 · AVC': 2, '720P 准高清 · AVC': 1 }, below_requested: 1 },
      files: ['/dl/a.mp4', '/dl/b.mp4']
    })
    expect(r.hint).toContain('1 个任务出错后在等待自动重试')
    expect(r.failed).toEqual([
      { item_id: 'ugc:BV9', title: 'ugc:BV9', status: 'not_added', reason: '风控', retryable: true },
      { task_id: 'x4', item_id: 'ugc:x4:1', title: 'x4', status: 'failed', reason: '网络错误', retryable: true },
      { task_id: 'x5', item_id: 'ugc:x5:1', title: 'x5', status: 'retrying', reason: '超时', retryable: true },
      { task_id: 'x6', item_id: 'ugc:x6:1', title: 'x6', status: 'unsupported', reason: '需要大会员', retryable: false }
    ])
    expect(r.running).toEqual([expect.objectContaining({ id: 'x2', status: 'running', stage: 'downloading', progress: 40 })])
  })

  it('没有参考数据或没有速度时不估算剩余时间；127 不统计降档；不要的明细不返回', () => {
    const { m, b } = setup([{ status: 'downloading', total: 1000, downloaded: 400, speed: 100 }, { status: 'queued' }], {
      options: normalizeOptions({}, 127)
    })
    let r = m.report(b, new Set())
    expect(r.progress.eta_seconds).toBeNull()
    expect(r.quality.below_requested).toBeUndefined()
    expect([r.failed, r.files, r.running]).toEqual([undefined, undefined, undefined])
    queue.tasks.pop()
    r = m.report(b, new Set(['failed']))
    expect(r.progress.eta_seconds).toBe(6)
    expect(r.failed).toBeUndefined()
    queue.tasks[0].status = 'paused'
    expect(m.report(b, new Set()).progress.eta_seconds).toBeNull()
  })

  it('失败明细最多 50 条，多出来的给出数量', () => {
    const { m, b } = setup(Array.from({ length: 53 }, () => ({ status: 'error' as const })))
    const r = m.report(b, new Set(['failed']))
    expect(r.failed).toHaveLength(50)
    expect(r.failed_more).toBe(3)
  })

  it('各种状态下的提示', () => {
    const hint = (statuses: Parameters<typeof makeTask>[1][], extra: Partial<Batch> = {}) => {
      queue.tasks = []
      const { m, b } = setup(statuses, extra)
      return m.report(b, new Set()).hint
    }
    expect(hint([], { state: 'expanding', processed: 3, selected: 9 })).toContain('（3/9）')
    expect(hint([], { state: 'interrupted', pending: [lazy('BV1')] })).toMatch(/还有 1 个条目没加入队列.*action=resume/)
    expect(hint([{ status: 'waitingAuth' }])).toContain('重新登录')
    expect(hint([{ status: 'downloading' }])).toBe('下载中，可以带 wait_seconds 等待')
    expect(hint([{ status: 'paused' }, { status: 'paused' }])).toMatch(/^2 个任务已暂停/)
    expect(hint([{ status: 'error' }, { status: 'unsupported' }])).toMatch(/action=retry.*；无法下载/)
    expect(hint([{ status: 'unsupported' }])).toMatch(/^无法下载/)
    expect(hint([{ status: 'done' }], { failed: [{ item: lazy('BV1'), reason: 'x' }] })).toContain('action=retry')
    expect(hint([{ status: 'done' }])).toBeUndefined()
  })

  it('简要信息', () => {
    const { m, b } = setup([{ status: 'done' }, { status: 'error' }, { status: 'unsupported' }], {
      requestId: 'r',
      failed: [{ item: lazy('BV1'), reason: 'x' }]
    })
    expect(m.brief(b)).toEqual({
      batch_id: b.id,
      title: '合集',
      url: 'https://b23.tv/x',
      request_id: 'r',
      created_at: new Date(b.createdAt).toISOString(),
      state: 'done_with_errors',
      tasks: 3,
      done: 1,
      failed: 3
    })
  })
})

describe('等待', () => {
  it('不等或已经停下时立即返回', async () => {
    const m = make()
    const b = m.submit(request([plain('BV1')]))
    const on = vi.spyOn(queue, 'on')
    await m.wait(b, 0)
    queue.tasks[0].status = 'paused'
    await m.wait(b, 10_000)
    expect(on).not.toHaveBeenCalled()
  })

  it('任务变化后停下就返回，并移除监听', async () => {
    const m = make()
    const b = m.submit(request([plain('BV1')]))
    const p = m.wait(b, 60_000)
    queue.patch('t1', { status: 'downloading' })
    queue.patch('t1', { status: 'done' })
    await p
    expect(queue.listenerCount('update')).toBe(0)
    expect(m.listenerCount('change')).toBe(0)
  })

  it('批次自己的变化（展开结束）也会触发检查', async () => {
    const gate = deferred<MediaItem[]>()
    expand.mockImplementationOnce(() => gate.promise)
    const m = make()
    const b = m.submit(request([lazy('BV1')]))
    const p = m.wait(b, 60_000)
    gate.resolve([{ ...lazy('BV1'), unavailable: '已失效' }])
    await p
    expect(m.state(b)).toBe('done_with_errors')
  })

  it('超时返回', async () => {
    vi.useFakeTimers()
    const m = make()
    const b = m.submit(request([plain('BV1')]))
    const done = vi.fn()
    void m.wait(b, 5000).then(done)
    await vi.advanceTimersByTimeAsync(4999)
    expect(done).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toHaveBeenCalled()
    expect(queue.listenerCount('update')).toBe(0)
  })
})
