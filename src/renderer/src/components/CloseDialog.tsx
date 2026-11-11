import { useState } from 'react'
import { AppWindow, LogOut, MonitorDown } from 'lucide-react'
import type { CloseAction } from '@shared/types'
import { useT } from '../i18n'
import { api, sysText, useStore } from '../store'
import { unfinishedCount } from '../taskStatus'
import { Banner, Button, Modal, ModalFooter, ModalHeader } from './ui'

export function CloseDialog() {
  const t = useT()
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
        title={t('closeDialog.title')}
        subtitle={t('closeDialog.subtitle', { reopenFrom: sysText.reopenFrom })}
        onClose={() => set({ closeAsk: false })}
      />
      <div className="flex flex-col gap-3 px-6 pt-4">
        {pending > 0 && <Banner tone="warn">{t('closeDialog.pendingTasks', { count: pending })}</Banner>}
        <label className="flex cursor-pointer items-start gap-2 text-[13px]">
          <input type="checkbox" className="mt-0.5 accent-bili" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>
            {t('closeDialog.remember')}
            <span className="mt-0.5 block text-xs text-muted">{t('closeDialog.rememberHint')}</span>
          </span>
        </label>
      </div>
      <ModalFooter>
        <Button variant="ghost" onClick={() => set({ closeAsk: false })}>
          {t('closeDialog.cancel')}
        </Button>
        <Button icon={LogOut} onClick={() => choose('quit')}>
          {t('closeDialog.quit')}
        </Button>
        <Button variant="primary" icon={MonitorDown} autoFocus onClick={() => choose('background')}>
          {t('closeDialog.background')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
