import {
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
import { t } from '@shared/i18n'
import { thumb } from '../format'
import { useT } from '../i18n'
import { api, useStore, type View } from '../store'
import { updateEntry, type UpdateIcon } from '../viewLogic'
import { Logo } from './Logo'
import { ACTIVE } from './TaskList'
import { Badge, IconButton, STROKE } from './ui'

// 文案在渲染时取，切换语言后跟着变
const nav = (): { view: View; label: string; icon: LucideIcon }[] => [
  { view: 'downloads', label: t('sidebar.downloads'), icon: Download },
  { view: 'subs', label: t('sidebar.subs'), icon: Rss },
  { view: 'history', label: t('sidebar.history'), icon: History }
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
  const t = useT()
  const auth = useStore((s) => s.auth)
  const set = useStore((s) => s.set)

  if (auth === null) {
    return (
      <div className="flex h-11 items-center gap-2 px-2.5 text-xs text-muted">
        <Loader2 size={15} strokeWidth={STROKE} className="animate-spin" />
        {t('sidebar.checkingLogin')}
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
          <div className="text-[13px] font-medium">{auth.expired ? t('sidebar.loginExpired') : t('sidebar.login')}</div>
          <div className="truncate text-[11px] text-muted">{auth.expired ? t('sidebar.reloginHint') : t('sidebar.loginHint')}</div>
        </div>
      </button>
    )
  }

  const face = thumb(auth.user.face, 96)
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5">
      <img src={face} referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded-full ring-1 ring-black/5" alt="" />
      <div className="min-w-0 flex-1">
        {/* 名字太长时截成省略号，悬停看全名 */}
        <div className="truncate text-[13px] font-medium" title={auth.user.uname}>
          {auth.user.uname}
        </div>
        {auth.user.vipActive ? (
          <Badge tone="brand" className="mt-0.5">
            {auth.user.vipLabel}
          </Badge>
        ) : (
          <div className="text-[11px] text-muted">{t('sidebar.normalUser')}</div>
        )}
      </div>
      <IconButton
        icon={LogOut}
        label={t('sidebar.logout')}
        size="sm"
        variant="danger"
        onClick={async () => {
          if (confirm(t('sidebar.logoutConfirm'))) set({ auth: await api.auth.logout() })
        }}
      />
    </div>
  )
}

export function Sidebar() {
  const t = useT()
  const running = useStore((s) => s.tasks.filter((t) => ACTIVE.has(t.status) || t.status === 'queued').length)
  const version = useStore((s) => s.update?.current)

  return (
    <aside className="flex w-[216px] shrink-0 flex-col">
      {/* 红绿灯所在的拖拽区；其他系统用系统标题栏，不需要。系统把拖拽区当标题栏，双击会缩放窗口，所以侧边栏只留这一条 */}
      <div className="drag hidden h-[52px] shrink-0 mac:block" />
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-5 mac:pt-0">
        <Logo size={30} className="shrink-0 drop-shadow-sm" />
        <div>
          <div className="text-[15px] font-semibold tracking-tight">{t('common.appName')}</div>
          {/* 先占好高度，拿到版本号时布局不跳 */}
          <div className="h-4 text-[11px] leading-4 text-muted tabular-nums">{version && `v${version}`}</div>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5 px-3">
        {nav().map((n) => (
          <NavItem key={n.view} {...n} count={n.view === 'downloads' ? running : undefined} />
        ))}
      </nav>
      <div className="flex-1" />
      <div className="flex flex-col gap-2 px-3 pb-3">
        <UpdateEntry />
        <NavItem view="settings" label={t('sidebar.settings')} icon={Settings} />
        {/* 账号单独成块，和上面的导航分开 */}
        <div className="mx-2.5 border-t border-line" />
        <Account />
      </div>
    </aside>
  )
}
