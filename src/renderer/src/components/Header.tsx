import { api, useStore } from '../store'
import { Button } from './Modal'

export function Header() {
  const auth = useStore((s) => s.auth)
  const set = useStore((s) => s.set)

  return (
    <header className="drag flex h-14 shrink-0 items-center gap-3 border-b border-neutral-200 pr-4 pl-20 dark:border-neutral-800">
      <span className="text-base font-semibold text-bili">B站下载器</span>
      <div className="flex-1" />
      <div className="no-drag flex items-center gap-2">
        {auth?.loggedIn ? (
          <>
            <img
              src={auth.user.face.replace(/^http:/, 'https:') + '@64w.webp'}
              referrerPolicy="no-referrer"
              className="h-7 w-7 rounded-full"
              alt=""
            />
            <span className="text-sm">{auth.user.uname}</span>
            {auth.user.vipActive && (
              <span className="rounded bg-bili px-1.5 py-0.5 text-[10px] font-medium text-white">
                {auth.user.vipLabel}
              </span>
            )}
            <Button
              variant="ghost"
              onClick={async () => {
                if (confirm('退出后需要重新导入或登录，确定吗？')) set({ auth: await api.auth.logout() })
              }}
            >
              退出
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={() => set({ loginOpen: true })}>
            {auth === null ? '检查登录…' : auth.expired ? '登录已过期，重新登录' : '登录'}
          </Button>
        )}
        <Button variant="ghost" onClick={() => set({ settingsOpen: true })}>
          设置
        </Button>
      </div>
    </header>
  )
}
