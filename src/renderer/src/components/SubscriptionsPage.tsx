import { useEffect, useState } from 'react'
import { RefreshCw, Rss, Trash2 } from 'lucide-react'
import type { Subscription } from '@shared/types'
import { api } from '../store'
import { EmptyState, IconButton, PageHeader, Select, Switch } from './ui'

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

export function SubscriptionsPage() {
  const [subs, setSubs] = useState<Subscription[] | null>(null)
  const [checking, setChecking] = useState<string | null>(null)

  useEffect(() => {
    void api.subs.list().then(setSubs)
    return api.subs.onUpdate(setSubs)
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="订阅" subtitle="应用运行期间按间隔检查收藏夹、合集、番剧、UP 主等来源，有新内容就按订阅时的选项自动下载。" />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {subs?.length === 0 && (
          <EmptyState icon={Rss} title="还没有订阅">
            解析收藏夹、合集、番剧或 UP 主空间后，在选择窗口底部点“订阅更新”即可添加。
          </EmptyState>
        )}
        {subs && subs.length > 0 && (
          <div className="divide-y divide-line rounded-xl border border-line bg-surface">
            {subs.map((s) => (
              <div key={s.id} className="group flex items-center gap-4 px-4 py-3">
                <Switch
                  checked={s.enabled}
                  label={s.enabled ? '已启用' : '已停用'}
                  onChange={async (enabled) => setSubs(await api.subs.update(s.id, { enabled }))}
                />
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-[13px] font-medium ${s.enabled ? '' : 'text-muted'}`} title={s.input}>
                    {s.title}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted">
                    {ago(s.lastCheck)}
                    {s.lastNew ? ` · 上次发现 ${s.lastNew} 个新内容` : ''}
                    {s.lastError && <span className="text-red-600 dark:text-red-400"> · {s.lastError}</span>}
                  </div>
                </div>
                <Select
                  value={s.intervalMin}
                  onChange={async (e) => setSubs(await api.subs.update(s.id, { intervalMin: Number(e.target.value) }))}
                >
                  {INTERVALS.map((i) => (
                    <option key={i.min} value={i.min}>
                      每 {i.label}
                    </option>
                  ))}
                </Select>
                <div className="flex gap-0.5">
                  <IconButton
                    icon={RefreshCw}
                    label={checking === s.id ? '检查中…' : '立即检查'}
                    disabled={checking !== null}
                    className={checking === s.id ? '[&>svg]:animate-spin' : ''}
                    onClick={async () => {
                      setChecking(s.id)
                      try {
                        setSubs(await api.subs.check(s.id))
                      } finally {
                        setChecking(null)
                      }
                    }}
                  />
                  <IconButton
                    icon={Trash2}
                    variant="danger"
                    label="取消订阅"
                    onClick={async () => {
                      if (confirm(`取消订阅“${s.title}”？`)) setSubs(await api.subs.remove(s.id))
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
