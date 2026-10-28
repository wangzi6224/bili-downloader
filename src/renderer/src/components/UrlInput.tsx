import { useEffect, useRef, useState } from 'react'
import { parseInput } from '@shared/parseUrl'
import { api, parseLink, useStore } from '../store'
import { Button } from './Modal'
import { ParseHistory } from './ParseHistory'

export function UrlInput() {
  const [text, setText] = useState('')
  const [clip, setClip] = useState<string | null>(null)
  const lastClip = useRef('')
  const parsing = useStore((s) => s.parsing)
  const error = useStore((s) => s.error)
  const clipboardWatch = useStore((s) => s.settings?.clipboardWatch)

  const submit = (value: string): void => {
    if (!value.trim() || parsing) return
    setClip(null)
    void parseLink(value)
  }

  // 窗口回到前台时，如果剪贴板里有新的 B站链接就提示
  useEffect(() => {
    if (!clipboardWatch) return
    const onFocus = async (): Promise<void> => {
      const t = (await api.readClipboard()).trim()
      if (!t || t === lastClip.current) return
      lastClip.current = t
      if (parseInput(t)) setClip(t)
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
            // 粘贴后立即解析
            if (parseInput(pasted)) setTimeout(() => submit(pasted), 0)
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit(text)}
          placeholder="粘贴 B站视频 / 合集 / 番剧 / 电影链接，支持 BV 号、b23.tv 短链"
          className="h-11 flex-1 rounded-lg border border-neutral-300 bg-white px-4 text-sm outline-none focus:border-bili dark:border-neutral-700 dark:bg-neutral-900"
        />
        <Button variant="primary" className="h-11 px-5" disabled={parsing || !text.trim()} onClick={() => submit(text)}>
          {parsing ? '解析中…' : '解析'}
        </Button>
        <ParseHistory
          onPick={(input) => {
            setText(input)
            submit(input)
          }}
        />
      </div>
      {clip && !parsing && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-sky/10 px-3 py-2 text-sm">
          <span className="shrink-0 text-sky">检测到剪贴板里的链接</span>
          <span className="min-w-0 flex-1 truncate text-neutral-500">{clip}</span>
          <Button
            variant="ghost"
            onClick={() => {
              setText(clip)
              submit(clip)
            }}
          >
            解析
          </Button>
          <Button variant="ghost" onClick={() => setClip(null)}>
            忽略
          </Button>
        </div>
      )}
      {error && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/50">{error}</div>}
    </div>
  )
}
