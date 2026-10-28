import { useEffect, useMemo, useState } from 'react'
import type { PowerMode, TaskInfo, TaskStatus } from '@shared/types'
import { fmtBytes, fmtEta, fmtSpeed, thumb } from '../format'
import { api, updateSettings, useStore } from '../store'
import { Button } from './Modal'

const STATUS: Record<TaskStatus, { label: string; color: string }> = {
  queued: { label: '排队中', color: 'text-neutral-500' },
  fetching: { label: '获取地址', color: 'text-sky' },
  downloading: { label: '下载中', color: 'text-sky' },
  merging: { label: '合并中', color: 'text-sky' },
  extras: { label: '下载附加内容', color: 'text-sky' },
  done: { label: '已完成', color: 'text-green-600' },
  paused: { label: '已暂停', color: 'text-neutral-500' },
  waitingAuth: { label: '等待重新登录', color: 'text-amber-600' },
  error: { label: '失败', color: 'text-red-600' },
  unsupported: { label: '无法下载', color: 'text-red-600' }
}

const ACTIVE = new Set<TaskStatus>(['fetching', 'downloading', 'merging', 'extras'])

const POWER: { value: PowerMode; label: string }[] = [
  { value: 'off', label: '允许休眠' },
  { value: 'system', label: '阻止系统睡眠' },
  { value: 'display', label: '保持屏幕常亮' }
]

type Tab = 'all' | 'active' | 'done' | 'failed'
const TABS: { value: Tab; label: string; match: (t: TaskInfo) => boolean }[] = [
  { value: 'all', label: '全部', match: () => true },
  {
    value: 'active',
    label: '进行中',
    match: (t) => ACTIVE.has(t.status) || ['queued', 'paused', 'waitingAuth'].includes(t.status) || Boolean(t.retryAt)
  },
  { value: 'done', label: '已完成', match: (t) => t.status === 'done' },
  { value: 'failed', label: '失败', match: (t) => (t.status === 'error' && !t.retryAt) || t.status === 'unsupported' }
]

/** 每秒刷新一次，用于重试倒计时 */
function useNow(enabled: boolean): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [enabled])
  return now
}

