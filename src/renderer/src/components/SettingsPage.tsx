import { useRef, useState } from 'react'
import { Download, Film, FileType, FolderOpen, Globe, Monitor, Moon, SlidersHorizontal, Sun } from 'lucide-react'
import {
  DEFAULT_TEMPLATES,
  MEDIA_LIBRARY_PGC,
  NAMING_VARS,
  renderTemplate,
  SAMPLE_VALUES,
  validateTemplate,
  type NamingTemplates
} from '@shared/naming'
import type { CloseAction, DuplicateAction, PowerMode, ThemeMode } from '@shared/types'
import { api, updateSettings, useStore } from '../store'
import { AdvancedSettings } from './AdvancedSettings'
import { OptionsEditor } from './OptionsEditor'
import { Button, fieldCls, Group, Input, PageHeader, Row, Segmented, Select, Switch } from './ui'

// 需要包含所有清晰度代码：“记住上次选择”可能存下其中任意一个
const QN = [
  { qn: 127, label: '最高可用（8K）' },
  { qn: 126, label: '杜比视界' },
  { qn: 125, label: 'HDR 真彩' },
  { qn: 120, label: '4K 超清' },
  { qn: 116, label: '1080P 60帧' },
  { qn: 112, label: '1080P 高码率' },
  { qn: 80, label: '1080P 高清' },
  { qn: 74, label: '720P 60帧' },
  { qn: 64, label: '720P 准高清' },
  { qn: 32, label: '480P 标清' },
  { qn: 16, label: '360P 流畅' }
]

type Tab = 'general' | 'download' | 'format' | 'naming' | 'advanced'
const TABS = [
  { value: 'general' as const, label: '常规', icon: SlidersHorizontal },
  { value: 'download' as const, label: '下载', icon: Download },
  { value: 'format' as const, label: '默认格式', icon: Film },
  { value: 'naming' as const, label: '命名', icon: FileType },
  { value: 'advanced' as const, label: '网络与高级', icon: Globe }
]

const THEMES = [
  { value: 'system' as const, label: '跟随系统', icon: Monitor },
  { value: 'light' as const, label: '浅色', icon: Sun },
  { value: 'dark' as const, label: '深色', icon: Moon }
]

const NAMING_ROWS: { key: keyof NamingTemplates; label: string; hint: string }[] = [
  { key: 'single', label: '只下载一个', hint: '单个视频、电影，或从合集里只挑了一集' },
  { key: 'multi', label: '合集 / 分P', hint: '一次下载合集或多P视频里的多个' },
  { key: 'pgc', label: '番剧 / 影视', hint: '一次下载番剧或剧集里的多集' }
]

