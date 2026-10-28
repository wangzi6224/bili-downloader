import { useEffect, useState } from 'react'
import type { BrowserProfile } from '@shared/types'
import { api, useStore } from '../store'
import { Button, Modal } from './Modal'

export function LoginDialog() {
  const auth = useStore((s) => s.auth)
  const set = useStore((s) => s.set)
  const [profiles, setProfiles] = useState<BrowserProfile[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
  const withoutLogin = profiles?.filter((p) => !p.hasBiliLogin && !p.blocked) ?? []

  return (
    <Modal onClose={() => set({ loginOpen: false })}>
      <div className="p-6">
        <div className="text-lg font-semibold">{expired ? 'B站登录已过期' : '登录 B站账号'}</div>
        <div className="mt-1 text-sm text-neutral-500">
          {expired
            ? '需要重新登录后才能继续解析和下载，正在进行的下载会在登录后自动继续。'
            : '用你自己的账号下载，才能拿到 1080P 及以上清晰度和大会员内容。'}
        </div>

        <div className="mt-5 text-sm font-medium">从浏览器导入</div>
        <div className="mt-2 flex flex-col gap-1.5">
          {profiles === null && <div className="text-xs text-neutral-500">正在查找浏览器…</div>}
          {withLogin.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-700">
              <span className="text-sm">{p.browser}</span>
              <span className="text-xs text-neutral-500">{p.profile}</span>
              <span className="text-xs text-green-600">已登录 B站</span>
              <div className="flex-1" />
              <Button variant="primary" disabled={busy !== null} onClick={() => importFrom(p)}>
                {busy === p.id ? '导入中…' : '导入'}
              </Button>
            </div>
          ))}
          {blocked.length > 0 && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <div>
                macOS 不允许本应用读取 {blocked.map((p) => p.browser).join('、')} 的数据。要从这些浏览器导入，请在“系统设置 →
                隐私与安全性 → 完全磁盘访问权限”中打开本应用，然后重启本应用。也可以直接用下面的应用内登录。
              </div>
              <div className="mt-2 flex gap-2">
                <Button onClick={() => api.openFullDiskAccessSettings()}>打开系统设置</Button>
                <Button variant="ghost" onClick={detect}>
                  重新检测
                </Button>
              </div>
            </div>
          )}
          {profiles && !withLogin.length && !blocked.length && (
            <div className="text-xs text-neutral-500">
              {profiles.length ? '找到的浏览器里都没有登录 B站' : '没有找到支持的浏览器'}
              （支持 Chrome、Edge、Brave、Arc、Vivaldi、Chromium、Firefox；Safari 暂不支持）
            </div>
          )}
          {withoutLogin.length > 0 && withLogin.length > 0 && (
            <div className="text-xs text-neutral-400">
              未登录 B站：{withoutLogin.map((p) => `${p.browser}（${p.profile}）`).join('、')}
            </div>
          )}
          {withLogin.some((p) => p.browser !== 'Firefox') && (
            <div className="text-xs text-neutral-400">导入 Chrome 系浏览器时 macOS 会弹出钥匙串授权，请点“允许”。</div>
          )}
        </div>

        <div className="mt-5 text-sm font-medium">在应用内登录</div>
        <div className="mt-2 flex items-center gap-3">
          <Button disabled={busy !== null} onClick={loginInApp}>
            {busy === 'window' ? '等待登录完成…' : '打开 B站登录页'}
          </Button>
          <span className="text-xs text-neutral-500">支持扫码、密码、短信登录，登录成功后窗口自动关闭</span>
        </div>

        {error && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/50">{error}</div>}

        <div className="mt-6 flex justify-end">
          <Button variant="ghost" onClick={() => set({ loginOpen: false })}>
            稍后
          </Button>
        </div>
      </div>
    </Modal>
  )
}
