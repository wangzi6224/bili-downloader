import { useEffect, useState } from 'react'
import { RefreshCw, Rss, Trash2 } from 'lucide-react'
import type { Subscription } from '@shared/types'
import { t } from '@shared/i18n'
import { checkedAgo } from '../format'
import { useT } from '../i18n'
import { api } from '../store'
import { EmptyState, IconButton, PageHeader, Select, Switch } from './ui'

/** 检查间隔的选项。文案在调用时取，切换语言后跟着变 */
export const intervals = (): { min: number; label: string }[] => [
  { min: 30, label: t('subs.interval30m') },
  { min: 60, label: t('subs.interval1h') },
  { min: 180, label: t('subs.interval3h') },
  { min: 360, label: t('subs.interval6h') },
  { min: 720, label: t('subs.interval12h') },
  { min: 1440, label: t('subs.interval1d') }
]

export function SubscriptionsPage() {
  const t = useT()
  const [subs, setSubs] = useState<Subscription[] | null>(null)
  const [checking, setChecking] = useState<string | null>(null)

  useEffect(() => {
    void api.subs.list().then(setSubs)
    return api.subs.onUpdate(setSubs)
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t('subs.title')} subtitle={t('subs.subtitle')} />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {subs?.length === 0 && (
          <EmptyState icon={Rss} title={t('subs.empty')}>
            {t('subs.emptyHint')}
          </EmptyState>
        )}
        {subs && subs.length > 0 && (
          <div className="divide-y divide-line rounded-xl border border-line bg-surface">
            {subs.map((s) => (
              <div key={s.id} className="group flex items-center gap-4 px-4 py-3">
                <Switch
                  checked={s.enabled}
                  label={s.enabled ? t('subs.enabled') : t('subs.disabled')}
                  onChange={async (enabled) => setSubs(await api.subs.update(s.id, { enabled }))}
                />
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-[13px] font-medium ${s.enabled ? '' : 'text-muted'}`} title={s.input}>
                    {s.title}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted">
                    {checkedAgo(s.lastCheck, Date.now())}
                    {s.lastNew ? ` · ${t('subs.lastNew', { count: s.lastNew })}` : ''}
                    {s.lastError && <span className="text-red-600 dark:text-red-400"> · {s.lastError}</span>}
                  </div>
                </div>
                <Select
                  value={s.intervalMin}
                  onChange={async (e) => setSubs(await api.subs.update(s.id, { intervalMin: Number(e.target.value) }))}
                >
                  {intervals().map((i) => (
                    <option key={i.min} value={i.min}>
                      {t('subs.everyInterval', { interval: i.label })}
                    </option>
                  ))}
                </Select>
                <div className="flex gap-0.5">
                  <IconButton
                    icon={RefreshCw}
                    label={checking === s.id ? t('subs.checking') : t('subs.checkNow')}
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
                    label={t('subs.unsubscribe')}
                    onClick={async () => {
                      if (confirm(t('subs.unsubscribeConfirm', { title: s.title }))) setSubs(await api.subs.remove(s.id))
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
