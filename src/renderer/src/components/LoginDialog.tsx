import { useEffect, useState } from 'react'
import { ChevronRight, Cookie, Globe, KeyRound, Loader2, LogIn, QrCode, RefreshCw } from 'lucide-react'
import type { BrowserProfile } from '@shared/types'
import { joinList } from '@shared/i18n'
import { useT } from '../i18n'
import { api, sysText, useStore } from '../store'
import { Badge, Banner, Button, fieldCls, IconButton, Modal, ModalFooter, ModalHeader, STROKE } from './ui'

export function LoginDialog() {
  const t = useT()
  const auth = useStore((s) => s.auth)
  const set = useStore((s) => s.set)
  const [profiles, setProfiles] = useState<BrowserProfile[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cookieText, setCookieText] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)

  const detect = (): void => {
    setProfiles(null)
    api.auth
      .listBrowsers()
      .then(setProfiles)
      .catch((e: Error) => {
        setProfiles([])
        setError(e.message)
      })
  }
  useEffect(detect, [])

  const done = (state: Awaited<ReturnType<typeof api.auth.check>>): void => {
    set({ auth: state })
    if (state.loggedIn) set({ loginOpen: false, error: null })
  }

  const importFrom = async (p: BrowserProfile): Promise<void> => {
    setBusy(p.id)
    setError(null)
    try {
      done(await api.auth.importFromBrowser(p.id))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const loginInApp = async (): Promise<void> => {
    setBusy('window')
    setError(null)
    try {
      const s = await api.auth.openLoginWindow()
      done(s)
      if (!s.loggedIn) setError(t('login.windowClosedNotLoggedIn'))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const expired = auth && !auth.loggedIn && auth.expired
  const withLogin = profiles?.filter((p) => p.hasBiliLogin && !p.appBoundLogin) ?? []
  // Windows 上新版 Chrome、Edge 的登录只有浏览器自己读得出：提前标出来，不让用户点了才失败
  const sealed = profiles?.filter((p) => p.hasBiliLogin && p.appBoundLogin) ?? []
  // Safari 没有完全磁盘访问权限时总是读不了，已经有别的浏览器可以导入就不用提醒
  const blocked = profiles?.filter((p) => p.blocked && (p.browser !== 'Safari' || !withLogin.length)) ?? []
  const locked = profiles?.filter((p) => p.locked) ?? []
  const withoutLogin = profiles?.filter((p) => !p.hasBiliLogin && !p.blocked && !p.locked) ?? []

  const section = 'flex items-center gap-2 text-[13px] font-medium'

  return (
    <Modal onClose={() => set({ loginOpen: false })} className="max-w-xl">
      <ModalHeader
        icon={expired ? KeyRound : LogIn}
        title={expired ? t('login.expiredTitle') : t('login.title')}
        subtitle={
          expired ? t('login.expiredSubtitle') : t('login.subtitle')
        }
        onClose={() => set({ loginOpen: false })}
      />

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
                    <Badge tone="success">{t('login.loggedIn')}</Badge>
                  </div>
                  <div className="truncate text-xs text-muted">{p.profile}</div>
                </div>
                <Button variant="primary" disabled={busy !== null} onClick={() => importFrom(p)}>
                  {busy === p.id && <Loader2 size={14} className="animate-spin" />}
                  {busy === p.id ? t('login.importing') : t('login.import')}
                </Button>
              </div>
            ))}
            {sealed.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px] font-medium">
                    {p.browser}
                    <Badge tone="success">{t('login.loggedIn')}</Badge>
                    <Badge tone="warn">{t('login.cannotImport')}</Badge>
                  </div>
                  <div className="truncate text-xs text-muted">{p.profile}</div>
                </div>
              </div>
            ))}
            {sealed.length > 0 && (
              <Banner
                tone="warn"
                actions={
                  <>
                    <Button size="sm" variant="primary" disabled={busy !== null} onClick={loginInApp}>
                      {t('login.scanToLogin')}
                    </Button>
                    <Button size="sm" onClick={() => setPasteOpen(true)}>
                      {t('login.pasteManually')}
                    </Button>
                  </>
                }
              >
                {t('login.appBoundBanner', { browsers: joinList([...new Set(sealed.map((p) => p.browser))]) })}
              </Banner>
            )}
            {blocked.length > 0 &&
              (sysText.isMac ? (
                <Banner
                  tone="warn"
                  actions={<Button size="sm" onClick={() => api.openFullDiskAccessSettings()}>{t('login.openSystemSettings')}</Button>}
                >
                  {t('login.macBlocked', { browsers: joinList(blocked.map((p) => p.browser)) })}
                </Banner>
              ) : (
                <Banner tone="warn">
                  {t('login.blocked', { browsers: joinList(blocked.map((p) => p.browser)) })}
                </Banner>
              ))}
            {locked.length > 0 && (
              <Banner tone="warn">
                {t('login.locked', { browsers: joinList([...new Set(locked.map((p) => p.browser))]) })}
                {locked.some((p) => p.appBound) && ` ${t('login.lockedAppBound')}`}
              </Banner>
            )}
            {profiles && !withLogin.length && !sealed.length && !blocked.length && !locked.length && (
              <div className="text-xs leading-relaxed text-muted">
                {profiles.length ? t('login.noBrowserLoggedIn') : t('login.noBrowserFound')}
                {t('login.supported', { browsers: sysText.browsers })}
              </div>
            )}
            {withoutLogin.length > 0 && withLogin.length > 0 && (
              <div className="text-xs text-subtle">
                {t('login.notLoggedInList', {
                  list: joinList(withoutLogin.map((p) => t('login.profileLabel', { browser: p.browser, profile: p.profile })))
                })}
              </div>
            )}
            {withLogin.some((p) => p.browser !== 'Firefox' && p.browser !== 'Safari') && (
              <div className="text-xs text-subtle">{sysText.chromiumAuthHint}</div>
            )}
          </div>
        </section>

        <section className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bili/12 text-bili">
            <QrCode size={18} strokeWidth={STROKE} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium">{t('login.inApp')}</div>
            <div className="text-xs text-muted">{t('login.inAppHint')}</div>
          </div>
          <Button disabled={busy !== null} onClick={loginInApp}>
            {busy === 'window' && <Loader2 size={14} className="animate-spin" />}
            {busy === 'window' ? t('login.waitingLogin') : t('login.openLoginPage')}
          </Button>
        </section>

        <details className="group" open={pasteOpen} onToggle={(e) => setPasteOpen(e.currentTarget.open)}>
          <summary className={`${section} cursor-pointer list-none rounded-md`}>
            <Cookie size={15} strokeWidth={STROKE} className="text-muted" />
            {t('login.pasteCookie')}
            <ChevronRight size={14} strokeWidth={STROKE} className="text-subtle transition-transform group-open:rotate-90" />
          </summary>
          <div className="mt-2 text-xs leading-relaxed text-muted">
            {t('login.pasteHint')}
          </div>
          <ol className="mt-1.5 list-decimal pl-5 text-xs leading-relaxed text-muted">
            <li>{t('login.pasteStep1')}</li>
            <li>{t('login.pasteStep2')}</li>
            <li>{t('login.pasteStep3')}</li>
          </ol>
          <textarea
            value={cookieText}
            onChange={(e) => setCookieText(e.target.value)}
            rows={3}
            className={`${fieldCls} mt-2 w-full resize-none p-2.5 font-mono text-xs`}
          />
          <Button
            className="mt-2"
            disabled={busy !== null || !cookieText.trim()}
            onClick={async () => {
              setBusy('cookie')
              setError(null)
              try {
                done(await api.auth.importCookie(cookieText))
                setCookieText('')
              } catch (e) {
                setError((e as Error).message)
              } finally {
                setBusy(null)
              }
            }}
          >
            {busy === 'cookie' ? t('login.verifying') : t('login.loginWithCookie')}
          </Button>
        </details>

        {error && <Banner tone="error">{error}</Banner>}
      </div>

      <ModalFooter>
        <Button variant="ghost" onClick={() => set({ loginOpen: false })}>
          {t('common.later')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
