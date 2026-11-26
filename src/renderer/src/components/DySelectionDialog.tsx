import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftRight, Check, ChevronDown, ChevronsDown, CircleStop, CopyMinus, Download, FileVideo, Hash, Loader2, Rss, Search, Square, UserRound, X } from 'lucide-react'
import { downloadStatusMatcher } from '@shared/downloaded'
import { DY_ORIGINAL_QN } from '@shared/options'
import { parseRange } from '@shared/range'
import type { MediaGroup, MediaItem, Paging, ParseResult, StreamInfo } from '@shared/types'
import { currentDyAccount, dyDefaultOptions, dyDefaultQuality, dyPathPreview, dyQualities } from '../dyView'
import { fmtDuration } from '../format'
import { useT } from '../i18n'
import {
  appendToFirst,
  enqueueBatches,
  filterGroups,
  resolveDuplicates,
  selectable,
  selectedItems,
  selectionSummary,
  setMany as withMany,
  subscribable as canSubscribe,
  toggleSelection
} from '../selection'
import { api, useStore } from '../store'
import { DyOptionsEditor, type DyEditable } from './DyOptionsEditor'
import { Section } from './OptionsEditor'
import { intervals } from './SubscriptionsPage'
import { Badge, Banner, Button, Dropdown, IconButton, Input, MenuItem, Modal, Select, STROKE } from './ui'

/** 自动加载全部分页时每页的间隔 */
const PAGE_INTERVAL = 800
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
/** 抖音订阅检查得太勤容易触发验证 */
const MIN_INTERVAL = 180

function SelectionCheckbox({ count, total, onChange }: { count: number; total: number; onChange: (checked: boolean) => void }) {
  return (
    <input
      type="checkbox"
      ref={(input) => { if (input) input.indeterminate = count > 0 && count < total }}
      checked={total > 0 && count === total}
      disabled={!total}
      onChange={(event) => onChange(event.currentTarget.checked)}
      className="shrink-0 accent-bili"
    />
  )
}