const code = 'rounded bg-track px-1 py-px font-mono text-[11px] text-fg'

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
    <div className="flex flex-col gap-5">
      <div className="text-xs leading-relaxed text-muted">
        用 <code className={code}>{'{变量}'}</code> 引用信息，<code className={code}>{'{index:03}'}</code> 补零，
        <code className={code}>{'{pubdate:YYYYMMDD}'}</code> 格式化时间；<code className={code}>{'<…>'}</code>{' '}
        是可选段，段里的变量为空就整段省略；<code className={code}>/</code> 建子文件夹。
      </div>
      <Group>
        {NAMING_ROWS.map((r) => (
          <div key={r.key} className="px-4 py-3">
            <div className="flex items-baseline gap-2">
              <span className="text-[13px] font-medium">{r.label}</span>
              <span className="text-xs text-muted">{r.hint}</span>
            </div>
            <input
              ref={(el) => {
                inputs.current[r.key] = el
              }}
              value={draft[r.key]}
              onFocus={() => setFocused(r.key)}
              onChange={(e) => setDraft({ ...draft, [r.key]: e.target.value })}
              spellCheck={false}
              className={`${fieldCls} mt-2 h-8 w-full px-2.5 font-mono text-[13px] ${errors[r.key] ? 'border-red-400 focus:border-red-400 focus:ring-red-400/15' : ''}`}
            />
            <div className={`mt-1.5 truncate text-xs ${errors[r.key] ? 'text-red-600 dark:text-red-400' : 'text-muted'}`}>
              {errors[r.key] ?? `预览：${renderTemplate(draft[r.key], SAMPLE_VALUES[r.key])}.mp4`}
            </div>
          </div>
        ))}
      </Group>
      <div>
        <div className="mb-2 text-xs text-muted">点击插入到“{NAMING_ROWS.find((r) => r.key === focused)?.label}”：</div>
        <div className="flex flex-wrap gap-1">
          {NAMING_VARS.map((v) => (
            <button
              key={v.name}
              type="button"
              title={v.label}
              onClick={() => insert(`{${v.name}}`)}
              className="rounded-md bg-track px-2 py-0.5 font-mono text-xs text-muted transition-colors hover:bg-bili/15 hover:text-bili-dark dark:hover:text-bili"
            >
              {v.name}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={!dirty || !valid} onClick={() => updateSettings({ naming: draft })}>
          保存命名规则
        </Button>
        <Button variant="ghost" onClick={() => setDraft({ ...DEFAULT_TEMPLATES })}>
          恢复默认
        </Button>
        <Button variant="ghost" onClick={() => setDraft({ ...draft, pgc: MEDIA_LIBRARY_PGC })} title={MEDIA_LIBRARY_PGC}>
          番剧用媒体库风格（S01E01）
        </Button>
        {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">有未保存的修改</span>}
      </div>
    </div>
  )
}

export function SettingsPage() {
  const s = useStore((st) => st.settings)!
  const set = useStore((st) => st.set)
  const [tab, setTab] = useState<Tab>('general')
  const [cleared, setCleared] = useState('')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="设置" />
      <div className="px-8 pb-4">
        <Segmented value={tab} onChange={setTab} options={TABS} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10">
        <div className="flex max-w-2xl flex-col gap-6">
          {tab === 'general' && (
            <>
              <Group title="存储">
                <Row label="下载目录" hint={<span className="break-all">{s.downloadDir}</span>}>
                  <Button icon={FolderOpen} onClick={async () => set({ settings: await api.settings.chooseDir() })}>
                    更改
                  </Button>
                </Row>
              </Group>
              <Group title="外观与行为">
                <Row label="外观">
                  <Segmented value={s.theme} options={THEMES} onChange={(theme: ThemeMode) => updateSettings({ theme })} />
                </Row>
                <Row label="下载时" hint="只在有任务进行时生效，全部完成后自动恢复系统默认">
                  <Select value={s.powerMode} onChange={(e) => updateSettings({ powerMode: e.target.value as PowerMode })}>
                    <option value="off">允许休眠</option>
                    <option value="system">阻止系统睡眠（允许熄屏）</option>
                    <option value="display">保持屏幕常亮</option>
                  </Select>
                </Row>
                <Row label="关闭窗口时" hint="后台运行时下载和订阅照常进行，点程序坞图标重新打开；⌘Q 总是完全退出">
                  <Select value={s.closeAction} onChange={(e) => updateSettings({ closeAction: e.target.value as CloseAction })}>
                    <option value="ask">每次询问</option>
                    <option value="background">后台运行</option>
                    <option value="quit">完全退出</option>
                  </Select>
                </Row>
              </Group>
              <Group title="提醒">
                <Row label="完成通知" hint="队列全部结束后发系统通知">
                  <Switch checked={s.notify} onChange={(notify) => updateSettings({ notify })} />
                </Row>
                <Row label="剪贴板检测" hint="启动和切回应用时提示剪贴板里的 B站链接">
                  <Switch checked={s.clipboardWatch} onChange={(clipboardWatch) => updateSettings({ clipboardWatch })} />
                </Row>
              </Group>
              <Group title="记录">
                <Row
                  label="下载历史与解析记录"
                  hint={cleared ? <span className="text-green-600 dark:text-green-400">{cleared}</span> : '下载历史用于标记“已下载”和跳过重复；解析记录在侧边栏的“解析记录”里'}
                >
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
                </Row>
              </Group>
            </>
          )}

          {tab === 'download' && (
            <>
              <Group title="队列">
                <Row label="同时下载" hint="同时进行的任务数，太多容易被 B站限速">
                  <Select value={s.concurrency} onChange={(e) => updateSettings({ concurrency: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} 个
                      </option>
                    ))}
                  </Select>
                </Row>
                <Row label="分段下载" hint="每个文件拆成几段同时下载，网速受单连接限制时能明显提速；太多容易触发风控">
                  <Select value={s.threads} onChange={(e) => updateSettings({ threads: Number(e.target.value) })}>
                    {[1, 2, 4, 6, 8].map((n) => (
                      <option key={n} value={n}>
                        {n === 1 ? '不分段' : `${n} 段`}
                      </option>
                    ))}
                  </Select>
                </Row>
                <Row
                  label="限速"
                  hint={s.speedLimit > 0 ? `所有任务共享，约 ${(s.speedLimit / 1024).toFixed(1)} MB/s` : '所有任务共享，0 表示不限速'}
                >
                  <Input
                    type="number"
                    min={0}
                    step={512}
                    className="w-28"
                    value={s.speedLimit}
                    onChange={(e) => updateSettings({ speedLimit: Number(e.target.value) || 0 })}
                  />
                  <span className="text-xs text-muted">KB/s</span>
                </Row>
                <Row label="自动重试" hint="只针对断网、超时等网络错误；间隔从 30 秒开始逐次加长，最长 5 分钟">
                  <Select value={s.autoRetry} onChange={(e) => updateSettings({ autoRetry: Number(e.target.value) })}>
                    {[0, 3, 5, 10, 20].map((n) => (
                      <option key={n} value={n}>
                        {n === 0 ? '关闭' : `最多 ${n} 次`}
                      </option>
                    ))}
                  </Select>
                </Row>
                <Row label="重复下载" hint="选中的条目在下载历史里已经有了时">
                  <Select
                    value={s.duplicateAction}
                    onChange={(e) => updateSettings({ duplicateAction: e.target.value as DuplicateAction })}
                  >
                    <option value="ask">每次询问</option>
                    <option value="skip">自动跳过</option>
                    <option value="download">照常下载</option>
                  </Select>
                </Row>
              </Group>
              <Group title="弹幕">
                <Row label="弹幕样式" hint="生成 .ass 文件时使用，可在 IINA 等播放器中加载" wide>
                  <div className="flex flex-wrap items-center gap-5 text-[13px]">
                    <label className="flex items-center gap-2">
                      字号
                      <Input
                        type="number"
                        min={12}
                        max={50}
                        className="w-16"
                        value={s.danmaku.fontSize}
                        onChange={(e) => updateSettings({ danmaku: { ...s.danmaku, fontSize: Number(e.target.value) || 25 } })}
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      不透明度
                      <input
                        type="range"
                        min={0.2}
                        max={1}
                        step={0.05}
                        className="accent-bili"
                        value={s.danmaku.opacity}
                        onChange={(e) => updateSettings({ danmaku: { ...s.danmaku, opacity: Number(e.target.value) } })}
                      />
                      <span className="w-9 text-xs text-muted tabular-nums">{Math.round(s.danmaku.opacity * 100)}%</span>
                    </label>
                    <label className="flex items-center gap-2">
                      停留
                      <Input
                        type="number"
                        min={3}
                        max={20}
                        className="w-16"
                        value={s.danmaku.duration}
                        onChange={(e) => updateSettings({ danmaku: { ...s.danmaku, duration: Number(e.target.value) || 8 } })}
                      />
                      秒
                    </label>
                  </div>
                </Row>
              </Group>
            </>
          )}

          {tab === 'format' && (
            <>
              <Group>
                <Row label="默认清晰度" hint="没有这么高的清晰度时自动选择最接近的较低档">
                  <Select value={s.defaultQn} onChange={(e) => updateSettings({ defaultQn: Number(e.target.value) })}>
                    {QN.map((q) => (
                      <option key={q.qn} value={q.qn}>
                        {q.label}
                      </option>
                    ))}
                  </Select>
                </Row>
                <Row label="记住上次选择" hint="每次下载后把这次的选择存为默认">
                  <Switch checked={s.rememberLast} onChange={(rememberLast) => updateSettings({ rememberLast })} />
                </Row>
              </Group>
              <div className="rounded-xl border border-line bg-surface p-4">
                <OptionsEditor value={s.defaults} onChange={(defaults) => updateSettings({ defaults })} />
              </div>
            </>
          )}

          {tab === 'naming' && <NamingEditor />}
          {tab === 'advanced' && <AdvancedSettings />}
        </div>
      </div>
    </div>
  )
}
