import type { TaskInfo, TaskStatus } from '@shared/types'

export const ACTIVE = new Set<TaskStatus>(['fetching', 'downloading', 'merging', 'extras'])

/** 同一次（或同一订阅陆续）加入的合集、番剧、收藏夹等归为一组 */
export const groupKey = (t: TaskInfo): string => `${t.item.kind}|${t.groupTitle}`

export type Entry = { type: 'task'; t: TaskInfo } | { type: 'group'; key: string; tasks: TaskInfo[]; visible: TaskInfo[] }

/** 排序分档：进行中 → 等待（排队、等待重试、等待登录）→ 暂停 → 失败 → 已完成 */
const DONE_RANK = 4
function rank(t: TaskInfo): number {
  if (ACTIVE.has(t.status)) return 0
  if (t.status === 'queued' || t.status === 'waitingAuth' || t.retryAt) return 1
  if (t.status === 'paused') return 2
  return t.status === 'done' ? DONE_RANK : 3
}

/**
 * 把通过筛选的任务（visible）排成列表：同一合集有两个以上任务时折叠成组。
 * 先按状态分档，进行中的在最上面；同一档里未完成的按队列顺序（就是接下来的下载顺序），
 * 已完成的新加入的在前。组按其中排得最靠前的任务定位置，组内同样分档、再按集数顺序。
 */
export function buildEntries(tasks: TaskInfo[], visible: TaskInfo[]): Entry[] {
  const order = new Map(tasks.map((t, i) => [t.id, i]))
  const idx = (t: TaskInfo): number => order.get(t.id)!
  const members = new Map<string, TaskInfo[]>()
  for (const t of tasks) {
    const k = groupKey(t)
    const list = members.get(k)
    if (list) list.push(t)
    else members.set(k, [t])
  }
  const out: Entry[] = []
  const groups = new Map<string, Extract<Entry, { type: 'group' }>>()
  for (const t of visible) {
    const k = groupKey(t)
    const all = members.get(k)!
    if (all.length < 2) {
      out.push({ type: 'task', t })
      continue
    }
    let g = groups.get(k)
    if (!g) {
      g = { type: 'group', key: k, tasks: all, visible: [] }
      groups.set(k, g)
      out.push(g)
    }
    g.visible.push(t)
  }

  const byRank = (a: TaskInfo, b: TaskInfo): number => rank(a) - rank(b) || idx(a) - idx(b)
  const sortKey = (e: Entry): [number, number] => {
    const ts = e.type === 'task' ? [e.t] : e.visible.sort(byRank)
    const r = rank(ts[0])
    const same = ts.filter((t) => rank(t) === r).map(idx)
    return r === DONE_RANK ? [r, -Math.max(...same)] : [r, Math.min(...same)]
  }
  const keys = new Map(out.map((e) => [e, sortKey(e)]))
  return out.sort((a, b) => {
    const [ra, ta] = keys.get(a)!
    const [rb, tb] = keys.get(b)!
    return ra - rb || ta - tb
  })
}
