import { t, type Key } from '@shared/i18n'
import type { AiEstimate, AiModelStatus, WatermarkMode, WatermarkSpeed, WatermarkSpeedInfo } from '@shared/types'
import { fmtBytes } from './format'

/** 预计耗时的区间，按量级取整：“不到 1 分钟”“约 3～5 分钟”“约 1.5～2 小时” */
export function fmtRange([lo, hi]: [number, number]): string {
  if (hi < 60) return t('aiRefine.lessThanMinute')
  if (hi < 3600) {
    const a = Math.max(1, Math.round(lo / 60))
    const b = Math.max(a, Math.round(hi / 60))
    return a === b ? t('aiRefine.aboutMinutes', { count: a }) : t('aiRefine.aboutMinutesRange', { min: a, max: b })
  }
  const h = (s: number): string => String(Math.round((s / 3600) * 2) / 2)
  const a = h(Math.max(lo, 1800))
  const b = h(hi)
  return a === b ? t('aiRefine.aboutHours', { count: a }) : t('aiRefine.aboutHoursRange', { min: a, max: b })
}

/** 估算结果的一行说明 */
export function estimateText(e: AiEstimate): string {
  return t('aiRefine.estimate', { range: fmtRange(e.seconds), device: e.label })
}

/** 估算结果的补充说明：用 CPU 很慢、没认出笔画 */
export function estimateHints(e: AiEstimate): string[] {
  const hints: string[] = []
  if (e.backend === 'cpu') hints.push(t('aiRefine.hintCpu'))
  if (e.reuse >= 0.3) hints.push(t('aiRefine.hintReuse', { pct: Math.round(e.reuse * 100) }))
  if (e.fallback) hints.push(t('aiRefine.hintFallback'))
  return hints
}

/** 模型状态的说明 */
export function modelText(s: AiModelStatus): string {
  if (s.state === 'ready') return t('aiRefine.modelReady')
  if (s.state === 'downloading') {
    if (s.verifying) return t('aiRefine.modelVerifying')
    const pct = s.size ? Math.floor(((s.done ?? 0) / s.size) * 100) : 0
    const params = { pct, done: fmtBytes(s.done ?? 0), size: fmtBytes(s.size) }
    return s.source
      ? t('aiRefine.modelDownloadingFrom', { ...params, source: s.source })
      : t('aiRefine.modelDownloading', params)
  }
  if (s.state === 'error') return t('aiRefine.modelFailed', { message: s.message ?? t('aiRefine.unknownReason') })
  return t('aiRefine.modelMissing', { size: fmtBytes(s.size) })
}

export const modelPct = (s: AiModelStatus): number => (s.state === 'downloading' && s.size ? ((s.done ?? 0) / s.size) * 100 : 0)

/** 设置页里模型那一行的说明 */
export function modelSettingsText(s: AiModelStatus): string {
  if (s.state === 'ready') return s.disk ? t('aiRefine.settingsReadyDisk', { disk: fmtBytes(s.disk) }) : t('aiRefine.settingsReady')
  if (s.state === 'downloading') return modelText(s)
  const size = fmtBytes(s.size)
  if (s.state === 'error') return t('aiRefine.settingsError', { error: modelText(s), size })
  return s.disk ? t('aiRefine.settingsNeededPartial', { size, disk: fmtBytes(s.disk) }) : t('aiRefine.settingsNeeded', { size })
}

/** 倍数：小于 1 保留一位小数，大于 1 去掉多余的 0 */
const fmtRatio = (v: number): string => (v < 1 ? v.toFixed(1) : String(Math.round(v * 10) / 10))

const BASIS: Record<WatermarkSpeedInfo['basis'], Key> = {
  measured: 'aiRefine.basisMeasured',
  calibrated: 'aiRefine.basisCalibrated',
  default: 'aiRefine.basisRough'
}

/** “约为视频时长的 2～3 倍 · 实测 · GPU” */
export function speedText(s: WatermarkSpeedInfo): string {
  const [a, b] = s.ratio.map(fmtRatio)
  const range = a === b ? t('aiRefine.speedRatio', { count: a }) : t('aiRefine.speedRatioRange', { min: a, max: b })
  return [range, t(BASIS[s.basis]), s.backend].filter(Boolean).join(' · ')
}

const modeOption = (value: WatermarkMode, label: Key, hint: Key): { value: WatermarkMode; label: string; hint: string } => ({
  value,
  get label() {
    return t(label)
  },
  get hint() {
    return t(hint)
  }
})

/** label、hint 是 getter，读取时才按当前语言取 */
export const WATERMARK_MODES: { value: WatermarkMode; readonly label: string; readonly hint: string }[] = [
  modeOption('off', 'aiRefine.modeOff', 'aiRefine.modeOffHint'),
  modeOption('auto', 'aiRefine.modeAuto', 'aiRefine.modeAutoHint'),
  modeOption('ai', 'aiRefine.modeAi', 'aiRefine.modeAiHint')
]

/** 总开关菜单里每一项下面的小字：效果 + 预计耗时 */
export function watermarkModeHint(mode: WatermarkMode, speed: WatermarkSpeed | null): string {
  const base = WATERMARK_MODES.find((m) => m.value === mode)!.hint
  if (mode === 'off' || !speed) return base
  return t('aiRefine.hintWithSpeed', { hint: base, speed: speedText(mode === 'ai' ? speed.ai : speed.fast) })
}
