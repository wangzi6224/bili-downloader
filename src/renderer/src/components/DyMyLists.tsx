import { useEffect, useState } from 'react'
import { ChevronRight, Loader2, LogIn } from 'lucide-react'
import type { DyListEntry, DySourceCategory } from '@shared/types'
import { currentDyAccount } from '../dyView'
import { useT } from '../i18n'
import { api, reopenDyParseRecord, useStore } from '../store'
import { Banner, Button, EmptyState, Segmented } from './ui'

const SELF = 'https://www.douyin.com/user/self?showTab='

function Entries({ category }: { category: DySourceCategory }) {
  const t = useT()
  const [entries, setEntries] = useState<DyListEntry[] | null>(null)
  const [cursor, setCursor] = useState('')
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (from: string): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const page = await api.dy.lists(category, from)
      setEntries((current) => (from ? [...(current ?? []), ...page.entries] : page.entries))
      setCursor(page.cursor)
      setMore(page.hasMore)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load('')
  }, [])

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <Banner tone="error" actions={<Button size="sm" onClick={() => void load(entries ? cursor : '')}>{t('options.retry')}</Button>}>
          {error}
        </Banner>
      )}
      {entries?.length === 0 && !more && <div className="px-1 text-xs text-muted">{t('dyUi.listsEmpty')}</div>}
      {!!entries?.length && (
        <div className="divide-y divide-line rounded-xl border border-line bg-surface">
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => void reopenDyParseRecord(entry.url)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-hover"
            >
              {entry.cover ? <img src={entry.cover} referrerPolicy="no-referrer" alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" /> : <span className="h-9 w-9 shrink-0 rounded-lg bg-track" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{entry.title}</span>
                <span className="block truncate text-xs text-muted">
                  {[entry.subtitle, entry.count === undefined ? undefined : t('dyUi.listCount', { count: entry.count })].filter(Boolean).join(' · ')}
                </span>
              </span>
              <ChevronRight size={14} className="shrink-0 text-subtle" />
            </button>
          ))}
        </div>
      )}
      {loading && <Loader2 size={16} className="mx-auto animate-spin text-muted" />}
      {more && !loading && !error && (
        <Button variant="ghost" onClick={() => void load(cursor)}>
          {t('dyUi.listsLoadMore')}
        </Button>
      )}
    </div>
  )
}

/** 订阅页里抖音的“我的抖音”：自己的列表、收藏夹、收藏的合集和关注，点开就解析 */
export function DyMyLists() {
  const t = useT()
  const account = useStore((s) => currentDyAccount(s.dyAccounts))
  const set = useStore((s) => s.set)
  const [category, setCategory] = useState<DySourceCategory>('folders')
  if (!account) {
    return (
      <div className="px-8">
        <EmptyState icon={LogIn} title={t('dyUi.sidebarLogin')}>
          {t('dyUi.myListsHint')}
          <div className="mt-3">
            <Button variant="primary" onClick={() => set({ dyLoginOpen: true })}>{t('dyUi.importLogin')}</Button>
          </div>
        </EmptyState>
      </div>
    )
  }
  const mine = [
    { label: t('dyUi.liked'), input: `${SELF}like` },
    { label: t('dyUi.collection'), input: `${SELF}favorite_collection` },
    { label: t('dyUi.watchLater'), input: `${SELF}watch_later` },
    { label: t('dyUi.history'), input: `${SELF}record` },
    { label: t('dyUi.myPosts'), input: `${SELF}post` }
  ]
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
      <div className="divide-y divide-line rounded-xl border border-line bg-surface">
        {mine.map((l) => (
          <button key={l.input} type="button" onClick={() => void reopenDyParseRecord(l.input)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[13px] font-medium hover:bg-hover">
            <span className="flex-1">{l.label}</span>
            <ChevronRight size={14} className="text-subtle" />
          </button>
        ))}
      </div>
      <p className="mt-2 mb-4 px-1 text-xs leading-relaxed text-muted">{t('dyUi.myListsSubscribeHint')}</p>
      <div className="mb-3">
        <Segmented
          value={category}
          onChange={setCategory}
          options={[
            { value: 'folders' as const, label: t('dyUi.listsFolders') },
            { value: 'mixes' as const, label: t('dyUi.listsMixes') },
            { value: 'following' as const, label: t('dyUi.listsFollowing') }
          ]}
        />
      </div>
      <Entries key={`${account.id}-${category}`} category={category} />
    </div>
  )
}
