import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronsDown,
  CircleStop,
  CopyMinus,
  Crown,
  Download,
  FileVideo,
  Hash,
  Loader2,
  Rss,
  Search,
  Square,
  UserRound,
  X
} from 'lucide-react'
import { downloadStatusMatcher } from '@shared/downloaded'
import type { Key } from '@shared/i18n'
import { parseRange } from '@shared/range'
import type { MediaGroup, MediaItem, Paging, ParseResult, StreamInfo } from '@shared/types'
import { fmtDuration, thumb } from '../format'
import { useT } from '../i18n'
import {
  appendToFirst,
  bestQuality,
  CODEC_TEXT,
  downloadedMatcher,
  enqueueBatches,
  FALLBACK,
  filterGroups,
  pathPreview,
  resolveDuplicates,
  selectable,
  selectedItems,
  selectionSummary,
  setMany as withMany,
  subscribable as canSubscribe,
  toggleSelection
} from '../selection'
import { api, useStore } from '../store'
import { useLazyNextPage } from '../useLazyNextPage'
import { summaryTags, type EditableOptions } from '../viewLogic'
import { OptionsEditor, Section } from './OptionsEditor'
import { intervals } from './SubscriptionsPage'
import { AccountOrigin } from './AccountOrigin'
import { Badge, Banner, Button, Dropdown, IconButton, Input, MenuItem, Modal, Select, STROKE } from './ui'

const KIND_TEXT: Record<ParseResult['kind'], Key> = {
  ugc: 'selection.kindUgc',
  pgc: 'selection.kindPgc',
  cheese: 'selection.kindCheese',
  audio: 'selection.kindAudio'
}
/** 自动加载全部分页时每页的间隔，避免触发风控 */
const PAGE_INTERVAL = 1000

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

type DuplicatePrompt = {
  count: number
  prepared?: { items: MediaItem[]; note?: string }
}

