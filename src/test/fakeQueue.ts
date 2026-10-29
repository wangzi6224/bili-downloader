// MCP 测试用的下载队列：只模拟 DownloadManager 里 MCP 用到的部分
import { EventEmitter } from 'node:events'
import { vi } from 'vitest'
import { normalizeOptions } from '@shared/options'
import type { EnqueueRequest, MediaItem, TaskInfo } from '@shared/types'
import type { EnqueueResult } from '../main/download/manager'

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
