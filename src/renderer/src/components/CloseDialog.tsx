import { useState } from 'react'
import { AppWindow, LogOut, MonitorDown } from 'lucide-react'
import type { CloseAction } from '@shared/types'
import { api, sysText, useStore } from '../store'
import { unfinishedCount } from '../taskStatus'
import { Banner, Button, Modal, ModalFooter, ModalHeader } from './ui'

export function CloseDialog() {
  const set = useStore((s) => s.set)
  // 退出后进行中、排队、等待登录的任务都会变成已暂停
  const pending = useStore((s) => unfinishedCount(s.tasks))
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
      <ModalHeader
        icon={AppWindow}
        title="关闭窗口"
        subtitle={`后台运行时下载和订阅检查会继续，可以从${sysText.reopenFrom}重新打开窗口。`}
        onClose={() => set({ closeAsk: false })}
      />
      <div className="flex flex-col gap-3 px-6 pt-4">
        {pending > 0 && <Banner tone="warn">还有 {pending} 个任务未完成，完全退出会暂停它们，下次打开后可以继续。</Banner>}
        <label className="flex cursor-pointer items-start gap-2 text-[13px]">
          <input type="checkbox" className="mt-0.5 accent-bili" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>
            记住我的选择，不再询问
            <span className="mt-0.5 block text-xs text-muted">之后可以在“设置 → 常规”里修改</span>
          </span>
        </label>
      </div>
      <ModalFooter>
        <Button variant="ghost" onClick={() => set({ closeAsk: false })}>
          取消
        </Button>
        <Button icon={LogOut} onClick={() => choose('quit')}>
          完全退出
        </Button>
        <Button variant="primary" icon={MonitorDown} autoFocus onClick={() => choose('background')}>
          后台运行
        </Button>
      </ModalFooter>
    </Modal>
  )
}
