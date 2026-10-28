import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import {
  ArrowDown,
  Ban,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CirclePause,
  Clock,
  Coffee,
  Download,
  FolderOpen,
  Gauge,
  KeyRound,
  ListX,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Timer,
  Trash2,
  X,
  type LucideIcon
} from 'lucide-react'
import { itemUrl } from '@shared/parseUrl'
import type { PowerMode, TaskInfo, TaskStatus } from '@shared/types'
import { fmtBytes, fmtEta, fmtSpeed, thumb } from '../format'
import { api, updateSettings, useStore } from '../store'
import { ACTIVE, buildEntries } from '../taskOrder'
import { Logo } from './Logo'
import {
  Badge,
  Banner,
  Button,
  Dropdown,
  EmptyState,
  IconButton,
  Input,
  MenuItem,
  MenuLabel,
  Modal,
  ModalFooter,
  ModalHeader,
  Progress,
  Segmented,
  STROKE
} from './ui'

const SKY = 'text-sky-600 dark:text-sky-400'
const STATUS: Record<TaskStatus, { label: string; color: string; icon: LucideIcon; spin?: boolean }> = {
  queued: { label: '排队中', color: 'text-muted', icon: Clock },
  fetching: { label: '获取地址', color: SKY, icon: Loader2, spin: true },
  downloading: { label: '下载中', color: 'text-bili', icon: ArrowDown },
  merging: { label: '合并中', color: SKY, icon: Loader2, spin: true },
  extras: { label: '下载附加内容', color: SKY, icon: Loader2, spin: true },
  done: { label: '已完成', color: 'text-green-600 dark:text-green-500', icon: CircleCheck },
  paused: { label: '已暂停', color: 'text-muted', icon: CirclePause },
  waitingAuth: { label: '等待重新登录', color: 'text-amber-600 dark:text-amber-400', icon: KeyRound },
  error: { label: '失败', color: 'text-red-600 dark:text-red-400', icon: CircleAlert },
  unsupported: { label: '无法下载', color: 'text-red-600 dark:text-red-400', icon: Ban }
}

export { ACTIVE }

/** 和主进程的判断一致：排队、运行中、等待登录、等待自动重试 */
const pausable = (t: TaskInfo): boolean =>
  ACTIVE.has(t.status) || t.status === 'queued' || t.status === 'waitingAuth' || Boolean(t.retryAt)
const resumable = (t: TaskInfo): boolean => t.status === 'paused' || t.status === 'error'
const settled = (t: TaskInfo): boolean => t.status === 'done' || t.status === 'unsupported'
const failed = (t: TaskInfo): boolean => (t.status === 'error' && !t.retryAt) || t.status === 'unsupported'

function removeTasks(ids: string[], deleteFiles: boolean): void {
  api.download.remove(ids, deleteFiles).catch((e: Error) => useStore.getState().set({ error: e.message }))
}

/** 点击来自行里的按钮或链接时，不触发行本身的点击 */
const fromControl = (e: MouseEvent): boolean => Boolean((e.target as HTMLElement).closest('a, button'))

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
  { value: 'failed', label: '失败', match: failed }
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

/** 标题链接：在浏览器里打开 B站页面（主进程的 setWindowOpenHandler 交给系统浏览器） */
function TitleLink({ href, children }: { href?: string; children: ReactNode }) {
  if (!href) return <>{children}</>
  return (
    <a href={href} target="_blank" rel="noreferrer" title="在浏览器中打开 B站页面" className="hover:text-bili hover:underline">
      {children}
    </a>
  )
}

