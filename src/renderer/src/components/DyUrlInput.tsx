import { useEffect, useRef, useState } from 'react'
import { Bookmark, CircleX, Clipboard, ClipboardPaste, Clock, History, Link2, ListPlus, Loader2, ScanLine, ShieldAlert, Star, ThumbsUp, User } from 'lucide-react'
import { extractDyInputs } from '@shared/douyinUrl'
import { currentDyAccount, classifyDyPaste, dyNotice } from '../dyView'
import { useT } from '../i18n'
import { api, dyParseBatch, dyParseLink, useStore, verifyDouyin } from '../store'
import { Banner, Button, Dropdown, fieldCls, IconButton, MenuItem, Modal, ModalFooter, ModalHeader, STROKE } from './ui'

const SELF = 'https://www.douyin.com/user/self?showTab='

/** 要处理的账号状态：安全验证、登录失效、限流 */
export function DyStatusBanner() {
  const t = useT()
  const status = useStore((s) => s.dyStatus)
  const verifying = useStore((s) => s.dyVerifying)
  const set = useStore((s) => s.set)
  const [now, setNow] = useState(Date.now())
  const notice = dyNotice(status, now)
  const counting = notice?.type === 'cooling'
  useEffect(() => {
    setNow(Date.now())
    if (!counting) return
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [counting, status])
  if (!notice) return null
  return (
    <Banner
      icon={notice.type === 'cooling' ? Clock : ShieldAlert}
      tone="warn"
      actions={
        notice.type === 'verify' ? (
          <Button size="sm" variant="primary" disabled={verifying} onClick={() => void verifyDouyin(notice.account)}>
            {verifying && <Loader2 size={13} className="animate-spin" />}
            {t('dyUi.verifyButton')}
          </Button>
        ) : notice.type === 'expired' ? (
          <Button size="sm" variant="primary" onClick={() => set({ dyLoginOpen: true })}>
            {t('dyUi.relogin')}
          </Button>
        ) : undefined
      }
    >
      {verifying && notice.type === 'verify' ? t('dyUi.verifying') : notice.text}
    </Banner>
  )
}

/** “我的”：自己的作品、喜欢、收藏、稍后再看、观看历史（要先登录） */
function MyMenu({ onPick }: { onPick: (input: string) => void }) {
  const t = useT()
  const account = useStore((s) => currentDyAccount(s.dyAccounts))
  const set = useStore((s) => s.set)
  if (!account) {
    return (
      <IconButton
        icon={Star}
        label={t('dyUi.myMenuLoggedOut')}
        size="lg"
        variant="default"
        className="h-11 w-11 rounded-xl"
        onClick={() => set({ dyLoginOpen: true })}
      />
    )
  }
  const items = [
    { icon: User, label: t('dyUi.myPosts'), input: `${SELF}post` },
    { icon: ThumbsUp, label: t('dyUi.liked'), input: `${SELF}like` },
    { icon: Bookmark, label: t('dyUi.collection'), input: `${SELF}favorite_collection` },
    { icon: Clock, label: t('dyUi.watchLater'), input: `${SELF}watch_later` },
    { icon: History, label: t('dyUi.history'), input: `${SELF}record` }
  ]
  return (
    <Dropdown
      className="w-52"
      button={({ open, toggle }) => (
        <IconButton icon={Star} label={t('dyUi.myMenu')} size="lg" variant="default" className="h-11 w-11 rounded-xl" active={open} onClick={toggle} />
      )}
    >
      {(close) =>
        items.map((it) => (
          <MenuItem
            key={it.input}
            icon={it.icon}
            onClick={() => {
              close()
              onPick(it.input)
            }}
          >
            {it.label}
          </MenuItem>
        ))
      }
    </Dropdown>
  )
}

function BatchDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [text, setText] = useState('')
  const inputs = extractDyInputs(text)
  return (
    <Modal onClose={onClose}>
      <ModalHeader icon={ListPlus} title={t('input.batchTitle')} subtitle={t('dyUi.batchSubtitle')} onClose={onClose} />
      <div className="px-6 pt-4">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={'https://v.douyin.com/…\nhttps://www.douyin.com/video/…\nhttps://www.douyin.com/user/…'}
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
          icon={ScanLine}
          disabled={!inputs.length}
          onClick={() => {
            onClose()
            void (inputs.length === 1 ? dyParseLink(inputs[0]) : dyParseBatch(inputs))
          }}
        >
          {t('input.parseCount', { count: inputs.length })}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

export function DyUrlInput() {
  const t = useT()
  const [text, setText] = useState('')
  const [clip, setClip] = useState<string[] | null>(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastClip = useRef('')
  const parsing = useStore((s) => s.dyParsing)
  const progress = useStore((s) => s.dyProgress)
  const error = useStore((s) => s.dyError)
  const notice = useStore((s) => s.dyNotice)
  const set = useStore((s) => s.set)
  const clipboardWatch = useStore((s) => s.settings?.clipboardWatch)
  const InputActionIcon = text ? CircleX : ClipboardPaste
  const inputActionLabel = t(text ? 'input.clearLink' : 'input.pasteAndParse')

  const submit = (value: string): void => {
    if (!value.trim() || parsing) return
    setClip(null)
    const inputs = extractDyInputs(value)
    void (inputs.length > 1 ? dyParseBatch(inputs) : dyParseLink(inputs[0] ?? value))
  }

  const pick = (input: string): void => {
    setText(input)
    submit(input)
  }

  useEffect(() => api.onParseProgress((p) => {
    if (p.site === 'douyin' && useStore.getState().dyParsing) set({ dyProgress: p })
  }), [set])

  // 窗口回到前台时，剪贴板里有新的抖音链接就提示
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
      const inputs = extractDyInputs(text)
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
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text')
              lastClip.current = pasted.trim()
              const paste = classifyDyPaste(pasted)
              if (paste.type === 'batch') {
                e.preventDefault()
                setText(paste.inputs.join(' '))
                void dyParseBatch(paste.inputs)
              } else if (paste.type === 'single') {
                setTimeout(() => submit(pasted), 0)
              }
            }}
            onKeyDown={(e) => e.key === 'Enter' && submit(text)}
            placeholder={t('dyUi.placeholder')}
            aria-label={t('dyUi.placeholder')}
            className="h-11 w-full rounded-xl border border-line-strong bg-field pr-11 pl-11 text-sm text-fg shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-subtle focus:border-bili focus:ring-4 focus:ring-bili/15"
          />
          <button
            type="button"
            title={inputActionLabel}
            aria-label={inputActionLabel}
            onClick={async () => {
              if (text) {
                setText('')
                inputRef.current?.focus()
                return
              }
              const clipText = (await api.readClipboard()).trim()
              if (!clipText) return
              lastClip.current = clipText
              setText(clipText)
              submit(clipText)
            }}
            className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-subtle hover:bg-hover hover:text-fg"
          >
            <InputActionIcon size={16} strokeWidth={STROKE} />
          </button>
        </div>
        <Button
          variant="primary"
          size="lg"
          className="h-11 min-w-[104px] rounded-xl px-5"
          icon={parsing ? undefined : ScanLine}
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
        <DyStatusBanner />
        {parsing && progress && progress.total > 1 && (
          <Banner icon={Loader2} spin tone="info">
            <div className="flex items-center gap-3">
              <span className="shrink-0 tabular-nums">{t('input.parsingProgress', { done: progress.done, total: progress.total })}</span>
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
              <Button size="sm" variant="primary" onClick={() => {
                setText(clip.join(' '))
                submit(clip.join('\n'))
              }}>
                {clip.length > 1 ? t('input.batchTitle') : t('input.parse')}
              </Button>
            }
          >
            <div className="flex items-center gap-2">
              <span className="shrink-0 font-medium">{clip.length > 1 ? t('input.clipboardLinks', { count: clip.length }) : t('dyUi.clipboardLink')}</span>
              <span className="min-w-0 truncate opacity-70">{clip.join('  ')}</span>
            </div>
          </Banner>
        )}
        {error && (
          <Banner tone="error" onClose={() => set({ dyError: null })}>
            {error}
          </Banner>
        )}
        {notice && (
          <Banner tone="warn" onClose={() => set({ dyNotice: null })}>
            {notice}
          </Banner>
        )}
      </div>
      {batchOpen && <BatchDialog onClose={() => setBatchOpen(false)} />}
    </div>
  )
}
