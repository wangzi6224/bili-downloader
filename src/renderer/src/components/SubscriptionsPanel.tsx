import { useEffect, useState } from 'react'
import type { Subscription } from '@shared/types'
import { api, useStore } from '../store'
import { Button, Modal } from './Modal'

export const INTERVALS = [
  { min: 30, label: '30 分钟' },
  { min: 60, label: '1 小时' },
  { min: 180, label: '3 小时' },
  { min: 360, label: '6 小时' },
  { min: 720, label: '12 小时' },
  { min: 1440, label: '每天' }
]

function ago(ms?: number): string {
  if (!ms) return '还没检查过'
  const s = (Date.now() - ms) / 1000
  if (s < 60) return '刚刚检查'
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前检查`
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前检查`
  return `${Math.floor(s / 86400)} 天前检查`
}

export function SubscriptionsPanel() {
  const set = useStore((s) => s.set)
  const [subs, setSubs] = useState<Subscription[] | null>(null)
  const [checking, setChecking] = useState<string | null>(null)

  useEffect(() => {
    void api.subs.list().then(setSubs)
    return api.subs.onUpdate(setSubs)
  }, [])

  return (
    <Modal onClose={() => set({ subsOpen: false })} className="flex max-h-[80vh] max-w-2xl flex-col">
      <div className="px-6 pt-5">
        <div className="text-lg font-semibold">订阅</div>
        <div className="mt-1 text-xs text-neutral-500">
          应用运行期间按间隔检查收藏夹、合集、番剧、UP 主等来源，有新内容就按订阅时的选项自动下载。
          在解析结果里点“订阅更新”即可添加。
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
        {subs?.length === 0 && <div className="py-10 text-center text-sm text-neutral-400">还没有订阅</div>}
        {subs?.map((s) => (
          <div key={s.id} className="flex items-center gap-3 border-b border-neutral-100 py-3 dark:border-neutral-800">
            <input
              type="checkbox"
              className="accent-bili"
              title="启用"
              checked={s.enabled}
              onChange={async (e) => setSubs(await api.subs.update(s.id, { enabled: e.target.checked }))}
            />
            <div className="min-w-0 flex-1">
              <div className={`truncate text-sm ${s.enabled ? '' : 'text-neutral-400'}`} title={s.input}>
                {s.title}
              </div>
              <div className="truncate text-xs text-neutral-500">
                {ago(s.lastCheck)}
                {s.lastNew ? ` · 上次发现 ${s.lastNew} 个新内容` : ''}
                {s.lastError && <span className="text-red-600"> · {s.lastError}</span>}
              </div>
            </div>
            <select
              value={s.intervalMin}
              onChange={async (e) => setSubs(await api.subs.update(s.id, { intervalMin: Number(e.target.value) }))}
              className="rounded-md border border-neutral-300 bg-white px-1.5 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
            >
              {INTERVALS.map((i) => (
                <option key={i.min} value={i.min}>
                  每 {i.label}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              disabled={checking !== null}
              onClick={async () => {
                setChecking(s.id)
                try {
                  setSubs(await api.subs.check(s.id))
                } finally {
                  setChecking(null)
                }
              }}
            >
              {checking === s.id ? '检查中…' : '立即检查'}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (confirm(`取消订阅“${s.title}”？`)) setSubs(await api.subs.remove(s.id))
              }}
            >
              删除
            </Button>
          </div>
        ))}
      </div>
      <div className="flex justify-end border-t border-neutral-100 px-6 py-4 dark:border-neutral-800">
        <Button variant="primary" onClick={() => set({ subsOpen: false })}>
          完成
        </Button>
      </div>
    </Modal>
  )
}
