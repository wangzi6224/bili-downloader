import { useEffect, useMemo, useState } from 'react'
import { History, Search, Trash2, X } from 'lucide-react'
import type { ParseRecord } from '@shared/types'
import { ago, thumb } from '../format'
import { useT } from '../i18n'
import { api, parseLink, useStore } from '../store'
import { Badge, Button, EmptyState, IconButton, Input, PageHeader } from './ui'

/** 解析记录：方便下次接着下合集里剩下的集 */
export function HistoryPage() {
  const t = useT()
  const set = useStore((s) => s.set)
  const [records, setRecords] = useState<ParseRecord[] | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    void api.history.parses().then(setRecords)
  }, [])

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase()
    const all = records ?? []
    return k ? all.filter((r) => r.title.toLowerCase().includes(k) || r.input.toLowerCase().includes(k)) : all
  }, [records, q])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={t('history.title')}
        subtitle={t('history.subtitle')}
        actions={
          records?.length ? (
            <>
              <Input icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('history.search')} className="w-52" />
              <Button
                icon={Trash2}
                variant="ghost"
                onClick={async () => {
                  if (!confirm(t('history.clearConfirm'))) return
                  await api.history.clearParses()
                  setRecords([])
                }}
              >
                {t('history.clear')}
              </Button>
            </>
          ) : null
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {records?.length === 0 && (
          <EmptyState icon={History} title={t('history.empty')}>
            {t('history.emptyHint')}
          </EmptyState>
        )}
        {records && records.length > 0 && shown.length === 0 && <EmptyState icon={Search} title={t('history.noMatch')} />}
        {shown.map((r) => (
          <div
            key={r.input}
            role="button"
            tabIndex={0}
            onClick={() => {
              set({ view: 'downloads' })
              void parseLink(r.input)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                set({ view: 'downloads' })
                void parseLink(r.input)
              }
            }}
            className="group flex cursor-pointer items-center gap-4 rounded-xl px-3 py-2.5 transition-colors outline-none hover:bg-hover focus-visible:bg-hover"
          >
            <div className="h-[54px] w-24 shrink-0 overflow-hidden rounded-lg bg-track ring-1 ring-line">
              {r.cover && <img src={thumb(r.cover, 192)} referrerPolicy="no-referrer" className="h-full w-full object-cover" alt="" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{r.title}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                <Badge>{r.kind === 'pgc' ? t('history.kindPgc') : t('history.kindVideo')}</Badge>
                <span className="tabular-nums">{t('history.itemCount', { count: r.count })}</span>
                <span>·</span>
                <span>{ago(r.at, Date.now())}</span>
              </div>
              <div className="mt-0.5 truncate text-[11px] text-subtle">{r.input}</div>
            </div>
            <IconButton
              icon={X}
              variant="danger"
              label={t('history.remove')}
              className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              onClick={async (e) => {
                e.stopPropagation()
                setRecords(await api.history.removeParse(r.input))
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
