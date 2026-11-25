import { useEffect } from 'react'
import { CloseDialog } from './components/CloseDialog'
import { HistoryPage } from './components/HistoryPage'
import { LoginDialog } from './components/LoginDialog'
import { SelectionDialog } from './components/SelectionDialog'
import { SettingsPage } from './components/SettingsPage'
import { Sidebar } from './components/Sidebar'
import { SubscriptionsPage } from './components/SubscriptionsPage'
import { TaskList } from './components/TaskList'
import { UpdateDialog } from './components/UpdateDialog'
import { UrlInput } from './components/UrlInput'
import { YtLoginDialog } from './components/YtAccounts'
import { YtSelectionDialog } from './components/YtSelectionDialog'
import { YtUrlInput } from './components/YtUrlInput'
import { applyLanguage } from './i18n'
import { isSettingsShortcut, isSiteShortcut } from './platform'
import { resultId } from './selection'
import { api, openLogin, switchSite, updateAccounts, updateAuth, useStore } from './store'

export default function App() {
  const s = useStore()

  useEffect(() => {
    const { set } = useStore.getState()
    void api.settings.get().then((settings) => set({ settings }))
    void api.i18n.get().then(applyLanguage)
    void api.download.list().then((tasks) => set({ tasks: [...tasks] }))
    void api.auth.check().then((auth) => {
      if (useStore.getState().auth === null) updateAuth(auth)
    })
    void api.auth.accounts().then((accounts) => {
      if (useStore.getState().accounts === null) updateAccounts(accounts)
    })
    void api.update.state().then((update) => set({ update }))
    void api.yt.accounts().then((ytAccounts) => set({ ytAccounts }))
    void api.yt.engine.status().then((ytEngine) => set({ ytEngine }))
    const offs = [
      api.yt.onAccountsChanged((ytAccounts) => set({ ytAccounts })),
      api.yt.engine.onStatus((ytEngine) => set({ ytEngine })),
      api.auth.onRequired(openLogin),
      api.auth.onChanged(updateAuth),
      api.auth.onAccountsChanged(updateAccounts),
      api.download.onUpdate((tasks) => set({ tasks: [...tasks] })),
      // MCP 改了设置时同步过来，免得界面之后用旧值写回去
      api.settings.onChanged((settings) => set({ settings })),
      api.i18n.onChanged(applyLanguage),
      api.app.onCloseRequested(() => set({ closeAsk: true })),
      api.app.onOpenSettings(() => set({ view: 'settings' })),
      api.update.onState((update) => set({ update })),
      api.update.onPrompt(() => set({ updateOpen: true }))
    ]
    // ⌘, / Ctrl+, 打开设置，和系统上的其他应用一致
    const onKey = (e: KeyboardEvent): void => {
      if (isSettingsShortcut(e, api.platform)) {
        e.preventDefault()
        set({ view: 'settings' })
      } else if (isSiteShortcut(e, api.platform)) {
        // ⌘⇧Y / Ctrl+Shift+Y 在 B站和 YouTube 之间切换
        e.preventDefault()
        const current = useStore.getState().settings?.uiSite ?? 'bili'
        void switchSite(current === 'bili' ? 'youtube' : 'bili')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      offs.forEach((off) => off())
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const site = s.settings?.uiSite ?? 'bili'
  // 平台主题：配色由 <html data-brand> 切换（index.css），组件不用管
  useEffect(() => {
    document.documentElement.dataset.brand = site
  }, [site])
  // 第一次切到 YouTube 时自动准备组件（下载 yt-dlp），进度显示在输入框下面
  const engineMissing = s.ytEngine?.state === 'missing'
  useEffect(() => {
    if (site === 'youtube' && engineMissing) void api.yt.engine.prepare().catch(() => undefined)
  }, [site, engineMissing])

  // 设置和语言都拿到了才渲染，免得先闪一下别的语言
  if (!s.settings || !s.lang) return null

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col border-l border-black/10 bg-canvas dark:border-black/40">
        {/* 下载页一直挂着：切到别的页面再回来，输入框内容和剪贴板检测都还在 */}
        <div className={s.view === 'downloads' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
          {/* 两个平台的输入框都一直挂着，切换后输入的内容、剪贴板检测都还在 */}
          <div className={site === 'bili' ? 'contents' : 'hidden'}>
            <UrlInput />
          </div>
          <div className={site === 'youtube' ? 'contents' : 'hidden'}>
            <YtUrlInput />
          </div>
          <TaskList />
        </div>
        {s.view === 'subs' && <SubscriptionsPage />}
        {s.view === 'history' && <HistoryPage />}
        {s.view === 'settings' && <SettingsPage />}
      </main>
      {site === 'bili' && s.parse && <SelectionDialog key={resultId(s.parse)} result={s.parse} fromSource={s.source !== null} />}
      {site === 'youtube' && s.ytParse && <YtSelectionDialog key={resultId(s.ytParse)} result={s.ytParse} />}
      {s.loginOpen && <LoginDialog />}
      {s.ytLoginOpen && <YtLoginDialog />}
      {s.closeAsk && <CloseDialog />}
      {/* 不打断正在进行的登录、选择和关闭询问，等它们结束再弹 */}
      {s.updateOpen && !s.parse && !s.ytParse && !s.loginOpen && !s.ytLoginOpen && !s.closeAsk && <UpdateDialog />}
    </div>
  )
}
