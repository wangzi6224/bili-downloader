import { useEffect, useState } from 'react'
import { CircleCheck, Cookie, Globe, KeyRound, Loader2, LogIn, QrCode, RefreshCw, Trash2, UserRound } from 'lucide-react'
import type { BrowserProfile, DyAccount } from '@shared/types'
import { currentDyAccount } from '../dyView'
import { useT } from '../i18n'
import { api, useStore } from '../store'
import { Badge, Banner, Button, fieldCls, Group, IconButton, Modal, ModalFooter, ModalHeader, STROKE } from './ui'

/** 登录抖音：扫码（推荐）、从浏览器读取，或手动粘贴 cookie */
export function DyLoginDialog() {
  const t = useT()
  const set = useStore((s) => s.set)
  const [profiles, setProfiles] = useState<BrowserProfile[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cookieText, setCookieText] = useState('')
  const [browserOpen, setBrowserOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)

  const detect = (): void => {
    setProfiles(null)
    setError(null)
    api.dy
      .listBrowsers()
      .then(setProfiles)
      .catch((e: Error) => {
        setProfiles([])
        setError(e.message)
      })
  }
  // 读浏览器要用户展开才开始：macOS 上读取会弹钥匙串授权
  useEffect(() => {
    if (browserOpen) detect()
  }, [browserOpen])

  const close = (): void => set({ dyLoginOpen: false })
  const run = async (key: string, fn: () => Promise<{ accounts: DyAccount[]; current?: string }>, stayIfUnchanged = false): Promise<void> => {
    setBusy(key)
    setError(null)
    try {
      const before = useStore.getState().dyAccounts
      const after = await fn()
      set({ dyAccounts: after })
      // 扫码窗口被直接关掉时账号没变，对话框留着让用户换别的方式
      const changed = !before || JSON.stringify(before) !== JSON.stringify(after)
      if (!stayIfUnchanged || changed) close()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const withLogin = profiles?.filter((p) => p.hasBiliLogin && !p.appBoundLogin && !p.blocked) ?? []
  const sealed = profiles?.filter((p) => p.hasBiliLogin && p.appBoundLogin) ?? []
  const locked = profiles?.filter((p) => p.locked) ?? []
  const section = 'flex items-center gap-2 text-[13px] font-medium'

  return (
    <Modal onClose={close} className="max-w-xl">
      <ModalHeader icon={LogIn} title={t('dyUi.loginTitle')} subtitle={t('dyUi.loginSubtitle')} onClose={close} />
      <div className="flex max-h-[62vh] flex-col gap-5 overflow-y-auto px-6 pt-5">
        <section className="rounded-xl border border-line bg-surface p-3">
          <div className="flex items-center gap-3">
            <QrCode size={28} strokeWidth={STROKE} className="shrink-0 text-bili" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">{t('dyUi.scanTitle')}</div>
              <div className="text-xs leading-relaxed text-muted">{busy === 'scan' ? t('dyUi.scanWaiting') : t('dyUi.scanHint')}</div>
            </div>
            <Button variant="primary" disabled={busy !== null} onClick={() => void run('scan', () => api.dy.login(), true)}>
              {busy === 'scan' && <Loader2 size={14} className="animate-spin" />}
              {t('dyUi.scanButton')}
            </Button>
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2">
            <button type="button" className={`${section} hover:text-bili-dark dark:hover:text-bili`} aria-expanded={browserOpen} onClick={() => setBrowserOpen((v) => !v)}>
              <Globe size={15} strokeWidth={STROKE} className="text-muted" />
              {t('login.fromBrowser')}
            </button>
            <div className="flex-1" />
            {browserOpen && <IconButton icon={RefreshCw} label={t('login.redetect')} size="sm" onClick={detect} />}
          </div>
          {browserOpen && (
            <div className="mt-2 flex flex-col gap-1.5">
              {profiles === null && (
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Loader2 size={13} className="animate-spin" />
                  {t('login.detecting')}
                </div>
              )}
              {withLogin.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[13px] font-medium">
                      {p.browser}
                      <Badge tone="success">{t('dyUi.loggedInDy')}</Badge>
                    </div>
                    <div className="truncate text-xs text-muted">{p.profile}</div>
                  </div>
                  <Button disabled={busy !== null} onClick={() => void run(p.id, () => api.dy.importBrowser(p.id))}>
                    {busy === p.id && <Loader2 size={14} className="animate-spin" />}
                    {busy === p.id ? t('login.importing') : t('login.import')}
                  </Button>
                </div>
              ))}
              {sealed.length > 0 && <Banner tone="warn">{t('dyUi.appBound')}</Banner>}
              {locked.length > 0 && <Banner tone="warn">{t('dyUi.browserLocked', { browser: locked[0].browser })}</Banner>}
              {profiles !== null && !withLogin.length && !sealed.length && <div className="text-xs leading-relaxed text-muted">{t('dyUi.noBrowserLogin')}</div>}
              <div className="text-xs leading-relaxed text-muted">{t('dyUi.importHint')}</div>
            </div>
          )}
        </section>

        <section>
          <button type="button" className={`${section} hover:text-bili-dark dark:hover:text-bili`} aria-expanded={pasteOpen} onClick={() => setPasteOpen((v) => !v)}>
            <Cookie size={15} strokeWidth={STROKE} className="text-muted" />
            {t('dyUi.pasteCookie')}
          </button>
          {pasteOpen && (
            <div className="mt-2 flex flex-col gap-2">
              <textarea
                value={cookieText}
                onChange={(e) => setCookieText(e.target.value)}
                rows={5}
                placeholder={t('dyUi.pastePlaceholder')}
                aria-label={t('dyUi.pasteCookie')}
                className={`${fieldCls} w-full resize-none p-2.5 font-mono text-xs`}
              />
              <div className="text-xs leading-relaxed text-muted">{t('dyUi.pasteHint')}</div>
              <div>
                <Button variant="primary" disabled={!cookieText.trim() || busy !== null} onClick={() => void run('paste', () => api.dy.importCookie(cookieText))}>
                  {busy === 'paste' && <Loader2 size={14} className="animate-spin" />}
                  {t('dyUi.pasteImport')}
                </Button>
              </div>
            </div>
          )}
        </section>
        <div className="pb-1 text-xs leading-relaxed text-amber-700 dark:text-amber-300">{t('dyUi.riskHint')}</div>
        {error && <Banner tone="error" onClose={() => setError(null)}>{error}</Banner>}
      </div>
      <ModalFooter>
        <span className="flex-1 text-xs text-muted">{t('dyUi.privacyHint')}</span>
        <Button variant="ghost" onClick={close}>
          {t('input.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

function AccountRow({ account, current }: { account: DyAccount; current: boolean }) {
  const t = useT()
  const set = useStore((s) => s.set)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const act = async (key: string, fn: () => Promise<unknown>): Promise<void> => {
    setBusy(key)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="flex flex-col gap-1.5 px-4 py-2.5">
      <div className="flex items-center gap-3">
        {account.avatar ? (
          <img src={account.avatar} referrerPolicy="no-referrer" alt="" className="h-8 w-8 shrink-0 rounded-full ring-1 ring-black/5" />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bili/12 text-bili">
            <UserRound size={15} strokeWidth={STROKE} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[13px] font-medium">
            <span className="truncate">{account.name}</span>
            {current && <Badge tone="brand" icon={CircleCheck}>{t('ytUi.current')}</Badge>}
            {account.status === 'expired' && <Badge tone="warn">{t('ytUi.expired')}</Badge>}
          </div>
          {account.handle && <div className="truncate text-xs text-muted">{account.handle}</div>}
        </div>
        {account.status === 'expired' && (
          <Button size="sm" variant="primary" onClick={() => set({ dyLoginOpen: true })}>
            {t('dyUi.relogin')}
          </Button>
        )}
        {!current && account.status !== 'expired' && (
          <Button size="sm" disabled={busy !== null} onClick={() => void act('select', () => api.dy.selectAccount(account.id))}>
            {t('ytUi.use')}
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void act('check', () => api.dy.checkAccount(account.id))}>
          {busy === 'check' && <Loader2 size={13} className="animate-spin" />}
          {t('ytUi.check')}
        </Button>
        {confirmRemove ? (
          <>
            <Button size="sm" variant="danger" disabled={busy !== null} onClick={() => void act('remove', () => api.dy.removeAccount(account.id))}>
              {t('ytUi.confirmRemove')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
              {t('input.cancel')}
            </Button>
          </>
        ) : (
          <IconButton icon={Trash2} size="sm" label={t('ytUi.remove')} onClick={() => setConfirmRemove(true)} />
        )}
      </div>
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

/** 设置 → 账号里的抖音区块（各主题下都显示） */
export function DyAccountSettings() {
  const t = useT()
  const snapshot = useStore((s) => s.dyAccounts)
  const set = useStore((s) => s.set)
  const current = currentDyAccount(snapshot)
  return (
    <Group title={t('dyUi.accountsTitle')}>
      {snapshot?.accounts.length ? (
        <div className="divide-y divide-line">
          {snapshot.accounts.map((a) => (
            <AccountRow key={a.id} account={a} current={a.id === snapshot.current} />
          ))}
        </div>
      ) : (
        <div className="px-4 py-3 text-xs leading-relaxed text-muted">{t('dyUi.noAccounts')}</div>
      )}
      <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
        <Button size="sm" icon={KeyRound} onClick={() => set({ dyLoginOpen: true })}>
          {snapshot?.accounts.length ? t('ytUi.addAccount') : t('dyUi.importLogin')}
        </Button>
        {current && (
          <Button size="sm" variant="ghost" onClick={() => void api.dy.selectAccount()}>
            {t('ytUi.useNoAccount')}
          </Button>
        )}
        <span className="flex-1" />
        <span className="text-xs text-muted">{current ? t('ytUi.downloadingAs', { name: current.name }) : t('dyUi.notLoggedIn')}</span>
      </div>
    </Group>
  )
}