function TaskRow({ t, now }: { t: TaskInfo; now: number }) {
  const s = STATUS[t.status]
  const pct = t.total ? Math.min(100, (t.downloaded / t.total) * 100) : 0
  const active = ACTIVE.has(t.status)
  const retrying = t.status === 'error' && t.retryAt

  let detail = ''
  if (t.status === 'downloading') {
    const eta = t.speed > 0 ? fmtEta((t.total - t.downloaded) / t.speed) : ''
    detail = `${fmtSpeed(t.speed)} · ${fmtBytes(t.total)}${eta ? ` · 剩余 ${eta}` : ''}`
  } else if (t.status === 'done') {
    detail = fmtBytes(t.total)
  } else if (t.total > 0 && t.status !== 'queued') {
    detail = `${fmtBytes(t.downloaded)} / ${fmtBytes(t.total)}`
  }

  return (
    <div className="flex items-center gap-3 border-b border-neutral-100 px-6 py-3 dark:border-neutral-800">
      <img
        src={thumb(t.item.cover, 160)}
        referrerPolicy="no-referrer"
        className="h-10 w-16 shrink-0 rounded bg-neutral-200 object-cover dark:bg-neutral-800"
        alt=""
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm" title={t.relBase}>
          {t.title}
        </div>
        <div className="mt-0.5 flex gap-2 truncate text-xs text-neutral-500">
          {t.groupTitle !== t.title && <span className="truncate">{t.groupTitle}</span>}
          {t.qualityLabel && <span className="shrink-0">{t.qualityLabel}</span>}
        </div>
        {(active || t.status === 'paused' || retrying) && t.total > 0 && (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div className="h-full rounded-full bg-bili transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
        {(t.error || t.note) && (
          <div className={`mt-1 truncate text-xs ${t.error ? 'text-red-600' : 'text-amber-600'}`} title={t.error ?? t.note}>
            {t.error ?? t.note}
          </div>
        )}
      </div>
      <div className="w-44 shrink-0 text-right text-xs">
        <div className={retrying ? 'text-amber-600' : s.color}>
          {retrying
            ? `${Math.max(0, Math.ceil((t.retryAt! - now) / 1000))} 秒后自动重试（第 ${(t.retries ?? 0) + 1} 次）`
            : s.label}
          {t.status === 'downloading' && ` ${pct.toFixed(0)}%`}
        </div>
        <div className="mt-0.5 text-neutral-500 tabular-nums">{detail}</div>
      </div>
      <div className="flex w-56 shrink-0 justify-end gap-1">
        {(active || t.status === 'queued') && (
          <Button variant="ghost" onClick={() => api.download.pause(t.id)}>
            暂停
          </Button>
        )}
        {(t.status === 'paused' || t.status === 'waitingAuth') && (
          <Button variant="ghost" onClick={() => api.download.resume(t.id)}>
            继续
          </Button>
        )}
        {t.status === 'error' && (
          <Button variant="ghost" onClick={() => api.download.retry(t.id)}>
            {retrying ? '立即重试' : '重试'}
          </Button>
        )}
        {(t.status === 'error' || t.status === 'paused') && (
          <Button
            variant="ghost"
            title="删除已下载的部分，从头开始"
            onClick={() => {
              if (confirm(`删除“${t.title}”已下载的部分并从头下载？`)) void api.download.redownload(t.id)
            }}
          >
            重新下载
          </Button>
        )}
        {t.status === 'done' && t.outputPath && (
          <Button variant="ghost" onClick={() => api.showInFolder(t.outputPath!)}>
            在访达中显示
          </Button>
        )}
        <Button
          variant="danger"
          onClick={() => {
            if (t.status === 'done' || t.status === 'unsupported' || confirm(`取消“${t.title}”并删除已下载的部分？`)) {
              void api.download.cancel(t.id)
            }
          }}
        >
          {t.status === 'done' || t.status === 'unsupported' ? '移除' : '取消'}
        </Button>
      </div>
    </div>
  )
}

export function TaskList() {
  const tasks = useStore((s) => s.tasks)
  const powerMode = useStore((s) => s.settings?.powerMode ?? 'off')
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const running = tasks.some((t) => ACTIVE.has(t.status))
  const resumable = tasks.some((t) => t.status === 'paused' || t.status === 'error')
  const finished = tasks.some((t) => t.status === 'done' || t.status === 'unsupported')
  const now = useNow(tasks.some((t) => t.retryAt))

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = TABS.find((x) => x.value === tab)!.match
    return tasks
      .filter((t) => match(t))
      .filter(
        (t) =>
          !q ||
          [t.title, t.groupTitle, t.relBase, t.item.bvid ?? ''].some((s) => s.toLowerCase().includes(q))
      )
      .reverse()
  }, [tasks, tab, query])

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-4">
      <div className="flex items-center gap-2 px-6 pb-2">
        <div className="flex rounded-lg bg-neutral-100 p-0.5 text-xs dark:bg-neutral-800">
          {TABS.map((x) => {
            const count = tasks.filter(x.match).length
            return (
              <button
                key={x.value}
                onClick={() => setTab(x.value)}
                className={`rounded-md px-2.5 py-1 ${tab === x.value ? 'bg-white shadow dark:bg-neutral-700' : 'text-neutral-500'}`}
              >
                {x.label}
                {count > 0 && <span className="ml-1 tabular-nums opacity-60">{count}</span>}
              </button>
            )
          })}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索标题、合集、BV 号"
          className="h-7 w-44 rounded-md border border-neutral-300 bg-white px-2 text-xs outline-none focus:border-bili dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
          {running && powerMode !== 'off' && (
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" title="正在阻止休眠" />
          )}
          下载时
          <select
            value={powerMode}
            onChange={(e) => updateSettings({ powerMode: e.target.value as PowerMode })}
            className="rounded-md border border-neutral-300 bg-white px-1.5 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
          >
            {POWER.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <Button variant="ghost" disabled={!resumable} onClick={() => api.download.resumeAll()}>
          全部继续
        </Button>
        <Button variant="ghost" disabled={!finished} onClick={() => api.download.clearFinished()}>
          清除已完成
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto border-t border-neutral-200 dark:border-neutral-800">
        {visible.length ? (
          visible.map((t) => <TaskRow key={t.id} t={t} now={now} />)
        ) : tasks.length ? (
          <div className="flex h-full items-center justify-center text-sm text-neutral-400">没有符合条件的任务</div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-neutral-400">
            <div>复制 B站链接后回到这里，或直接粘贴到上方输入框</div>
            <div className="text-xs">支持普通视频、分P、合集、番剧、电影，以及 b23.tv 短链</div>
          </div>
        )}
      </div>
    </div>
  )
}
