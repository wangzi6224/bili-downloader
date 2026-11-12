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
import type { Key } from '@shared/i18n'
import { itemUrl } from '@shared/parseUrl'
import { isVideoTask } from '@shared/watermark'
import type { AiModelStatus, PowerMode, TaskInfo, TaskStatus, WatermarkSpeed } from '@shared/types'
import { modelPct, modelText, WATERMARK_MODES, watermarkModeHint } from '../aiRefine'
import { fmtSpeed, thumb } from '../format'
import { useT } from '../i18n'
import { WatermarkOff } from '../icons'
import { api, sysText, updateSettings, useStore } from '../store'
import { ACTIVE, buildEntries } from '../taskOrder'
import {
  clearCounts,
  filterTasks,
  groupSummary,
  pausable,
  resumable,
  settled,
  shortenHome,
  statusCounts,
  TABS,
  taskDetail,
  taskPct,
  type Tab
} from '../taskStatus'
import { Logo } from './Logo'
import { AccountOrigin } from './AccountOrigin'
import { WatermarkDialog } from './WatermarkDialog'
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
const STATUS: Record<TaskStatus, { label: Key; color: string; icon: LucideIcon; spin?: boolean }> = {
  queued: { label: 'tasks.statusQueued', color: 'text-muted', icon: Clock },
  fetching: { label: 'tasks.statusFetching', color: SKY, icon: Loader2, spin: true },
  downloading: { label: 'tasks.statusDownloading', color: 'text-bili', icon: ArrowDown },
  merging: { label: 'tasks.statusMerging', color: SKY, icon: Loader2, spin: true },
  extras: { label: 'tasks.statusExtras', color: SKY, icon: Loader2, spin: true },
  processing: { label: 'tasks.statusProcessing', color: SKY, icon: Loader2, spin: true },
  done: { label: 'tasks.statusDone', color: 'text-green-600 dark:text-green-500', icon: CircleCheck },
  paused: { label: 'tasks.statusPaused', color: 'text-muted', icon: CirclePause },
  waitingAuth: { label: 'tasks.statusWaitingAuth', color: 'text-amber-600 dark:text-amber-400', icon: KeyRound },
  error: { label: 'tasks.statusError', color: 'text-red-600 dark:text-red-400', icon: CircleAlert },
  unsupported: { label: 'tasks.statusUnsupported', color: 'text-red-600 dark:text-red-400', icon: Ban }
}

export { ACTIVE }

function removeTasks(ids: string[], deleteFiles: boolean): void {
  api.download.remove(ids, deleteFiles).catch((e: Error) => useStore.getState().set({ error: e.message }))
}

/** 点击来自行里的按钮或链接时，不触发行本身的点击 */
const fromControl = (e: MouseEvent): boolean => Boolean((e.target as HTMLElement).closest('a, button'))

const POWER: { value: PowerMode; label: Key }[] = [
  { value: 'off', label: 'tasks.powerOff' },
  { value: 'system', label: 'tasks.powerSystem' },
  { value: 'display', label: 'tasks.powerDisplay' }
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
  const t = useT()
  if (!href) return <>{children}</>
  return (
    <a href={href} target="_blank" rel="noreferrer" title={t('tasks.openInBrowser')} className="hover:text-bili hover:underline">
      {children}
    </a>
  )
}

