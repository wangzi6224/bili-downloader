import { useState, type ReactNode } from 'react'
import { Download, ExternalLink, Loader2, RotateCw, SkipForward, Sparkles } from 'lucide-react'
import { fmtBytes } from '../format'
import { api, useStore } from '../store'
import { ACTIVE } from './TaskList'
import { Banner, Button, Modal, ModalFooter, ModalHeader, Progress } from './ui'

const code = 'rounded bg-track px-1 py-px font-mono text-[11px] text-fg'

/** 行内：**粗体**、`代码`、[文字](https://链接) */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1]) out.push(<strong key={m.index} className="font-semibold">{m[1]}</strong>)
    else if (m[2]) out.push(<code key={m.index} className={code}>{m[2]}</code>)
    else
      out.push(
        <a key={m.index} href={m[4]} target="_blank" rel="noreferrer" className="text-bili hover:underline">
          {m[3]}
        </a>
      )
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** 更新说明只用到标题、列表和段落，不引入完整的 Markdown 库 */
function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []
  const flush = (): void => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>)
    para = []
    if (list) {
      const items = list.items.map((t, i) => <li key={i}>{inline(t)}</li>)
      blocks.push(
        list.ordered ? (
          <ol key={blocks.length} className="list-decimal space-y-1 pl-5">
            {items}
          </ol>
        ) : (
          <ul key={blocks.length} className="list-disc space-y-1 pl-5 marker:text-subtle">
            {items}
          </ul>
        )
      )
    }
    list = null
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const heading = /^#{1,4}\s+(.*)$/.exec(line)
    const item = /^(?:[-*+]|(\d+)\.)\s+(.*)$/.exec(line)
    if (!line) flush()
    else if (heading) {
      flush()
      blocks.push(
        <div key={blocks.length} className="font-semibold">
          {inline(heading[1])}
        </div>
      )
    } else if (item) {
      if (para.length || (list && list.ordered !== Boolean(item[1]))) flush()
      list ??= { ordered: Boolean(item[1]), items: [] }
      list.items.push(item[2])
    } else if (list && /^\s{2,}/.test(raw)) {
      // 缩进的续行接在上一条后面
      list.items[list.items.length - 1] += ` ${line}`
    } else {
      if (list) flush()
      para.push(line)
    }
  }
  flush()
  return <div className="flex flex-col gap-2 text-[13px] leading-relaxed">{blocks}</div>
}

const fmtDate = (s: string): string => {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('zh-CN')
}

export function UpdateDialog() {
  const u = useStore((s) => s.update)
  const set = useStore((s) => s.set)
  const pending = useStore((s) => s.tasks.filter((t) => ACTIVE.has(t.status) || t.status === 'queued' || t.status === 'waitingAuth').length)
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
            跳过这个版本
          </Button>
        )}
        <Button variant="ghost" onClick={close}>
          以后再说
        </Button>
        {info.blocker ? (
          <Button variant="primary" icon={ExternalLink} autoFocus onClick={openPage}>
            前往下载页面
          </Button>
        ) : (
          <Button variant="primary" icon={Download} autoFocus onClick={run(() => api.update.download())}>
            下载并安装
          </Button>
        )}
      </>
    )
  } else if (u.status === 'downloading') {
    footer = (
      <>
        <Button variant="ghost" className="mr-auto" onClick={run(() => api.update.cancel())}>
          取消下载
        </Button>
        <Button variant="primary" onClick={close}>
          后台下载
        </Button>
      </>
    )
  } else if (u.status === 'ready') {
    footer = (
      <>
        <Button variant="ghost" onClick={close}>
          以后再说
        </Button>
        <Button variant="primary" icon={RotateCw} autoFocus onClick={run(() => api.update.install())}>
          重启并安装
        </Button>
      </>
    )
  } else if (u.status === 'installing') {
    footer = (
      <Button variant="primary" disabled>
        正在安装…
      </Button>
    )
  } else {
    footer = (
      <>
        <Button variant="ghost" icon={ExternalLink} className="mr-auto" onClick={openPage}>
          前往下载页面
        </Button>
        <Button variant="ghost" onClick={close}>
          关闭
        </Button>
        <Button variant="primary" icon={RotateCw} onClick={run(() => api.update.download())}>
          重试
        </Button>
      </>
    )
  }

  return (
    <Modal onClose={u.status === 'installing' ? undefined : close} className="max-w-lg">
      <ModalHeader
        icon={Sparkles}
        title={`发现新版本 ${info.version}`}
        subtitle={`当前版本 ${u.current}${info.date ? ` · ${fmtDate(info.date)} 发布` : ''} · 安装包 ${fmtBytes(info.size)}`}
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
            <div className="text-[13px] text-muted">这个版本没有填写更新说明。</div>
          )}
        </div>
        {u.status === 'available' && info.blocker && <Banner tone="warn">{info.blocker}，或者去下载页面手动安装。</Banner>}
        {u.status === 'available' && info.skipped && <Banner>你之前跳过了这个版本，自动检查时不再提醒。</Banner>}
        {u.status === 'downloading' && (
          <div>
            <Progress value={u.total ? (u.done / u.total) * 100 : 0} />
            <div className="mt-1.5 flex justify-between text-xs text-muted tabular-nums">
              <span>正在下载…关掉窗口也会继续</span>
              <span>
                {fmtBytes(u.done)} / {fmtBytes(u.total)}
              </span>
            </div>
          </div>
        )}
        {u.status === 'ready' && pending > 0 && (
          <Banner tone="warn">还有 {pending} 个任务未完成，重启会暂停它们，更新后可以继续。</Banner>
        )}
        {u.status === 'ready' && !pending && <Banner>新版本已下载并校验完成，重启后即可使用。</Banner>}
        {u.status === 'installing' && (
          <Banner icon={Loader2} spin>
            正在安装，应用马上会自动重新打开…
          </Banner>
        )}
        {u.status === 'error' && <Banner tone="error">{u.error}</Banner>}
        {failed && <Banner tone="error">{failed}</Banner>}
      </div>
      <ModalFooter>{footer}</ModalFooter>
    </Modal>
  )
}
