import { useEffect, useMemo, useRef, useState } from 'react'
import type { ParseRecord } from '@shared/types'
import { thumb } from '../format'
import { api } from '../store'
import { Button } from './Modal'

function ago(ms: number): string {
  const s = (Date.now() - ms) / 1000
  if (s < 60) return '刚刚'
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} 天前`
  return new Date(ms).toLocaleDateString()
}

/** 解析记录：方便下次接着下合集里剩下的集 */
export function ParseHistory({ onPick }: { onPick: (input: string) => void }) {
  const [open, setOpen] = useState(false)
  const [records, setRecords] = useState<ParseRecord[]>([])
  const [q, setQ] = useState('')
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    void api.history.parses().then(setRecords)
    const onDown = (e: MouseEvent): void => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase()
    return k ? records.filter((r) => r.title.toLowerCase().includes(k) || r.input.toLowerCase().includes(k)) : records
  }, [records, q])

  return (
    <div className="relative" ref={box}>
      <Button className="h-11" onClick={() => setOpen(!open)} title="解析记录">
        记录
      </Button>
      {open && (
        <div className="absolute top-12 right-0 z-40 flex max-h-[60vh] w-[440px] flex-col rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex items-center gap-2 border-b border-neutral-100 p-2 dark:border-neutral-800">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索标题或链接"
              className="h-8 flex-1 rounded-md border border-neutral-300 bg-white px-2 text-sm outline-none focus:border-bili dark:border-neutral-700 dark:bg-neutral-900"
            />
            {records.length > 0 && (
              <Button
                variant="ghost"
                onClick={async () => {
                  await api.history.clearParses()
                  setRecords([])
                }}
              >
                清空
              </Button>
            )}
          </div>
          <div className="overflow-y-auto">
            {shown.length === 0 && <div className="p-6 text-center text-sm text-neutral-400">还没有解析记录</div>}
            {shown.map((r) => (
              <div
                key={r.input}
                onClick={() => {
                  setOpen(false)
                  onPick(r.input)
                }}
                className="group flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                <img src={thumb(r.cover, 120)} referrerPolicy="no-referrer" className="h-9 w-14 shrink-0 rounded object-cover" alt="" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{r.title}</div>
                  <div className="truncate text-xs text-neutral-500">
                    {r.kind === 'pgc' ? '番剧影视' : '视频'} · {r.count} 项 · {ago(r.at)}
                  </div>
                </div>
                <button
                  type="button"
                  title="删除这条记录"
                  onClick={async (e) => {
                    e.stopPropagation()
                    setRecords(await api.history.removeParse(r.input))
                  }}
                  className="invisible rounded px-1.5 text-neutral-400 group-hover:visible hover:bg-neutral-200 dark:hover:bg-neutral-700"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
