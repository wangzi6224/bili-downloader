// MCP 测试用的下载队列：只模拟 DownloadManager 里 MCP 用到的部分
import { EventEmitter } from 'node:events'
import { vi } from 'vitest'
import { normalizeOptions } from '@shared/options'
import type { EnqueueRequest, MediaItem, TaskInfo, WatermarkMethod, WatermarkRegion } from '@shared/types'
import type { EnqueueResult } from '../main/download/manager'
import type { WatermarkDeps } from '../main/mcp/watermark'

export const mediaItem = (key: string, over: Partial<MediaItem> = {}): MediaItem => ({
  key,
  kind: 'ugc',
  title: key,
  index: 1,
  cid: 1,
  ...over
})

export const makeTask = (id: string, over: Partial<TaskInfo> = {}): TaskInfo => ({
  id,
  title: id,
  groupTitle: 'g',
  item: mediaItem(`ugc:${id}:1`),
  options: normalizeOptions({}, 80),
  relBase: id,
  status: 'queued',
  downloaded: 0,
  total: 0,
  speed: 0,
  createdAt: 0,
  ...over
})

export class FakeQueue extends EventEmitter {
  tasks: TaskInfo[] = []
  private n = 0

  list = (): TaskInfo[] => this.tasks

  /** 和 DownloadManager 一样：同 key 未完成的任务不重复添加 */
  enqueue = vi.fn((req: EnqueueRequest): EnqueueResult => {
    const result: EnqueueResult = { created: [], skipped: [] }
    for (const item of req.items) {
      const dup = this.tasks.find((t) => t.item.key === item.key && t.status !== 'done')
      if (dup) {
        result.skipped.push({ key: item.key, taskId: dup.id })
        continue
      }
      const t = makeTask(`t${++this.n}`, {
        title: item.title,
        groupTitle: req.title,
        item,
        options: req.options,
        batchId: req.batchId,
        dir: req.dir,
        status: req.paused ? 'paused' : 'queued'
      })
      this.tasks.push(t)
      result.created.push(t)
    }
    return result
  })

  pauseMany = vi.fn((ids: string[]): void => this.patchAll(ids, { status: 'paused' }))
  resume = vi.fn((id: string): void => this.patchAll([id], { status: 'queued', error: undefined }))
  resumeMany = vi.fn((ids: string[]): void => this.patchAll(ids, { status: 'queued', error: undefined, retryAt: undefined }))
  redownload = vi.fn((_id: string): void => {})
  remove = vi.fn((ids: string[], _deleteFiles: boolean): void => {
    this.tasks = this.tasks.filter((t) => !ids.includes(t.id))
  })
  /** 和 DownloadManager 一样：开始后任务仍是 done，带上手动去水印的进度 */
  startWatermark = vi.fn((id: string, _region: WatermarkRegion, _method: WatermarkMethod): void =>
    this.patchAll([id], { processing: { manual: true, stage: 'queue' } })
  )
  cancelWatermark = vi.fn((id: string): void => this.patchAll([id], { processing: undefined }))

  add(...tasks: TaskInfo[]): void {
    this.tasks.push(...tasks)
  }

  /** 改任务状态并像 DownloadManager 一样发出 update */
  patch(id: string, fields: Partial<TaskInfo>): void {
    this.patchAll([id], fields)
    this.emit('update', this.tasks)
  }

  private patchAll(ids: string[], fields: Partial<TaskInfo>): void {
    for (const t of this.tasks) if (ids.includes(t.id)) Object.assign(t, fields)
  }
}

export const WM_REGION = { x: 1668, y: 18, w: 234, h: 72 }

/**
 * MCP 去水印的依赖：快速去除按时长的 0.1～0.2 倍加 5 秒、AI 精修按 2～3 倍加 15 秒估算；
 * 模型没下载；识别都能认出右上角的水印
 */
export const fakeWatermark = () => ({
  estimate: vi.fn<WatermarkDeps['estimate']>((method, w) => {
    const [a, b, prep] = method === 'ai' ? [2, 3, 15] : [0.1, 0.2, 5]
    return { seconds: [Math.round(prep + w.duration * a), Math.round(prep + w.duration * b)], basis: 'default' }
  }),
  speed: vi.fn<WatermarkDeps['speed']>(() => ({
    fast: { ratio: [0.05, 0.4], basis: 'default' },
    ai: { ratio: [2, 3], basis: 'measured', backend: 'GPU' }
  })),
  model: vi.fn<WatermarkDeps['model']>(() => ({ state: 'missing', size: 208_044_816 })),
  inspect: vi.fn<WatermarkDeps['inspect']>(async (t) => ({
    width: 1920,
    height: 1080,
    duration: t.item.duration ?? 60,
    found: true,
    known: false,
    region: WM_REGION
  }))
})
