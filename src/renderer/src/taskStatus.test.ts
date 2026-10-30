import { describe, expect, it } from 'vitest'
import type { TaskInfo, TaskStatus } from '@shared/types'
import {
  clearCounts,
  failed,
  filterTasks,
  groupStatus,
  groupSummary,
  pausable,
  resumable,
  settled,
  shortenHome,
  statusCounts,
  TABS,
  taskDetail,
  taskPct,
  unfinishedCount,
  type Tab
} from './taskStatus'

const task = (id: string, status: TaskStatus, extra: Partial<TaskInfo> = {}): TaskInfo =>
  ({
    id,
    title: id,
    groupTitle: id,
    relBase: id,
    item: { key: id, kind: 'ugc', title: id, index: 1, cid: 1 },
    status,
    downloaded: 0,
    total: 0,
    speed: 0,
    createdAt: 0,
    ...extra
  }) as TaskInfo

const ALL: TaskStatus[] = ['queued', 'fetching', 'downloading', 'merging', 'extras', 'done', 'paused', 'waitingAuth', 'error', 'unsupported']
/** 哪些状态满足条件 */
const which = (fn: (t: TaskInfo) => boolean, extra: Partial<TaskInfo> = {}): TaskStatus[] => ALL.filter((s) => fn(task(s, s, extra)))

const MB = 1024 * 1024

describe('任务状态判断', () => {
  it('pausable：运行中、排队、等待登录，以及等待自动重试的', () => {
    expect(which(pausable)).toEqual(['queued', 'fetching', 'downloading', 'merging', 'extras', 'waitingAuth'])
    expect(pausable(task('r', 'error', { retryAt: 1 }))).toBe(true)
  })

  it('resumable：暂停和失败的', () => {
    expect(which(resumable)).toEqual(['paused', 'error'])
  })

  it('settled：已完成和无法下载的', () => {
    expect(which(settled)).toEqual(['done', 'unsupported'])
  })

  it('failed：失败且不再自动重试的，以及无法下载的', () => {
    expect(which(failed)).toEqual(['error', 'unsupported'])
    expect(failed(task('r', 'error', { retryAt: 1 }))).toBe(false)
  })
})

describe('TABS', () => {
  const match = (tab: Tab): ((t: TaskInfo) => boolean) => TABS.find((x) => x.value === tab)!.match

  it('四个标签页依次是全部、进行中、已完成、失败', () => {
    expect(TABS.map((x) => x.label)).toEqual(['全部', '进行中', '已完成', '失败'])
  })

  it('全部：所有状态', () => {
    expect(which(match('all'))).toEqual(ALL)
  })

  it('进行中：运行中、排队、暂停、等待登录，以及等待重试的', () => {
    expect(which(match('active'))).toEqual(['queued', 'fetching', 'downloading', 'merging', 'extras', 'paused', 'waitingAuth'])
    expect(match('active')(task('r', 'error', { retryAt: 1 }))).toBe(true)
  })

  it('已完成：只有 done', () => {
    expect(which(match('done'))).toEqual(['done'])
  })

  it('失败：等待重试的不算', () => {
    expect(which(match('failed'))).toEqual(['error', 'unsupported'])
    expect(which(match('failed'), { retryAt: 1 })).toEqual(['unsupported'])
  })
})

describe('filterTasks', () => {
  const tasks = [
    task('a', 'done', { title: '第一集', groupTitle: 'Python 合集', relBase: 'Python 合集/01 第一集' }),
    task('b', 'queued', { title: '第二集', groupTitle: '其它', relBase: 'Downloads/Second' }),
    task('c', 'error', { title: '单个视频', item: { key: 'c', kind: 'ugc', title: 'c', index: 1, cid: 1, bvid: 'BV1xx411c7mD' } })
  ]
  const ids = (list: TaskInfo[]): string[] => list.map((t) => t.id)

  it('没有搜索词时只按标签页筛选', () => {
    expect(ids(filterTasks(tasks, 'all', ''))).toEqual(['a', 'b', 'c'])
    expect(ids(filterTasks(tasks, 'done', '  '))).toEqual(['a'])
    expect(ids(filterTasks(tasks, 'failed', ''))).toEqual(['c'])
  })

  it('搜索标题、合集名、文件路径和 BV 号，不区分大小写并去掉首尾空格', () => {
    expect(ids(filterTasks(tasks, 'all', '第二'))).toEqual(['b'])
    expect(ids(filterTasks(tasks, 'all', ' python '))).toEqual(['a'])
    expect(ids(filterTasks(tasks, 'all', 'second'))).toEqual(['b'])
    expect(ids(filterTasks(tasks, 'all', 'bv1xx'))).toEqual(['c'])
  })

  it('标签页和搜索词同时生效', () => {
    expect(ids(filterTasks(tasks, 'active', '第一'))).toEqual([])
    expect(ids(filterTasks(tasks, 'active', '第二'))).toEqual(['b'])
  })
})

