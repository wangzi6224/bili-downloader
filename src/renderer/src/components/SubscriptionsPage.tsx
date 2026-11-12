import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Clock, Download, Folder, Loader2, LogIn, RefreshCw, Rss, Search, Trash2, Tv } from 'lucide-react'
import type { AccountSource, AccountSourceCategory, SourceRef, Subscription } from '@shared/types'
import { t, type Key } from '@shared/i18n'
import { checkedAgo, thumb } from '../format'
import { useT } from '../i18n'
import { api, openSource, useStore } from '../store'
import { useLazyNextPage } from '../useLazyNextPage'
import { AccountOrigin } from './AccountOrigin'
import { Banner, Button, EmptyState, IconButton, Input, PageHeader, Segmented, Select, STROKE, Switch } from './ui'

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
  const [tab, setTab] = useState<'local' | 'account'>('local')
  const auth = useStore((s) => s.auth)
  const set = useStore((s) => s.set)
  const quick = useQuickDownload()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t('subs.title')} subtitle={tab === 'local' ? t('subs.subtitle') : auth?.loggedIn && auth.user.uname} />
      <div className="px-8 pb-4">
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'local', label: t('subs.local') },
          { value: 'account', label: t('subs.account') }
        ]} />
      </div>
      {quick.pending && (
        <div role="status" className="px-8 pb-3">
          <Banner icon={Loader2} spin>{t('subs.quickPreparing', { title: quick.pending })}</Banner>
        </div>
      )}
      {quick.feedback && (
        <div role="status" className="px-8 pb-3">
          <Banner tone={quick.feedback.tone} onClose={quick.dismiss}>{quick.feedback.message}</Banner>
        </div>
      )}
      {tab === 'local' ? (
        <LocalSubscriptions quick={quick} />
      ) : auth?.loggedIn ? (
        <AccountSources key={auth.user.mid} mid={auth.user.mid} quick={quick} />
      ) : (
        <div className="px-8">
          {auth === null ? (
            <LoadingSources />
          ) : (
            <EmptyState icon={LogIn} title={t(auth.expired ? 'sidebar.loginExpired' : 'sidebar.login')}>
              {t('subs.signInHint')}
              <div className="mt-3">
                <Button variant="primary" onClick={() => set({ loginOpen: true })}>{t('sidebar.login')}</Button>
              </div>
            </EmptyState>
          )}
        </div>
      )}
    </div>
  )
}

function useQuickDownload() {
  const t = useT()
  const [pending, setPending] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'info' | 'warn' | 'error'; message: string } | null>(null)
  const run = async (source: SourceRef, title: string): Promise<void> => {
    if (pending !== null) return
    setPending(title)
    setFeedback(null)
    try {
      const result = await api.sources.subscribeDownload(source)
      const status = result.count
        ? t('subs.quickQueued', { count: result.count })
        : t('subs.quickUpToDate')
      setFeedback({
        tone: result.note ? 'warn' : 'info',
        message: [result.subscribed ? t('subs.quickSubscribed', { title: result.title }) : '', status, result.note]
          .filter(Boolean).join(t('input.separator'))
      })
    } catch (e) {
      setFeedback({ tone: 'error', message: (e as Error).message })
    } finally {
      setPending(null)
    }
  }
  return { pending, feedback, run, dismiss: () => setFeedback(null) }
}

type QuickDownload = ReturnType<typeof useQuickDownload>

function useSourceOpener() {
  const request = useRef(0)
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<{ source: SourceRef; key: string; message: string } | null>(null)
  useEffect(() => () => { request.current++ }, [])

  const open = async (source: SourceRef, key: string): Promise<void> => {
    const id = ++request.current
    const isCurrent = (): boolean => request.current === id
    setPending(key)
    setFailed(null)
    try {
      await openSource(source, isCurrent)
    } catch (e) {
      if (isCurrent()) setFailed({ source, key, message: (e as Error).message })
    } finally {
      if (isCurrent()) setPending(null)
    }
  }
  return { open, pending, failed }
}

