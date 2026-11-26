import { useEffect, useRef, useState } from 'react'
import { CircleX, Clipboard, ClipboardPaste, Clock, History, Link2, ListPlus, Loader2, PackageCheck, RotateCw, ScanLine, Star, ThumbsUp, Tv, X } from 'lucide-react'
import { extractYtInputs } from '@shared/ytUrl'
import { useT } from '../i18n'
import { api, useStore, ytParseBatch, ytParseLink } from '../store'
import { classifyYtPaste, currentYtAccount, engineLine } from '../ytView'
import { Banner, Button, Dropdown, fieldCls, IconButton, MenuItem, Modal, ModalFooter, ModalHeader, Progress, STROKE } from './ui'

/** 组件状态：第一次用时下载 yt-dlp 的进度、出错时重试、后台更新中 */
export function EngineBanner() {
  const t = useT()
  const status = useStore((s) => s.ytEngine)
  const line = engineLine(status)
  if (!line) return null
  return (
    <Banner
      icon={line.busy ? Loader2 : PackageCheck}
      spin={line.busy}
      tone={line.error ? 'error' : 'info'}
      actions={
        line.busy ? (
          status?.state === 'downloading' && status.stage === 'download' ? (
            <Button size="sm" variant="ghost" icon={X} onClick={() => void api.yt.engine.cancel()}>
              {t('options.cancel')}
            </Button>
          ) : undefined
        ) : (
          <Button size="sm" variant="primary" icon={line.error ? RotateCw : undefined} onClick={() => void api.yt.engine.prepare().catch(() => undefined)}>
            {line.error ? t('options.retry') : t('ytUi.engineInstall')}
          </Button>
        )
      }
    >
      <div className="flex items-center gap-3">
        <span className="min-w-0 truncate">{line.text}</span>
        {line.percent !== undefined && <Progress value={line.percent} className="w-32 shrink-0" />}
      </div>
    </Banner>
  )
}

/** “我的”：稍后观看、喜欢的视频、订阅内容、观看记录（要先导入 YouTube 登录） */
function MyMenu({ onPick }: { onPick: (input: string) => void }) {
  const t = useT()
  const account = useStore((s) => currentYtAccount(s.ytAccounts))
  const set = useStore((s) => s.set)
  if (!account) {
    return (
      <IconButton
        icon={Star}
        label={t('ytUi.myMenuLoggedOut')}
        size="lg"
        variant="default"
        className="h-11 w-11 rounded-xl"
        onClick={() => set({ ytLoginOpen: true })}
      />
    )
  }
  const items = [
    { icon: Clock, label: t('ytUi.watchLater'), input: 'https://www.youtube.com/playlist?list=WL' },
    { icon: ThumbsUp, label: t('ytUi.liked'), input: 'https://www.youtube.com/playlist?list=LL' },
    { icon: Tv, label: t('ytUi.subscriptionsFeed'), input: 'https://www.youtube.com/feed/subscriptions' },
    { icon: History, label: t('ytUi.watchHistory'), input: 'https://www.youtube.com/feed/history' }
  ]
  return (
    <Dropdown
      className="w-60"
      button={({ open, toggle }) => (
        <IconButton icon={Star} label={t('ytUi.myMenu')} size="lg" variant="default" className="h-11 w-11 rounded-xl" active={open} onClick={toggle} />
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
  const inputs = extractYtInputs(text)
  return (
    <Modal onClose={onClose}>
      <ModalHeader icon={ListPlus} title={t('input.batchTitle')} subtitle={t('ytUi.batchSubtitle')} onClose={onClose} />
      <div className="px-6 pt-4">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={'https://www.youtube.com/watch?v=…\nhttps://youtu.be/…\nhttps://www.youtube.com/playlist?list=…'}
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
            void (inputs.length === 1 ? ytParseLink(inputs[0]) : ytParseBatch(inputs))
          }}
        >
          {t('input.parseCount', { count: inputs.length })}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

export function YtUrlInput() {
  const t = useT()
  const [text, setText] = useState('')
  const [clip, setClip] = useState<string[] | null>(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastClip = useRef('')
  const parsing = useStore((s) => s.ytParsing)
  const progress = useStore((s) => s.ytProgress)
  const error = useStore((s) => s.ytError)
  const notice = useStore((s) => s.ytNotice)
  const set = useStore((s) => s.set)
  const clipboardWatch = useStore((s) => s.settings?.clipboardWatch)
  const InputActionIcon = text ? CircleX : ClipboardPaste
  const inputActionLabel = t(text ? 'input.clearLink' : 'input.pasteAndParse')

  const submit = (value: string): void => {
    if (!value.trim() || parsing) return
    setClip(null)
    const inputs = extractYtInputs(value)
    void (inputs.length > 1 ? ytParseBatch(inputs) : ytParseLink(inputs[0] ?? value))
  }

  const pick = (input: string): void => {
    setText(input)
    submit(input)
  }

  useEffect(() => api.onParseProgress((p) => {
    if ((!p.site || p.site === 'youtube') && useStore.getState().ytParsing) set({ ytProgress: p })
  }), [set])

  // 窗口回到前台时，剪贴板里有新的 YouTube 链接就提示
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
      const inputs = extractYtInputs(text)
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
              const paste = classifyYtPaste(pasted)
              if (paste.type === 'batch') {
                e.preventDefault()
                setText(paste.inputs.join(' '))
                void ytParseBatch(paste.inputs)
              } else if (paste.type === 'single') {
                setTimeout(() => submit(pasted), 0)
              }
            }}
            onKeyDown={(e) => e.key === 'Enter' && submit(text)}
            placeholder={t('ytUi.placeholder')}
            aria-label={t('ytUi.placeholder')}
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
        <EngineBanner />
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
              <span className="shrink-0 font-medium">{clip.length > 1 ? t('input.clipboardLinks', { count: clip.length }) : t('ytUi.clipboardLink')}</span>
              <span className="min-w-0 truncate opacity-70">{clip.join('  ')}</span>
            </div>
          </Banner>
        )}
        {error && (
          <Banner tone="error" onClose={() => set({ ytError: null })}>
            {error}
          </Banner>
        )}
        {notice && (
          <Banner tone="warn" onClose={() => set({ ytNotice: null })}>
            {notice}
          </Banner>
        )}
      </div>
      {batchOpen && <BatchDialog onClose={() => setBatchOpen(false)} />}
    </div>
  )
}
