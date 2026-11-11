import { useState, type ReactNode } from 'react'
import { Download, ExternalLink, Loader2, RotateCw, SkipForward, Sparkles } from 'lucide-react'
import { fmtBytes } from '../format'
import { useT } from '../i18n'
import { fmtDate, parseMarkdown, type InlineNode } from '../markdown'
import { api, useStore } from '../store'
import { unfinishedCount } from '../taskStatus'
import { Banner, Button, Modal, ModalFooter, ModalHeader, Progress } from './ui'

const code = 'rounded bg-track px-1 py-px font-mono text-[11px] text-fg'

function renderInline(nodes: InlineNode[]): ReactNode[] {
  return nodes.map((n, i) => {
    if (n.type === 'text') return n.text
    if (n.type === 'strong')
      return (
        <strong key={i} className="font-semibold">
          {n.text}
        </strong>
      )
    if (n.type === 'code')
      return (
        <code key={i} className={code}>
          {n.text}
        </code>
      )
    return (
      <a key={i} href={n.href} target="_blank" rel="noreferrer" className="text-bili hover:underline">
        {n.text}
      </a>
    )
  })
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2 text-[13px] leading-relaxed">
      {parseMarkdown(text).map((b, i) => {
        if (b.type === 'heading')
          return (
            <div key={i} className="font-semibold">
              {renderInline(b.content)}
            </div>
          )
        if (b.type === 'paragraph')
          return (
            <p key={i}>
              {renderInline(b.content)}
            </p>
          )
        const items = b.items.map((nodes, j) => (
          <li key={j}>
            {renderInline(nodes)}
          </li>
        ))
        return b.ordered ? (
          <ol key={i} className="list-decimal space-y-1 pl-5">
            {items}
          </ol>
        ) : (
          <ul key={i} className="list-disc space-y-1 pl-5 marker:text-subtle">
            {items}
          </ul>
        )
      })}
    </div>
  )
}

export function UpdateDialog() {
  const t = useT()
  const u = useStore((s) => s.update)
  const set = useStore((s) => s.set)
  const pending = useStore((s) => unfinishedCount(s.tasks))
  const [failed, setFailed] = useState('')
  if (!u || !('info' in u) || !u.info) return null
  const { info } = u
  const close = (): void => set({ updateOpen: false })
  const run = (fn: () => Promise<void>) => async (): Promise<void> => {
    setFailed('')
    try {
      await fn()
    } catch (e) {
      setFailed((e as Error).message)
    }
  }
  const openPage = run(() => api.update.openPage())

  let footer: ReactNode
  if (u.status === 'available') {
    footer = (
      <>
        {!info.skipped && (
          <Button
            variant="ghost"
            icon={SkipForward}
            className="mr-auto"
            onClick={run(async () => {
              await api.update.skip()
              close()
            })}
          >
            {t('updateUi.skipVersion')}
          </Button>
        )}
        <Button variant="ghost" onClick={close}>
          {t('updateUi.notNow')}
        </Button>
        {info.blocker ? (
          <Button variant="primary" icon={ExternalLink} autoFocus onClick={openPage}>
            {t('updateUi.openDownloadPage')}
          </Button>
        ) : (
          <Button variant="primary" icon={Download} autoFocus onClick={run(() => api.update.download())}>
            {t('updateUi.downloadAndInstall')}
          </Button>
        )}
      </>
    )
  } else if (u.status === 'downloading') {
    footer = (
      <>
        <Button variant="ghost" className="mr-auto" onClick={run(() => api.update.cancel())}>
          {t('updateUi.cancelDownload')}
        </Button>
        <Button variant="primary" onClick={close}>
          {t('updateUi.downloadInBackground')}
        </Button>
      </>
    )
  } else if (u.status === 'ready') {
    footer = (
      <>
        <Button variant="ghost" onClick={close}>
          {t('updateUi.notNow')}
        </Button>
        <Button variant="primary" icon={RotateCw} autoFocus onClick={run(() => api.update.install())}>
          {t('updateUi.restartAndInstall')}
        </Button>
      </>
    )
  } else if (u.status === 'installing') {
    footer = (
      <Button variant="primary" disabled>
        {t('updateUi.installingButton')}
      </Button>
    )
  } else {
    footer = (
      <>
        <Button variant="ghost" icon={ExternalLink} className="mr-auto" onClick={openPage}>
          {t('updateUi.openDownloadPage')}
        </Button>
        <Button variant="ghost" onClick={close}>
          {t('common.close')}
        </Button>
        <Button variant="primary" icon={RotateCw} onClick={run(() => api.update.download())}>
          {t('updateUi.retry')}
        </Button>
      </>
    )
  }

  return (
    <Modal onClose={u.status === 'installing' ? undefined : close} className="max-w-lg">
      <ModalHeader
        icon={Sparkles}
        title={t('updateUi.title', { version: info.version })}
        subtitle={[
          t('updateUi.currentVersion', { version: u.current }),
          ...(info.date ? [t('updateUi.releasedOn', { date: fmtDate(info.date) })] : []),
          t('updateUi.packageSize', { size: fmtBytes(info.size) })
        ].join(' · ')}
        onClose={u.status === 'installing' ? undefined : close}
      />
      <div className="flex flex-col gap-3 px-6 pt-4">
        <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-line bg-surface px-4 py-3">
          {info.notes.length ? (
            <div className="flex flex-col gap-4">
              {info.notes.map((n) => (
                <section key={n.version}>
                  {info.notes.length > 1 && (
                    <div className="mb-1.5 text-xs font-medium text-muted">
                      {n.version}
                      {n.date && ` · ${fmtDate(n.date)}`}
                    </div>
                  )}
                  <Markdown text={n.body} />
                </section>
              ))}
            </div>
          ) : (
            <div className="text-[13px] text-muted">{t('updateUi.noNotes')}</div>
          )}
        </div>
        {u.status === 'available' && info.blocker && <Banner tone="warn">{t('updateUi.blocker', { blocker: info.blocker })}</Banner>}
        {u.status === 'available' && info.skipped && <Banner>{t('updateUi.skipped')}</Banner>}
        {u.status === 'downloading' && (
          <div>
            <Progress value={u.total ? (u.done / u.total) * 100 : 0} />
            <div className="mt-1.5 flex justify-between text-xs text-muted tabular-nums">
              <span>{t('updateUi.downloading')}</span>
              <span>
                {fmtBytes(u.done)} / {fmtBytes(u.total)}
              </span>
            </div>
          </div>
        )}
        {u.status === 'ready' && pending > 0 && (
          <Banner tone="warn">{t('updateUi.pendingTasks', { count: pending })}</Banner>
        )}
        {u.status === 'ready' && !pending && <Banner>{t('updateUi.ready')}</Banner>}
        {u.status === 'installing' && (
          <Banner icon={Loader2} spin>
            {t('updateUi.installing')}
          </Banner>
        )}
        {u.status === 'error' && <Banner tone="error">{u.error}</Banner>}
        {failed && <Banner tone="error">{failed}</Banner>}
      </div>
      <ModalFooter>{footer}</ModalFooter>
    </Modal>
  )
}
