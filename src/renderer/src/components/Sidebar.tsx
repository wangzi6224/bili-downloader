import {
  ChevronUp,
  CircleAlert,
  CircleCheck,
  UserRound,
  UserX,
  CircleArrowUp,
  Download,
  History,
  KeyRound,
  Loader2,
  LogIn,
  RotateCw,
  Rss,
  Settings,
  type LucideIcon
} from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { t } from '@shared/i18n'
import { thumb } from '../format'
import { useT } from '../i18n'
import { SITES } from '@shared/site'
import type { Site } from '@shared/types'
import { currentDyAccount } from '../dyView'
import { siteName } from '../sites'
import { api, openLogin, switchSite, useSite, useStore, type View } from '../store'
import { updateEntry, type UpdateIcon } from '../viewLogic'
import { activeCounts, currentYtAccount } from '../ytView'
import { Logo } from './Logo'
import { QuickAccounts, useAccountActions } from './AccountControls'
import { Badge, Dropdown, MenuItem, STROKE } from './ui'

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

function AccountChevron({ open }: { open: boolean }) {
  return (
    <ChevronUp
      aria-hidden="true"
      size={16}
      strokeWidth={STROKE}
      className={`shrink-0 text-muted transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
    />
  )
}

/** YouTube 主题下的账号卡片：当前 YouTube 账号，点开切换或导入 */
function YtAccountCard() {
  const t = useT()
  const snapshot = useStore((s) => s.ytAccounts)
  const set = useStore((s) => s.set)
  const current = currentYtAccount(snapshot)
  const card = (onClick: () => void, open?: boolean) => (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={current
        ? 'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-hover aria-expanded:bg-hover'
        : 'flex w-full items-center gap-2.5 rounded-xl border border-line-strong bg-elevated/70 px-2.5 py-2 text-left shadow-xs hover:bg-elevated'}
    >
      {current?.avatar ? (
        <img src={current.avatar} referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded-full ring-1 ring-black/5" alt="" />
      ) : (
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${current?.status === 'expired' ? 'bg-amber-500/15 text-amber-600' : 'bg-bili/12 text-bili'}`}>
          {current?.status === 'expired' ? <KeyRound size={15} strokeWidth={STROKE} /> : <LogIn size={15} strokeWidth={STROKE} />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{current ? current.name : t('ytUi.sidebarLogin')}</div>
        <div className="truncate text-[11px] text-muted">
          {current ? (current.status === 'expired' ? t('ytUi.expired') : current.handle ?? 'YouTube') : t('ytUi.sidebarLoginHint')}
        </div>
      </div>
      {open !== undefined && <AccountChevron open={open} />}
    </button>
  )
  if (!snapshot?.accounts.length) return card(() => set({ ytLoginOpen: true }))
  return (
    <Dropdown side="top" align="start" className="w-56" button={({ open, toggle }) => card(toggle, open)}>
      {(close) => (
        <>
          {snapshot.accounts.map((a) => (
            <MenuItem
              key={a.id}
              icon={a.id === snapshot.current ? CircleCheck : UserRound}
              onClick={() => {
                close()
                void api.yt.selectAccount(a.id)
              }}
            >
              {a.name}
            </MenuItem>
          ))}
          <MenuItem icon={UserX} onClick={() => { close(); void api.yt.selectAccount() }}>
            {t('ytUi.useNoAccount')}
          </MenuItem>
          <MenuItem icon={KeyRound} onClick={() => { close(); set({ ytLoginOpen: true }) }}>
            {t('ytUi.addAccount')}
          </MenuItem>
          <MenuItem icon={Settings} onClick={() => { close(); set({ view: 'settings', showAccountSettings: true }) }}>
            {t('accounts.manage')}
          </MenuItem>
        </>
      )}
    </Dropdown>
  )
}

/**
 * 一键切换平台：只换界面，下载和账号都不受影响。
 * 只有文字的分段控件，白色滑块平滑移动；另一边有任务在下载时文字旁边一个小圆点
 */
function SiteSwitch() {
  const t = useT()
  const site = useSite()
  // 选择器不能每次返回新对象，否则 zustand 会认为状态一直在变、反复重渲染
  const tasks = useStore((s) => s.tasks)
  const counts = useMemo(() => activeCounts(tasks), [tasks])
  const options: { value: Site; label: string }[] = SITES.map((value) => ({ value, label: siteName(value, t) }))
  return (
    <div
      role="radiogroup"
      aria-label={t('ytUi.switchSite')}
      className="no-drag relative mx-3 mb-4 grid grid-cols-3 rounded-[9px] bg-black/[.045] p-[3px] dark:bg-white/[.07]"
    >
      <span
        aria-hidden="true"
        style={{ width: `calc((100% - 6px) / ${SITES.length})`, transform: `translateX(${SITES.indexOf(site) * 100}%)` }}
        className="site-thumb pointer-events-none absolute inset-y-[3px] left-[3px] rounded-[7px] bg-elevated shadow-[0_0_0_0.5px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.08)] dark:bg-white/[.14] dark:shadow-none"
      />
      {options.map((o) => {
        const on = site === o.value
        const other = !on && counts[o.value] > 0
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={other ? t('ytUi.otherRunning', { count: counts[o.value] }) : undefined}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              void switchSite(o.value, { x: r.left + r.width / 2, y: r.top + r.height / 2 })
            }}
            className={`relative z-10 flex h-[26px] min-w-0 items-center justify-center px-1 text-xs transition-colors duration-200 ${on ? 'font-medium text-fg' : 'text-muted hover:text-fg'}`}
          >
            <span className="truncate">{o.label}</span>
            {/* 三格很窄：小圆点放在角上，不占文字的位置 */}
            {other && <span aria-label={t('ytUi.otherRunning', { count: counts[o.value] })} className="absolute top-[3px] right-[3px] size-[5px] rounded-full bg-bili" />}
          </button>
        )
      })}
    </div>
  )
}

