import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Clipboard, ClipboardPaste, Clock, Flame, Folder, Link2, ListPlus, Loader2, Star } from 'lucide-react'
import { extractInputs, rankLabel } from '@shared/parseUrl'
import { useT } from '../i18n'
import { api, parseBatch, parseLink, useStore } from '../store'
import { classifyPaste } from '../viewLogic'
import { Banner, Button, Dropdown, fieldCls, IconButton, MenuItem, MenuLabel, Modal, ModalFooter, ModalHeader, STROKE } from './ui'

/** 菜单打开时才挂载，顺便加载收藏夹 */
function MyMenuContent({ pick }: { pick: (input: string) => void }) {
  const t = useT()
  const [folders, setFolders] = useState<{ id: number; title: string; count: number }[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .myFavFolders()
      .then(setFolders)
      .catch((e: Error) => setError(e.message))
  }, [])

  return (
    <>
      <MenuItem icon={Clock} onClick={() => pick('https://www.bilibili.com/watchlater')}>
        {t('input.watchLater')}
      </MenuItem>
      <MenuLabel>{t('input.popular')}</MenuLabel>
      <MenuItem icon={Flame} onClick={() => pick('每周必看')}>
        {t('input.weekly')}
      </MenuItem>
      <div className="flex flex-wrap gap-1 px-2.5 pt-1 pb-1.5">
        {['all', 'knowledge', 'tech', 'music', 'game', 'douga', 'life', 'cinephile'].map((slug) => (
          <button
            key={slug}
            type="button"
            onClick={() => pick(`https://www.bilibili.com/v/popular/rank/${slug}`)}
            className="rounded-md bg-track px-2 py-0.5 text-xs text-muted transition-colors hover:bg-bili/15 hover:text-bili-dark dark:hover:text-bili"
          >
            {t('input.rank', { name: rankLabel(slug) })}
          </button>
        ))}
      </div>
      <MenuLabel>{t('input.myFavorites')}</MenuLabel>
      {!folders && !error && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted">
          <Loader2 size={13} className="animate-spin" />
          {t('input.loading')}
        </div>
      )}
      {error && <div className="px-2.5 py-1.5 text-xs text-red-600">{error}</div>}
      {folders?.length === 0 && <div className="px-2.5 py-1.5 text-xs text-muted">{t('input.noFavorites')}</div>}
      {folders?.map((f) => (
        <MenuItem
          key={f.id}
          icon={Folder}
          onClick={() => pick(`https://www.bilibili.com/medialist/detail/ml${f.id}`)}
          trailing={<span className="text-xs text-subtle tabular-nums">{f.count}</span>}
        >
          {f.title}
        </MenuItem>
      ))}
    </>
  )
}

/** “我的”：稍后再看、热门和自己的收藏夹，不用再回浏览器复制链接 */
function MyMenu({ onPick }: { onPick: (input: string) => void }) {
  const t = useT()
  const loggedIn = useStore((s) => s.auth?.loggedIn)
  return (
    <Dropdown
      className="w-72"
      button={({ open, toggle }) => (
        <IconButton
          icon={Star}
          label={loggedIn ? t('input.myMenu') : t('input.myMenuLoggedOut')}
          size="lg"
          variant="default"
          className="h-11 w-11 rounded-xl"
          active={open}
          disabled={!loggedIn}
          onClick={toggle}
        />
      )}
    >
      {(close) => (
        <MyMenuContent
          pick={(input) => {
            close()
            onPick(input)
          }}
        />
      )}
    </Dropdown>
  )
}

function BatchDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [text, setText] = useState('')
  const inputs = extractInputs(text)
  return (
    <Modal onClose={onClose}>
      <ModalHeader
        icon={ListPlus}
        title={t('input.batchTitle')}
        subtitle={t('input.batchSubtitle')}
        onClose={onClose}
      />
      <div className="px-6 pt-4">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={'https://www.bilibili.com/video/BV…\nhttps://www.bilibili.com/bangumi/play/ep…\nBV1…'}
          className={`${fieldCls} w-full resize-none p-3 font-mono text-xs leading-relaxed`}
        />
      </div>
      <ModalFooter>
        <span className="flex-1 text-xs text-muted">{t('input.detectedLinks', { count: inputs.length })}</span>
        <Button variant="ghost" onClick={onClose}>
          {t('input.cancel')}
        </Button>
        <Button
          variant="primary"
          icon={ArrowRight}
          disabled={!inputs.length}
          onClick={() => {
            onClose()
            void (inputs.length === 1 ? parseLink(inputs[0]) : parseBatch(inputs))
          }}
        >
          {t('input.parseCount', { count: inputs.length })}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

export function UrlInput() {
  const t = useT()
  const [text, setText] = useState('')
  const [clip, setClip] = useState<string[] | null>(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const lastClip = useRef('')
  const parsing = useStore((s) => s.parsing)
  const progress = useStore((s) => s.progress)
  const error = useStore((s) => s.error)
  const notice = useStore((s) => s.notice)
  const set = useStore((s) => s.set)
  const clipboardWatch = useStore((s) => s.settings?.clipboardWatch)

  const submit = (value: string): void => {
    if (!value.trim() || parsing) return
    setClip(null)
    const inputs = extractInputs(value)
    void (inputs.length > 1 ? parseBatch(inputs) : parseLink(inputs[0] ?? value))
  }

  const pick = (input: string): void => {
    setText(input)
    submit(input)
  }

  useEffect(() => api.onParseProgress((p) => set({ progress: p })), [set])

  // 启动和窗口回到前台时，如果剪贴板里有新的 B站链接就提示
  useEffect(() => {
    if (!clipboardWatch) return
    const onFocus = async (): Promise<void> => {
      let text = ''
      try {
        text = (await api.readClipboard()).trim()
      } catch {
        return
      }
      if (!text || text === lastClip.current) return
      lastClip.current = text
      const inputs = extractInputs(text)
      if (inputs.length) setClip(inputs)
    }
    void onFocus()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [clipboardWatch])

  return (
    <div className="drag shrink-0 px-6 pt-5 pb-1">
      <div className="no-drag flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Link2 size={18} strokeWidth={STROKE} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle" />
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text')
              lastClip.current = pasted.trim()
              const paste = classifyPaste(pasted)
              if (paste.type === 'batch') {
                // 多行内容粘进单行输入框会丢掉换行，直接批量解析
                e.preventDefault()
                setText(paste.inputs.join(' '))
                void parseBatch(paste.inputs)
              } else if (paste.type === 'single') {
                // 粘贴后立即解析
                setTimeout(() => submit(pasted), 0)
              }
            }}
            onKeyDown={(e) => e.key === 'Enter' && submit(text)}
            placeholder={t('input.placeholder')}
            className="h-11 w-full rounded-xl border border-line-strong bg-field pr-11 pl-11 text-sm text-fg shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-subtle focus:border-bili focus:ring-4 focus:ring-bili/15"
          />
          {!text && (
            <button
              type="button"
              title={t('input.pasteAndParse')}
              aria-label={t('input.pasteAndParse')}
              onClick={async () => {
                const clipText = (await api.readClipboard()).trim()
                if (!clipText) return
                lastClip.current = clipText
                setText(clipText)
                submit(clipText)
              }}
              className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-subtle hover:bg-hover hover:text-fg"
            >
              <ClipboardPaste size={16} strokeWidth={STROKE} />
            </button>
          )}
        </div>
        <Button
          variant="primary"
          size="lg"
          className="h-11 min-w-[104px] rounded-xl px-5"
          icon={parsing ? undefined : ArrowRight}
          disabled={parsing || !text.trim()}
          onClick={() => submit(text)}
        >
          {parsing && <Loader2 size={16} className="animate-spin" />}
          {parsing ? t('input.parsing') : t('input.parse')}
        </Button>
        <IconButton icon={ListPlus} label={t('input.batchButton')} size="lg" variant="default" className="h-11 w-11 rounded-xl" onClick={() => setBatchOpen(true)} />
        <MyMenu onPick={pick} />
      </div>

      <div className="no-drag flex flex-col gap-2 empty:hidden [&:not(:empty)]:mt-3">
        {parsing && progress && progress.total > 1 && (
          <Banner icon={Loader2} spin tone="info">
            <div className="flex items-center gap-3">
              <span className="shrink-0 tabular-nums">
                {t('input.parsingProgress', { done: progress.done, total: progress.total })}
              </span>
              <div className="h-1 w-32 shrink-0 overflow-hidden rounded-full bg-sky/20">
                <div className="h-full bg-sky transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
              {progress.title && <span className="truncate opacity-70">{progress.title}</span>}
            </div>
          </Banner>
        )}
        {clip && !parsing && (
          <Banner
            icon={Clipboard}
            tone="info"
            onClose={() => setClip(null)}
            actions={
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setText(clip.join(' '))
                  submit(clip.join('\n'))
                }}
              >
                {clip.length > 1 ? t('input.batchTitle') : t('input.parse')}
              </Button>
            }
          >
            <div className="flex items-center gap-2">
              <span className="shrink-0 font-medium">{clip.length > 1 ? t('input.clipboardLinks', { count: clip.length }) : t('input.clipboardLink')}</span>
              <span className="min-w-0 truncate opacity-70">{clip.join('  ')}</span>
            </div>
          </Banner>
        )}
        {error && (
          <Banner tone="error" onClose={() => set({ error: null })}>
            {error}
          </Banner>
        )}
        {notice && (
          <Banner tone="warn" onClose={() => set({ notice: null })}>
            {notice}
          </Banner>
        )}
      </div>
      {batchOpen && <BatchDialog onClose={() => setBatchOpen(false)} />}
    </div>
  )
}
