import { useEffect, useMemo, useRef, useState } from 'react'
import { renderTemplate } from '@shared/naming'
import { parseRange } from '@shared/range'
import type { MediaGroup, MediaItem, Paging, ParseResult, QualityOption, StreamInfo } from '@shared/types'
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
const KIND_TEXT = { ugc: '视频', pgc: '番剧 / 影视', cheese: '课程', audio: '音频' } as const
/** 自动加载全部分页时每页的间隔，避免触发风控 */
const PAGE_INTERVAL = 1000

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export function SelectionDialog({ result }: { result: ParseResult }) {
  const set = useStore((s) => s.set)
  const settings = useStore((s) => s.settings)!
  const auth = useStore((s) => s.auth)
  const progress = useStore((s) => s.progress)
  const isVip = auth?.loggedIn ? auth.user.vipActive : false
  const audioKind = result.kind === 'audio'

  const [groups, setGroups] = useState<MediaGroup[]>(result.groups)
  const [paging, setPaging] = useState<Paging | undefined>(result.paging)
  const [loadingMore, setLoadingMore] = useState(false)
  const stopLoading = useRef(false)
  const all = useMemo(() => groups.flatMap((g) => g.items), [groups])
  const [selected, setSelected] = useState(() => new Set(result.defaultSelected))
  const lastClicked = useRef<number | null>(null)
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set())
  const [dupPrompt, setDupPrompt] = useState<MediaItem[] | null>(null)
  const [filter, setFilter] = useState('')
  const [range, setRange] = useState('')

  const [info, setInfo] = useState<StreamInfo | null>(null)
  const [infoError, setInfoError] = useState<string | null>(null)
  const [qn, setQn] = useState(settings.defaultQn)
  const [opts, setOpts] = useState<EditableOptions>(() =>
    audioKind ? { ...settings.defaults, output: 'audio' } : settings.defaults
  )
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void api.history.downloadedKeys().then((keys) => setDownloaded(new Set(keys)))
  }, [])

  // 列表里还没展开分P的视频，按 BV 号判断是否下载过
  const downloadedBv = useMemo(() => new Set([...downloaded].map((k) => k.split(':')[1])), [downloaded])
  const isDownloaded = (i: MediaItem): boolean =>
    downloaded.has(i.key) || Boolean(i.lazy && i.bvid && downloadedBv.has(i.bvid))

  // 用第一个选中项（没有就用第一项）查询可用清晰度和音轨
  const probe = all.find((i) => selected.has(i.key) && !i.unavailable) ?? all.find((i) => !i.unavailable)
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

  const appendPage = async (page: number): Promise<boolean> => {
    if (!paging) return false
    const r = await api.parseMore(paging.source, page)
    setGroups((gs) => gs.map((g, i) => (i === 0 ? { ...g, items: [...g.items, ...r.items.filter((it) => !g.items.some((x) => x.key === it.key))] } : g)))
    setPaging({ ...paging, page, total: r.total, hasMore: r.hasMore })
    return r.hasMore
  }

  const loadNext = async (): Promise<void> => {
    if (!paging?.hasMore) return
    setLoadingMore(true)
    try {
      await appendPage(paging.page + 1)
    } catch (e) {
      set({ error: (e as Error).message })
    } finally {
      setLoadingMore(false)
    }
  }

  const loadAll = async (): Promise<void> => {
    if (!paging?.hasMore) return
    setLoadingMore(true)
    stopLoading.current = false
    try {
      for (let page = paging.page + 1; !stopLoading.current; page++) {
        const more = await appendPage(page)
        if (!more) break
        await sleep(PAGE_INTERVAL)
      }
    } catch (e) {
      set({ error: (e as Error).message })
    } finally {
      setLoadingMore(false)
    }
  }

  const visible = useMemo(() => {
    const k = filter.trim().toLowerCase()
    if (!k) return groups
    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => i.title.toLowerCase().includes(k) || (i.owner ?? '').toLowerCase().includes(k)) }))
      .filter((g) => g.items.length)
  }, [groups, filter])
  const visibleItems = useMemo(() => visible.flatMap((g) => g.items), [visible])
  const selectable = (i: MediaItem): boolean => !i.unavailable

  const toggle = (item: MediaItem, shift: boolean): void => {
    if (!selectable(item)) return
    const idx = visibleItems.indexOf(item)
    const next = new Set(selected)
    const on = !next.has(item.key)
    if (shift && lastClicked.current !== null) {
      // Shift 点击：把区间内的都设成同一个状态
      const [a, b] = [lastClicked.current, idx].sort((x, y) => x - y)
      for (const i of visibleItems.slice(a, b + 1)) if (selectable(i)) on ? next.add(i.key) : next.delete(i.key)
    } else {
      on ? next.add(item.key) : next.delete(item.key)
    }
    lastClicked.current = idx
    setSelected(next)
  }

  const setMany = (items: MediaItem[], on: boolean): void => {
    const next = new Set(selected)
    for (const i of items) if (selectable(i)) on ? next.add(i.key) : next.delete(i.key)
    setSelected(next)
  }

  const close = (): void => {
    stopLoading.current = true
    set({ parse: null })
  }

  const enqueue = async (items: MediaItem[]): Promise<void> => {
    if (!items.length) return close()
    setSubmitting(true)
    const options = { qn, ...opts, output: audioKind ? ('audio' as const) : opts.output }
    try {
      const keys = new Set(items.map((i) => i.key))
      // 批量解析时每个来源单独入队，命名各用各的标题
      const batches = result.batch
        ? groups
            .map((g) => ({ g, items: g.items.filter((i) => keys.has(i.key)) }))
            .filter((b) => b.items.length && b.g.source)
            .map(({ g, items: its }) => ({ ...g.source!, items: its }))
        : [{ title: result.title, cover: result.cover, kind: result.kind, meta: result.meta, items }]
      const notes: string[] = []
      for (const b of batches) {
        const note = await api.download.enqueue({ ...b, options })
        if (note) notes.push(note)
      }
      if (notes.length) set({ notice: notes.join('；') })
      if (settings.rememberLast && !audioKind) {
        set({ settings: await api.settings.set({ defaults: opts, defaultQn: qn }) })
      }
      close()
    } catch (e) {
      set({ error: (e as Error).message })
      setSubmitting(false)
    }
  }

  const start = (): void => {
    const items = all.filter((i) => selected.has(i.key) && selectable(i))
    const dups = items.filter(isDownloaded)
    if (!dups.length || settings.duplicateAction === 'download') return void enqueue(items)
    if (settings.duplicateAction === 'skip') return void enqueue(items.filter((i) => !isDownloaded(i)))
    setDupPrompt(dups)
  }

  const qualities = info?.qualities ?? (infoError ? FALLBACK : [])
  const chosen = qualities.find((q) => q.qn === qn)
  const showList = groups.length > 1 || all.length > 1
  const selectedCount = all.filter((i) => selected.has(i.key) && selectable(i)).length

  // 保存路径预览：和主进程用同一套模板
  const preview = useMemo(() => {
    const first = all.find((i) => selected.has(i.key))
    if (!first) return ''
    const group = groups.find((g) => g.items.includes(first))
    const src = result.batch && group?.source ? group.source : { title: result.title, kind: result.kind, meta: result.meta }
    const multi = (result.batch ? (group?.items.filter((i) => selected.has(i.key)).length ?? 0) : selectedCount) > 1
    const episodic = src.kind === 'pgc' || src.kind === 'cheese'
    const tpl = !multi ? settings.naming.single : episodic ? settings.naming.pgc : settings.naming.multi
    const output = audioKind ? 'audio' : opts.output
    const ext = output === 'audio' ? (opts.audio === 'flac' ? 'flac' : 'm4a') : opts.container
    const codec = chosen?.codecs.length ? (opts.codecOrder.find((c) => chosen.codecs.includes(c)) ?? opts.codecOrder[0]) : opts.codecOrder[0]
    return `${renderTemplate(tpl, {
      title: first.title,
      series: multi || first.title !== src.title ? src.title : '',
      index: first.index,
      owner: first.owner ?? src.meta?.owner,
      owner_mid: first.ownerMid ?? src.meta?.ownerMid,
      pubdate: first.pubdate ?? src.meta?.pubdate,
      date: Math.floor(Date.now() / 1000),
      quality: output === 'audio' ? '' : chosen?.label,
      codec: output === 'audio' ? '' : CODEC_TEXT[codec],
      bvid: first.bvid,
      aid: first.aid,
      cid: first.cid,
      ep_id: first.epId,
      type: { ugc: '视频', pgc: '番剧影视', cheese: '课程', audio: '音频' }[src.kind]
    })}.${ext}`
  }, [all, groups, selected, settings.naming, result, opts, chosen, selectedCount, audioKind])

  const downloadedCount = all.filter(isDownloaded).length
  const lazyCount = all.filter((i) => selected.has(i.key) && i.lazy).length

  return (
    <Modal onClose={close} className="flex h-[86vh] max-w-6xl flex-col">
      <div className="flex items-center gap-4 border-b border-neutral-200 p-4 dark:border-neutral-800">
        {result.cover && (
          <img src={thumb(result.cover, 240)} referrerPolicy="no-referrer" className="h-16 w-28 rounded-md object-cover" alt="" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold">{result.title}</div>
          <div className="mt-1 text-xs text-neutral-500">
            {result.batch ? `${groups.length} 个来源` : KIND_TEXT[result.kind]}
            {result.owner && ` · ${result.owner}`} · {paging ? `已加载 ${all.length} / ${paging.total} 项` : `共 ${all.length} 项`}
            {downloadedCount > 0 && <span className="text-green-600"> · 已下载过 {downloadedCount} 项</span>}
          </div>
        </div>
        <Button variant="ghost" onClick={close}>
          关闭
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col border-r border-neutral-200 dark:border-neutral-800">
          {showList && (
            <div className="flex flex-wrap items-center gap-1 border-b border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
              <Button variant="ghost" onClick={() => setMany(visibleItems, true)}>
                {filter ? '全选筛选结果' : '全选'}
              </Button>
              <Button variant="ghost" onClick={() => setMany(visibleItems, false)}>
                全不选
              </Button>
              <Button variant="ghost" onClick={() => setSelected(new Set(all.filter((i) => selectable(i) && !selected.has(i.key)).map((i) => i.key)))}>
                反选
              </Button>
              {downloadedCount > 0 && (
                <Button variant="ghost" onClick={() => setMany(all.filter(isDownloaded), false)}>
                  去掉已下载
                </Button>
              )}
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="筛选标题 / UP 主"
                className="ml-1 h-7 w-36 rounded-md border border-neutral-300 bg-white px-2 text-xs outline-none focus:border-bili dark:border-neutral-700 dark:bg-neutral-900"
              />
              <input
                value={range}
                onChange={(e) => setRange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setSelected(new Set(all.filter((i) => parseRange(range).has(i.index) && selectable(i)).map((i) => i.key)))
                }}
                placeholder="序号 如 1-5,7"
                title="按序号选择，回车生效"
                className="h-7 w-28 rounded-md border border-neutral-300 bg-white px-2 text-xs outline-none focus:border-bili dark:border-neutral-700 dark:bg-neutral-900"
              />
              <span className="ml-auto text-xs text-neutral-500">Shift 连选 · 已选 {selectedCount} 项</span>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {visible.map((g) => {
              const groupOn = g.items.filter(selectable).every((i) => selected.has(i.key))
              return (
                <div key={g.id}>
                  {(groups.length > 1 || paging) && (
                    <label className="sticky top-0 z-10 flex cursor-pointer items-center gap-2 bg-neutral-100 px-4 py-1.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      <input type="checkbox" checked={groupOn} onChange={() => setMany(g.items, !groupOn)} className="accent-bili" />
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
                      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 36px' }}
                      className={`flex items-center gap-3 px-4 py-2 text-sm ${item.unavailable ? 'text-neutral-400' : 'cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/60'}`}
                    >
                      <input type="checkbox" readOnly disabled={!selectable(item)} checked={selected.has(item.key) && selectable(item)} className="accent-bili" />
                      <span className="w-8 shrink-0 text-right text-xs text-neutral-400 tabular-nums">{item.index}</span>
                      <span className="min-w-0 flex-1 truncate" title={item.title}>
                        {item.title}
                      </span>
                      {item.owner && item.owner !== result.owner && (
                        <span className="max-w-28 shrink-0 truncate text-xs text-neutral-400">{item.owner}</span>
                      )}
                      {item.unavailable && <span className="shrink-0 text-xs text-red-500">{item.unavailable}</span>}
                      {isDownloaded(item) && (
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
            {paging?.hasMore && !filter && (
              <div className="flex items-center justify-center gap-2 p-4">
                {loadingMore ? (
                  <>
                    <span className="text-xs text-neutral-500">正在加载第 {paging.page + 1} 页…</span>
                    <Button variant="ghost" onClick={() => (stopLoading.current = true)}>
                      停止
                    </Button>
                  </>
                ) : (
                  <>
                    <Button onClick={loadNext}>加载下一页</Button>
                    <Button variant="ghost" onClick={loadAll} title="每页间隔 1 秒，避免请求太快被风控">
                      加载全部（剩 {paging.total - all.length} 项）
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex w-80 shrink-0 flex-col text-sm">
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
            {!audioKind && (
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
            )}
            {audioKind && <div className="text-xs text-neutral-500">音频区内容只下载音频；无损需要大会员，拿不到时自动降档。</div>}
            <OptionsEditor value={opts} onChange={setOpts} info={info} codecsForQuality={chosen?.codecs} />
          </div>

          {/* 下载按钮固定在底部，不随选项滚动 */}
          <div className="border-t border-neutral-200 p-4 dark:border-neutral-800">
            <div className="mb-2 flex flex-wrap gap-1">
              {summaryTags(audioKind ? { ...opts, output: 'audio' } : opts, info).map((t) => (
                <span key={t} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {t}
                </span>
              ))}
            </div>
            {submitting && lazyCount > 0 && progress ? (
              <div className="text-xs text-neutral-500">
                正在获取视频分P {progress.done}/{progress.total}…
              </div>
            ) : dupPrompt ? (
              <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                选中的项目里有 {dupPrompt.length} 项已经下载过
                <div className="mt-2 flex gap-2">
                  <Button variant="primary" onClick={() => enqueue(all.filter((i) => selected.has(i.key) && selectable(i) && !isDownloaded(i)))}>
                    跳过它们
                  </Button>
                  <Button onClick={() => enqueue(all.filter((i) => selected.has(i.key) && selectable(i)))}>仍然下载</Button>
                </div>
              </div>
            ) : (
              <Button
                variant="primary"
                className="w-full py-2.5"
                disabled={!selectedCount || submitting || (!audioKind && !info && !infoError && opts.output !== 'audio')}
                onClick={start}
              >
                下载 {selectedCount} 项
              </Button>
            )}
            {lazyCount > 0 && !submitting && (
              <div className="mt-1 text-xs text-neutral-500">其中 {lazyCount} 个视频会在加入队列时查询分P，多P视频会展开成多个任务</div>
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