function SelectionCheckbox({
  count,
  total,
  onChange
}: {
  count: number
  total: number
  onChange: (checked: boolean) => void
}) {
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

export function SelectionDialog({ result, fromSource = false }: { result: ParseResult; fromSource?: boolean }) {
  const t = useT()
  const set = useStore((s) => s.set)
  const settings = useStore((s) => s.settings)!
  const auth = useStore((s) => s.auth)
  const accountMid = useStore((s) => s.sourceAccountMid)
  const account = useStore((s) => s.accounts?.accounts.find((account) => account.mid === accountMid))
  const progress = useStore((s) => s.progress)
  const isVip = account?.vipActive ?? (auth?.loggedIn === true && (accountMid === undefined || auth.user.mid === accountMid) && auth.user.vipActive)
  const audioKind = result.kind === 'audio'

  const [groups, setGroups] = useState<MediaGroup[]>(result.groups)
  const [paging, setPaging] = useState<Paging | undefined>(result.paging)
  const [loadingMore, setLoadingMore] = useState(false)
  const pagingBusy = useRef(false)
  const [pagingFailed, setPagingFailed] = useState(false)
  const [autoPaused, setAutoPaused] = useState(false)
  const stopLoading = useRef(false)
  const all = useMemo(() => groups.flatMap((g) => g.items), [groups])
  const [selected, setSelected] = useState(() => new Set(result.defaultSelected))
  const lastClicked = useRef<MediaItem | null>(null)
  const [downloaded, setDownloaded] = useState<string[] | null>(null)
  const [historyError, setHistoryError] = useState(false)
  const [historyAttempt, setHistoryAttempt] = useState(0)
  const [dupPrompt, setDupPrompt] = useState<DuplicatePrompt | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'warn' | 'error'; message: string } | null>(null)
  const [filter, setFilter] = useState('')
  const [range, setRange] = useState('')

  const [info, setInfo] = useState<StreamInfo | null>(null)
  const [infoError, setInfoError] = useState<string | null>(null)
  const [qn, setQn] = useState(settings.defaultQn)
  const [opts, setOpts] = useState<EditableOptions>(() =>
    audioKind ? { ...settings.defaults, output: 'audio' } : settings.defaults
  )
  const [submitting, setSubmitting] = useState(false)
  const [subForm, setSubForm] = useState(false)
  const [subInterval, setSubInterval] = useState(360)
  const [subExisting, setSubExisting] = useState(false)

  useEffect(() => {
    let request = 0
    const refresh = (): void => {
      const id = ++request
      api.history.downloadedKeys().then((keys) => {
        if (id !== request) return
        setDownloaded(keys)
        setHistoryError(false)
      }).catch(() => {
        if (id !== request) return
        setDownloaded(null)
        setHistoryError(true)
      })
    }
    const off = api.history.onDownloadsChanged(refresh)
    refresh()
    return () => {
      request++
      off()
    }
  }, [historyAttempt])

  const statusFor = useMemo(() => downloadStatusMatcher(downloaded ?? []), [downloaded])
  const isDownloaded = useMemo(
    () => fromSource ? (item: MediaItem) => statusFor(item) === 'downloaded' : downloadedMatcher(downloaded ?? []),
    [downloaded, fromSource, statusFor]
  )

  useEffect(() => {
    stopLoading.current = false
    return () => { stopLoading.current = true }
  }, [])

  useEffect(() => {
    setDupPrompt(null)
  }, [selected])

  const reportError = (e: unknown): void => {
    const message = (e as Error).message
    if (fromSource) setFeedback({ tone: 'error', message })
    else set({ error: message })
  }

  // 用第一个选中项（没有就用第一项）查询可用清晰度和音轨
  const probe = all.find((i) => selected.has(i.key) && !i.unavailable) ?? all.find((i) => !i.unavailable)
  useEffect(() => {
    if (!probe) return
    let alive = true
    setInfo(null)
    setInfoError(null)
    api
      .streamInfo(probe, accountMid)
      .then((s) => {
        if (!alive) return
        setInfo(s)
        const best = bestQuality(s.qualities, isVip, settings.defaultQn)
        if (best) setQn(best.qn)
      })
      .catch((e: Error) => alive && setInfoError(e.message))
    return () => {
      alive = false
    }
  }, [probe?.key, accountMid])

  const appendPage = async (page: number): Promise<boolean> => {
    if (!paging) return false
    const r = accountMid === undefined
      ? await api.parseMore(paging.source, page)
      : await api.parseMore(paging.source, page, accountMid)
    setGroups((gs) => appendToFirst(gs, r.items))
    setPaging({ ...paging, page, total: r.total, hasMore: r.hasMore })
    return r.hasMore
  }

  const loadNext = async (): Promise<void> => {
    if (!paging?.hasMore || pagingBusy.current) return
    pagingBusy.current = true
    setFeedback(null)
    setPagingFailed(false)
    setLoadingMore(true)
    try {
      await appendPage(paging.page + 1)
    } catch (e) {
      setPagingFailed(true)
      reportError(e)
    } finally {
      pagingBusy.current = false
      setLoadingMore(false)
    }
  }

  const loadAll = async (): Promise<void> => {
    if (!paging?.hasMore || pagingBusy.current) return
    pagingBusy.current = true
    setFeedback(null)
    setPagingFailed(false)
    setLoadingMore(true)
    stopLoading.current = false
    try {
      for (let page = paging.page + 1; !stopLoading.current; page++) {
        const more = await appendPage(page)
        if (!more) break
        await sleep(PAGE_INTERVAL)
      }
    } catch (e) {
      setPagingFailed(true)
      reportError(e)
    } finally {
      pagingBusy.current = false
      setLoadingMore(false)
    }
  }

  const sentinel = useLazyNextPage(
    fromSource && !!paging?.hasMore && !loadingMore && !pagingFailed && !submitting && !autoPaused,
    paging?.page ?? 0, filter.trim(), loadNext
  )
  const visible = useMemo(() => filterGroups(groups, filter), [groups, filter])
  const visibleItems = useMemo(() => visible.flatMap((g) => g.items), [visible])

  // Shift 点击：把区间内的都设成同一个状态
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
    set({ parse: null, source: null, sourceAccountMid: undefined })
  }

  const enqueue = async (items: MediaItem[], preparationNote?: string): Promise<void> => {
    if (!items.length) {
      if (fromSource) {
        setFeedback({ tone: 'warn', message: preparationNote ?? t('subs.allSkipped') })
        setSubmitting(false)
      } else close()
      return
    }
    setSubmitting(true)
    const options = { qn, ...opts, output: audioKind ? ('audio' as const) : opts.output }
    try {
      const notes = preparationNote ? [preparationNote] : []
      for (const b of enqueueBatches(result, groups, items)) {
        const note = await api.download.enqueue({ ...b, options }, accountMid)
        if (note) notes.push(note)
      }
      if (notes.length) set({ notice: notes.join(t('input.separator')) })
      if (settings.rememberLast && !audioKind) {
        set({ settings: await api.settings.set({ defaults: opts, defaultQn: qn }) })
      }
      if (fromSource) {
        if (useStore.getState().parse === result) set({ view: 'downloads', parse: null, source: null, sourceAccountMid: undefined })
      } else close()
    } catch (e) {
      reportError(e)
      setSubmitting(false)
    }
  }

  const start = async (): Promise<void> => {
    const items = selectedItems(all, selected)
    if (!fromSource) {
      const decision = resolveDuplicates(items, isDownloaded, settings.duplicateAction)
      if ('ask' in decision) setDupPrompt({ count: decision.ask.length })
      else void enqueue(decision.enqueue)
      return
    }

    setFeedback(null)
    setSubmitting(true)
    set({ progress: null })
    try {
      const prepared = items.some((item) => item.lazy) ? await api.sources.prepareItems(items, accountMid) : { items }
      if (!prepared.items.length) {
        setFeedback({ tone: 'error', message: prepared.note ?? t('subs.noDownloadableSelection') })
        return
      }
      const keys = new Set(await api.history.downloadedKeys())
      if (useStore.getState().parse !== result) return
      const exact = (item: MediaItem): boolean => keys.has(item.key)
      const decision = resolveDuplicates(prepared.items, exact, settings.duplicateAction)
      if ('ask' in decision) {
        setDupPrompt({ count: decision.ask.length, prepared })
      } else {
        await enqueue(decision.enqueue, prepared.note)
      }
    } catch (e) {
      reportError(e)
    } finally {
      setSubmitting(false)
    }
  }

  const confirmDuplicates = async (skip: boolean): Promise<void> => {
    if (dupPrompt?.prepared) {
      const { items, note } = dupPrompt.prepared
      setSubmitting(true)
      try {
        const keys = skip ? new Set(await api.history.downloadedKeys()) : null
        if (useStore.getState().parse !== result) return
        setDupPrompt(null)
        await enqueue(keys ? items.filter((item) => !keys.has(item.key)) : items, note)
      } catch (e) {
        reportError(e)
        setSubmitting(false)
      }
    } else {
      const items = selectedItems(all, selected)
      void enqueue(skip ? items.filter((item) => !isDownloaded(item)) : items)
    }
  }

  const qualities = info?.qualities ?? (infoError ? FALLBACK : [])
  const chosen = qualities.find((q) => q.qn === qn)
  const showList = groups.length > 1 || all.length > 1 || Boolean(filter) || (fromSource && !!paging?.hasMore)
  const selectedCount = selectedItems(all, selected).length
  const visibleSelection = selectionSummary(visibleItems, selected)
  const hiddenSelected = selectedCount - visibleSelection.count
  const selectLabel = filter.trim() ? 'selection.selectAllFiltered' : paging?.hasMore ? 'selection.selectAllLoaded' : 'selection.selectAll'

  // 保存路径预览：和主进程用同一套模板
  const preview = useMemo(
    () => pathPreview({ result, groups, all, selected, naming: settings.naming, opts, audioKind, chosen, now: Date.now() }),
    [all, groups, selected, settings.naming, result, opts, chosen, audioKind]
  )

  const subscribable = !fromSource && canSubscribe(result, paging, all.length)

  const subscribe = async (): Promise<void> => {
    try {
      await api.subs.add({
        input: result.input!,
        title: result.title,
        kind: result.kind,
        options: { qn, ...opts, output: audioKind ? 'audio' : opts.output },
        intervalMin: subInterval,
        includeExisting: subExisting,
        currentKeys: all.map((i) => i.key)
      }, accountMid)
      const label = intervals().find((i) => i.min === subInterval)?.label ?? ''
      set({ notice: t('selection.subscribed', { title: result.title, interval: label }) })
      close()
    } catch (e) {
      set({ error: (e as Error).message })
    }
  }

  const downloadedCount = all.filter(isDownloaded).length
  const lazyCount = all.filter((i) => selected.has(i.key) && i.lazy).length

  return (
    <Modal onClose={close} className="flex h-[86vh] max-w-6xl flex-col">
      <div className="flex items-center gap-4 border-b border-line px-5 py-4">
        {result.cover && (
          <img
            src={thumb(result.cover, 240)}
            referrerPolicy="no-referrer"
            className="h-16 w-28 shrink-0 rounded-lg object-cover ring-1 ring-line"
            alt=""
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold">{result.title}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge tone="brand">{result.batch ? t('selection.sources', { count: groups.length }) : t(KIND_TEXT[result.kind])}</Badge>
            {result.owner && (
              <span className="flex items-center gap-1">
                <UserRound size={12} strokeWidth={STROKE} />
                {result.owner}
              </span>
            )}
            <span className="tabular-nums">{paging ? t('selection.loadedOf', { count: all.length, total: paging.total }) : t('selection.totalItems', { count: all.length })}</span>
            {fromSource && downloaded ? (
              <Badge tone={downloadedCount ? 'success' : 'neutral'}>
                {t('subs.statusSummary', { count: downloadedCount, total: all.length })}
              </Badge>
            ) : downloadedCount > 0 && (
              <Badge tone="success" icon={Check}>
                {t('selection.downloadedBefore', { count: downloadedCount })}
              </Badge>
            )}
          </div>
        </div>
        <IconButton icon={X} label={t('selection.close')} onClick={close} className="self-start" />
      </div>

      <div className="flex min-h-0 flex-1">
        <div inert={fromSource && submitting} className="flex min-w-0 flex-1 flex-col border-r border-line">
          {fromSource && historyError && (
            <div role="alert" className="p-3">
              <Banner tone="error" actions={
                <Button size="sm" variant="ghost" onClick={() => setHistoryAttempt((n) => n + 1)}>{t('tasks.retry')}</Button>
              }>
                {t('subs.historyUnavailable')}
              </Banner>
            </div>
          )}
          {showList && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line px-4 py-2">
              <div className="flex min-w-0 items-center gap-0.5">
                <label className="flex min-h-7 cursor-pointer items-center gap-2 text-xs font-medium text-fg has-disabled:cursor-default has-disabled:text-subtle">
                  <SelectionCheckbox {...visibleSelection} onChange={(checked) => setMany(visibleItems, checked)} />
                  {t(selectLabel)}
                </label>
                <Dropdown align="start" className="w-max min-w-40" button={({ open, toggle }) => (
                  <IconButton
                    icon={ChevronDown}
                    size="sm"
                    label={t('selection.selectionActions')}
                    active={open}
                    aria-expanded={open}
                    disabled={!visibleSelection.total && !selectedCount}
                    onClick={toggle}
                  />
                )}>
                  {(closeMenu) => (
                    <>
                      {visibleSelection.total > 0 && (
                        <MenuItem icon={ArrowLeftRight} onClick={() => { setMany(visibleItems, 'invert'); closeMenu() }}>
                          {t('selection.invert')}
                        </MenuItem>
                      )}
                      {selectedCount > 0 && (
                        <MenuItem icon={Square} onClick={() => { setMany(all, false); closeMenu() }}>
                          {t('selection.selectNone')}
                        </MenuItem>
                      )}
                      {downloadedCount > 0 && (
                        <MenuItem icon={CopyMinus} onClick={() => { setMany(all.filter(isDownloaded), false); closeMenu() }}>
                          {t('selection.deselectDownloaded')}
                        </MenuItem>
                      )}
                    </>
                  )}
                </Dropdown>
              </div>
              <Input
                icon={Search}
                size="sm"
                value={filter}
                onChange={(e) => {
                  lastClicked.current = null
                  setFilter(e.target.value)
                  setAutoPaused(false)
                }}
                placeholder={t('selection.filterPlaceholder')}
                className="w-36"
              />
              <Input
                icon={Hash}
                size="sm"
                value={range}
                onChange={(e) => setRange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const indices = parseRange(range)
                    lastClicked.current = null
                    setSelected(new Set(all.filter((i) => indices.has(i.index) && selectable(i)).map((i) => i.key)))
                  }
                }}
                placeholder={t('selection.rangePlaceholder')}
                title={t('selection.rangeTitle')}
                className="w-32"
              />
              <span role="status" className="ml-auto text-xs text-muted tabular-nums">
                {t('selection.selectedCount', { count: selectedCount })}
                {hiddenSelected > 0 && ` · ${t('selection.hiddenSelected', { count: hiddenSelected })}`}
              </span>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {fromSource && !all.length && !paging?.hasMore && (
              <p className="p-6 text-center text-sm text-muted">{t('subs.noItems')}</p>
            )}
            {fromSource && all.length > 0 && !visible.length && !paging?.hasMore && (
              <p className="p-6 text-center text-sm text-muted">{t('subs.noMatches')}</p>
            )}
            {visible.map((g) => (
              <div key={g.id}>
                {groups.length > 1 && (
                  <label className="sticky top-0 z-10 flex cursor-pointer items-center gap-2 border-b border-line bg-elevated/95 px-4 py-1.5 text-xs font-medium text-muted backdrop-blur has-disabled:cursor-default">
                    <SelectionCheckbox {...selectionSummary(g.items, selected)} onChange={(checked) => setMany(g.items, checked)} />
                    {g.title}
                    <span className="font-normal text-subtle tabular-nums">
                      {paging && g.id === groups[0].id ? t('selection.groupLoaded', { count: g.items.length, total: paging.total }) : g.items.length}
                    </span>
                  </label>
                )}
                {g.items.map((item) => {
                  const on = selected.has(item.key) && selectable(item)
                  const status = fromSource && downloaded ? statusFor(item) : undefined
                  return (
                    <label
                      key={item.key}
                      onClick={(event) => {
                        if (!event.shiftKey || event.target instanceof HTMLInputElement) return
                        // 标签转发给复选框的点击可能丢失 Shift，区间操作在这里处理一次。
                        event.preventDefault()
                        toggle(item, true)
                      }}
                      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 38px' }}
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
                      <span className="min-w-0 flex-1 truncate" title={item.title}>
                        {item.title}
                      </span>
                      {item.owner && item.owner !== result.owner && (
                        <span className="max-w-28 shrink-0 truncate text-xs text-subtle">{item.owner}</span>
                      )}
                      {item.unavailable && <Badge tone="danger">{item.unavailable}</Badge>}
                      {(fromSource ? status === 'downloaded' : isDownloaded(item)) && (
                        <Badge tone="success" icon={Check} title={t('selection.downloadedTitle')}>
                          {t('selection.downloaded')}
                        </Badge>
                      )}
                      {status === 'parts' && (
                        <Badge tone="info">{t('subs.partsDownloaded')}</Badge>
                      )}
                      {status === 'missing' && !item.unavailable && (
                        <Badge>{t('subs.notDownloaded')}</Badge>
                      )}
                      {item.badge && <Badge tone="brand">{item.badge}</Badge>}
                      {item.needVip && !isVip && !item.badge && <Badge tone="brand">{t('selection.needVip')}</Badge>}
                      <span className="w-14 shrink-0 text-right text-xs text-subtle tabular-nums">{fmtDuration(item.duration)}</span>
                    </label>
                  )
                })}
              </div>
            ))}
            {paging?.hasMore && (fromSource || !filter) && (
              <div ref={sentinel} className="flex items-center justify-center gap-2 p-4">
                {loadingMore ? (
                  <>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      <Loader2 size={13} className="animate-spin" />
                      {t('selection.loadingPage', { page: paging.page + 1 })}
                    </span>
                    <Button size="sm" variant="ghost" icon={CircleStop} onClick={() => {
                      stopLoading.current = true
                      setAutoPaused(true)
                    }}>
                      {t('selection.stop')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button icon={ChevronDown} onClick={loadNext}>
                      {t('selection.loadNext')}
                    </Button>
                    <Button variant="ghost" icon={ChevronsDown} onClick={loadAll} title={t('selection.loadAllTitle')}>
                      {t('selection.loadAll', { count: paging.total - all.length })}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex w-80 shrink-0 flex-col bg-surface">
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
            {!audioKind && (
              <Section title={t('selection.quality')} dim={opts.output === 'audio'}>
                {!info && !infoError && (
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <Loader2 size={13} className="animate-spin" />
                    {t('selection.fetchingQualities')}
                  </div>
                )}
                {infoError && <div className="mb-2 text-xs text-amber-600 dark:text-amber-400">{infoError}</div>}
                <div className="flex flex-col gap-1">
                  {qualities.map((q) => {
                    const locked = (q.needVip && !isVip) || (info !== null && !q.codecs.length)
                    const on = qn === q.qn
                    return (
                      <label
                        key={q.qn}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px] transition-colors ${on ? 'border-bili bg-bili/[.07]' : 'border-line bg-elevated'} ${locked ? 'opacity-45' : 'cursor-pointer hover:border-line-strong'}`}
                      >
                        <input
                          type="radio"
                          name="qn"
                          disabled={locked || opts.output === 'audio'}
                          checked={on}
                          onChange={() => setQn(q.qn)}
                          className="accent-bili"
                        />
                        <span className={`flex-1 ${on ? 'font-medium' : ''}`}>{q.label}</span>
                        <span className="text-[10px] text-subtle">{q.codecs.map((c) => CODEC_TEXT[c]).join(' ')}</span>
                        {q.needVip && (
                          <Badge tone="brand" icon={Crown}>
                            {t('selection.vip')}
                          </Badge>
                        )}
                      </label>
                    )
                  })}
                </div>
              </Section>
            )}
            {audioKind && <div className="text-xs leading-relaxed text-muted">{t('selection.audioOnlyHint')}</div>}
            <OptionsEditor value={opts} onChange={setOpts} info={info} codecsForQuality={chosen?.codecs} />
          </div>

          {/* 下载按钮固定在底部，不随选项滚动 */}
          <div className="border-t border-line bg-elevated p-4">
            <div className="mb-3 flex flex-wrap gap-1">
              {summaryTags(audioKind ? { ...opts, output: 'audio' } : opts, info).map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>
            <div className="mb-2 text-xs text-muted">
              <AccountOrigin mid={accountMid ?? (auth?.loggedIn ? auth.user.mid : undefined)} />
            </div>
            {submitting && lazyCount > 0 && progress ? (
              <div className="flex items-center gap-2 text-xs text-muted">
                <Loader2 size={13} className="animate-spin" />
                {t('selection.fetchingParts', { done: progress.done, total: progress.total })}
              </div>
            ) : dupPrompt ? (
              <div className="rounded-xl bg-amber-500/12 p-3 text-xs text-amber-800 dark:text-amber-200">
                {t('selection.dupPrompt', { count: dupPrompt.count })}
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={submitting}
                    onClick={() => void confirmDuplicates(true)}
                  >
                    {t('selection.skipThem')}
                  </Button>
                  <Button size="sm" disabled={submitting} onClick={() => void confirmDuplicates(false)}>
                    {t('selection.downloadAnyway')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="primary"
                size="lg"
                icon={Download}
                className="w-full"
                disabled={!selectedCount || submitting || (fromSource && !downloaded) || (!audioKind && !info && !infoError && opts.output !== 'audio')}
                onClick={start}
              >
                {t('selection.downloadCount', { count: selectedCount })}
              </Button>
            )}
            {lazyCount > 0 && !submitting && (
              <div className="mt-1.5 text-xs leading-relaxed text-muted">{t('selection.lazyHint', { count: lazyCount })}</div>
            )}
            {feedback && (
              <div role="alert" className="mt-2">
                <Banner tone={feedback.tone} onClose={() => setFeedback(null)}>{feedback.message}</Banner>
              </div>
            )}
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted" title={`${settings.downloadDir}/${preview}`}>
              <FileVideo size={13} strokeWidth={STROKE} className="shrink-0" />
              <span className="truncate">{preview || '—'}</span>
            </div>
            {subscribable && !subForm && (
              <button
                type="button"
                className="mt-2 flex items-center gap-1.5 text-xs text-sky-600 hover:underline dark:text-sky-400"
                onClick={() => setSubForm(true)}
              >
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
                    {intervals().map((i) => (
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
          </div>
        </div>
      </div>
    </Modal>
  )
}
