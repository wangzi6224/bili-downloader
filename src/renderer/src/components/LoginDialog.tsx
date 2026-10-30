import { useEffect, useState } from 'react'
import { ChevronRight, Cookie, Globe, KeyRound, Loader2, LogIn, QrCode, RefreshCw } from 'lucide-react'
import type { BrowserProfile } from '@shared/types'
import { api, sysText, useStore } from '../store'
import { Badge, Banner, Button, fieldCls, IconButton, Modal, ModalFooter, ModalHeader, STROKE } from './ui'

export function LoginDialog() {
  const auth = useStore((s) => s.auth)
  const set = useStore((s) => s.set)
  const [profiles, setProfiles] = useState<BrowserProfile[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cookieText, setCookieText] = useState('')

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
      if (!s.loggedIn) setError('登录窗口已关闭，但还没有登录成功')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const expired = auth && !auth.loggedIn && auth.expired
  const withLogin = profiles?.filter((p) => p.hasBiliLogin) ?? []
  const blocked = profiles?.filter((p) => p.blocked) ?? []
  const locked = profiles?.filter((p) => p.locked) ?? []
  const withoutLogin = profiles?.filter((p) => !p.hasBiliLogin && !p.blocked && !p.locked) ?? []

  const section = 'flex items-center gap-2 text-[13px] font-medium'

  return (
    <Modal onClose={() => set({ loginOpen: false })} className="max-w-xl">
      <ModalHeader
        icon={expired ? KeyRound : LogIn}
        title={expired ? 'B站登录已过期' : '登录 B站账号'}
        subtitle={
          expired
            ? '需要重新登录后才能继续解析和下载，正在进行的下载会在登录后自动继续。'
            : '用你自己的账号下载，才能拿到 1080P 及以上清晰度和大会员内容。'
        }
        onClose={() => set({ loginOpen: false })}
      />

      <div className="flex max-h-[62vh] flex-col gap-5 overflow-y-auto px-6 pt-5">
        <section>
          <div className={section}>
            <Globe size={15} strokeWidth={STROKE} className="text-muted" />
            从浏览器导入
            <div className="flex-1" />
            <IconButton icon={RefreshCw} label="重新检测" size="sm" onClick={detect} />
          </div>
          <div className="mt-2 flex flex-col gap-1.5">
            {profiles === null && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <Loader2 size={13} className="animate-spin" />
                正在查找浏览器…
              </div>
            )}
            {withLogin.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px] font-medium">
                    {p.browser}
                    <Badge tone="success">已登录 B站</Badge>
                  </div>
                  <div className="truncate text-xs text-muted">{p.profile}</div>
                </div>
                <Button variant="primary" disabled={busy !== null} onClick={() => importFrom(p)}>
                  {busy === p.id && <Loader2 size={14} className="animate-spin" />}
                  {busy === p.id ? '导入中' : '导入'}
                </Button>
              </div>
            ))}
            {blocked.length > 0 &&
              (sysText.isMac ? (
                <Banner
                  tone="warn"
                  actions={<Button size="sm" onClick={() => api.openFullDiskAccessSettings()}>打开系统设置</Button>}
                >
                  macOS 不允许本应用读取 {blocked.map((p) => p.browser).join('、')} 的数据。要从这些浏览器导入，请在“系统设置 →
                  隐私与安全性 → 完全磁盘访问权限”中打开本应用，然后重启本应用。也可以直接用下面的应用内登录。
                </Banner>
              ) : (
                <Banner tone="warn">
                  没有权限读取 {blocked.map((p) => p.browser).join('、')} 的数据（浏览器的配置文件夹不允许当前用户读取）。可以直接用下面的应用内登录。
                </Banner>
              ))}
            {locked.length > 0 && (
              <Banner tone="warn">
                {[...new Set(locked.map((p) => p.browser))].join('、')} 正在运行，读不到它的登录信息。请完全退出浏览器（包括后台运行的）后点“重新检测”。
              </Banner>
            )}
            {profiles && !withLogin.length && !blocked.length && !locked.length && (
              <div className="text-xs leading-relaxed text-muted">
                {profiles.length ? '找到的浏览器里都没有登录 B站' : '没有找到支持的浏览器'}
                （支持 {sysText.browsers}）
              </div>
            )}
            {withoutLogin.length > 0 && withLogin.length > 0 && (
              <div className="text-xs text-subtle">
                未登录 B站：{withoutLogin.map((p) => `${p.browser}（${p.profile}）`).join('、')}
              </div>
            )}
            {withLogin.some((p) => p.browser !== 'Firefox') && (
              <div className="text-xs text-subtle">{sysText.chromiumAuthHint}</div>
            )}
          </div>
        </section>

        <section className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bili/12 text-bili">
            <QrCode size={18} strokeWidth={STROKE} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium">在应用内登录</div>
            <div className="text-xs text-muted">支持扫码、密码、短信登录，登录成功后窗口自动关闭</div>
          </div>
          <Button disabled={busy !== null} onClick={loginInApp}>
            {busy === 'window' && <Loader2 size={14} className="animate-spin" />}
            {busy === 'window' ? '等待登录完成' : '打开登录页'}
          </Button>
        </section>

        <details className="group">
          <summary className={`${section} cursor-pointer list-none rounded-md`}>
            <Cookie size={15} strokeWidth={STROKE} className="text-muted" />
            手动粘贴 Cookie
            <ChevronRight size={14} strokeWidth={STROKE} className="text-subtle transition-transform group-open:rotate-90" />
          </summary>
          <div className="mt-2 text-xs leading-relaxed text-muted">
            粘贴 “SESSDATA=…; bili_jct=…; DedeUserID=…” 这样的内容，或 Cookie-Editor 等插件导出的 JSON。Cookie 等同于登录凭据，只在本机保存。
          </div>
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
            {busy === 'cookie' ? '验证中…' : '用这段 Cookie 登录'}
          </Button>
        </details>

        {error && <Banner tone="error">{error}</Banner>}
      </div>

      <ModalFooter>
        <Button variant="ghost" onClick={() => set({ loginOpen: false })}>
          稍后
        </Button>
      </ModalFooter>
    </Modal>
  )
}
