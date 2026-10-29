import type { TaskInfo, TaskStatus } from '@shared/types'
import { fmtBytes, fmtEta, fmtSpeed } from './format'
import { ACTIVE } from './taskOrder'

/** 和主进程的判断一致：排队、运行中、等待登录、等待自动重试 */
export const pausable = (t: TaskInfo): boolean =>
  ACTIVE.has(t.status) || t.status === 'queued' || t.status === 'waitingAuth' || Boolean(t.retryAt)
export const resumable = (t: TaskInfo): boolean => t.status === 'paused' || t.status === 'error'
export const settled = (t: TaskInfo): boolean => t.status === 'done' || t.status === 'unsupported'
export const failed = (t: TaskInfo): boolean => (t.status === 'error' && !t.retryAt) || t.status === 'unsupported'

export type Tab = 'all' | 'active' | 'done' | 'failed'
export const TABS: { value: Tab; label: string; match: (t: TaskInfo) => boolean }[] = [
  { value: 'all', label: '全部', match: () => true },
  {
    value: 'active',
    label: '进行中',
    match: (t) => ACTIVE.has(t.status) || ['queued', 'paused', 'waitingAuth'].includes(t.status) || Boolean(t.retryAt)
  },
  { value: 'done', label: '已完成', match: (t) => t.status === 'done' },
  { value: 'failed', label: '失败', match: failed }
]

/** 按标签页筛选，再按标题、合集、文件路径、BV 号搜索 */
export function filterTasks(tasks: TaskInfo[], tab: Tab, query: string): TaskInfo[] {
  const q = query.trim().toLowerCase()
  const match = TABS.find((x) => x.value === tab)!.match
  return tasks
    .filter((t) => match(t))
    .filter((t) => !q || [t.title, t.groupTitle, t.relBase, t.item.bvid ?? ''].some((s) => s.toLowerCase().includes(q)))
}

/** 单个任务的进度百分比 */
export const taskPct = (t: TaskInfo): number => (t.total ? Math.min(100, (t.downloaded / t.total) * 100) : 0)

/** 任务行右侧状态下面那行：重试倒计时、速度和剩余时间、大小 */
export function taskDetail(t: TaskInfo, now: number): string {
  if (t.status === 'error' && t.retryAt) {
    return `${Math.max(0, Math.ceil((t.retryAt - now) / 1000))} 秒后 · 第 ${(t.retries ?? 0) + 1} 次`
  }
  if (t.status === 'downloading') {
    const eta = t.speed > 0 ? fmtEta((t.total - t.downloaded) / t.speed) : ''
    return `${fmtSpeed(t.speed)}${eta ? ` · 剩 ${eta}` : ''}`
  }
  if (t.status === 'done') return fmtBytes(t.total)
  if (t.total > 0 && t.status !== 'queued') return `${fmtBytes(t.downloaded)} / ${fmtBytes(t.total)}`
  return ''
}

/** 合集的总体状态：有在下的算下载中，其次排队、等待登录、暂停、失败，都没有才算完成 */
export function groupStatus(tasks: TaskInfo[]): TaskStatus {
  if (tasks.some((t) => ACTIVE.has(t.status))) return 'downloading'
  if (tasks.some((t) => t.status === 'queued' || t.retryAt)) return 'queued'
  if (tasks.some((t) => t.status === 'waitingAuth')) return 'waitingAuth'
  if (tasks.some((t) => t.status === 'paused')) return 'paused'
  if (tasks.some(failed)) return 'error'
  return 'done'
}

export interface GroupSummary {
  status: TaskStatus
  /** 0–100 */
  pct: number
  /** 组里正在下载的任务速度之和 */
  speed: number
  done: TaskInfo[]
  failedCount: number
  allSettled: boolean
  /** 组行右侧状态下面那行 */
  detail: string
}

export function groupSummary(tasks: TaskInfo[]): GroupSummary {
  const counted = tasks.filter((t) => t.status !== 'unsupported')
  const done = tasks.filter((t) => t.status === 'done')
  // 按任务数平均：排队的任务还不知道大小，按字节算会忽高忽低
  const pct = counted.length
    ? (counted.reduce((sum, t) => sum + (t.status === 'done' ? 1 : t.total ? Math.min(1, t.downloaded / t.total) : 0), 0) /
        counted.length) *
      100
    : 0
  const speed = tasks.reduce((sum, t) => sum + (t.status === 'downloading' ? t.speed : 0), 0)
  const status = groupStatus(tasks)

  let detail = `${pct.toFixed(0)}%`
  if (status === 'downloading') detail = fmtSpeed(speed)
  else if (status === 'done') detail = fmtBytes(done.reduce((sum, t) => sum + t.total, 0))

  return { status, pct, speed, done, failedCount: tasks.filter(failed).length, allSettled: tasks.every(settled), detail }
}

/** 底部状态栏的总速度和各状态数量 */
export function statusCounts(tasks: TaskInfo[]): { speed: number; running: number; queued: number; done: number } {
  return {
    speed: tasks.reduce((sum, t) => sum + (t.status === 'downloading' ? t.speed : 0), 0),
    running: tasks.filter((t) => ACTIVE.has(t.status)).length,
    queued: tasks.filter((t) => t.status === 'queued').length,
    done: tasks.filter((t) => t.status === 'done').length
  }
}

/** /Users/xxx（macOS）或 /home/xxx（Linux）开头的路径缩写成 ~ */
export const shortenHome = (path: string): string => path.replace(/^\/(Users|home)\/[^/]+/, '~')

/** 清除已完成：要移除的任务数，以及其中有文件可删的数量 */
export function clearCounts(tasks: TaskInfo[]): { count: number; files: number } {
  return {
    count: tasks.filter(settled).length,
    files: tasks.filter((t) => t.status === 'done' && t.outputPath).length
  }
}

/** 退出或重启后会变成已暂停的任务数：进行中、排队、等待登录 */
export const unfinishedCount = (tasks: TaskInfo[]): number =>
  tasks.filter((t) => ACTIVE.has(t.status) || t.status === 'queued' || t.status === 'waitingAuth').length
