import { useEffect, useState } from 'react'
import { CircleCheck, Cookie, Globe, KeyRound, Loader2, LogIn, RefreshCw, Trash2, UserRound } from 'lucide-react'
import type { BrowserProfile, YtAccount } from '@shared/types'
import { useT } from '../i18n'
import { api, useStore } from '../store'
import { currentYtAccount } from '../ytView'
import { Badge, Banner, Button, fieldCls, Group, IconButton, Modal, ModalFooter, ModalHeader, STROKE } from './ui'

/** 导入 YouTube 登录：从浏览器读取，或手动粘贴 cookie（Google 不允许在应用内嵌的窗口里登录） */
export function YtLoginDialog() {
  const t = useT()
  const set = useStore((s) => s.set)
  const [profiles, setProfiles] = useState<BrowserProfile[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cookieText, setCookieText] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)

  const detect = (): void => {
    setProfiles(null)
    setError(null)
    api.yt
      .listBrowsers()
      .then(setProfiles)
      .catch((e: Error) => {
        setProfiles([])
        setError(e.message)
      })
  }
  useEffect(detect, [])

  const close = (): void => set({ ytLoginOpen: false })
  const run = async (key: string, fn: () => Promise<unknown>): Promise<void> => {
    setBusy(key)
    setError(null)
    try {
      await fn()
      close()
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
      <ModalHeader icon={LogIn} title={t('ytUi.loginTitle')} subtitle={t('ytUi.loginSubtitle')} onClose={close} />
      <div className="flex max-h-[62vh] flex-col gap-5 overflow-y-auto px-6 pt-5">
        <section>
          <div className={section}>
            <Globe size={15} strokeWidth={STROKE} className="text-muted" />
            {t('login.fromBrowser')}
            <div className="flex-1" />
            <IconButton icon={RefreshCw} label={t('login.redetect')} size="sm" onClick={detect} />
          </div>
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
                    <Badge tone="success">{t('ytUi.loggedInYt')}</Badge>
                  </div>
                  <div className="truncate text-xs text-muted">{p.profile}</div>
                </div>
                <Button variant="primary" disabled={busy !== null} onClick={() => void run(p.id, () => api.yt.importBrowser(p.id))}>
                  {busy === p.id && <Loader2 size={14} className="animate-spin" />}
                  {busy === p.id ? t('login.importing') : t('login.import')}
                </Button>
              </div>
            ))}
            {sealed.length > 0 && <Banner tone="warn">{t('ytUi.appBound')}</Banner>}
            {locked.length > 0 && <Banner tone="warn">{t('ytUi.browserLocked', { browser: locked[0].browser })}</Banner>}
            {profiles !== null && !withLogin.length && !sealed.length && (
              <div className="text-xs leading-relaxed text-muted">{t('ytUi.noBrowserLogin')}</div>
            )}
          </div>
          <div className="mt-2 text-xs leading-relaxed text-muted">{t('ytUi.rotationHint')}</div>
        </section>

        <section className="pb-1">
          <button type="button" className={`${section} hover:text-bili-dark dark:hover:text-bili`} onClick={() => setPasteOpen((v) => !v)}>
            <Cookie size={15} strokeWidth={STROKE} className="text-muted" />
            {t('ytUi.pasteCookie')}
          </button>
          {pasteOpen && (
            <div className="mt-2 flex flex-col gap-2">
              <textarea
                value={cookieText}
                onChange={(e) => setCookieText(e.target.value)}
                rows={5}
                placeholder={t('ytUi.pastePlaceholder')}
                aria-label={t('ytUi.pasteCookie')}
                className={`${fieldCls} w-full resize-none p-2.5 font-mono text-xs`}
              />
              <div className="text-xs leading-relaxed text-muted">{t('ytUi.pasteHint')}</div>
              <div>
                <Button variant="primary" disabled={!cookieText.trim() || busy !== null} onClick={() => void run('paste', () => api.yt.importCookie(cookieText))}>
                  {busy === 'paste' && <Loader2 size={14} className="animate-spin" />}
                  {t('ytUi.pasteImport')}
                </Button>
              </div>
            </div>
          )}
        </section>
        {error && <Banner tone="error" onClose={() => setError(null)}>{error}</Banner>}
      </div>
      <ModalFooter>
        <span className="flex-1 text-xs text-muted">{t('ytUi.privacyHint')}</span>
        <Button variant="ghost" onClick={close}>
          {t('input.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

function AccountRow({ account, current }: { account: YtAccount; current: boolean }) {
  const t = useT()
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
        {!current && account.status !== 'expired' && (
          <Button size="sm" disabled={busy !== null} onClick={() => void act('select', () => api.yt.selectAccount(account.id))}>
            {t('ytUi.use')}
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void act('check', () => api.yt.checkAccount(account.id))}>
          {busy === 'check' && <Loader2 size={13} className="animate-spin" />}
          {t('ytUi.check')}
        </Button>
        {confirmRemove ? (
          <>
            <Button size="sm" variant="danger" disabled={busy !== null} onClick={() => void act('remove', () => api.yt.removeAccount(account.id))}>
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

/** 设置 → 账号里的 YouTube 区块（B站的区块不动，两个主题下都显示） */
export function YtAccountSettings() {
  const t = useT()
  const snapshot = useStore((s) => s.ytAccounts)
  const set = useStore((s) => s.set)
  const current = currentYtAccount(snapshot)
  return (
    <Group title={t('ytUi.accountsTitle')}>
      {snapshot?.accounts.length ? (
        <div className="divide-y divide-line">
          {snapshot.accounts.map((a) => (
            <AccountRow key={a.id} account={a} current={a.id === snapshot.current} />
          ))}
        </div>
      ) : (
        <div className="px-4 py-3 text-xs leading-relaxed text-muted">{t('ytUi.noAccounts')}</div>
      )}
      <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
        <Button size="sm" icon={KeyRound} onClick={() => set({ ytLoginOpen: true })}>
          {snapshot?.accounts.length ? t('ytUi.addAccount') : t('ytUi.importLogin')}
        </Button>
        {current && (
          <Button size="sm" variant="ghost" onClick={() => void api.yt.selectAccount()}>
            {t('ytUi.useNoAccount')}
          </Button>
        )}
        <span className="flex-1" />
        <span className="text-xs text-muted">{current ? t('ytUi.downloadingAs', { name: current.name }) : t('ytUi.notLoggedIn')}</span>
      </div>
    </Group>
  )
}
