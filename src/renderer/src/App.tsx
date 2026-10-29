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
import { isSettingsShortcut } from './platform'
import { api, useStore } from './store'

export default function App() {
  const s = useStore()

  useEffect(() => {
    const { set } = useStore.getState()
    void api.settings.get().then((settings) => set({ settings }))
    void api.download.list().then((tasks) => set({ tasks: [...tasks] }))
    void api.auth.check().then((auth) => set({ auth }))
    void api.update.state().then((update) => set({ update }))
    const offs = [
      api.auth.onRequired(() => set({ loginOpen: true })),
      api.auth.onChanged((auth) => set(auth.loggedIn ? { auth, loginOpen: false } : { auth })),
      api.download.onUpdate((tasks) => set({ tasks: [...tasks] })),
      api.app.onCloseRequested(() => set({ closeAsk: true })),
      api.update.onState((update) => set({ update })),
      api.update.onPrompt(() => set({ updateOpen: true }))
    ]
    // ⌘, / Ctrl+, 打开设置，和系统上的其他应用一致
    const onKey = (e: KeyboardEvent): void => {
      if (isSettingsShortcut(e, api.platform)) {
        e.preventDefault()
        set({ view: 'settings' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      offs.forEach((off) => off())
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  if (!s.settings) return null

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col border-l border-black/10 bg-canvas dark:border-black/40">
        {/* 下载页一直挂着：切到别的页面再回来，输入框内容和剪贴板检测都还在 */}
        <div className={s.view === 'downloads' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
          <UrlInput />
          <TaskList />
        </div>
        {s.view === 'subs' && <SubscriptionsPage />}
        {s.view === 'history' && <HistoryPage />}
        {s.view === 'settings' && <SettingsPage />}
      </main>
      {s.parse && <SelectionDialog result={s.parse} />}
      {s.loginOpen && <LoginDialog />}
      {s.closeAsk && <CloseDialog />}
      {/* 不打断正在进行的登录、选择和关闭询问，等它们结束再弹 */}
      {s.updateOpen && !s.parse && !s.loginOpen && !s.closeAsk && <UpdateDialog />}
    </div>
  )
}
