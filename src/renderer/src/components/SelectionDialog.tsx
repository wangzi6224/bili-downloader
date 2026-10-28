import { useEffect, useMemo, useRef, useState } from 'react'
import { renderTemplate } from '@shared/naming'
import type { MediaItem, ParseResult, QualityOption, StreamInfo } from '@shared/types'
import { fmtDuration, thumb } from '../format'
import { api, useStore } from '../store'
import { Button, Modal } from './Modal'
import { OptionsEditor, Section, summaryTags, type EditableOptions } from './OptionsEditor'

// 取不到清晰度列表时的兜底选项
const FALLBACK: QualityOption[] = [
  { qn: 127, label: '最高可用', needVip: false, needLogin: false, codecs: [] },
  { qn: 80, label: '1080P 高清', needVip: false, needLogin: true, codecs: [] },
  { qn: 64, label: '720P 准高清', needVip: false, needLogin: false, codecs: [] },
  { qn: 32, label: '480P 标清', needVip: false, needLogin: false, codecs: [] }
]

const CODEC_TEXT = { avc: 'AVC', hevc: 'HEVC', av1: 'AV1' } as const

export function SelectionDialog({ result }: { result: ParseResult }) {
  const set = useStore((s) => s.set)
  const settings = useStore((s) => s.settings)!
  const auth = useStore((s) => s.auth)
  const isVip = auth?.loggedIn ? auth.user.vipActive : false

  const all = useMemo(() => result.groups.flatMap((g) => g.items), [result])
  const [selected, setSelected] = useState(() => new Set(result.defaultSelected))
  const lastClicked = useRef<number | null>(null)
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set())
  const [dupPrompt, setDupPrompt] = useState<MediaItem[] | null>(null)

  const [info, setInfo] = useState<StreamInfo | null>(null)
  const [infoError, setInfoError] = useState<string | null>(null)
  const [qn, setQn] = useState(settings.defaultQn)
  const [opts, setOpts] = useState<EditableOptions>(settings.defaults)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void api.history.downloadedKeys().then((keys) => setDownloaded(new Set(keys)))
  }, [])

  // 用第一个选中项（没有就用第一项）查询可用清晰度和音轨
  const probe = all.find((i) => selected.has(i.key)) ?? all[0]
  useEffect(() => {
    if (!probe) return
    let alive = true
    setInfo(null)
    setInfoError(null)
    api
      .streamInfo(probe)
      .then((s) => {
        if (!alive) return
        setInfo(s)
        const usable = s.qualities.filter((q) => (isVip || !q.needVip) && q.codecs.length)
        const best = usable.find((q) => q.qn <= settings.defaultQn) ?? usable[usable.length - 1] ?? s.qualities[0]
        if (best) setQn(best.qn)
      })
      .catch((e: Error) => alive && setInfoError(e.message))
    return () => {
      alive = false
    }
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

  const enqueue = async (items: MediaItem[]): Promise<void> => {
    if (!items.length) return close()
    setSubmitting(true)
    try {
      await api.download.enqueue({
        title: result.title,
        cover: result.cover,
        kind: result.kind,
        meta: result.meta,
        items,
        options: { qn, ...opts }
      })
      if (settings.rememberLast) {
        set({ settings: await api.settings.set({ defaults: opts, defaultQn: qn }) })
      }
      close()
    } catch (e) {
      set({ error: (e as Error).message })
      setSubmitting(false)
    }
  }

  const start = (): void => {
    const items = all.filter((i) => selected.has(i.key))
    const dups = items.filter((i) => downloaded.has(i.key))
    if (!dups.length || settings.duplicateAction === 'download') return void enqueue(items)
    if (settings.duplicateAction === 'skip') return void enqueue(items.filter((i) => !downloaded.has(i.key)))
    setDupPrompt(dups)
  }

  const qualities = info?.qualities ?? (infoError ? FALLBACK : [])
  const chosen = qualities.find((q) => q.qn === qn)
  const multiGroup = result.groups.length > 1 || all.length > 1

  // 保存路径预览：和主进程用同一套模板
  const preview = useMemo(() => {
    const items = all.filter((i) => selected.has(i.key))
    const first = items[0]
    if (!first) return ''
    const multi = items.length > 1
    const tpl = !multi ? settings.naming.single : result.kind === 'pgc' ? settings.naming.pgc : settings.naming.multi
    const ext = opts.output === 'audio' ? (opts.audio === 'flac' ? 'flac' : 'm4a') : opts.container
    const codec = chosen?.codecs.length ? (opts.codecOrder.find((c) => chosen.codecs.includes(c)) ?? opts.codecOrder[0]) : opts.codecOrder[0]
    return `${renderTemplate(tpl, {
      title: first.title,
      series: multi || first.title !== result.title ? result.title : '',
      index: first.index,
      owner: result.meta?.owner,
      owner_mid: result.meta?.ownerMid,
      pubdate: first.pubdate ?? result.meta?.pubdate,
      date: Math.floor(Date.now() / 1000),
      quality: chosen?.label,
      codec: opts.output === 'audio' ? '' : CODEC_TEXT[codec],
      bvid: first.bvid,
      aid: first.aid,
      cid: first.cid,
      ep_id: first.epId,
      type: result.kind === 'pgc' ? '番剧影视' : '视频'
    })}.${ext}`
  }, [all, selected, settings.naming, result, opts, chosen])

  const downloadedCount = all.filter((i) => downloaded.has(i.key)).length

  return (
    <Modal onClose={close} className="flex h-[86vh] max-w-6xl flex-col">
      <div className="flex items-center gap-4 border-b border-neutral-200 p-4 dark:border-neutral-800">
        {result.cover && (
          <img src={thumb(result.cover, 240)} referrerPolicy="no-referrer" className="h-16 w-28 rounded-md object-cover" alt="" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold">{result.title}</div>
          <div className="mt-1 text-xs text-neutral-500">
            {result.kind === 'pgc' ? '番剧 / 影视' : '视频'}
            {result.owner && ` · ${result.owner}`} · 共 {all.length} 项
            {downloadedCount > 0 && <span className="text-green-600"> · 已下载过 {downloadedCount} 项</span>}
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
              {downloadedCount > 0 && (
                <Button variant="ghost" onClick={() => setGroup(all.filter((i) => downloaded.has(i.key)), false)}>
                  去掉已下载
                </Button>
              )}
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
                      {downloaded.has(item.key) && (
                        <span className="shrink-0 text-xs text-green-600" title="下载历史里有这一项">
                          ✓ 已下载
                        </span>
                      )}
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

        <div className="flex w-80 shrink-0 flex-col text-sm">
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
            <Section title="清晰度" dim={opts.output === 'audio'}>
              {!info && !infoError && <div className="text-xs text-neutral-500">正在获取可用清晰度…</div>}
              {infoError && <div className="mb-2 text-xs text-amber-600">{infoError}</div>}
              <div className="flex flex-col gap-0.5">
                {qualities.map((q) => {
                  const locked = (q.needVip && !isVip) || (info !== null && !q.codecs.length)
                  return (
                    <label
                      key={q.qn}
                      className={`flex items-center gap-2 rounded-md px-2 py-1 ${locked ? 'text-neutral-400' : 'cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800'}`}
                    >
                      <input
                        type="radio"
                        name="qn"
                        disabled={locked || opts.output === 'audio'}
                        checked={qn === q.qn}
                        onChange={() => setQn(q.qn)}
                        className="accent-bili"
                      />
                      <span className="flex-1">{q.label}</span>
                      <span className="text-[10px] text-neutral-400">{q.codecs.map((c) => CODEC_TEXT[c]).join(' ')}</span>
                      {q.needVip && <span className="text-[10px] text-bili">大会员</span>}
                    </label>
                  )
                })}
              </div>
            </Section>
            <OptionsEditor value={opts} onChange={setOpts} info={info} codecsForQuality={chosen?.codecs} />
          </div>

          {/* 下载按钮固定在底部，不随选项滚动 */}
          <div className="border-t border-neutral-200 p-4 dark:border-neutral-800">
            <div className="mb-2 flex flex-wrap gap-1">
              {summaryTags(opts, info).map((t) => (
                <span key={t} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {t}
                </span>
              ))}
            </div>
            {dupPrompt ? (
              <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                选中的项目里有 {dupPrompt.length} 项已经下载过
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="primary"
                    onClick={() => enqueue(all.filter((i) => selected.has(i.key) && !downloaded.has(i.key)))}
                  >
                    跳过它们
                  </Button>
                  <Button onClick={() => enqueue(all.filter((i) => selected.has(i.key)))}>仍然下载</Button>
                </div>
              </div>
            ) : (
              <Button
                variant="primary"
                className="w-full py-2.5"
                disabled={!selected.size || submitting || (!info && !infoError && opts.output !== 'audio')}
                onClick={start}
              >
                下载 {selected.size} 项
              </Button>
            )}
            <div className="mt-2 truncate text-xs text-neutral-500" title={`${settings.downloadDir}/${preview}`}>
              保存为 {preview || '—'}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
