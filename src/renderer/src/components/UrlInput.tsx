import { useEffect, useRef, useState } from 'react'
import { extractInputs, parseInput, RANK_SLUGS } from '@shared/parseUrl'
import { api, parseBatch, parseLink, useStore } from '../store'
import { Button, Modal } from './Modal'
import { ParseHistory } from './ParseHistory'

/** “我的”：稍后再看和自己的收藏夹，不用再回浏览器复制链接 */
function MyMenu({ onPick }: { onPick: (input: string) => void }) {
  const loggedIn = useStore((s) => s.auth?.loggedIn)
  const [open, setOpen] = useState(false)
  const [folders, setFolders] = useState<{ id: number; title: string; count: number }[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    api
      .myFavFolders()
      .then(setFolders)
      .catch((e: Error) => setError(e.message))
    const onDown = (e: MouseEvent): void => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const pick = (input: string): void => {
    setOpen(false)
    onPick(input)
  }

  return (
    <div className="relative" ref={box}>
      <Button className="h-11" disabled={!loggedIn} onClick={() => setOpen(!open)} title="稍后再看、热门、我的收藏夹">
        我的
      </Button>
      {open && (
        <div className="absolute top-12 right-0 z-40 max-h-[60vh] w-72 overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
          <button
            onClick={() => pick('https://www.bilibili.com/watchlater')}
            className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
          >
            稍后再看
          </button>
          <div className="px-3 pt-2 pb-1 text-xs text-neutral-500">热门</div>
          <button
            onClick={() => pick('每周必看')}
            className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
          >
            每周必看（最新一期）
          </button>
          <div className="flex flex-wrap gap-1 px-3 py-1.5">
            {['all', 'knowledge', 'tech', 'music', 'game', 'douga', 'life', 'cinephile'].map((slug) => (
              <button
                key={slug}
                onClick={() => pick(`https://www.bilibili.com/v/popular/rank/${slug}`)}
                className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs hover:bg-bili/15 dark:bg-neutral-800"
              >
                {RANK_SLUGS[slug].label}排行
              </button>
            ))}
          </div>
          <div className="px-3 pt-2 pb-1 text-xs text-neutral-500">我的收藏夹</div>
          {!folders && !error && <div className="px-3 py-2 text-xs text-neutral-400">加载中…</div>}
          {error && <div className="px-3 py-2 text-xs text-red-600">{error}</div>}
          {folders?.length === 0 && <div className="px-3 py-2 text-xs text-neutral-400">没有收藏夹</div>}
          {folders?.map((f) => (
            <button
              key={f.id}
              onClick={() => pick(`https://www.bilibili.com/medialist/detail/ml${f.id}`)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              <span className="min-w-0 flex-1 truncate">{f.title}</span>
              <span className="text-xs text-neutral-400 tabular-nums">{f.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BatchDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('')
  const inputs = extractInputs(text)
  return (
    <Modal onClose={onClose}>
      <div className="p-6">
        <div className="text-lg font-semibold">批量解析</div>
        <div className="mt-1 text-sm text-neutral-500">每行一个链接（BV 号、番剧、收藏夹、UP 主都可以），会逐个解析后合在一起选择。</div>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={'https://www.bilibili.com/video/BV…\nhttps://www.bilibili.com/bangumi/play/ep…\nBV1…'}
          className="mt-3 w-full rounded-lg border border-neutral-300 bg-white p-3 font-mono text-xs outline-none focus:border-bili dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div className="mt-3 flex items-center gap-2">
          <span className="flex-1 text-xs text-neutral-500">识别到 {inputs.length} 个链接</span>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={!inputs.length}
            onClick={() => {
              onClose()
              void (inputs.length === 1 ? parseLink(inputs[0]) : parseBatch(inputs))
            }}
          >
            解析 {inputs.length} 个
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function UrlInput() {
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

  useEffect(() => api.onParseProgress((p) => set({ progress: p })), [set])

  // 启动和窗口回到前台时，如果剪贴板里有新的 B站链接就提示
  useEffect(() => {
    if (!clipboardWatch) return
    const onFocus = async (): Promise<void> => {
      let t = ''
      try {
        t = (await api.readClipboard()).trim()
      } catch {
        return
      }
      if (!t || t === lastClip.current) return
      lastClip.current = t
      const inputs = extractInputs(t)
      if (inputs.length) setClip(inputs)
    }
    void onFocus()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [clipboardWatch])

  return (
    <div className="px-6 pt-5">
      <div className="flex gap-2">
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text')
            lastClip.current = pasted.trim()
            const inputs = extractInputs(pasted)
            if (inputs.length > 1) {
              // 多行内容粘进单行输入框会丢掉换行，直接批量解析
              e.preventDefault()
              setText(inputs.join(' '))
              void parseBatch(inputs)
            } else if (parseInput(pasted)) {
              // 粘贴后立即解析
              setTimeout(() => submit(pasted), 0)
            }
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit(text)}
          placeholder="粘贴视频、合集、番剧、课程、收藏夹、UP 主空间链接；多个链接会批量解析"
          className="h-11 min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-4 text-sm outline-none focus:border-bili dark:border-neutral-700 dark:bg-neutral-900"
        />
        <Button variant="primary" className="h-11 px-5" disabled={parsing || !text.trim()} onClick={() => submit(text)}>
          {parsing ? '解析中…' : '解析'}
        </Button>
        <Button className="h-11" onClick={() => setBatchOpen(true)} title="一次粘贴多行链接">
          批量
        </Button>
        <MyMenu
          onPick={(input) => {
            setText(input)
            submit(input)
          }}
        />
        <ParseHistory
          onPick={(input) => {
            setText(input)
            submit(input)
          }}
        />
      </div>
      {parsing && progress && progress.total > 1 && (
        <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
          <div className="h-1 w-40 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div className="h-full bg-bili" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          正在解析 {progress.done}/{progress.total}
          {progress.title && <span className="truncate">· {progress.title}</span>}
        </div>
      )}
      {clip && !parsing && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-sky/10 px-3 py-2 text-sm">
          <span className="shrink-0 text-sky">
            {clip.length > 1 ? `剪贴板里有 ${clip.length} 个链接` : '检测到剪贴板里的链接'}
          </span>
          <span className="min-w-0 flex-1 truncate text-neutral-500">{clip.join('  ')}</span>
          <Button
            variant="ghost"
            onClick={() => {
              setText(clip.join(' '))
              submit(clip.join('\n'))
            }}
          >
            {clip.length > 1 ? '批量解析' : '解析'}
          </Button>
          <Button variant="ghost" onClick={() => setClip(null)}>
            忽略
          </Button>
        </div>
      )}
      {error && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/50">{error}</div>}
      {notice && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <span className="flex-1">{notice}</span>
          <button className="text-xs opacity-60 hover:opacity-100" onClick={() => set({ notice: null })}>
            关闭
          </button>
        </div>
      )}
      {batchOpen && <BatchDialog onClose={() => setBatchOpen(false)} />}
    </div>
  )
}
