import { FolderOpen } from 'lucide-react'
import { DEFAULT_DY_OPTIONS, DY_ORIGINAL_QN } from '@shared/options'
import { useT } from '../i18n'
import { api, updateSettings, useStore } from '../store'
import { DyOptionsEditor } from './DyOptionsEditor'
import { Button, Group, Row, Select, Switch } from './ui'

/** 默认画质：画面短边像素，0 是最高 */
const DY_QN = [0, 2160, 1440, 1080, 720, 540] as const

/** 常规 → 存储里的抖音下载目录 */
export function DyDirRow() {
  const t = useT()
  const s = useStore((st) => st.settings)!
  const set = useStore((st) => st.set)
  return (
    <Row label={t('dyUi.downloadDir')} hint={<span className="break-all">{s.douyin.downloadDir}</span>}>
      <Button icon={FolderOpen} onClick={async () => set({ settings: await api.settings.chooseDir('douyin') })}>
        {t('settings.change')}
      </Button>
    </Row>
  )
}

/** 下载 → 队列里的抖音同时下载数 */
export function DyConcurrencyRow() {
  const t = useT()
  const s = useStore((st) => st.settings)!
  return (
    <Row label={t('dyUi.concurrency')} hint={t('dyUi.concurrencyHint')}>
      <Select value={s.douyin.concurrency} onChange={(e) => updateSettings({ douyin: { ...s.douyin, concurrency: Number(e.target.value) } })}>
        {[1, 2, 3].map((n) => (
          <option key={n} value={n}>
            {t('settings.concurrencyN', { count: n })}
          </option>
        ))}
      </Select>
    </Row>
  )
}

/** 格式 → 抖音的默认画质和下载选项 */
export function DyFormatSettings() {
  const t = useT()
  const s = useStore((st) => st.settings)!
  const d = s.douyin
  return (
    <>
      <Group>
        <Row label={t('settings.defaultQn')} hint={t('dyUi.defaultQnHint')}>
          <Select value={d.defaultQn} onChange={(e) => updateSettings({ douyin: { ...d, defaultQn: Number(e.target.value) } })}>
            {DY_QN.map((qn) => (
              <option key={qn} value={qn}>
                {qn ? `${qn}p` : t('ytUi.qualityBest')}
              </option>
            ))}
            <option value={DY_ORIGINAL_QN}>{t('dy.original')}</option>
          </Select>
        </Row>
        <Row label={t('settings.rememberLast')} hint={t('settings.rememberLastHint')}>
          <Switch checked={s.rememberLast} onChange={(rememberLast) => updateSettings({ rememberLast })} />
        </Row>
      </Group>
      <div className="rounded-xl border border-line bg-surface p-4">
        <DyOptionsEditor
          value={{ ...d.defaults, dy: { ...DEFAULT_DY_OPTIONS, ...d.defaults.dy } }}
          onChange={(defaults) => updateSettings({ douyin: { ...d, defaults } })}
        />
      </div>
    </>
  )
}