function TaskRow({ t: task, now, nested = false }: { t: TaskInfo; now: number; nested?: boolean }) {
  const t = useT()
  const pct = taskPct(task)
  const active = ACTIVE.has(task.status)
  const retrying = task.status === 'error' && task.retryAt
  // 对已完成的视频手动去水印：状态还是已完成，界面上按处理中显示
  const manual = Boolean(task.processing?.manual)
  const s = retrying
    ? { label: 'tasks.statusRetrying' as Key, color: 'text-amber-600 dark:text-amber-400', icon: Timer, spin: false }
    : manual
      ? STATUS.processing
      : STATUS[task.status]
  const finished = settled(task)
  const detail = taskDetail(task, now)

  // 常显的主操作
  let primary = null
  if (manual) {
    primary = <IconButton icon={X} label={t('tasks.cancelWatermark')} onClick={() => api.watermark.cancel(task.id)} />
  } else if (active || task.status === 'queued') {
    primary = <IconButton icon={Pause} label={t('tasks.pause')} onClick={() => api.download.pause(task.id)} />
  } else if (task.status === 'paused' || task.status === 'waitingAuth') {
    primary = <IconButton icon={Play} label={t('tasks.resume')} onClick={() => api.download.resume(task.id)} />
  } else if (task.status === 'error') {
    primary = <IconButton icon={RefreshCw} label={retrying ? t('tasks.retryNow') : t('tasks.retry')} onClick={() => api.download.retry(task.id)} />
  } else if (task.status === 'done' && task.outputPath) {
    primary = <IconButton icon={FolderOpen} label={t('tasks.showInFolder', { fileManager: sysText.fileManager })} onClick={() => api.showInFolder(task.outputPath!)} />
  }

  return (
    <div
      className="group flex items-center gap-4 rounded-xl px-3 py-2.5 transition-colors hover:bg-hover"
      onDoubleClick={(e) => !fromControl(e) && task.status === 'done' && task.outputPath && api.showInFolder(task.outputPath)}
    >
      <div className="relative h-[54px] w-24 shrink-0 overflow-hidden rounded-lg bg-track ring-1 ring-line">
        {task.item.cover && (
          <img src={thumb(task.item.cover, 192)} referrerPolicy="no-referrer" className="h-full w-full object-cover" alt="" />
        )}
        {task.status === 'done' && (
          <span className="absolute right-1 bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-white shadow-sm">
            <Check size={11} strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">
          <TitleLink href={itemUrl(task.item)}>{task.title}</TitleLink>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted" title={task.relBase}>
          {task.qualityLabel && <Badge>{task.qualityLabel}</Badge>}
          {task.watermark?.applied && <Badge>{t('tasks.watermarked')}</Badge>}
          <AccountOrigin mid={task.accountMid} />
          {!nested && task.groupTitle !== task.title && <span className="truncate">{task.groupTitle}</span>}
        </div>
        {(active || task.status === 'paused' || retrying || manual) && (task.total > 0 || manual) && (
          <Progress value={pct} muted={!active && !manual} className="mt-2" />
        )}
        {(task.error || task.note) && (
          <div
            className={`mt-1 truncate text-xs ${task.error ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}
            title={task.error ?? task.note}
          >
            {task.error ?? task.note}
          </div>
        )}
      </div>
      <div className="w-32 shrink-0 text-right text-xs">
        <div className={`inline-flex items-center gap-1 font-medium ${s.color}`}>
          <s.icon size={13} strokeWidth={2} className={s.spin ? 'animate-spin' : ''} />
          {t(s.label)}
          {(task.status === 'downloading' || task.processing?.stage === 'encode') && (
            <span className="tabular-nums">{pct.toFixed(0)}%</span>
          )}
        </div>
        <div className="mt-0.5 truncate text-muted tabular-nums">{detail}</div>
      </div>
      <div className="flex w-[132px] shrink-0 items-center justify-end gap-0.5">
        {/* 次要操作悬停时才出现，避免满屏按钮 */}
        <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {(task.status === 'error' || task.status === 'paused') && (
            <IconButton
              icon={RotateCcw}
              label={t('tasks.redownload')}
              onClick={() => {
                if (confirm(t('tasks.confirmRedownload', { title: task.title }))) void api.download.redownload(task.id)
              }}
            />
          )}
          {task.status === 'done' && task.outputPath && !manual && isVideoTask(task) && (
            <IconButton icon={WatermarkOff} label={t('tasks.removeWatermark')} onClick={() => useStore.getState().set({ watermarkTaskId: task.id })} />
          )}
          {finished && !manual && (
            <IconButton icon={X} label={t('tasks.removeFromList')} onClick={() => removeTasks([task.id], false)} />
          )}
          {task.status !== 'unsupported' && (
            <IconButton
              icon={Trash2}
              variant="danger"
              label={task.status === 'done' ? t('tasks.deleteDone') : t('tasks.deleteUnfinished')}
              onClick={() => {
                const ok = confirm(
                  task.status === 'done'
                    ? t('tasks.confirmDeleteDone', { title: task.title })
                    : t('tasks.confirmDeleteUnfinished', { title: task.title })
                )
                if (ok) removeTasks([task.id], true)
              }}
            />
          )}
        </div>
        {primary}
      </div>
    </div>
  )
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
  const t = useT()
  const first = tasks[0]
  const ids = tasks.map((t) => t.id)
  const { status, pct, done, failedCount, allSettled, detail } = groupSummary(tasks)
  const s = STATUS[status]
  const label = status === 'error' ? t('tasks.groupFailed', { count: failedCount }) : t(s.label)

  let primary = null
  if (tasks.some(pausable)) {
    primary = <IconButton icon={Pause} label={t('tasks.pauseGroup')} onClick={() => api.download.pauseMany(ids)} />
  } else if (tasks.some(resumable)) {
    primary = <IconButton icon={Play} label={t('tasks.resumeGroup')} onClick={() => api.download.resumeMany(ids)} />
  } else if (done[0]?.outputPath) {
    primary = <IconButton icon={FolderOpen} label={t('tasks.showInFolder', { fileManager: sysText.fileManager })} onClick={() => api.showInFolder(done[0].outputPath!)} />
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
              aria-label={open ? t('tasks.collapse') : t('tasks.expand')}
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
            {failedCount > 0
              ? t('tasks.groupStatsFailed', { count: tasks.length, done: done.length, failed: failedCount })
              : t('tasks.groupStats', { count: tasks.length, done: done.length })}
            {' · '}<AccountOrigin mid={first.accountMid} />
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
        <div className="flex w-[132px] shrink-0 items-center justify-end gap-0.5">
          <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {allSettled && <IconButton icon={X} label={t('tasks.removeGroup')} onClick={() => removeTasks(ids, false)} />}
            <IconButton
              icon={Trash2}
              variant="danger"
              label={t('tasks.deleteGroup')}
              onClick={() => {
                const ok = confirm(
                  done.length
                    ? t('tasks.confirmDeleteGroupDone', { title: first.groupTitle, count: tasks.length, done: done.length })
                    : t('tasks.confirmDeleteGroup', { title: first.groupTitle, count: tasks.length })
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
  const t = useT()
  const powerMode = useStore((s) => s.settings?.powerMode ?? 'off')
  return (
    <Dropdown
      className="w-48"
      button={({ open, toggle }) => (
        <div className="relative">
          <IconButton
            icon={Coffee}
            label={t('tasks.powerLabel', { mode: t((POWER.find((p) => p.value === powerMode) ?? POWER[0]).label) })}
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
          <MenuLabel>{t('tasks.powerMenu')}</MenuLabel>
          {POWER.map((p) => (
            <MenuItem
              key={p.value}
              checked={powerMode === p.value}
              onClick={() => {
                close()
                void updateSettings({ powerMode: p.value })
              }}
            >
              {t(p.label)}
            </MenuItem>
          ))}
        </>
      )}
    </Dropdown>
  )
}

/**
 * 去水印的总开关：下载后怎么处理水印（不处理 / 快速去除 / AI 精修）。改的就是设置里“默认格式”的水印，
 * 下载对话框、设置页和 AI 助手的下载（没指定时）都跟着它
 */
function WatermarkMenu() {
  const t = useT()
  const defaults = useStore((s) => s.settings?.defaults)
  const mode = defaults?.watermark ?? 'off'
  const [speed, setSpeed] = useState<WatermarkSpeed | null>(null)
  const [model, setModel] = useState<AiModelStatus | null>(null)
  useEffect(() => {
    void api.watermark.aiStatus().then(setModel)
    return api.watermark.onAiStatus(setModel)
  }, [])
  const label = WATERMARK_MODES.find((m) => m.value === mode)?.label ?? ''
  return (
    <Dropdown
      className="w-80"
      button={({ open, toggle }) => (
        <div className="relative">
          <IconButton
            icon={WatermarkOff}
            label={t('tasks.watermarkLabel', { mode: label })}
            active={open || mode !== 'off'}
            onClick={() => {
              // 每次打开都取一次最新的速度（刚处理完一个视频，实测值会变）
              if (!open) void api.watermark.speed().then(setSpeed)
              toggle()
            }}
          />
          {mode !== 'off' && (
            <span className={`pointer-events-none absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full ${mode === 'ai' ? 'bg-bili' : 'bg-subtle'}`} />
          )}
        </div>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>{t('tasks.watermarkMenu')}</MenuLabel>
          {WATERMARK_MODES.map((m) => (
            <MenuItem
              key={m.value}
              checked={mode === m.value}
              onClick={() => {
                close()
                if (defaults) void updateSettings({ defaults: { ...defaults, watermark: m.value } })
              }}
            >
              <span className="block">{m.label}</span>
              <span className="block text-[11px] leading-snug whitespace-normal text-muted">{watermarkModeHint(m.value, speed)}</span>
            </MenuItem>
          ))}
          {mode === 'ai' && model && model.state !== 'ready' && (
            <div className="mx-1 mt-1 flex items-center gap-2 rounded-lg bg-track px-2.5 py-2 text-[11px] leading-snug text-muted">
              <div className="min-w-0 flex-1">
                <div>{modelText(model)}</div>
                {model.state === 'downloading' && <Progress value={modelPct(model)} className="mt-1" />}
              </div>
              {model.state !== 'downloading' && (
                <Button size="sm" icon={Download} onClick={() => void api.watermark.aiDownload()}>
                  {t('tasks.download')}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </Dropdown>
  )
}

/** 清除已完成：默认只清空任务列表，勾选“同时删除原文件”才会永久删除下载好的文件 */
function ClearDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const tasks = useStore((s) => s.tasks)
  const [deleteFiles, setDeleteFiles] = useState(false)
  const { count, files } = clearCounts(tasks)

  const submit = (): void => {
    onClose()
    api.download.clearFinished(deleteFiles).catch((e: Error) => useStore.getState().set({ error: e.message }))
  }

  return (
    <Modal onClose={onClose} className="max-w-md">
      <ModalHeader icon={ListX} title={t('tasks.clearFinished')} subtitle={t('tasks.clearSubtitle', { count })} onClose={onClose} />
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
            {t('tasks.clearDeleteFiles')}
            <span className="mt-0.5 block text-xs text-muted">{t('tasks.clearDeleteFilesHint')}</span>
          </span>
        </label>
        {deleteFiles && (
          <Banner tone="warn">{t('tasks.clearWarn', { count: files })}</Banner>
        )}
      </div>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>
          {t('tasks.cancel')}
        </Button>
        {deleteFiles ? (
          <Button variant="danger" icon={Trash2} onClick={submit}>
            {t('tasks.clearAndDelete')}
          </Button>
        ) : (
          <Button variant="primary" icon={ListX} autoFocus onClick={submit}>
            {t('tasks.clearListOnly')}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  )
}

/** 底部状态栏：总速度、各状态数量、下载目录 */
function StatusBar({ tasks }: { tasks: TaskInfo[] }) {
  const t = useT()
  const settings = useStore((s) => s.settings)!
  const { speed, running, queued, done } = statusCounts(tasks)

  return (
    <div className="flex h-9 shrink-0 items-center gap-4 border-t border-line px-6 text-xs text-muted tabular-nums">
      {running > 0 && (
        <span className="flex items-center gap-1 font-medium text-bili">
          <ArrowDown size={13} strokeWidth={2.25} />
          {fmtSpeed(speed)}
        </span>
      )}
      {running > 0 && <span>{t('tasks.countRunning', { count: running })}</span>}
      {queued > 0 && <span>{t('tasks.countQueued', { count: queued })}</span>}
      {done > 0 && <span>{t('tasks.countDone', { count: done })}</span>}
      {settings.speedLimit > 0 && (
        <span className="flex items-center gap-1">
          <Gauge size={13} strokeWidth={STROKE} />
          {t('tasks.speedLimit', { speed: fmtSpeed(settings.speedLimit * 1024) })}
        </span>
      )}
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => api.showInFolder(settings.downloadDir)}
        title={t('tasks.saveTo', { dir: settings.downloadDir, fileManager: sysText.fileManager })}
        className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-hover hover:text-fg"
      >
        <FolderOpen size={13} strokeWidth={STROKE} className="shrink-0" />
        <span className="max-w-64 truncate">{shortenHome(settings.downloadDir)}</span>
      </button>
    </div>
  )
}

const KINDS: Key[] = [
  'tasks.kindVideo',
  'tasks.kindPart',
  'tasks.kindCollection',
  'tasks.kindBangumi',
  'tasks.kindMovie',
  'tasks.kindCourse',
  'tasks.kindFavorites',
  'tasks.kindUploader',
  'tasks.kindShortLink'
]

export function TaskList() {
  const t = useT()
  const tasks = useStore((s) => s.tasks)
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  /** 展开着的合集，默认都折叠 */
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [clearing, setClearing] = useState(false)
  const watermarkTaskId = useStore((s) => s.watermarkTaskId)
  const running = tasks.some((t) => ACTIVE.has(t.status))
  const canPause = tasks.some(pausable)
  const canResume = tasks.some(resumable)
  const finished = tasks.some(settled)
  const now = useNow(tasks.some((t) => t.retryAt))

  const visible = useMemo(() => filterTasks(tasks, tab, query), [tasks, tab, query])

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
        <EmptyState art={<Logo size={64} className="mb-3 drop-shadow-md" />} title={t('tasks.emptyTitle')}>
          <div>{t('tasks.emptyHint', { key: sysText.pasteKey })}</div>
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {KINDS.map((k) => (
              <Badge key={k}>{t(k)}</Badge>
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
          placeholder={t('tasks.search')}
          className="w-48"
        />
        <div className="flex-1" />
        <WatermarkMenu />
        <PowerMenu running={running} />
        <IconButton icon={Pause} label={t('tasks.pauseAll')} disabled={!canPause} onClick={() => api.download.pauseAll()} />
        <IconButton icon={Play} label={t('tasks.resumeAll')} disabled={!canResume} onClick={() => api.download.resumeAll()} />
        <IconButton icon={ListX} label={t('tasks.clearFinished')} disabled={!finished} onClick={() => setClearing(true)} />
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
          <EmptyState icon={query ? Search : Download} title={t('tasks.noMatch')} />
        )}
      </div>
      <StatusBar tasks={tasks} />
      {clearing && <ClearDialog onClose={() => setClearing(false)} />}
      {watermarkTaskId && (
        <WatermarkDialog taskId={watermarkTaskId} onClose={() => useStore.getState().set({ watermarkTaskId: null })} />
      )}
    </div>
  )
}
