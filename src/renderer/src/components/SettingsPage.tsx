import { useEffect, useRef, useState } from 'react'
import { Bot, Download, Film, FileType, FolderOpen, Globe, Monitor, Moon, RefreshCw, SlidersHorizontal, Sun } from 'lucide-react'
import {
  DEFAULT_TEMPLATES,
  MEDIA_LIBRARY_PGC,
  NAMING_VARS,
  renderTemplate,
  SAMPLE_VALUES,
  validateTemplate,
  type NamingTemplates
} from '@shared/naming'
import { LANG_NAMES, LANGS, t, type LanguageSetting } from '@shared/i18n'
import type { CloseAction, DuplicateAction, PowerMode, ThemeMode, WatermarkMode } from '@shared/types'
import { WATERMARK_MODES } from '../aiRefine'
import { insertAt } from '../format'
import { useT } from '../i18n'
import { api, sysText, updateSettings, useStore } from '../store'
import { updateHint } from '../viewLogic'
import { AdvancedSettings } from './AdvancedSettings'
import { AgentIntegrations } from './AgentIntegrations'
import { AccountSettings } from './AccountControls'
import { OptionsEditor } from './OptionsEditor'
import { Button, fieldCls, Group, Input, PageHeader, rich, Row, Segmented, Select, Switch } from './ui'

// 需要包含所有清晰度代码：“记住上次选择”可能存下其中任意一个
const QN = [127, 126, 125, 120, 116, 112, 80, 74, 64, 32, 16] as const

type Tab = 'general' | 'download' | 'format' | 'naming' | 'agents' | 'advanced'
// 文案在渲染时取，切换语言后跟着变
const tabs = () => [
  { value: 'general' as const, label: t('settings.tabGeneral'), icon: SlidersHorizontal },
  { value: 'download' as const, label: t('settings.tabDownload'), icon: Download },
  { value: 'format' as const, label: t('settings.tabFormat'), icon: Film },
  { value: 'naming' as const, label: t('settings.tabNaming'), icon: FileType },
  { value: 'agents' as const, label: t('settings.tabAgents'), icon: Bot },
  { value: 'advanced' as const, label: t('settings.tabAdvanced'), icon: Globe }
]

const themes = () => [
  { value: 'system' as const, label: t('settings.themeSystem'), icon: Monitor },
  { value: 'light' as const, label: t('settings.themeLight'), icon: Sun },
  { value: 'dark' as const, label: t('settings.themeDark'), icon: Moon }
]

const NAMING_KEYS: (keyof NamingTemplates)[] = ['single', 'multi', 'pgc']
const namingRows = (): { key: keyof NamingTemplates; label: string; hint: string }[] => [
  { key: 'single', label: t('settings.namingSingle'), hint: t('settings.namingSingleHint') },
  { key: 'multi', label: t('settings.namingMulti'), hint: t('settings.namingMultiHint') },
  { key: 'pgc', label: t('settings.namingPgc'), hint: t('settings.namingPgcHint') }
]

const code = 'rounded bg-track px-1 py-px font-mono text-[11px] text-fg'