function Account() {
  const t = useT()
  const auth = useStore((s) => s.auth)
  const hasAccounts = useStore((s) => s.accounts?.accounts.some((account) => account.status !== 'removed'))
  const actions = useAccountActions()

  if (auth === null) {
    return (
      <div className="flex h-11 items-center gap-2 px-2.5 text-xs text-muted">
        <Loader2 size={15} strokeWidth={STROKE} className="animate-spin" />
        {t('sidebar.checkingLogin')}
      </div>
    )
  }

  const card = (onClick: () => void, open?: boolean) => {
    if (!auth.loggedIn) return (
      <button
        type="button"
        onClick={onClick}
        aria-expanded={open}
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
        {open !== undefined && <AccountChevron open={open} />}
      </button>
    )

    return (
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-hover focus-visible:bg-hover aria-expanded:bg-hover"
        aria-expanded={open}
        aria-label={`${t('accounts.manage')} · ${auth.user.uname}`}
        title={t('accounts.manage')}
        onClick={onClick}
      >
        <img src={thumb(auth.user.face, 96)} referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded-full ring-1 ring-black/5" alt="" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium" title={auth.user.uname}>{auth.user.uname}</span>
          {auth.user.vipActive ? (
            <Badge tone="brand" className="mt-0.5">{auth.user.vipLabel}</Badge>
          ) : (
            <span className="block text-[11px] text-muted">{t('sidebar.normalUser')}</span>
          )}
        </span>
        <AccountChevron open={open === true} />
      </button>
    )
  }

  if (!auth.loggedIn && !hasAccounts) return card(() => openLogin())
  return (
    <>
      <Dropdown side="top" align="start" button={({ open, toggle }) => card(toggle, open)}>
        {(close) => <QuickAccounts close={close} actions={actions} />}
      </Dropdown>
      {actions.error && <p role="alert" className="px-2 text-xs text-red-600 dark:text-red-400">{actions.error}</p>}
    </>
  )
}

