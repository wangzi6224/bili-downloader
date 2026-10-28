import { useRef, useState, type ReactNode } from 'react'
import {
  DEFAULT_TEMPLATES,
  MEDIA_LIBRARY_PGC,
  NAMING_VARS,
  renderTemplate,
  SAMPLE_VALUES,
  validateTemplate,
  type NamingTemplates
} from '@shared/naming'
import type { DuplicateAction, PowerMode, ThemeMode } from '@shared/types'
import { api, updateSettings, useStore } from '../store'
import { Button, Modal } from './Modal'
import { OptionsEditor } from './OptionsEditor'

const QN = [
  { qn: 127, label: '最高可用' },
  { qn: 120, label: '4K' },
  { qn: 116, label: '1080P 60帧' },
  { qn: 80, label: '1080P' },
  { qn: 64, label: '720P' },
  { qn: 32, label: '480P' }
]

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-3">
      <div className="w-28 shrink-0 pt-1 text-sm">{label}</div>
      <div className="min-w-0 flex-1">
        {children}
        {hint && <div className="mt-1 text-xs text-neutral-500">{hint}</div>}
      </div>
    </div>
  )
}

const selectCls =
  'rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900'

type Tab = 'general' | 'download' | 'format' | 'naming'
const TABS: { value: Tab; label: string }[] = [
  { value: 'general', label: '常规' },
  { value: 'download', label: '下载' },
  { value: 'format', label: '默认格式' },
  { value: 'naming', label: '命名' }
]

const NAMING_ROWS: { key: keyof NamingTemplates; label: string; hint: string }[] = [
  { key: 'single', label: '只下载一个', hint: '单个视频、电影，或从合集里只挑了一集' },
  { key: 'multi', label: '合集 / 分P', hint: '一次下载合集或多P视频里的多个' },
  { key: 'pgc', label: '番剧 / 影视', hint: '一次下载番剧或剧集里的多集' }
]