function SourceError({ message, retry }: { message: string; retry: () => void }) {
  const t = useT()
  return (
    <div role="alert" className="mb-3">
      <Banner tone="error" actions={<Button size="sm" variant="ghost" onClick={retry}>{t('tasks.retry')}</Button>}>
        {message}
      </Banner>
    </div>
  )
}

function LoadingSources() {
  const t = useT()
  return (
    <div role="status" className="flex items-center gap-2 py-3 text-xs text-muted">
      <Loader2 size={14} className="animate-spin" />
      {t('input.loading')}
    </div>
  )
}

function SourceSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useT()
  return (
    <div className="px-8 pb-3">
      <Input
        type="search"
        icon={Search}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t('subs.search')}
        placeholder={t('subs.search')}
        className="max-w-80"
      />
    </div>
  )
}

function LocalSubscriptions({ quick }: { quick: QuickDownload }) {
  const t = useT()
  const [subs, setSubs] = useState<Subscription[] | null>(null)
  const [checking, setChecking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [search, setSearch] = useState('')
  const { open, pending, failed } = useSourceOpener()
  const query = search.trim().toLowerCase()
  const visible = subs?.filter((s) => s.title.toLowerCase().includes(query) || s.input.toLowerCase().includes(query))

  useEffect(() => {
    let initial = true
    const off = api.subs.onUpdate((list) => {
      initial = false
      setError(null)
      setSubs(list)
    })
    api.subs.list().then((list) => {
      if (initial) setSubs(list)
    }).catch((e: Error) => {
      if (initial) setError(e.message)
    })
    return () => {
      initial = false
      off()
    }
  }, [attempt])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SourceSearch value={search} onChange={setSearch} />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {error && <SourceError message={error} retry={() => { setError(null); setAttempt(attempt + 1) }} />}
        {failed && <SourceError message={failed.message} retry={() => void open(failed.source, failed.key)} />}
        {subs === null && !error && <LoadingSources />}
        {subs?.length === 0 && (
          <EmptyState icon={Rss} title={t('subs.empty')}>
            {t('subs.emptyHint')}
          </EmptyState>
        )}
        {!!subs?.length && !visible?.length && <EmptyState icon={Search} title={t('subs.noMatches')} />}
        {!!visible?.length && (
          <div className="divide-y divide-line rounded-xl border border-line bg-surface">
            {visible.map((s) => (
              <div key={s.id} className="group flex items-center gap-4 px-4 py-3">
                <Switch
                  checked={s.enabled}
                  label={s.enabled ? t('subs.enabled') : t('subs.disabled')}
                  onChange={async (enabled) => setSubs(await api.subs.update(s.id, { enabled }))}
                />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    title={s.input}
                    disabled={pending !== null}
                    aria-busy={pending === s.id}
                    className={`flex max-w-full items-center gap-1.5 rounded text-left text-[13px] font-medium hover:text-bili-dark dark:hover:text-bili ${s.enabled ? '' : 'text-muted'}`}
                    onClick={() => void open({ type: 'subscription', id: s.id }, s.id)}
                  >
                    <span className="truncate">{s.title}</span>
                    {pending === s.id
                      ? <Loader2 size={13} className="shrink-0 animate-spin" />
                      : <ChevronRight size={13} className="shrink-0 text-subtle" />}
                  </button>
                  <div className="mt-0.5 truncate text-xs text-muted">
                    <AccountOrigin mid={s.accountMid} />{' · '}
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
                    icon={Download}
                    label={t('subs.downloadMissing')}
                    disabled={quick.pending !== null || checking === s.id}
                    onClick={() => void quick.run({ type: 'subscription', id: s.id }, s.title)}
                  />
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

const CATEGORIES = {
  anime: 'subs.anime',
  cinema: 'subs.cinema',
  collected: 'subs.collected',
  folders: 'subs.folders',
  watchlater: 'input.watchLater'
} as const satisfies Record<AccountSourceCategory | 'watchlater', Key>

function AccountSources({ mid, quick }: { mid: number; quick: QuickDownload }) {
  const t = useT()
  const [category, setCategory] = useState<AccountSourceCategory | 'watchlater'>('anime')
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="overflow-x-auto px-8 pb-3">
        <Segmented
          size="sm"
          value={category}
          onChange={setCategory}
          options={(Object.keys(CATEGORIES) as Array<keyof typeof CATEGORIES>).map((value) => ({ value, label: t(CATEGORIES[value]) }))}
        />
      </div>
      <AccountSourceList key={category} mid={mid} category={category} quick={quick} />
    </div>
  )
}

function AccountSourceList({ mid, category, quick }: { mid: number; category: AccountSourceCategory | 'watchlater'; quick: QuickDownload }) {
  const t = useT()
  const { open, pending, failed } = useSourceOpener()
  const request = useRef(0)
  const loadingPage = useRef(false)
  const [items, setItems] = useState<AccountSource[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(category !== 'watchlater')
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()

  const load = useCallback(async (next: number): Promise<void> => {
    if (category === 'watchlater' || loadingPage.current) return
    const id = ++request.current
    loadingPage.current = true
    setLoading(true)
    setError(null)
    try {
      const result = await api.sources.listAccount(mid, category, next)
      if (request.current !== id) return
      setItems((previous) => [...new Map([...previous, ...result.items].map((item) => [item.key, item])).values()])
      setHasMore(result.hasMore)
      setPage(next)
    } catch (e) {
      if (request.current === id) setError((e as Error).message)
    } finally {
      if (request.current === id) {
        loadingPage.current = false
        setLoading(false)
      }
    }
  }, [mid, category])

  useEffect(() => {
    void load(1)
    return () => {
      request.current++
      loadingPage.current = false
    }
  }, [load])
  const sentinel = useLazyNextPage(hasMore && !loading && !error, page, query, () => load(page + 1))

  const sources: AccountSource[] = category === 'watchlater'
    ? [{ key: 'watchlater', title: t('input.watchLater'), target: { type: 'watchlater' } }]
    : items
  const rows = sources.filter((source) => source.title.toLowerCase().includes(query))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {category !== 'watchlater' && <SourceSearch value={search} onChange={setSearch} />}
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {failed && <SourceError message={failed.message} retry={() => void open(failed.source, failed.key)} />}
        {error && <SourceError message={error} retry={() => void load(page + 1)} />}
        {!rows.length && !loading && !hasMore && !error && (
          <EmptyState icon={query ? Search : Folder} title={t(query ? 'subs.noMatches' : 'subs.accountEmpty')} />
        )}
        {rows.length > 0 && (
          <div className="divide-y divide-line rounded-xl border border-line bg-surface">
            {rows.map(({ key, title, cover, target }) => {
              const Icon = target.type === 'watchlater' ? Clock : target.type === 'pgc' ? Tv : Folder
              const source: SourceRef = { type: 'account', mid, target }
              return (
                <div
                  key={key}
                  style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 60px' }}
                  className="flex items-center gap-2 pr-3 first:rounded-t-xl last:rounded-b-xl hover:bg-hover"
                >
                  <button
                    type="button"
                    disabled={pending !== null}
                    aria-busy={pending === key}
                    onClick={() => void open(source, key)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left text-[13px] font-medium"
                  >
                    <span className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-track text-muted">
                      {cover
                        ? <img src={thumb(cover, 120)} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" />
                        : <Icon size={17} strokeWidth={STROKE} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate" title={title}>{title}</span>
                    {pending === key
                      ? <Loader2 size={15} className="shrink-0 animate-spin text-muted" />
                      : <ChevronRight size={15} className="shrink-0 text-subtle" />}
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Download}
                    disabled={quick.pending !== null}
                    onClick={() => void quick.run(source, title)}
                  >
                    {t('subs.subscribeDownload')}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
        {loading && <LoadingSources />}
        {hasMore && !error && (
          <div ref={sentinel}>
            {!loading && (
              <Button className="mt-3" icon={ChevronDown} onClick={() => void load(page + 1)}>
                {t('selection.loadNext')}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