function TaskRow({ t, now, nested = false }: { t: TaskInfo; now: number; nested?: boolean }) {
  const pct = t.total ? Math.min(100, (t.downloaded / t.total) * 100) : 0
  const active = ACTIVE.has(t.status)
  const retrying = t.status === 'error' && t.retryAt
  const s = retrying ? { label: '等待重试', color: 'text-amber-600 dark:text-amber-400', icon: Timer, spin: false } : STATUS[t.status]
  const finished = settled(t)

  let detail = ''
  if (retrying) {
    detail = `${Math.max(0, Math.ceil((t.retryAt! - now) / 1000))} 秒后 · 第 ${(t.retries ?? 0) + 1} 次`
  } else if (t.status === 'downloading') {
    const eta = t.speed > 0 ? fmtEta((t.total - t.downloaded) / t.speed) : ''
    detail = `${fmtSpeed(t.speed)}${eta ? ` · 剩 ${eta}` : ''}`
  } else if (t.status === 'done') {
    detail = fmtBytes(t.total)
  } else if (t.total > 0 && t.status !== 'queued') {
    detail = `${fmtBytes(t.downloaded)} / ${fmtBytes(t.total)}`
  }

  // 常显的主操作
  let primary = null
  if (active || t.status === 'queued') {
    primary = <IconButton icon={Pause} label="暂停" onClick={() => api.download.pause(t.id)} />
  } else if (t.status === 'paused' || t.status === 'waitingAuth') {
    primary = <IconButton icon={Play} label="继续" onClick={() => api.download.resume(t.id)} />
  } else if (t.status === 'error') {
    primary = <IconButton icon={RefreshCw} label={retrying ? '立即重试' : '重试'} onClick={() => api.download.retry(t.id)} />
  } else if (t.status === 'done' && t.outputPath) {
    primary = <IconButton icon={FolderOpen} label="在访达中显示" onClick={() => api.showInFolder(t.outputPath!)} />
  }

  return (
    <div
      className="group flex items-center gap-4 rounded-xl px-3 py-2.5 transition-colors hover:bg-hover"
      onDoubleClick={(e) => !fromControl(e) && t.status === 'done' && t.outputPath && api.showInFolder(t.outputPath)}
    >
      <div className="relative h-[54px] w-24 shrink-0 overflow-hidden rounded-lg bg-track ring-1 ring-line">
        {t.item.cover && (
          <img src={thumb(t.item.cover, 192)} referrerPolicy="no-referrer" className="h-full w-full object-cover" alt="" />
        )}
        {t.status === 'done' && (
          <span className="absolute right-1 bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-white shadow-sm">
            <Check size={11} strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">
          <TitleLink href={itemUrl(t.item)}>{t.title}</TitleLink>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted" title={t.relBase}>
          {t.qualityLabel && <Badge>{t.qualityLabel}</Badge>}
          {!nested && t.groupTitle !== t.title && <span className="truncate">{t.groupTitle}</span>}
        </div>
        {(active || t.status === 'paused' || retrying) && t.total > 0 && (
          <Progress value={pct} muted={!active} className="mt-2" />
        )}
        {(t.error || t.note) && (
          <div
            className={`mt-1 truncate text-xs ${t.error ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}
            title={t.error ?? t.note}
          >
            {t.error ?? t.note}
          </div>
        )}
      </div>
      <div className="w-32 shrink-0 text-right text-xs">
        <div className={`inline-flex items-center gap-1 font-medium ${s.color}`}>
          <s.icon size={13} strokeWidth={2} className={s.spin ? 'animate-spin' : ''} />
          {s.label}
          {t.status === 'downloading' && <span className="tabular-nums">{pct.toFixed(0)}%</span>}
        </div>
        <div className="mt-0.5 truncate text-muted tabular-nums">{detail}</div>
      </div>
      <div className="flex w-[100px] shrink-0 items-center justify-end gap-0.5">
        {/* 次要操作悬停时才出现，避免满屏按钮 */}
        <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {(t.status === 'error' || t.status === 'paused') && (
            <IconButton
              icon={RotateCcw}
              label="重新下载：删除已下载的部分，从头开始"
              onClick={() => {
                if (confirm(`删除“${t.title}”已下载的部分并从头下载？`)) void api.download.redownload(t.id)
              }}
            />
          )}
          {finished && <IconButton icon={X} label="从列表移除（保留文件）" onClick={() => removeTasks([t.id], false)} />}
          {t.status !== 'unsupported' && (
            <IconButton
              icon={Trash2}
              variant="danger"
              label={t.status === 'done' ? '彻底删除：永久删除视频文件和附加文件' : '彻底删除：取消下载并删除已下载的部分'}
              onClick={() => {
                const ok = confirm(
                  t.status === 'done'
                    ? `永久删除“${t.title}”的视频文件，以及封面、字幕、弹幕等附加文件？删除后无法恢复。`
                    : `取消“${t.title}”并删除已下载的部分？`
                )
                if (ok) removeTasks([t.id], true)
              }}
            />
          )}
        </div>
        {primary}
      </div>
    </div>
  )
}

/** 合集的总体状态：有在下的算下载中，其次排队、等待登录、暂停、失败，都没有才算完成 */
function groupStatus(tasks: TaskInfo[]): TaskStatus {
  if (tasks.some((t) => ACTIVE.has(t.status))) return 'downloading'
  if (tasks.some((t) => t.status === 'queued' || t.retryAt)) return 'queued'
  if (tasks.some((t) => t.status === 'waitingAuth')) return 'waitingAuth'
  if (tasks.some((t) => t.status === 'paused')) return 'paused'
  if (tasks.some(failed)) return 'error'
  return 'done'
}

/** 同一个合集的任务折叠成一行，显示总进度；展开后列出每个任务 */
function GroupRow({
  tasks,
  visible,
  open,
  onToggle,
  now
}: {
  tasks: TaskInfo[]
  visible: TaskInfo[]
  open: boolean
  onToggle: () => void
  now: number
}) {
  const first = tasks[0]
  const ids = tasks.map((t) => t.id)
  const counted = tasks.filter((t) => t.status !== 'unsupported')
  const done = tasks.filter((t) => t.status === 'done')
  const failedCount = tasks.filter(failed).length
  // 按任务数平均：排队的任务还不知道大小，按字节算会忽高忽低
  const pct = counted.length
    ? (counted.reduce((sum, t) => sum + (t.status === 'done' ? 1 : t.total ? Math.min(1, t.downloaded / t.total) : 0), 0) /
        counted.length) *
      100
    : 0
  const speed = tasks.reduce((sum, t) => sum + (t.status === 'downloading' ? t.speed : 0), 0)
  const status = groupStatus(tasks)
  const s = STATUS[status]
  const label = status === 'error' ? `${failedCount} 个失败` : s.label
  const allSettled = tasks.every(settled)

  let detail = `${pct.toFixed(0)}%`
  if (status === 'downloading') detail = fmtSpeed(speed)
  else if (status === 'done') detail = fmtBytes(done.reduce((sum, t) => sum + t.total, 0))

  let primary = null
  if (tasks.some(pausable)) {
    primary = <IconButton icon={Pause} label="暂停整组" onClick={() => api.download.pauseMany(ids)} />
  } else if (tasks.some(resumable)) {
    primary = <IconButton icon={Play} label="继续整组" onClick={() => api.download.resumeMany(ids)} />
  } else if (done[0]?.outputPath) {
    primary = <IconButton icon={FolderOpen} label="在访达中显示" onClick={() => api.showInFolder(done[0].outputPath!)} />
  }

  return (
    <div>
      <div
        className="group flex items-center gap-4 rounded-xl px-3 py-2.5 transition-colors hover:bg-hover"
        onClick={(e) => !fromControl(e) && onToggle()}
      >
        {/* 叠起来的卡片，表示这是一组 */}
        <div className="relative h-[54px] w-24 shrink-0">
          <div className="absolute inset-x-2 -top-1 h-full rounded-lg bg-track ring-1 ring-line" />
          <div className="absolute inset-0 overflow-hidden rounded-lg bg-track ring-1 ring-line">
            {(first.seriesCover || first.item.cover) && (
              <img
                src={thumb((first.seriesCover || first.item.cover)!, 192)}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
                alt=""
              />
            )}
            <span className="absolute right-1 bottom-1 rounded bg-black/65 px-1 text-[10px] leading-4 font-medium text-white tabular-nums">
              {tasks.length}
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1 text-[13px] font-medium">
            <button
              type="button"
              aria-label={open ? '收起' : '展开'}
              aria-expanded={open}
              onClick={onToggle}
              className="-ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:bg-hover hover:text-fg"
            >
              <ChevronRight size={15} strokeWidth={STROKE} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
            </button>
            <span className="truncate">
              <TitleLink href={first.meta?.url}>{first.groupTitle}</TitleLink>
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-muted tabular-nums">
            共 {tasks.length} 个 · 已完成 {done.length}
            {failedCount > 0 && ` · 失败 ${failedCount}`}
          </div>
          {status !== 'done' && <Progress value={pct} muted={status !== 'downloading'} className="mt-2" />}
        </div>
        <div className="w-32 shrink-0 text-right text-xs">
          <div className={`inline-flex items-center gap-1 font-medium ${s.color}`}>
            <s.icon size={13} strokeWidth={2} className={s.spin ? 'animate-spin' : ''} />
            {label}
            {status === 'downloading' && <span className="tabular-nums">{pct.toFixed(0)}%</span>}
          </div>
          <div className="mt-0.5 truncate text-muted tabular-nums">{detail}</div>
        </div>
        <div className="flex w-[100px] shrink-0 items-center justify-end gap-0.5">
          <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {allSettled && <IconButton icon={X} label="整组从列表移除（保留文件）" onClick={() => removeTasks(ids, false)} />}
            <IconButton
              icon={Trash2}
              variant="danger"
              label="彻底删除整组"
              onClick={() => {
                const ok = confirm(
                  `删除“${first.groupTitle}”的 ${tasks.length} 个任务？` +
                    (done.length
                      ? `其中 ${done.length} 个已完成的视频文件及封面、字幕、弹幕会被永久删除，无法恢复。`
                      : '已下载的部分会一并删除。')
                )
                if (ok) removeTasks(ids, true)
              }}
            />
          </div>
          {primary}
        </div>
      </div>
      {open && (
        <div className="ml-6 border-l border-line pl-1">
          {visible.map((t) => (
            <TaskRow key={t.id} t={t} now={now} nested />
          ))}
        </div>
      )}
    </div>
  )
}

/** 下载时防休眠的开关，正在生效时图标带绿点 */
function PowerMenu({ running }: { running: boolean }) {
  const powerMode = useStore((s) => s.settings?.powerMode ?? 'off')
  return (
    <Dropdown
      className="w-48"
      button={({ open, toggle }) => (
        <div className="relative">
          <IconButton
            icon={Coffee}
            label={`下载时：${POWER.find((p) => p.value === powerMode)?.label}`}
            active={open || powerMode !== 'off'}
            onClick={toggle}
          />
          {powerMode !== 'off' && (
            <span
              className={`pointer-events-none absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full ${running ? 'animate-pulse bg-green-500' : 'bg-subtle'}`}
            />
          )}
        </div>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>下载时</MenuLabel>
          {POWER.map((p) => (
            <MenuItem
              key={p.value}
              checked={powerMode === p.value}
              onClick={() => {
                close()
                void updateSettings({ powerMode: p.value })
              }}
            >
              {p.label}
            </MenuItem>
          ))}
        </>
      )}
    </Dropdown>
  )
}

/** 清除已完成：默认只清空任务列表，勾选“同时删除原文件”才会永久删除下载好的文件 */
function ClearDialog({ onClose }: { onClose: () => void }) {
  const tasks = useStore((s) => s.tasks)
  const [deleteFiles, setDeleteFiles] = useState(false)
  const count = tasks.filter(settled).length
  const files = tasks.filter((t) => t.status === 'done' && t.outputPath).length

  const submit = (): void => {
    onClose()
    api.download.clearFinished(deleteFiles).catch((e: Error) => useStore.getState().set({ error: e.message }))
  }

  return (
    <Modal onClose={onClose} className="max-w-md">
      <ModalHeader icon={ListX} title="清除已完成" subtitle={`从下载列表移除 ${count} 个已完成的任务。`} onClose={onClose} />
      <div className="flex flex-col gap-3 px-6 pt-4">
        <label className={`flex items-start gap-2 text-[13px] ${files ? 'cursor-pointer' : 'opacity-50'}`}>
          <input
            type="checkbox"
            className="mt-0.5 accent-bili"
            checked={deleteFiles}
            disabled={!files}
            onChange={(e) => setDeleteFiles(e.target.checked)}
          />
          <span>
            同时删除原文件
            <span className="mt-0.5 block text-xs text-muted">不勾选只清空任务列表，下载好的文件保留在原处</span>
          </span>
        </label>
        {deleteFiles && (
          <Banner tone="warn">{files} 个视频文件及封面、字幕、弹幕等附加文件会被永久删除，无法恢复。</Banner>
        )}
      </div>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
        {deleteFiles ? (
          <Button variant="danger" icon={Trash2} onClick={submit}>
            清空并删除文件
          </Button>
        ) : (
          <Button variant="primary" icon={ListX} autoFocus onClick={submit}>
            仅清空列表
          </Button>
        )}
      </ModalFooter>
    </Modal>
  )
}

/** 底部状态栏：总速度、各状态数量、下载目录 */
function StatusBar({ tasks }: { tasks: TaskInfo[] }) {
  const settings = useStore((s) => s.settings)!
  const speed = tasks.reduce((sum, t) => sum + (t.status === 'downloading' ? t.speed : 0), 0)
  const running = tasks.filter((t) => ACTIVE.has(t.status)).length
  const queued = tasks.filter((t) => t.status === 'queued').length
  const done = tasks.filter((t) => t.status === 'done').length

  return (
    <div className="flex h-9 shrink-0 items-center gap-4 border-t border-line px-6 text-xs text-muted tabular-nums">
      {running > 0 && (
        <span className="flex items-center gap-1 font-medium text-bili">
          <ArrowDown size={13} strokeWidth={2.25} />
          {fmtSpeed(speed)}
        </span>
      )}
      {running > 0 && <span>{running} 个进行中</span>}
      {queued > 0 && <span>{queued} 个排队</span>}
      {done > 0 && <span>{done} 个已完成</span>}
      {settings.speedLimit > 0 && (
        <span className="flex items-center gap-1">
          <Gauge size={13} strokeWidth={STROKE} />
          限速 {fmtSpeed(settings.speedLimit * 1024)}
        </span>
      )}
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => api.showInFolder(settings.downloadDir)}
        title={`保存到 ${settings.downloadDir}，点击在访达中显示`}
        className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-hover hover:text-fg"
      >
        <FolderOpen size={13} strokeWidth={STROKE} className="shrink-0" />
        <span className="max-w-64 truncate">{settings.downloadDir.replace(/^\/Users\/[^/]+/, '~')}</span>
      </button>
    </div>
  )
}

const KINDS = ['视频', '分P', '合集', '番剧', '电影', '课程', '收藏夹', 'UP 主', 'b23.tv 短链']

export function TaskList() {
  const tasks = useStore((s) => s.tasks)
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  /** 展开着的合集，默认都折叠 */
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [clearing, setClearing] = useState(false)
  const running = tasks.some((t) => ACTIVE.has(t.status))
  const canPause = tasks.some(pausable)
  const canResume = tasks.some(resumable)
  const finished = tasks.some(settled)
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
  }, [tasks, tab, query])

  const entries = useMemo(() => buildEntries(tasks, visible), [tasks, visible])

  const toggle = (key: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) next.add(key)
      return next
    })

  if (!tasks.length) {
    return (
      <div className="min-h-0 flex-1">
        <EmptyState art={<Logo size={64} className="mb-3 drop-shadow-md" />} title="复制 B站链接，回到这里粘贴">
          <div>打开应用或切回窗口时会自动检测剪贴板，也可以直接按 ⌘V 粘贴到上方输入框。</div>
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {KINDS.map((k) => (
              <Badge key={k}>{k}</Badge>
            ))}
          </div>
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-6 pt-4 pb-2">
        <Segmented
          value={tab}
          onChange={setTab}
          options={TABS.map((x) => ({ value: x.value, label: x.label, count: tasks.filter(x.match).length }))}
        />
        <Input
          icon={Search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索标题、合集、BV 号"
          className="w-48"
        />
        <div className="flex-1" />
        <PowerMenu running={running} />
        <IconButton icon={Pause} label="全部暂停" disabled={!canPause} onClick={() => api.download.pauseAll()} />
        <IconButton icon={Play} label="全部继续" disabled={!canResume} onClick={() => api.download.resumeAll()} />
        <IconButton icon={ListX} label="清除已完成" disabled={!finished} onClick={() => setClearing(true)} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {entries.length ? (
          entries.map((e) =>
            e.type === 'task' ? (
              <TaskRow key={e.t.id} t={e.t} now={now} />
            ) : (
              <GroupRow
                key={e.key}
                tasks={e.tasks}
                visible={e.visible}
                // 搜索时自动展开，直接看到匹配的任务
                open={Boolean(query.trim()) || expanded.has(e.key)}
                onToggle={() => toggle(e.key)}
                now={now}
              />
            )
          )
        ) : (
          <EmptyState icon={query ? Search : Download} title="没有符合条件的任务" />
        )}
      </div>
      <StatusBar tasks={tasks} />
      {clearing && <ClearDialog onClose={() => setClearing(false)} />}
    </div>
  )
}