function NamingEditor() {
  const s = useStore((st) => st.settings)!
  const [draft, setDraft] = useState<NamingTemplates>(s.naming)
  const [focused, setFocused] = useState<keyof NamingTemplates>('single')
  const inputs = useRef<Partial<Record<keyof NamingTemplates, HTMLInputElement | null>>>({})
  const errors = Object.fromEntries(NAMING_ROWS.map((r) => [r.key, validateTemplate(draft[r.key])])) as Record<
    keyof NamingTemplates,
    string | null
  >
  const dirty = NAMING_ROWS.some((r) => draft[r.key] !== s.naming[r.key])
  const valid = NAMING_ROWS.every((r) => !errors[r.key])

  // 在光标处插入变量
  const insert = (text: string): void => {
    const el = inputs.current[focused]
    const cur = draft[focused]
    const at = el?.selectionStart ?? cur.length
    const end = el?.selectionEnd ?? cur.length
    setDraft({ ...draft, [focused]: cur.slice(0, at) + text + cur.slice(end) })
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at + text.length, at + text.length)
    })
  }

  return (
    <div className="py-3">
      <div className="text-xs leading-relaxed text-neutral-500">
        用 <code>{'{变量}'}</code> 引用信息，<code>{'{index:03}'}</code> 补零，
        <code>{'{pubdate:YYYYMMDD}'}</code> 格式化时间；<code>{'<…>'}</code> 是可选段，段里的变量为空就整段省略；
        <code>/</code> 建子文件夹。
      </div>
      {NAMING_ROWS.map((r) => (
        <div key={r.key} className="mt-4">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium">{r.label}</span>
            <span className="text-xs text-neutral-500">{r.hint}</span>
          </div>
          <input
            ref={(el) => {
              inputs.current[r.key] = el
            }}
            value={draft[r.key]}
            onFocus={() => setFocused(r.key)}
            onChange={(e) => setDraft({ ...draft, [r.key]: e.target.value })}
            spellCheck={false}
            className={`mt-1 w-full rounded-md border bg-white px-2 py-1.5 font-mono text-sm outline-none dark:bg-neutral-900 ${errors[r.key] ? 'border-red-400' : focused === r.key ? 'border-bili' : 'border-neutral-300 dark:border-neutral-700'}`}
          />
          <div className={`mt-1 truncate text-xs ${errors[r.key] ? 'text-red-600' : 'text-neutral-500'}`}>
            {errors[r.key] ?? `预览：${renderTemplate(draft[r.key], SAMPLE_VALUES[r.key])}.mp4`}
          </div>
        </div>
      ))}
      <div className="mt-4 text-xs text-neutral-500">点击插入到“{NAMING_ROWS.find((r) => r.key === focused)?.label}”：</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {NAMING_VARS.map((v) => (
          <button
            key={v.name}
            type="button"
            title={v.label}
            onClick={() => insert(`{${v.name}}`)}
            className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs hover:bg-bili/15 dark:bg-neutral-800"
          >
            {v.name}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={!dirty || !valid} onClick={() => updateSettings({ naming: draft })}>
          保存命名规则
        </Button>
        <Button variant="ghost" onClick={() => setDraft({ ...DEFAULT_TEMPLATES })}>
          恢复默认
        </Button>
        <Button variant="ghost" onClick={() => setDraft({ ...draft, pgc: MEDIA_LIBRARY_PGC })} title={MEDIA_LIBRARY_PGC}>
          番剧用媒体库风格（S01E01）
        </Button>
        {dirty && <span className="text-xs text-amber-600">有未保存的修改</span>}
      </div>
    </div>
  )
}

export function SettingsPanel() {
  const s = useStore((st) => st.settings)!
  const set = useStore((st) => st.set)
  const [tab, setTab] = useState<Tab>('general')
  const [cleared, setCleared] = useState('')

  return (
    <Modal onClose={() => set({ settingsOpen: false })} className="flex h-[88vh] max-w-2xl flex-col">
      <div className="flex items-center gap-4 px-6 pt-5">
        <div className="text-lg font-semibold">设置</div>
        <div className="flex rounded-lg bg-neutral-100 p-0.5 text-sm dark:bg-neutral-800">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`rounded-md px-3 py-1 ${tab === t.value ? 'bg-white shadow dark:bg-neutral-700' : 'text-neutral-500'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6">
        {tab === 'general' && (
          <div className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-800">
            <Row label="下载目录">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-600 dark:text-neutral-300" title={s.downloadDir}>
                  {s.downloadDir}
                </span>
                <Button onClick={async () => set({ settings: await api.settings.chooseDir() })}>更改</Button>
              </div>
            </Row>
            <Row label="外观">
              <select className={selectCls} value={s.theme} onChange={(e) => updateSettings({ theme: e.target.value as ThemeMode })}>
                <option value="system">跟随系统</option>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </Row>
            <Row label="下载时" hint="只在有任务进行时生效，全部完成后自动恢复系统默认">
              <select
                className={selectCls}
                value={s.powerMode}
                onChange={(e) => updateSettings({ powerMode: e.target.value as PowerMode })}
              >
                <option value="off">允许休眠</option>
                <option value="system">阻止系统睡眠（允许熄屏）</option>
                <option value="display">保持屏幕常亮</option>
              </select>
            </Row>
            <Row label="完成通知">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" className="accent-bili" checked={s.notify} onChange={(e) => updateSettings({ notify: e.target.checked })} />
                队列全部结束后发系统通知
              </label>
            </Row>
            <Row label="剪贴板检测">
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="accent-bili"
                  checked={s.clipboardWatch}
                  onChange={(e) => updateSettings({ clipboardWatch: e.target.checked })}
                />
                启动和切回应用时提示剪贴板里的 B站链接
              </label>
            </Row>
            <Row label="记录" hint="下载历史用于标记“已下载”和跳过重复；解析记录可在输入框旁的“记录”里找到">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={async () => {
                    if (!confirm('清空下载历史？之后已下载的条目不再显示“已下载”。')) return
                    await api.history.clearDownloads()
                    setCleared('下载历史已清空')
                  }}
                >
                  清空下载历史
                </Button>
                <Button
                  onClick={async () => {
                    await api.history.clearParses()
                    setCleared('解析记录已清空')
                  }}
                >
                  清空解析记录
                </Button>
                {cleared && <span className="text-xs text-green-600">{cleared}</span>}
              </div>
            </Row>
          </div>
        )}

        {tab === 'download' && (
          <div className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-800">
            <Row label="同时下载" hint="同时进行的任务数，太多容易被 B站限速">
              <select className={selectCls} value={s.concurrency} onChange={(e) => updateSettings({ concurrency: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} 个
                  </option>
                ))}
              </select>
            </Row>
            <Row label="分段下载" hint="每个文件拆成几段同时下载，网速受单连接限制时能明显提速；太多容易触发风控">
              <select className={selectCls} value={s.threads} onChange={(e) => updateSettings({ threads: Number(e.target.value) })}>
                {[1, 2, 4, 6, 8].map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? '不分段' : `${n} 段`}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="限速" hint="所有任务共享，0 表示不限速">
              <div className="flex items-center gap-2 text-sm">
                <input
                  type="number"
                  min={0}
                  step={512}
                  className={`${selectCls} w-28`}
                  value={s.speedLimit}
                  onChange={(e) => updateSettings({ speedLimit: Number(e.target.value) || 0 })}
                />
                KB/s
                {s.speedLimit > 0 && <span className="text-xs text-neutral-500">≈ {(s.speedLimit / 1024).toFixed(1)} MB/s</span>}
              </div>
            </Row>
            <Row label="自动重试" hint="只针对断网、超时等网络错误；间隔从 30 秒开始逐次加长，最长 5 分钟">
              <select className={selectCls} value={s.autoRetry} onChange={(e) => updateSettings({ autoRetry: Number(e.target.value) })}>
                {[0, 3, 5, 10, 20].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? '关闭' : `最多 ${n} 次`}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="重复下载" hint="选中的条目在下载历史里已经有了时">
              <select
                className={selectCls}
                value={s.duplicateAction}
                onChange={(e) => updateSettings({ duplicateAction: e.target.value as DuplicateAction })}
              >
                <option value="ask">每次询问</option>
                <option value="skip">自动跳过</option>
                <option value="download">照常下载</option>
              </select>
            </Row>
            <Row label="弹幕样式" hint="生成 .ass 文件时使用，可在 IINA 等播放器中加载">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-1">
                  字号
                  <input
                    type="number"
                    min={12}
                    max={50}
                    className={`${selectCls} w-16`}
                    value={s.danmaku.fontSize}
                    onChange={(e) => updateSettings({ danmaku: { ...s.danmaku, fontSize: Number(e.target.value) || 25 } })}
                  />
                </label>
                <label className="flex items-center gap-1">
                  不透明度
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={s.danmaku.opacity}
                    onChange={(e) => updateSettings({ danmaku: { ...s.danmaku, opacity: Number(e.target.value) } })}
                  />
                </label>
                <label className="flex items-center gap-1">
                  停留
                  <input
                    type="number"
                    min={3}
                    max={20}
                    className={`${selectCls} w-14`}
                    value={s.danmaku.duration}
                    onChange={(e) => updateSettings({ danmaku: { ...s.danmaku, duration: Number(e.target.value) || 8 } })}
                  />
                  秒
                </label>
              </div>
            </Row>
          </div>
        )}

        {tab === 'format' && (
          <div className="mt-2">
            <Row label="默认清晰度" hint="没有这么高的清晰度时自动选择最接近的较低档">
              <select className={selectCls} value={s.defaultQn} onChange={(e) => updateSettings({ defaultQn: Number(e.target.value) })}>
                {QN.map((q) => (
                  <option key={q.qn} value={q.qn}>
                    {q.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="记住上次选择">
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="accent-bili"
                  checked={s.rememberLast}
                  onChange={(e) => updateSettings({ rememberLast: e.target.checked })}
                />
                每次下载后把这次的选择存为默认
              </label>
            </Row>
            <div className="border-t border-neutral-100 pt-4 pb-2 dark:border-neutral-800">
              <OptionsEditor value={s.defaults} onChange={(defaults) => updateSettings({ defaults })} />
            </div>
          </div>
        )}

        {tab === 'naming' && <NamingEditor />}
      </div>
      <div className="flex justify-end border-t border-neutral-100 px-6 py-4 dark:border-neutral-800">
        <Button variant="primary" onClick={() => set({ settingsOpen: false })}>
          完成
        </Button>
      </div>
    </Modal>
  )
}
