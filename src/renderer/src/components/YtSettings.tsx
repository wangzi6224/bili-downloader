import { useState } from 'react'
import { FolderOpen, Loader2, RefreshCw } from 'lucide-react'
import { DEFAULT_YT_OPTIONS } from '@shared/options'
import { ago } from '../format'
import { useT } from '../i18n'
import { api, updateSettings, useStore } from '../store'
import { engineLine } from '../ytView'
import { YtOptionsEditor } from './YtOptionsEditor'
import { Button, Group, Row, Select, Switch } from './ui'

/** 默认画质：0 是最高 */
const YT_QN = [0, 4320, 2160, 1440, 1080, 720, 480, 360] as const

/** 常规 → 存储里的 YouTube 下载目录 */
export function YtDirRow() {
  const t = useT()
  const s = useStore((st) => st.settings)!
  const set = useStore((st) => st.set)
  return (
    <Row label={t('ytUi.downloadDir')} hint={<span className="break-all">{s.youtube.downloadDir}</span>}>
      <Button icon={FolderOpen} onClick={async () => set({ settings: await api.settings.chooseDir('youtube') })}>
        {t('settings.change')}
      </Button>
    </Row>
  )
}

/** 下载 → 队列里的 YouTube 同时下载数 */
export function YtConcurrencyRow() {
  const t = useT()
  const s = useStore((st) => st.settings)!
  return (
    <Row label={t('ytUi.concurrency')} hint={t('ytUi.concurrencyHint')}>
      <Select value={s.youtube.concurrency} onChange={(e) => updateSettings({ youtube: { ...s.youtube, concurrency: Number(e.target.value) } })}>
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {t('settings.concurrencyN', { count: n })}
          </option>
        ))}
      </Select>
    </Row>
  )
}

/** YouTube 组件（yt-dlp）的版本、检查更新、自动更新 */
function EngineGroup() {
  const t = useT()
  const s = useStore((st) => st.settings)!
  const status = useStore((st) => st.ytEngine)
  const [checking, setChecking] = useState(false)
  const line = engineLine(status)
  const hint = status?.version
    ? [
        t('ytUi.engineVersion', { version: status.version }),
        status.checkedAt ? t('ytUi.engineChecked', { when: ago(status.checkedAt, Date.now()) }) : undefined,
        status.message
      ].filter(Boolean).join(' · ')
    : line?.text ?? t('ytUi.engineMissing')
  return (
    <Group title={t('ytUi.engineGroup')}>
      <Row label="yt-dlp" hint={hint}>
        <Button
          icon={checking || line?.busy ? undefined : RefreshCw}
          disabled={checking || line?.busy}
          onClick={async () => {
            setChecking(true)
            try {
              await (status?.version ? api.yt.engine.check() : api.yt.engine.prepare())
            } catch {
              // 原因会出现在状态里
            } finally {
              setChecking(false)
            }
          }}
        >
          {(checking || line?.busy) && <Loader2 size={14} className="animate-spin" />}
          {status?.version ? t('ytUi.engineCheck') : t('ytUi.engineInstall')}
        </Button>
      </Row>
      <Row label={t('ytUi.autoUpdate')} hint={t('ytUi.autoUpdateHint')}>
        <Switch checked={s.youtube.autoUpdate} onChange={(autoUpdate) => updateSettings({ youtube: { ...s.youtube, autoUpdate } })} />
      </Row>
    </Group>
  )
}

/** 格式 → YouTube 的默认画质和下载选项 */
export function YtFormatSettings() {
  const t = useT()
  const s = useStore((st) => st.settings)!
  const y = s.youtube
  return (
    <>
      <Group>
        <Row label={t('settings.defaultQn')} hint={t('ytUi.defaultQnHint')}>
          <Select value={y.defaultQn} onChange={(e) => updateSettings({ youtube: { ...y, defaultQn: Number(e.target.value) } })}>
            {YT_QN.map((qn) => (
              <option key={qn} value={qn}>
                {qn ? `${qn}p${qn === 2160 ? ' (4K)' : qn === 4320 ? ' (8K)' : ''}` : t('ytUi.qualityBest')}
              </option>
            ))}
          </Select>
        </Row>
        <Row label={t('settings.rememberLast')} hint={t('settings.rememberLastHint')}>
          <Switch checked={s.rememberLast} onChange={(rememberLast) => updateSettings({ rememberLast })} />
        </Row>
      </Group>
      <div className="rounded-xl border border-line bg-surface p-4">
        <YtOptionsEditor
          value={{ ...y.defaults, yt: { ...DEFAULT_YT_OPTIONS, ...y.defaults.yt } }}
          onChange={(defaults) => updateSettings({ youtube: { ...y, defaults } })}
        />
      </div>
      <EngineGroup />
    </>
  )
}
