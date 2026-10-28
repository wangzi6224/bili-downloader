import { useEffect } from 'react'
import { Header } from './components/Header'
import { LoginDialog } from './components/LoginDialog'
import { SelectionDialog } from './components/SelectionDialog'
import { SettingsPanel } from './components/SettingsPanel'
import { TaskList } from './components/TaskList'
import { UrlInput } from './components/UrlInput'
import { api, useStore } from './store'

export default function App() {
  const s = useStore()

  useEffect(() => {
    const { set } = useStore.getState()
    void api.settings.get().then((settings) => set({ settings }))
    void api.download.list().then((tasks) => set({ tasks: [...tasks] }))
    void api.auth.check().then((auth) => set({ auth }))
    const offs = [
      api.auth.onRequired(() => set({ loginOpen: true })),
      api.auth.onChanged((auth) => set(auth.loggedIn ? { auth, loginOpen: false } : { auth })),
      api.download.onUpdate((tasks) => set({ tasks: [...tasks] }))
    ]
    return () => offs.forEach((off) => off())
  }, [])

  if (!s.settings) return null

  return (
    <div className="flex h-full flex-col">
      <Header />
      <UrlInput />
      <TaskList />
      {s.parse && <SelectionDialog result={s.parse} />}
      {s.settingsOpen && <SettingsPanel />}
      {s.loginOpen && <LoginDialog />}
    </div>
  )
}
