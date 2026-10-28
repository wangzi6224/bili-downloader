import { describe, expect, it } from 'vitest'
import type { TaskInfo, TaskStatus } from '@shared/types'
import { buildEntries, type Entry } from './taskOrder'

const task = (id: string, status: TaskStatus, groupTitle = id, extra: Partial<TaskInfo> = {}): TaskInfo =>
  ({
    id,
    title: id,
    groupTitle,
    item: { key: id, kind: 'ugc', title: id, index: 1, cid: 1 },
    status,
    downloaded: 0,
    total: 0,
    speed: 0,
    createdAt: 0,
    ...extra
  }) as TaskInfo

/** 每一项写成 id，组写成 [组标题, ...子任务 id] */
const shape = (entries: Entry[]): (string | string[])[] =>
  entries.map((e) => (e.type === 'task' ? e.t.id : [e.tasks[0].groupTitle, ...e.visible.map((t) => t.id)]))

describe('buildEntries', () => {
  it('进行中的排最上面，排队的按队列顺序，已完成的新的在前', () => {
    const tasks = [
      task('old-done', 'done'),
      task('q1', 'queued'),
      task('dl', 'downloading'),
      task('q2', 'queued'),
      task('paused', 'paused'),
      task('err', 'error'),
      task('retry', 'error', 'retry', { retryAt: 1 }),
      task('new-done', 'done')
    ]
    expect(shape(buildEntries(tasks, tasks))).toEqual(['dl', 'q1', 'q2', 'retry', 'paused', 'err', 'new-done', 'old-done'])
  })

  it('合集折叠成组，按组里最靠前的任务定位置，组内进行中的在前、其余按集数', () => {
    const tasks = [
      task('single-done', 'done'),
      task('ep1', 'done', '合集'),
      task('ep2', 'downloading', '合集'),
      task('ep3', 'queued', '合集'),
      task('ep4', 'paused', '合集'),
      task('single-q', 'queued')
    ]
    expect(shape(buildEntries(tasks, tasks))).toEqual([['合集', 'ep2', 'ep3', 'ep4', 'ep1'], 'single-q', 'single-done'])
  })

  it('只有一个任务的合集不成组；组头统计整组，子任务只列通过筛选的', () => {
    const tasks = [task('a', 'done', '合集'), task('b', 'error', '合集'), task('c', 'queued', '只有一个')]
    const entries = buildEntries(tasks, [tasks[1], tasks[2]])
    expect(shape(entries)).toEqual(['c', ['合集', 'b']])
    expect(entries[1].type === 'group' && entries[1].tasks.length).toBe(2)
  })
})