/** 抖音的选择窗口：选作品、画质和下载选项，可订阅博主主页、合集和自己的列表 */
export function DySelectionDialog({ result }: { result: ParseResult }) {
  const t = useT()
  const set = useStore((s) => s.set)
  const settings = useStore((s) => s.settings)!
  const account = useStore((s) => currentDyAccount(s.dyAccounts))

  const [groups, setGroups] = useState<MediaGroup[]>(result.groups)
  const [paging, setPaging] = useState<Paging | undefined>(result.paging)
  const [loadingMore, setLoadingMore] = useState(false)
  const busy = useRef(false)
  const stopLoading = useRef(false)
  const all = useMemo(() => groups.flatMap((g) => g.items), [groups])
  const [selected, setSelected] = useState(() => new Set(result.defaultSelected))
  const lastClicked = useRef<MediaItem | null>(null)
  const [downloaded, setDownloaded] = useState<string[] | null>(null)
  const [dupCount, setDupCount] = useState<number | null>(null)
  const [filter, setFilter] = useState('')
  const [range, setRange] = useState('')
  const [info, setInfo] = useState<StreamInfo | null>(null)
  const [infoError, setInfoError] = useState<string | null>(null)
  const defaults = dyDefaultOptions(settings)
  const [qn, setQn] = useState(defaults.qn)
  const qnPicked = useRef(false)
  const [opts, setOpts] = useState<DyEditable>(() => {
    const { qn: _qn, ...rest } = defaults
    return rest
  })
  const [submitting, setSubmitting] = useState(false)
  const [subForm, setSubForm] = useState(false)
  const [subInterval, setSubInterval] = useState(360)
  const [subExisting, setSubExisting] = useState(false)

  useEffect(() => {
    let alive = true
    const refresh = (): void => {
      api.history.downloadedKeys().then((keys) => alive && setDownloaded(keys)).catch(() => alive && setDownloaded([]))
    }
    const off = api.history.onDownloadsChanged(refresh)
    refresh()
    return () => {
      alive = false
      off()
    }
  }, [])
  useEffect(() => () => { stopLoading.current = true }, [])
  useEffect(() => setDupCount(null), [selected])

  const statusFor = useMemo(() => downloadStatusMatcher(downloaded ?? []), [downloaded])
  const isDownloaded = useMemo(() => (item: MediaItem) => statusFor(item) === 'downloaded', [statusFor])

  // 画质按第一个选中的视频查（图文没有画质可选）
  const usable = (i: MediaItem): boolean => !i.unavailable && !i.images
  const probe = all.find((i) => selected.has(i.key) && usable(i)) ?? all.find(usable)
  useEffect(() => {
    if (!probe) return
    let alive = true
    setInfo(null)
    setInfoError(null)
    api.dy
      .streamInfo(probe)
      .then((s) => {
        if (!alive) return
        setInfo(s)
        const list = dyQualities(s.qualities)
        const best = dyDefaultQuality(list, settings.douyin.defaultQn)
        setQn((cur) => (qnPicked.current && list.some((q) => q.qn === cur) ? cur : best.qn))
      })
      .catch((e: Error) => alive && setInfoError(e.message))
    return () => {
      alive = false
    }
  }, [probe?.key])

  const pagingRef = useRef(paging)
  pagingRef.current = paging

  const loadPages = async (every: boolean): Promise<void> => {
    if (!pagingRef.current?.hasMore || busy.current) return
    busy.current = true
    stopLoading.current = false
    setLoadingMore(true)
    try {
      // 按游标翻页：每一页要用上一页返回的来源
      let current: Paging = pagingRef.current
      while (!stopLoading.current && current.source.type === 'dy') {
        const r = await api.dy.parseMore(current.source, current.page + 1)
        setGroups((gs) => appendToFirst(gs, r.items))
        current = { source: r.next ?? current.source, page: r.page, total: r.total, hasMore: r.hasMore }
        setPaging(current)
        if (!r.hasMore || !every) break
        await sleep(PAGE_INTERVAL)
      }
    } catch (e) {
      set({ dyError: (e as Error).message })
    } finally {
      busy.current = false
      setLoadingMore(false)
    }
  }

  const visible = useMemo(() => filterGroups(groups, filter), [groups, filter])
  const visibleItems = useMemo(() => visible.flatMap((g) => g.items), [visible])
  const toggle = (item: MediaItem, shift: boolean): void => {
    if (!selectable(item)) return
    const anchor = lastClicked.current
    lastClicked.current = item
    setSelected((current) => toggleSelection(current, visibleItems, item, anchor, shift) ?? current)
  }
  const setMany = (items: MediaItem[], on: boolean | 'invert'): void => {
    lastClicked.current = null
    setSelected((current) => withMany(current, items, on))
  }

  const close = (): void => {
    stopLoading.current = true
    set({ dyParse: null })
  }

  const enqueue = async (items: MediaItem[]): Promise<void> => {
    if (!items.length) return close()
    setSubmitting(true)
    const options = { qn, ...opts }
    try {
      const notes: string[] = []
      for (const b of enqueueBatches(result, groups, items)) {
        const note = await api.dy.enqueue({ ...b, options })
        if (note) notes.push(note)
      }
      if (notes.length) set({ dyNotice: notes.join(t('input.separator')) })
      if (settings.rememberLast) {
        set({ settings: await api.settings.set({ douyin: { ...settings.douyin, defaults: opts, defaultQn: qn } }) })
      }
      close()
    } catch (e) {
      set({ dyError: (e as Error).message })
      setSubmitting(false)
    }
  }

  const start = (): void => {
    const items = selectedItems(all, selected)
    const decision = resolveDuplicates(items, isDownloaded, settings.duplicateAction)
    if ('ask' in decision) setDupCount(decision.ask.length)
    else void enqueue(decision.enqueue)
  }

  const subscribe = async (): Promise<void> => {
    try {
      await api.subs.add({
        input: result.input!,
        title: result.title,
        kind: 'douyin',
        options: { qn, ...opts },
        intervalMin: subInterval,
        includeExisting: subExisting,
        currentKeys: all.map((i) => i.key)
      })
      const label = intervals().find((i) => i.min === subInterval)?.label ?? ''
      set({ dyNotice: t('selection.subscribed', { title: result.title, interval: label }) })
      close()
    } catch (e) {
      set({ dyError: (e as Error).message })
    }
  }

  const qualities = dyQualities(info?.qualities)
  const chosen = qualities.find((q) => q.qn === qn)
  const selectedCount = selectedItems(all, selected).length
  const visibleSelection = selectionSummary(visibleItems, selected)
  const downloadedCount = all.filter(isDownloaded).length
  const showList = all.length > 1 || Boolean(filter) || !!paging?.hasMore
  const preview = useMemo(
    () => dyPathPreview({ result, groups, all, selected, naming: settings.naming, opts, chosen, now: Date.now() }),
    [all, groups, selected, settings.naming, result, opts, chosen]
  )
  const videoless = !probe
  const kindLabel = result.batch ? t('selection.sources', { count: groups.length }) : paging || all.length > 1 ? (groups[0]?.title ?? t('dyUi.siteName')) : t('dyUi.siteName')

  return (
    <Modal onClose={close} className="flex h-[86vh] max-w-6xl flex-col">
      <div className="flex items-center gap-4 border-b border-line px-5 py-4">
        {result.cover && <img src={result.cover} referrerPolicy="no-referrer" className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-line" alt="" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold">{result.title}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge tone="brand">{kindLabel}</Badge>
            {result.owner && (
              <span className="flex items-center gap-1">
                <UserRound size={12} strokeWidth={STROKE} />
                {result.owner}
              </span>
            )}
            <span className="tabular-nums">
              {paging && paging.hasMore ? t('selection.loadedOf', { count: all.length, total: paging.total }) : t('selection.totalItems', { count: all.length })}
            </span>
            {downloadedCount > 0 && (
              <Badge tone="success" icon={Check}>
                {t('selection.downloadedBefore', { count: downloadedCount })}
              </Badge>
            )}
          </div>
        </div>
        <IconButton icon={X} label={t('selection.close')} onClick={close} className="self-start" />
      </div>
      {result.note && (
        <div className="border-b border-line px-5 py-2">
          <Banner tone="warn">{result.note}</Banner>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col border-r border-line">
          {showList && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line px-4 py-2">
              <div className="flex min-w-0 items-center gap-0.5">
                <label className="flex min-h-7 cursor-pointer items-center gap-2 text-xs font-medium text-fg has-disabled:cursor-default has-disabled:text-subtle">
                  <SelectionCheckbox {...visibleSelection} onChange={(checked) => setMany(visibleItems, checked)} />
                  {t(filter.trim() ? 'selection.selectAllFiltered' : paging?.hasMore ? 'selection.selectAllLoaded' : 'selection.selectAll')}
                </label>
                <Dropdown align="start" className="w-max min-w-40" button={({ open, toggle }) => (
                  <IconButton icon={ChevronDown} size="sm" label={t('selection.selectionActions')} active={open} aria-expanded={open} onClick={toggle} />
                )}>
                  {(closeMenu) => (
                    <>
                      <MenuItem icon={ArrowLeftRight} onClick={() => { setMany(visibleItems, 'invert'); closeMenu() }}>
                        {t('selection.invert')}
                      </MenuItem>
                      <MenuItem icon={Square} onClick={() => { setMany(all, false); closeMenu() }}>
                        {t('selection.selectNone')}
                      </MenuItem>
                      {downloadedCount > 0 && (
                        <MenuItem icon={CopyMinus} onClick={() => { setMany(all.filter(isDownloaded), false); closeMenu() }}>
                          {t('selection.deselectDownloaded')}
                        </MenuItem>
                      )}
                    </>
                  )}
                </Dropdown>
              </div>
              <Input icon={Search} size="sm" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('dyUi.filterPlaceholder')} className="w-36" />
              <Input
                icon={Hash}
                size="sm"
                value={range}
                onChange={(e) => setRange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
                  const indices = parseRange(range)
                  if (!indices.size) return
                  const keys = new Set(visibleItems.map((i) => i.key))
                  setSelected((current) => {
                    const next = new Set([...current].filter((k) => !keys.has(k)))
                    for (const i of visibleItems) if (indices.has(i.index) && selectable(i)) next.add(i.key)
                    return next
                  })
                }}
                placeholder={t('selection.rangePlaceholder')}
                title={t('selection.rangeTitle')}
                className="w-32"
              />
              <span role="status" className="ml-auto text-xs text-muted tabular-nums">
                {t('selection.selectedCount', { count: selectedCount })}
              </span>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {visible.map((g) => (
              <div key={g.id}>
                {groups.length > 1 && (
                  <label className="sticky top-0 z-10 flex cursor-pointer items-center gap-2 border-b border-line bg-elevated/95 px-4 py-1.5 text-xs font-medium text-muted backdrop-blur">
                    <SelectionCheckbox {...selectionSummary(g.items, selected)} onChange={(checked) => setMany(g.items, checked)} />
                    {g.title}
                    <span className="font-normal text-subtle tabular-nums">{g.items.length}</span>
                  </label>
                )}
                {g.items.map((item) => {
                  const on = selected.has(item.key) && selectable(item)
                  const status = downloaded ? statusFor(item) : undefined
                  return (
                    <label
                      key={item.key}
                      onClick={(event) => {
                        if (!event.shiftKey || event.target instanceof HTMLInputElement) return
                        event.preventDefault()
                        toggle(item, true)
                      }}
                      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 52px' }}
                      className={`flex items-center gap-3 px-4 py-2 text-[13px] transition-colors ${item.unavailable ? 'text-subtle' : 'cursor-pointer hover:bg-hover'} ${on ? 'bg-bili/[.05]' : ''}`}
                    >
                      <input
                        type="checkbox"
                        disabled={!selectable(item)}
                        checked={on}
                        onChange={({ nativeEvent }) => toggle(item, nativeEvent instanceof MouseEvent && nativeEvent.shiftKey)}
                        className="accent-bili"
                      />
                      <span className="w-8 shrink-0 text-right text-xs text-subtle tabular-nums">{item.index}</span>
                      {item.cover ? (
                        <img src={item.cover} loading="lazy" referrerPolicy="no-referrer" alt="" className="h-11 w-9 shrink-0 rounded object-cover ring-1 ring-line" />
                      ) : (
                        <span className="h-11 w-9 shrink-0 rounded bg-track" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate" title={item.title}>{item.title}</span>
                        {item.owner && item.owner !== result.owner && <span className="block truncate text-xs text-subtle">{item.owner}</span>}
                      </span>
                      {item.unavailable && <Badge tone="danger">{item.unavailable}</Badge>}
                      {status === 'downloaded' && (
                        <Badge tone="success" icon={Check} title={t('selection.downloadedTitle')}>
                          {t('selection.downloaded')}
                        </Badge>
                      )}
                      {item.badge && <Badge tone="brand">{item.badge}</Badge>}
                      <span className="w-14 shrink-0 text-right text-xs text-subtle tabular-nums">{item.images ? `× ${item.images}` : fmtDuration(item.duration)}</span>
                    </label>
                  )
                })}
              </div>
            ))}
            {paging?.hasMore && !filter && (
              <div className="flex items-center justify-center gap-2 p-4">
                {loadingMore ? (
                  <>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      <Loader2 size={13} className="animate-spin" />
                      {t('selection.loadingPage', { page: paging.page + 1 })}
                    </span>
                    <Button size="sm" variant="ghost" icon={CircleStop} onClick={() => { stopLoading.current = true }}>
                      {t('selection.stop')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button icon={ChevronDown} onClick={() => void loadPages(false)}>
                      {t('selection.loadNext')}
                    </Button>
                    <Button variant="ghost" icon={ChevronsDown} onClick={() => void loadPages(true)} title={t('selection.loadAllTitle')}>
                      {t('ytUi.loadAllUnknown')}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex w-80 shrink-0 flex-col bg-surface">
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
            <Section title={t('selection.quality')} dim={opts.output === 'audio' || videoless}>
              {!info && !infoError && probe && (
                <div className="mb-2 flex items-center gap-2 text-xs text-muted">
                  <Loader2 size={13} className="animate-spin" />
                  {t('selection.fetchingQualities')}
                </div>
              )}
              {infoError && <div className="mb-2 text-xs text-amber-600 dark:text-amber-400">{infoError}</div>}
              <div className="flex flex-col gap-1">
                {qualities.map((q) => {
                  const on = qn === q.qn
                  return (
                    <label
                      key={q.qn}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px] transition-colors ${on ? 'border-bili bg-bili/[.07]' : 'border-line bg-elevated hover:border-line-strong'}`}
                    >
                      <input
                        type="radio"
                        name="dy-qn"
                        disabled={opts.output === 'audio' || videoless}
                        checked={on}
                        onChange={() => {
                          qnPicked.current = true
                          setQn(q.qn)
                        }}
                        className="accent-bili"
                      />
                      <span className={`flex-1 ${on ? 'font-medium' : ''}`}>{q.label}</span>
                      <span className="text-[10px] text-subtle uppercase">{q.codecs.join(' ')}</span>
                    </label>
                  )
                })}
              </div>
              {qn >= DY_ORIGINAL_QN && <div className="mt-1.5 text-xs leading-relaxed text-muted">{t('dyUi.originalHint')}</div>}
            </Section>
            <DyOptionsEditor
              value={opts}
              onChange={setOpts}
              info={info}
              images={all.some((i) => i.images)}
              codecsForQuality={chosen?.codecs.length ? chosen.codecs : undefined}
            />
          </div>

          <div className="border-t border-line bg-elevated p-4">
            <div className="mb-2 text-xs text-muted">{account ? t('dyUi.fromAccount', { name: account.name }) : t('dyUi.notLoggedIn')}</div>
            {dupCount !== null ? (
              <div className="rounded-xl bg-amber-500/12 p-3 text-xs text-amber-800 dark:text-amber-200">
                {t('selection.dupPrompt', { count: dupCount })}
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="primary" disabled={submitting} onClick={() => void enqueue(selectedItems(all, selected).filter((i) => !isDownloaded(i)))}>
                    {t('selection.skipThem')}
                  </Button>
                  <Button size="sm" disabled={submitting} onClick={() => void enqueue(selectedItems(all, selected))}>
                    {t('selection.downloadAnyway')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="primary"
                size="lg"
                icon={submitting ? undefined : Download}
                className="w-full"
                disabled={!selectedCount || submitting || downloaded === null}
                onClick={start}
              >
                {submitting && <Loader2 size={16} className="animate-spin" />}
                {t('selection.downloadCount', { count: selectedCount })}
              </Button>
            )}
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted" title={`${settings.douyin.downloadDir}/${preview}`}>
              <FileVideo size={13} strokeWidth={STROKE} className="shrink-0" />
              <span className="truncate">{preview || '—'}</span>
            </div>
            {canSubscribe(result, paging, all.length) && !subForm && (
              <button type="button" className="mt-2 flex items-center gap-1.5 text-xs text-sky-600 hover:underline dark:text-sky-400" onClick={() => setSubForm(true)}>
                <Rss size={13} strokeWidth={STROKE} />
                {t('selection.subscribeLink')}
              </button>
            )}
            {subForm && (
              <div className="mt-3 rounded-xl border border-line bg-surface p-3 text-xs">
                <div className="flex items-center gap-2">
                  <Rss size={13} strokeWidth={STROKE} className="text-sky-600 dark:text-sky-400" />
                  {t('selection.checkInterval')}
                  <Select size="sm" value={subInterval} onChange={(e) => setSubInterval(Number(e.target.value))}>
                    {intervals().filter((i) => i.min >= MIN_INTERVAL).map((i) => (
                      <option key={i.min} value={i.min}>
                        {t('subs.everyInterval', { interval: i.label })}
                      </option>
                    ))}
                  </Select>
                </div>
                <label className="mt-2 flex items-center gap-1.5">
                  <input type="checkbox" className="accent-bili" checked={subExisting} onChange={(e) => setSubExisting(e.target.checked)} />
                  {t('selection.subExisting')}
                </label>
                <div className="mt-1 text-muted">{t('selection.subHint')}</div>
                <div className="mt-2.5 flex gap-2">
                  <Button size="sm" variant="primary" onClick={subscribe}>
                    {t('selection.subscribe')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSubForm(false)}>
                    {t('selection.cancel')}
                  </Button>
                </div>
              </div>
            )}
            {infoError && !info && <Banner tone="warn">{t('dyUi.qualityFallback')}</Banner>}
          </div>
        </div>
      </div>
    </Modal>
  )
}
