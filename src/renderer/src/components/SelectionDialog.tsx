import { useEffect, useMemo, useRef, useState } from 'react'
import type { CodecPref, MediaItem, ParseResult, QualityOption } from '@shared/types'
import { fmtDuration, thumb } from '../format'
import { api, useStore } from '../store'
import { Button, Modal } from './Modal'

const CODECS: { value: CodecPref; label: string; hint: string }[] = [
  { value: 'avc', label: 'AVC', hint: '兼容性最好' },
  { value: 'hevc', label: 'HEVC', hint: '体积更小' },
  { value: 'av1', label: 'AV1', hint: '需较新的 Mac' }
]

// 取不到清晰度列表时的兜底选项
const FALLBACK: QualityOption[] = [
  { qn: 127, label: '最高可用', needVip: false, needLogin: false },
  { qn: 80, label: '1080P 高清', needVip: false, needLogin: true },
  { qn: 64, label: '720P 准高清', needVip: false, needLogin: false },
  { qn: 32, label: '480P 标清', needVip: false, needLogin: false }
]

export function SelectionDialog({ result }: { result: ParseResult }) {
  const set = useStore((s) => s.set)
  const settings = useStore((s) => s.settings)!
  const auth = useStore((s) => s.auth)
  const isVip = auth?.loggedIn ? auth.user.vipActive : false

  const all = useMemo(() => result.groups.flatMap((g) => g.items), [result])
  const [selected, setSelected] = useState(() => new Set(result.defaultSelected))
  const lastClicked = useRef<number | null>(null)

  const [qualities, setQualities] = useState<QualityOption[] | null>(null)
  const [qualityError, setQualityError] = useState<string | null>(null)
  const [qn, setQn] = useState(settings.defaultQn)
  const [codec, setCodec] = useState<CodecPref>(settings.defaultCodec)
  const [audioOnly, setAudioOnly] = useState(false)
  const [extras, setExtras] = useState(settings.extras)
  const [submitting, setSubmitting] = useState(false)

  // 用第一个选中项（没有就用第一项）查询可用清晰度
  const probe = all.find((i) => selected.has(i.key)) ?? all[0]
  useEffect(() => {
    if (!probe) return
    let alive = true
    setQualities(null)
    setQualityError(null)
    api
      .qualities(probe)
      .then((list) => {
        if (!alive) return
        setQualities(list)
        const usable = list.filter((q) => isVip || !q.needVip)
        const best = usable.find((q) => q.qn <= settings.defaultQn) ?? usable[usable.length - 1] ?? list[0]
        if (best) setQn(best.qn)
      })
      .catch((e: Error) => alive && setQualityError(e.message))
    return () => {
      alive = false
    }
    // 只在探测项变化时重新查询
  }, [probe?.key])

  const toggle = (item: MediaItem, shift: boolean): void => {
    const idx = all.indexOf(item)
    const next = new Set(selected)
    const on = !next.has(item.key)
    if (shift && lastClicked.current !== null) {
      // Shift 点击：把区间内的都设成同一个状态
      const [a, b] = [lastClicked.current, idx].sort((x, y) => x - y)
      for (const i of all.slice(a, b + 1)) on ? next.add(i.key) : next.delete(i.key)
    } else {
      on ? next.add(item.key) : next.delete(item.key)
    }
    lastClicked.current = idx
    setSelected(next)
  }

  const setGroup = (items: MediaItem[], on: boolean): void => {
    const next = new Set(selected)
    for (const i of items) on ? next.add(i.key) : next.delete(i.key)
    setSelected(next)
  }

  const close = (): void => set({ parse: null })

  const start = async (): Promise<void> => {
    setSubmitting(true)
    try {
      await api.download.enqueue({
        title: result.title,
        cover: result.cover,
        items: all.filter((i) => selected.has(i.key)),
        options: { qn, codec, audioOnly, ...extras }
      })
      close()
    } catch (e) {
      set({ error: (e as Error).message })
      setSubmitting(false)
    }
  }

  const options = qualities ?? (qualityError ? FALLBACK : [])
  const multiGroup = result.groups.length > 1 || all.length > 1

  return (
    <Modal onClose={close} className="flex h-[82vh] max-w-5xl flex-col">
      <div className="flex items-center gap-4 border-b border-neutral-200 p-4 dark:border-neutral-800">
        {result.cover && (
          <img src={thumb(result.cover, 240)} referrerPolicy="no-referrer" className="h-16 w-28 rounded-md object-cover" alt="" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold">{result.title}</div>
          <div className="mt-1 text-xs text-neutral-500">
            {result.kind === 'pgc' ? '番剧 / 影视' : '视频'}
            {result.owner && ` · ${result.owner}`} · 共 {all.length} 项
          </div>
        </div>
        <Button variant="ghost" onClick={close}>
          关闭
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col border-r border-neutral-200 dark:border-neutral-800">
          {multiGroup && (
            <div className="flex items-center gap-1 border-b border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
              <Button variant="ghost" onClick={() => setGroup(all, true)}>
                全选
              </Button>
              <Button variant="ghost" onClick={() => setGroup(all, false)}>
                全不选
              </Button>
              <Button
                variant="ghost"
                onClick={() => setSelected(new Set(all.filter((i) => !selected.has(i.key)).map((i) => i.key)))}
              >
                反选
              </Button>
              <span className="ml-auto text-xs text-neutral-500">按住 Shift 点击可以连续选择 · 已选 {selected.size} 项</span>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {result.groups.map((g) => {
              const groupOn = g.items.every((i) => selected.has(i.key))
              return (
                <div key={g.id}>
                  {result.groups.length > 1 && (
                    <label className="sticky top-0 z-10 flex cursor-pointer items-center gap-2 bg-neutral-100 px-4 py-1.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      <input type="checkbox" checked={groupOn} onChange={() => setGroup(g.items, !groupOn)} className="accent-bili" />
                      {g.title}（{g.items.length}）
                    </label>
                  )}
                  {g.items.map((item) => (
                    <label
                      key={item.key}
                      onClick={(e) => {
                        e.preventDefault()
                        toggle(item, e.shiftKey)
                      }}
                      className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
                    >
                      <input type="checkbox" readOnly checked={selected.has(item.key)} className="accent-bili" />
                      <span className="w-8 shrink-0 text-right text-xs text-neutral-400 tabular-nums">{item.index}</span>
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      {item.badge && (
                        <span className="shrink-0 rounded bg-bili/15 px-1.5 py-0.5 text-[10px] text-bili">{item.badge}</span>
                      )}
                      {item.needVip && !isVip && !item.badge && (
                        <span className="shrink-0 rounded bg-bili/15 px-1.5 py-0.5 text-[10px] text-bili">需大会员</span>
                      )}
                      <span className="w-14 shrink-0 text-right text-xs text-neutral-400 tabular-nums">
                        {fmtDuration(item.duration)}
                      </span>
                    </label>
                  ))}
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex w-72 shrink-0 flex-col text-sm">
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
            <section className={audioOnly ? 'opacity-40' : ''}>
              <div className="mb-2 font-medium">清晰度</div>
              {!qualities && !qualityError && <div className="text-xs text-neutral-500">正在获取可用清晰度…</div>}
              {qualityError && <div className="mb-2 text-xs text-amber-600">{qualityError}</div>}
              <div className="flex flex-col gap-1">
                {options.map((q) => {
                  const locked = q.needVip && !isVip
                  return (
                    <label
                      key={q.qn}
                      className={`flex items-center gap-2 rounded-md px-2 py-1 ${locked ? 'text-neutral-400' : 'cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800'}`}
                    >
                      <input
                        type="radio"
                        name="qn"
                        disabled={locked || audioOnly}
                        checked={qn === q.qn}
                        onChange={() => setQn(q.qn)}
                        className="accent-bili"
                      />
                      <span className="flex-1">{q.label}</span>
                      {q.needVip && <span className="text-[10px] text-bili">大会员</span>}
                    </label>
                  )
                })}
              </div>
            </section>

            <section className={audioOnly ? 'opacity-40' : ''}>
              <div className="mb-2 font-medium">编码偏好</div>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
                {CODECS.map((c) => (
                  <button
                    key={c.value}
                    title={c.hint}
                    disabled={audioOnly}
                    onClick={() => setCodec(c.value)}
                    className={`rounded-md py-1 text-xs ${codec === c.value ? 'bg-white shadow dark:bg-neutral-700' : 'text-neutral-500'}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="mt-1 text-xs text-neutral-500">{CODECS.find((c) => c.value === codec)?.hint}，没有时自动换用其他编码</div>
            </section>

            <section>
              <div className="mb-2 font-medium">附加内容</div>
              <label className="flex cursor-pointer items-center gap-2 py-0.5">
                <input type="checkbox" checked={audioOnly} onChange={(e) => setAudioOnly(e.target.checked)} className="accent-bili" />
                仅音频（m4a / 无损 flac）
              </label>
              <label className="flex cursor-pointer items-center gap-2 py-0.5">
                <input
                  type="checkbox"
                  checked={extras.cover}
                  onChange={(e) => setExtras({ ...extras, cover: e.target.checked })}
                  className="accent-bili"
                />
                封面图
              </label>
              <label className={`flex items-center gap-2 py-0.5 ${audioOnly ? 'opacity-40' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  disabled={audioOnly}
                  checked={extras.subtitle}
                  onChange={(e) => setExtras({ ...extras, subtitle: e.target.checked })}
                  className="accent-bili"
                />
                CC 字幕（.srt）
              </label>
              <label className={`flex items-center gap-2 py-0.5 ${audioOnly ? 'opacity-40' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  disabled={audioOnly}
                  checked={extras.danmaku}
                  onChange={(e) => setExtras({ ...extras, danmaku: e.target.checked })}
                  className="accent-bili"
                />
                弹幕（.ass）
              </label>
            </section>
          </div>

          {/* 下载按钮固定在底部，不随选项滚动 */}
          <div className="border-t border-neutral-200 p-4 dark:border-neutral-800">
            <Button
              variant="primary"
              className="w-full py-2.5"
              disabled={!selected.size || submitting || (!qualities && !qualityError && !audioOnly)}
              onClick={start}
            >
              下载 {selected.size} 项
            </Button>
            <div className="mt-2 truncate text-center text-xs text-neutral-500" title={settings.downloadDir}>
              保存到 {settings.downloadDir}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
