import { useEffect, useMemo, useState } from 'react'
import { History, Search, Trash2, X } from 'lucide-react'
import type { ParseRecord } from '@shared/types'
import { ago, thumb } from '../format'
import { api, parseLink, useStore } from '../store'
import { Badge, Button, EmptyState, IconButton, Input, PageHeader } from './ui'

/** 解析记录：方便下次接着下合集里剩下的集 */
export function HistoryPage() {
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
        title="解析记录"
        subtitle="解析过的链接都在这里，点一下重新打开选择窗口，接着下载剩下的集。"
        actions={
          records?.length ? (
            <>
              <Input icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索标题或链接" className="w-52" />
              <Button
                icon={Trash2}
                variant="ghost"
                onClick={async () => {
                  if (!confirm('清空全部解析记录？')) return
                  await api.history.clearParses()
                  setRecords([])
                }}
              >
                清空
              </Button>
            </>
          ) : null
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {records?.length === 0 && (
          <EmptyState icon={History} title="还没有解析记录">
            在下载页粘贴链接解析后，会自动记在这里。
          </EmptyState>
        )}
        {records && records.length > 0 && shown.length === 0 && <EmptyState icon={Search} title="没有匹配的记录" />}
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
                <Badge>{r.kind === 'pgc' ? '番剧影视' : '视频'}</Badge>
                <span className="tabular-nums">{r.count} 项</span>
                <span>·</span>
                <span>{ago(r.at, Date.now())}</span>
              </div>
              <div className="mt-0.5 truncate text-[11px] text-subtle">{r.input}</div>
            </div>
            <IconButton
              icon={X}
              variant="danger"
              label="删除这条记录"
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
