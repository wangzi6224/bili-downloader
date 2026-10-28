import {
  ChevronsUpDown,
  CircleAlert,
  CircleArrowUp,
  Download,
  History,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  RotateCw,
  Rss,
  Settings,
  type LucideIcon
} from 'lucide-react'
import { thumb } from '../format'
import { api, useStore, type View } from '../store'
import { updateEntry, type UpdateIcon } from '../viewLogic'
import { Logo } from './Logo'
import { ACTIVE } from './TaskList'
import { Badge, Dropdown, MenuItem, STROKE } from './ui'

const NAV: { view: View; label: string; icon: LucideIcon }[] = [
  { view: 'downloads', label: '下载', icon: Download },
  { view: 'subs', label: '订阅', icon: Rss },
  { view: 'history', label: '解析记录', icon: History }
]

function NavItem({ view, label, icon: Icon, count }: { view: View; label: string; icon: LucideIcon; count?: number }) {
  const current = useStore((s) => s.view)
  const set = useStore((s) => s.set)
  const on = current === view
  return (
    <button
      type="button"
      onClick={() => set({ view })}
      className={`flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors ${on ? 'bg-black/[.07] text-fg dark:bg-white/10' : 'text-fg/80 hover:bg-black/[.04] dark:hover:bg-white/[.05]'}`}
    >
      <Icon size={17} strokeWidth={STROKE} className={on ? 'text-bili' : 'text-muted'} />
      <span className="flex-1 text-left">{label}</span>
      {count ? (
        <span className="min-w-5 rounded-full bg-bili px-1.5 text-center text-[10px] leading-4 font-semibold text-white tabular-nums">
          {count}
        </span>
      ) : null}
    </button>
  )
}

const UPDATE_ICON: Record<UpdateIcon, LucideIcon> = {
  available: CircleArrowUp,
  loading: Loader2,
  restart: RotateCw,
  error: CircleAlert
}

/** 有新版本时显示在设置上方，点开更新弹窗 */
function UpdateEntry() {
  const u = useStore((s) => s.update)
  const set = useStore((s) => s.set)
  const entry = updateEntry(u)
  if (!entry) return null
  const Icon = UPDATE_ICON[entry.icon]
  const { label } = entry
  return (
    <button
      type="button"
      onClick={() => set({ updateOpen: true })}
      className="flex h-8 w-full items-center gap-2.5 rounded-lg bg-bili/10 px-2.5 text-[13px] font-medium text-bili-dark transition-colors hover:bg-bili/15 dark:text-bili"
    >
      <Icon size={17} strokeWidth={STROKE} className={`shrink-0 ${Icon === Loader2 ? 'animate-spin' : ''}`} />
      <span className="flex-1 truncate text-left tabular-nums">{label}</span>
    </button>
  )
}

function Account() {
  const auth = useStore((s) => s.auth)
  const set = useStore((s) => s.set)

  if (auth === null) {
    return (
      <div className="flex h-11 items-center gap-2 px-2.5 text-xs text-muted">
        <Loader2 size={15} strokeWidth={STROKE} className="animate-spin" />
        检查登录…
      </div>
    )
  }

  if (!auth.loggedIn) {
    return (
      <button
        type="button"
        onClick={() => set({ loginOpen: true })}
        className="flex w-full items-center gap-2.5 rounded-xl border border-line-strong bg-elevated/70 px-2.5 py-2 text-left shadow-xs hover:bg-elevated"
      >
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${auth.expired ? 'bg-amber-500/15 text-amber-600' : 'bg-bili/12 text-bili'}`}
        >
          {auth.expired ? <KeyRound size={15} strokeWidth={STROKE} /> : <LogIn size={15} strokeWidth={STROKE} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">{auth.expired ? '登录已过期' : '登录 B站账号'}</div>
          <div className="truncate text-[11px] text-muted">{auth.expired ? '点这里重新登录' : '解锁 1080P 以上清晰度'}</div>
        </div>
      </button>
    )
  }

  const face = thumb(auth.user.face, 96)
  return (
    <Dropdown
      side="top"
      align="start"
      className="w-[200px]"
      button={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors ${open ? 'bg-black/[.07] dark:bg-white/10' : 'hover:bg-black/[.04] dark:hover:bg-white/[.05]'}`}
        >
          <img src={face} referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded-full ring-1 ring-black/5" alt="" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">{auth.user.uname}</div>
            {auth.user.vipActive ? (
              <Badge tone="brand" className="mt-0.5">
                {auth.user.vipLabel}
              </Badge>
            ) : (
              <div className="text-[11px] text-muted">普通用户</div>
            )}
          </div>
          <ChevronsUpDown size={14} strokeWidth={STROKE} className="shrink-0 text-subtle" />
        </button>
      )}
    >
      {(close) => (
        <MenuItem
          icon={LogOut}
          danger
          onClick={async () => {
            close()
            if (confirm('退出后需要重新导入或登录，确定吗？')) set({ auth: await api.auth.logout() })
          }}
        >
          退出登录
        </MenuItem>
      )}
    </Dropdown>
  )
}

export function Sidebar() {
  const running = useStore((s) => s.tasks.filter((t) => ACTIVE.has(t.status) || t.status === 'queued').length)

  return (
    <aside className="flex w-[216px] shrink-0 flex-col">
      {/* 红绿灯所在的拖拽区 */}
      <div className="drag h-[52px] shrink-0" />
      <div className="drag flex items-center gap-2.5 px-5 pb-5">
        <Logo size={30} className="shrink-0 drop-shadow-sm" />
        <div className="text-[15px] font-semibold tracking-tight">B站下载器</div>
      </div>
      <nav className="flex flex-col gap-0.5 px-3">
        {NAV.map((n) => (
          <NavItem key={n.view} {...n} count={n.view === 'downloads' ? running : undefined} />
        ))}
      </nav>
      <div className="drag flex-1" />
      <div className="flex flex-col gap-2 px-3 pb-3">
        <UpdateEntry />
        <NavItem view="settings" label="设置" icon={Settings} />
        <Account />
      </div>
    </aside>
  )
}
