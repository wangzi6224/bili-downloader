import type { AiEstimate, AiModelStatus } from '@shared/types'
import { fmtBytes } from './format'

/** 预计耗时的区间，按量级取整：“不到 1 分钟”“约 3～5 分钟”“约 1.5～2 小时” */
export function fmtRange([lo, hi]: [number, number]): string {
  if (hi < 60) return '不到 1 分钟'
  if (hi < 3600) {
    const a = Math.max(1, Math.round(lo / 60))
    const b = Math.max(a, Math.round(hi / 60))
    return a === b ? `约 ${a} 分钟` : `约 ${a}～${b} 分钟`
  }
  const h = (s: number): string => String(Math.round((s / 3600) * 2) / 2)
  const a = h(Math.max(lo, 1800))
  const b = h(hi)
  return a === b ? `约 ${a} 小时` : `约 ${a}～${b} 小时`
}

/** 估算结果的一行说明 */
export function estimateText(e: AiEstimate): string {
  return `预计${fmtRange(e.seconds)} · 用 ${e.label}`
}

/** 估算结果的补充说明：用 CPU 很慢、没认出笔画 */
export function estimateHints(e: AiEstimate): string[] {
  const hints: string[] = []
  if (e.backend === 'cpu') hints.push('这台电脑上没能用显卡加速，只能用 CPU，会比较慢。')
  if (e.reuse >= 0.3) hints.push(`画面静止的部分会直接沿用（约 ${Math.round(e.reuse * 100)}% 的帧）。`)
  if (e.fallback) hints.push('没有认出水印的笔画，会重画整个方框，效果可能不如预期。')
  return hints
}

/** 模型状态的说明 */
export function modelText(s: AiModelStatus): string {
  if (s.state === 'ready') return 'AI 模型已就绪'
  if (s.state === 'downloading') {
    if (s.verifying) return '正在校验模型…'
    const pct = s.size ? Math.floor(((s.done ?? 0) / s.size) * 100) : 0
    return `正在${s.source ? `从 ${s.source} ` : ''}下载 AI 模型 ${pct}%（${fmtBytes(s.done ?? 0)} / ${fmtBytes(s.size)}）`
  }
  if (s.state === 'error') return `模型下载失败：${s.message ?? '未知原因'}`
  return `AI 精修要先下载模型（${fmtBytes(s.size)}，只需下载一次）`
}

export const modelPct = (s: AiModelStatus): number => (s.state === 'downloading' && s.size ? ((s.done ?? 0) / s.size) * 100 : 0)

/** 设置页里模型那一行的说明 */
export function modelSettingsText(s: AiModelStatus): string {
  const disk = s.disk ? `，连同缓存共占 ${fmtBytes(s.disk)}` : ''
  if (s.state === 'ready') return `已下载${disk}。去水印选“AI 精修”时使用；删除后再用要重新下载。`
  if (s.state === 'downloading') return modelText(s)
  const base = `去水印选“AI 精修”时需要，第一次使用时下载（${fmtBytes(s.size)}）`
  if (s.state === 'error') return `${modelText(s)}。${base}。`
  return `${base}${s.disk ? `；没下完的部分占 ${fmtBytes(s.disk)}` : ''}。`
}