function NamingEditor() {
  const t = useT()
  const s = useStore((st) => st.settings)!
  const rows = namingRows()
  const [draft, setDraft] = useState<NamingTemplates>(s.naming)
  const [focused, setFocused] = useState<keyof NamingTemplates>('single')
  const inputs = useRef<Partial<Record<keyof NamingTemplates, HTMLInputElement | null>>>({})
  const errors = Object.fromEntries(NAMING_KEYS.map((k) => [k, validateTemplate(draft[k])])) as Record<
    keyof NamingTemplates,
    string | null
  >
  const dirty = NAMING_KEYS.some((k) => draft[k] !== s.naming[k])
  const valid = NAMING_KEYS.every((k) => !errors[k])

  // 在光标处插入变量
  const insert = (text: string): void => {
    const el = inputs.current[focused]
    const cur = draft[focused]
    const at = el?.selectionStart ?? cur.length
    const end = el?.selectionEnd ?? cur.length
    setDraft({ ...draft, [focused]: insertAt(cur, at, end, text) })
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at + text.length, at + text.length)
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="text-xs leading-relaxed text-muted">
        {rich(t('settings.namingHelp'), {
          var: <code className={code}>{t('settings.namingVarExample')}</code>,
          pad: <code className={code}>{'{index:03}'}</code>,
          date: <code className={code}>{'{pubdate:YYYYMMDD}'}</code>,
          optional: <code className={code}>{'<…>'}</code>,
          slash: <code className={code}>/</code>
        })}
      </div>
      <Group>
        {rows.map((r) => (
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
              {errors[r.key] ?? t('settings.namingPreview', { file: `${renderTemplate(draft[r.key], SAMPLE_VALUES[r.key])}.mp4` })}
            </div>
          </div>
        ))}
      </Group>
      <div>
        <div className="mb-2 text-xs text-muted">
          {t('settings.namingInsertTo', { label: rows.find((r) => r.key === focused)?.label ?? '' })}
        </div>
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
          {t('settings.namingSave')}
        </Button>
        <Button variant="ghost" onClick={() => setDraft({ ...DEFAULT_TEMPLATES })}>
          {t('settings.namingReset')}
        </Button>
        <Button variant="ghost" onClick={() => setDraft({ ...draft, pgc: MEDIA_LIBRARY_PGC })} title={MEDIA_LIBRARY_PGC}>
          {t('settings.namingMediaLibrary')}
        </Button>
        {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">{t('settings.namingUnsaved')}</span>}
      </div>
    </div>
  )
}

