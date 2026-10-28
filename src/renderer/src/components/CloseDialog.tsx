import { useState } from 'react'
import type { CloseAction } from '@shared/types'
import { api, useStore } from '../store'
import { Button, Modal } from './Modal'
import { ACTIVE } from './TaskList'

export function CloseDialog() {
  const set = useStore((s) => s.set)
  // 退出后进行中、排队、等待登录的任务都会变成已暂停
  const pending = useStore((s) => s.tasks.filter((t) => ACTIVE.has(t.status) || t.status === 'queued' || t.status === 'waitingAuth').length)
  const [remember, setRemember] = useState(false)

  const choose = async (action: Exclude<CloseAction, 'ask'>): Promise<void> => {
    set({ closeAsk: false })
    try {
      await api.app.close(action, remember)
      if (remember) set({ settings: await api.settings.get() })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  }

  return (
    <Modal onClose={() => set({ closeAsk: false })} className="max-w-md">
      <div className="p-6">
        <div className="text-lg font-semibold">关闭窗口</div>
        <div className="mt-1 text-sm text-neutral-500">后台运行时下载和订阅检查会继续，点程序坞图标可以重新打开窗口。</div>
        {pending > 0 && (
          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            还有 {pending} 个任务未完成，完全退出会暂停它们，下次打开后可以继续。
          </div>
        )}
        <label className="mt-4 flex items-center gap-1.5 text-sm">
          <input type="checkbox" className="accent-bili" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          记住我的选择，不再询问
        </label>
        <div className="mt-1 pl-5 text-xs text-neutral-500">之后可以在“设置 → 常规”里修改</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => set({ closeAsk: false })}>
            取消
          </Button>
          <Button onClick={() => choose('quit')}>完全退出</Button>
          <Button variant="primary" autoFocus onClick={() => choose('background')}>
            后台运行
          </Button>
        </div>
      </div>
    </Modal>
  )
}
