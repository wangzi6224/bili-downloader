import type { PowerMode, TaskInfo, TaskStatus } from '@shared/types'
import { fmtBytes, fmtSpeed, thumb } from '../format'
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

function TaskRow({ t }: { t: TaskInfo }) {
  const s = STATUS[t.status]
  const pct = t.total ? Math.min(100, (t.downloaded / t.total) * 100) : 0
  const active = ACTIVE.has(t.status)

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
        {(active || t.status === 'paused') && t.total > 0 && (
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
      <div className="w-36 shrink-0 text-right text-xs">
        <div className={s.color}>
          {s.label}
          {t.status === 'downloading' && ` ${pct.toFixed(0)}%`}
        </div>
        <div className="mt-0.5 text-neutral-500 tabular-nums">
          {t.status === 'downloading'
            ? `${fmtSpeed(t.speed)} · ${fmtBytes(t.total)}`
            : t.total > 0 && t.status !== 'queued'
              ? fmtBytes(t.status === 'done' ? t.total : t.downloaded) + (t.status === 'done' ? '' : ` / ${fmtBytes(t.total)}`)
              : ''}
        </div>
      </div>
      <div className="flex w-52 shrink-0 justify-end gap-1">
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
            重试
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
  const running = tasks.some((t) => ACTIVE.has(t.status))
  const resumable = tasks.some((t) => t.status === 'paused' || t.status === 'error')
  const finished = tasks.some((t) => t.status === 'done' || t.status === 'unsupported')

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-4">
      <div className="flex items-center gap-2 px-6 pb-2">
        <span className="text-sm font-medium">下载列表</span>
        <span className="text-xs text-neutral-500">{tasks.length ? `${tasks.length} 项` : ''}</span>
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
        {tasks.length ? (
          [...tasks].reverse().map((t) => <TaskRow key={t.id} t={t} />)
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