function UpdateGroup() {
  const t = useT()
  const s = useStore((st) => st.settings)!
  const u = useStore((st) => st.update)
  const set = useStore((st) => st.set)
  const [busy, setBusy] = useState(false)
  const info = u && 'info' in u ? u.info : undefined
  const h = updateHint(u)
  const hint = h && (h.error ? <span className="text-red-600 dark:text-red-400">{h.text}</span> : h.text)

  const check = async (): Promise<void> => {
    setBusy(true)
    try {
      const next = await api.update.check()
      set({ update: next, updateOpen: 'info' in next && Boolean(next.info) })
    } catch (e) {
      set({ error: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Group title={t('settings.updateGroup')}>
      <Row label={t('updateUi.currentVersion', { version: u?.current ?? '' })} hint={hint}>
        {info && <Button onClick={() => set({ updateOpen: true })}>{t('settings.viewNewVersion')}</Button>}
        <Button icon={RefreshCw} disabled={busy || u?.status === 'checking'} onClick={check}>
          {t('settings.checkUpdate')}
        </Button>
      </Row>
      <Row label={t('settings.autoCheckUpdate')} hint={t('settings.autoCheckUpdateHint')}>
        <Switch checked={s.autoCheckUpdate} onChange={(autoCheckUpdate) => updateSettings({ autoCheckUpdate })} />
      </Row>
    </Group>
  )
}

export function SettingsPage() {
  const t = useT()
  const s = useStore((st) => st.settings)!
  const set = useStore((st) => st.set)
  const [tab, setTab] = useState<Tab>('general')
  const [cleared, setCleared] = useState<'' | 'downloads' | 'parses'>('')
  const showAccounts = useStore((st) => st.showAccountSettings)
  const accountSection = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showAccounts) return
    if (tab !== 'general') {
      setTab('general')
      return
    }
    accountSection.current?.scrollIntoView({ block: 'nearest' })
    set({ showAccountSettings: false })
  }, [showAccounts, tab, set])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t('settings.title')} />
      <div className="px-8 pb-4">
        <Segmented value={tab} onChange={setTab} options={tabs()} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10">
        <div className="flex max-w-2xl flex-col gap-6">
          {tab === 'general' && (
            <>
              <Group title={t('settings.storage')}>
                <Row label={t('settings.downloadDir')} hint={<span className="break-all">{s.downloadDir}</span>}>
                  <Button icon={FolderOpen} onClick={async () => set({ settings: await api.settings.chooseDir() })}>
                    {t('settings.change')}
                  </Button>
                </Row>
                <Row label={t('settings.watermark')} hint={t('settings.watermarkHint')}>
                  <Segmented
                    value={s.defaults.watermark}
                    options={WATERMARK_MODES}
                    onChange={(watermark: WatermarkMode) => updateSettings({ defaults: { ...s.defaults, watermark } })}
                  />
                </Row>
              </Group>
              <Group title={t('settings.appearanceGroup')}>
                <Row label={t('settings.appearance')}>
                  <Segmented value={s.theme} options={themes()} onChange={(theme: ThemeMode) => updateSettings({ theme })} />
                </Row>
                <Row label={t('common.language')}>
                  <Select
                    value={s.language}
                    onChange={(e) => updateSettings({ language: e.target.value as LanguageSetting })}
                  >
                    <option value="system">{t('common.languageSystem')}</option>
                    {LANGS.map((l) => (
                      <option key={l} value={l}>
                        {LANG_NAMES[l]}
                      </option>
                    ))}
                  </Select>
                </Row>
                <Row label={t('settings.power')} hint={t('settings.powerHint')}>
                  <Select value={s.powerMode} onChange={(e) => updateSettings({ powerMode: e.target.value as PowerMode })}>
                    <option value="off">{t('settings.powerOff')}</option>
                    <option value="system">{t('settings.powerSystem')}</option>
                    <option value="display">{t('settings.powerDisplay')}</option>
                  </Select>
                </Row>
                <Row
                  label={t('settings.closeAction')}
                  hint={t('settings.closeActionHint', { reopenFrom: sysText.reopenFrom, quitKey: sysText.quitKey })}
                >
                  <Select value={s.closeAction} onChange={(e) => updateSettings({ closeAction: e.target.value as CloseAction })}>
                    <option value="ask">{t('settings.closeAsk')}</option>
                    <option value="background">{t('settings.closeBackground')}</option>
                    <option value="quit">{t('settings.closeQuit')}</option>
                  </Select>
                </Row>
              </Group>
              <Group title={t('settings.reminders')}>
                <Row label={t('settings.notify')} hint={t('settings.notifyHint')}>
                  <Switch checked={s.notify} onChange={(notify) => updateSettings({ notify })} />
                </Row>
                <Row label={t('settings.clipboard')} hint={t('settings.clipboardHint')}>
                  <Switch checked={s.clipboardWatch} onChange={(clipboardWatch) => updateSettings({ clipboardWatch })} />
                </Row>
              </Group>
              <Group title={t('settings.records')}>
                <Row
                  label={t('settings.recordsLabel')}
                  hint={
                    cleared ? (
                      <span className="text-green-600 dark:text-green-400">
                        {t(cleared === 'downloads' ? 'settings.downloadsCleared' : 'settings.parsesCleared')}
                      </span>
                    ) : (
                      t('settings.recordsHint')
                    )
                  }
                >
                  <Button
                    onClick={async () => {
                      if (!confirm(t('settings.clearDownloadsConfirm'))) return
                      await api.history.clearDownloads()
                      setCleared('downloads')
                    }}
                  >
                    {t('settings.clearDownloads')}
                  </Button>
                  <Button
                    onClick={async () => {
                      await api.history.clearParses()
                      setCleared('parses')
                    }}
                  >
                    {t('settings.clearParses')}
                  </Button>
                </Row>
              </Group>
              <UpdateGroup />
              <div ref={accountSection}><AccountSettings /></div>
            </>
          )}

          {tab === 'download' && (
            <>
              <Group title={t('settings.queue')}>
                <Row label={t('settings.concurrency')} hint={t('settings.concurrencyHint')}>
                  <Select value={s.concurrency} onChange={(e) => updateSettings({ concurrency: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {t('settings.concurrencyN', { count: n })}
                      </option>
                    ))}
                  </Select>
                </Row>
                <Row label={t('settings.threads')} hint={t('settings.threadsHint')}>
                  <Select value={s.threads} onChange={(e) => updateSettings({ threads: Number(e.target.value) })}>
                    {[1, 2, 4, 6, 8].map((n) => (
                      <option key={n} value={n}>
                        {n === 1 ? t('settings.threadsOff') : t('settings.threadsN', { count: n })}
                      </option>
                    ))}
                  </Select>
                </Row>
                <Row
                  label={t('settings.speedLimit')}
                  hint={
                    s.speedLimit > 0
                      ? t('settings.speedLimitOn', { speed: (s.speedLimit / 1024).toFixed(1) })
                      : t('settings.speedLimitOff')
                  }
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
                <Row label={t('settings.autoRetry')} hint={t('settings.autoRetryHint')}>
                  <Select value={s.autoRetry} onChange={(e) => updateSettings({ autoRetry: Number(e.target.value) })}>
                    {[0, 3, 5, 10, 20].map((n) => (
                      <option key={n} value={n}>
                        {n === 0 ? t('settings.autoRetryOff') : t('settings.autoRetryN', { count: n })}
                      </option>
                    ))}
                  </Select>
                </Row>
                <Row label={t('settings.duplicate')} hint={t('settings.duplicateHint')}>
                  <Select
                    value={s.duplicateAction}
                    onChange={(e) => updateSettings({ duplicateAction: e.target.value as DuplicateAction })}
                  >
                    <option value="ask">{t('settings.duplicateAsk')}</option>
                    <option value="skip">{t('settings.duplicateSkip')}</option>
                    <option value="download">{t('settings.duplicateDownload')}</option>
                  </Select>
                </Row>
              </Group>
              <Group title={t('settings.danmakuGroup')}>
                <Row label={t('settings.danmakuStyle')} hint={t('settings.danmakuStyleHint')} wide>
                  <div className="flex flex-wrap items-center gap-5 text-[13px]">
                    <label className="flex items-center gap-2">
                      {t('settings.danmakuFontSize')}
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
                      {t('settings.danmakuOpacity')}
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
                      {rich(t('settings.danmakuDuration'), {
                        input: (
                          <Input
                            type="number"
                            min={3}
                            max={20}
                            className="w-16"
                            value={s.danmaku.duration}
                            onChange={(e) => updateSettings({ danmaku: { ...s.danmaku, duration: Number(e.target.value) || 8 } })}
                          />
                        )
                      })}
                    </label>
                  </div>
                </Row>
              </Group>
            </>
          )}

          {tab === 'format' && (
            <>
              <Group>
                <Row label={t('settings.defaultQn')} hint={t('settings.defaultQnHint')}>
                  <Select value={s.defaultQn} onChange={(e) => updateSettings({ defaultQn: Number(e.target.value) })}>
                    {QN.map((qn) => (
                      <option key={qn} value={qn}>
                        {t(`settings.qn${qn}`)}
                      </option>
                    ))}
                  </Select>
                </Row>
                <Row label={t('settings.rememberLast')} hint={t('settings.rememberLastHint')}>
                  <Switch checked={s.rememberLast} onChange={(rememberLast) => updateSettings({ rememberLast })} />
                </Row>
              </Group>
              <div className="rounded-xl border border-line bg-surface p-4">
                <OptionsEditor value={s.defaults} onChange={(defaults) => updateSettings({ defaults })} />
              </div>
            </>
          )}

          {tab === 'naming' && <NamingEditor />}
          {tab === 'agents' && <AgentIntegrations />}
          {tab === 'advanced' && <AdvancedSettings />}
        </div>
      </div>
    </div>
  )
}