/** 抖音主题下的账号卡片：当前抖音账号，点开切换或登录 */
function DyAccountCard() {
  const t = useT()
  const snapshot = useStore((s) => s.dyAccounts)
  const set = useStore((s) => s.set)
  const current = currentDyAccount(snapshot)
  const card = (onClick: () => void, open?: boolean) => (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={current
        ? 'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-hover aria-expanded:bg-hover'
        : 'flex w-full items-center gap-2.5 rounded-xl border border-line-strong bg-elevated/70 px-2.5 py-2 text-left shadow-xs hover:bg-elevated'}
    >
      {current?.avatar ? (
        <img src={current.avatar} referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded-full ring-1 ring-black/5" alt="" />
      ) : (
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${current?.status === 'expired' ? 'bg-amber-500/15 text-amber-600' : 'bg-bili/12 text-bili'}`}>
          {current?.status === 'expired' ? <KeyRound size={15} strokeWidth={STROKE} /> : <LogIn size={15} strokeWidth={STROKE} />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{current ? current.name : t('dyUi.sidebarLogin')}</div>
        <div className="truncate text-[11px] text-muted">
          {current ? (current.status === 'expired' ? t('ytUi.expired') : current.handle ?? t('dyUi.siteName')) : t('dyUi.sidebarLoginHint')}
        </div>
      </div>
      {open !== undefined && <AccountChevron open={open} />}
    </button>
  )
  if (!snapshot?.accounts.length) return card(() => set({ dyLoginOpen: true }))
  return (
    <Dropdown side="top" align="start" className="w-56" button={({ open, toggle }) => card(toggle, open)}>
      {(close) => (
        <>
          {snapshot.accounts.map((a) => (
            <MenuItem
              key={a.id}
              icon={a.id === snapshot.current ? CircleCheck : UserRound}
              onClick={() => {
                close()
                void api.dy.selectAccount(a.id)
              }}
            >
              {a.name}
            </MenuItem>
          ))}
          <MenuItem icon={UserX} onClick={() => { close(); void api.dy.selectAccount() }}>
            {t('ytUi.useNoAccount')}
          </MenuItem>
          <MenuItem icon={KeyRound} onClick={() => { close(); set({ dyLoginOpen: true }) }}>
            {t('ytUi.addAccount')}
          </MenuItem>
          <MenuItem icon={Settings} onClick={() => { close(); set({ view: 'settings', showAccountSettings: true }) }}>
            {t('accounts.manage')}
          </MenuItem>
        </>
      )}
    </Dropdown>
  )
}

/** 各平台主题下侧栏底部的账号卡片 */
const ACCOUNT_CARDS: Record<Site, () => ReactNode> = { bili: Account, youtube: YtAccountCard, douyin: DyAccountCard }

export function Sidebar() {
  const t = useT()
  const site = useSite()
  const running = useStore((s) => activeCounts(s.tasks)[site])
  const version = useStore((s) => s.update?.current)
  const AccountCard = ACCOUNT_CARDS[site]

  return (
    <aside className="flex w-[216px] shrink-0 flex-col">
      {/* 红绿灯所在的拖拽区；其他系统用系统标题栏，不需要。系统把拖拽区当标题栏，双击会缩放窗口，所以侧边栏只留这一条 */}
      <div className="drag hidden h-[52px] shrink-0 mac:block" />
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-5 mac:pt-0">
        <Logo size={30} className="shrink-0 drop-shadow-sm" />
        <div>
          <div className="text-[15px] font-semibold tracking-tight">{t('common.appName')}</div>
          {/* 先占好高度，拿到版本号时布局不跳；其他平台的主题下标出来 */}
          <div className="h-4 text-[11px] leading-4 text-muted tabular-nums">
            {site !== 'bili' && <span className="font-medium text-bili-dark dark:text-bili">{siteName(site, t)} · </span>}
            {version && `v${version}`}
          </div>
        </div>
      </div>
      <SiteSwitch />
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
        <AccountCard />
      </div>
    </aside>
  )
}