describe('taskPct', () => {
  it('不知道大小时为 0，超过 100% 按 100 算', () => {
    expect(taskPct(task('a', 'queued'))).toBe(0)
    expect(taskPct(task('a', 'downloading', { downloaded: 25, total: 100 }))).toBe(25)
    expect(taskPct(task('a', 'downloading', { downloaded: 120, total: 100 }))).toBe(100)
  })
})

describe('taskDetail', () => {
  const now = 1_000_000

  it('等待重试：倒计时向上取整，次数从已重试次数加一', () => {
    expect(taskDetail(task('a', 'error', { retryAt: now + 4200, retries: 2 }), now)).toBe('5 秒后 · 第 3 次')
    expect(taskDetail(task('a', 'error', { retryAt: now + 1000 }), now)).toBe('1 秒后 · 第 1 次')
  })

  it('重试时间已过时倒计时显示 0', () => {
    expect(taskDetail(task('a', 'error', { retryAt: now - 3000 }), now)).toBe('0 秒后 · 第 1 次')
  })

  it('下载中：速度和剩余时间；没有速度或剩余时间算不出来时只显示速度', () => {
    expect(taskDetail(task('a', 'downloading', { speed: MB, downloaded: 0, total: 90 * MB }), now)).toBe('1.0 MB/s · 剩 1 分 30 秒')
    expect(taskDetail(task('a', 'downloading', { speed: 0, total: 90 * MB }), now)).toBe('0 B/s')
    expect(taskDetail(task('a', 'downloading', { speed: 1, total: 200 * 1024 }), now)).toBe('1 B/s')
  })

  it('已完成显示文件大小', () => {
    expect(taskDetail(task('a', 'done', { total: 3 * MB }), now)).toBe('3.0 MB')
  })

  it('暂停等其它状态有大小时显示已下载 / 总大小', () => {
    expect(taskDetail(task('a', 'paused', { downloaded: MB, total: 2 * MB }), now)).toBe('1.0 MB / 2.0 MB')
    expect(taskDetail(task('a', 'error', { downloaded: 0, total: 1024 }), now)).toBe('0 B / 1 KB')
  })

  it('排队中或不知道大小时为空', () => {
    expect(taskDetail(task('a', 'queued', { total: MB }), now)).toBe('')
    expect(taskDetail(task('a', 'paused'), now)).toBe('')
  })
})

describe('groupStatus', () => {
  const g = (...statuses: (TaskStatus | 'retry')[]): TaskStatus =>
    groupStatus(statuses.map((s, i) => (s === 'retry' ? task(`t${i}`, 'error', { retryAt: 1 }) : task(`t${i}`, s))))

  it('优先级：下载中 > 排队或待重试 > 等待登录 > 暂停 > 出错 > 完成', () => {
    expect(g('done', 'error', 'paused', 'waitingAuth', 'queued', 'merging')).toBe('downloading')
    expect(g('done', 'error', 'paused', 'waitingAuth', 'queued')).toBe('queued')
    expect(g('done', 'error', 'paused', 'waitingAuth', 'retry')).toBe('queued')
    expect(g('done', 'error', 'paused', 'waitingAuth')).toBe('waitingAuth')
    expect(g('done', 'error', 'paused')).toBe('paused')
    expect(g('done', 'error')).toBe('error')
    expect(g('done', 'unsupported')).toBe('error')
    expect(g('done', 'done')).toBe('done')
  })
})

describe('groupSummary', () => {
  it('进度按任务数平均：已完成算 1，排除无法下载的，单个任务最多算 1', () => {
    const s = groupSummary([
      task('a', 'done', { total: 10 }),
      task('b', 'downloading', { downloaded: 50, total: 100, speed: 1024 }),
      task('c', 'paused', { downloaded: 200, total: 100 }),
      task('d', 'queued'),
      task('e', 'unsupported')
    ])
    expect(s.pct).toBe(((1 + 0.5 + 1 + 0) / 4) * 100)
    expect(s.status).toBe('downloading')
  })

  it('下载中时详情是各任务速度之和，其它状态的速度不计', () => {
    const s = groupSummary([
      task('a', 'downloading', { speed: 1024, total: 10 }),
      task('b', 'downloading', { speed: 2048, total: 10 }),
      task('c', 'merging', { speed: 4096 })
    ])
    expect(s.speed).toBe(3072)
    expect(s.detail).toBe('3 KB/s')
  })

  it('全部完成时详情是已完成文件的总大小', () => {
    const s = groupSummary([task('a', 'done', { total: MB }), task('b', 'done', { total: 2 * MB })])
    expect(s.status).toBe('done')
    expect(s.pct).toBe(100)
    expect(s.detail).toBe('3.0 MB')
    expect(s.done.map((t) => t.id)).toEqual(['a', 'b'])
    expect(s.allSettled).toBe(true)
  })

  it('其它状态的详情是取整后的百分比', () => {
    const s = groupSummary([task('a', 'done'), task('b', 'paused'), task('c', 'paused')])
    expect(s.status).toBe('paused')
    expect(s.detail).toBe('33%')
    expect(s.allSettled).toBe(false)
  })

  it('统计失败数：等待重试的不算', () => {
    const s = groupSummary([task('a', 'error'), task('b', 'unsupported'), task('c', 'error', { retryAt: 1 })])
    expect(s.failedCount).toBe(2)
    expect(s.status).toBe('queued')
  })

  it('全部无法下载时进度为 0，状态算出错', () => {
    const s = groupSummary([task('a', 'unsupported'), task('b', 'unsupported')])
    expect(s.pct).toBe(0)
    expect(s.status).toBe('error')
    expect(s.detail).toBe('0%')
    expect(s.allSettled).toBe(true)
  })
})

describe('statusCounts', () => {
  it('统计总速度、进行中、排队和已完成的数量', () => {
    const counts = statusCounts([
      task('a', 'downloading', { speed: 1000 }),
      task('b', 'fetching', { speed: 500 }),
      task('c', 'queued'),
      task('d', 'queued'),
      task('e', 'done'),
      task('f', 'paused')
    ])
    expect(counts).toEqual({ speed: 1000, running: 2, queued: 2, done: 1 })
  })

  it('没有任务时都是 0', () => {
    expect(statusCounts([])).toEqual({ speed: 0, running: 0, queued: 0, done: 0 })
  })
})

describe('shortenHome', () => {
  it('把 /Users/用户名 缩写成 ~', () => {
    expect(shortenHome('/Users/alice/Downloads/B站')).toBe('~/Downloads/B站')
    expect(shortenHome('/Users/alice')).toBe('~')
  })

  it('Linux 上把 /home/用户名 缩写成 ~', () => {
    expect(shortenHome('/home/alice/下载/Bilibili')).toBe('~/下载/Bilibili')
    expect(shortenHome('/home/alice')).toBe('~')
  })

  it('其它路径不变', () => {
    expect(shortenHome('/Volumes/Disk/Users/alice')).toBe('/Volumes/Disk/Users/alice')
  })

  it('Windows 用户目录缩写成 ~，保留反斜杠路径', () => {
    expect(shortenHome('C:\\Users\\alice\\Downloads\\B站')).toBe('~\\Downloads\\B站')
    expect(shortenHome('C:\\Users\\alice')).toBe('~')
  })
})

describe('clearCounts', () => {
  it('移除已完成和无法下载的，有输出文件的已完成任务才算可删文件', () => {
    expect(
      clearCounts([
        task('a', 'done', { outputPath: '/a.mp4' }),
        task('b', 'done'),
        task('c', 'unsupported'),
        task('d', 'error')
      ])
    ).toEqual({ count: 3, files: 1 })
  })
})

describe('unfinishedCount', () => {
  it('进行中、排队、等待登录的算未完成；暂停、失败、等待重试的不算', () => {
    expect(which((t) => unfinishedCount([t]) === 1)).toEqual(['queued', 'fetching', 'downloading', 'merging', 'extras', 'waitingAuth'])
    expect(unfinishedCount([task('a', 'error', { retryAt: 1 }), task('b', 'queued'), task('c', 'downloading')])).toBe(2)
  })
})
