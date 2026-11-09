import { describe, expect, it } from 'vitest'
import type { AiEstimate } from '@shared/types'
import { estimateHints, estimateText, fmtRange, modelPct, modelSettingsText, modelText } from './aiRefine'

describe('fmtRange', () => {
  it('按量级取整', () => {
    expect(fmtRange([10, 50])).toBe('不到 1 分钟')
    expect(fmtRange([50, 100])).toBe('约 1～2 分钟')
    expect(fmtRange([170, 190])).toBe('约 3 分钟')
    expect(fmtRange([600, 900])).toBe('约 10～15 分钟')
    expect(fmtRange([3000, 5400])).toBe('约 1～1.5 小时')
    expect(fmtRange([5400, 5500])).toBe('约 1.5 小时')
  })
})

describe('估算说明', () => {
  const e: AiEstimate = { seconds: [600, 900], backend: 'webgpu', label: 'GPU', frames: 18000, reuse: 0.1, fallback: false }

  it('一行概要', () => {
    expect(estimateText(e)).toBe('预计约 10～15 分钟 · 用 GPU')
  })

  it('补充说明：用 CPU、能沿用的帧多、没认出笔画', () => {
    expect(estimateHints(e)).toEqual([])
    expect(estimateHints({ ...e, backend: 'cpu', reuse: 0.42, fallback: true })).toEqual([
      '这台电脑上没能用显卡加速，只能用 CPU，会比较慢。',
      '画面静止的部分会直接沿用（约 42% 的帧）。',
      '没有认出水印的笔画，会重画整个方框，效果可能不如预期。'
    ])
  })
})

describe('模型状态', () => {
  const MB = 1024 * 1024
  it('各状态的说明和进度', () => {
    expect(modelText({ state: 'missing', size: 200 * MB })).toBe('AI 精修要先下载模型（200.0 MB，只需下载一次）')
    expect(modelText({ state: 'downloading', size: 200 * MB, done: 50 * MB })).toBe('正在下载 AI 模型 25%（50.0 MB / 200.0 MB）')
    expect(modelText({ state: 'downloading', size: 200 * MB, done: 50 * MB, source: 'ModelScope' })).toBe('正在从 ModelScope 下载 AI 模型 25%（50.0 MB / 200.0 MB）')
    expect(modelText({ state: 'downloading', size: 0 })).toBe('正在下载 AI 模型 0%（0 B / 0 B）')
    expect(modelText({ state: 'downloading', size: 1, done: 1, verifying: true })).toBe('正在校验模型…')
    expect(modelText({ state: 'error', size: 1, message: '连不上' })).toBe('模型下载失败：连不上')
    expect(modelText({ state: 'error', size: 1 })).toBe('模型下载失败：未知原因')
    expect(modelText({ state: 'ready', size: 1 })).toBe('AI 模型已就绪')
    expect(modelPct({ state: 'downloading', size: 200, done: 50 })).toBe(25)
    expect(modelPct({ state: 'downloading', size: 200 })).toBe(0)
    expect(modelPct({ state: 'ready', size: 200 })).toBe(0)
  })
})

describe('设置页的模型说明', () => {
  const MB = 1024 * 1024
  it('各状态', () => {
    expect(modelSettingsText({ state: 'ready', size: 200 * MB, disk: 600 * MB })).toBe('已下载，连同缓存共占 600.0 MB。去水印选“AI 精修”时使用；删除后再用要重新下载。')
    expect(modelSettingsText({ state: 'ready', size: 200 * MB })).toBe('已下载。去水印选“AI 精修”时使用；删除后再用要重新下载。')
    expect(modelSettingsText({ state: 'downloading', size: 200 * MB, done: 100 * MB })).toBe('正在下载 AI 模型 50%（100.0 MB / 200.0 MB）')
    expect(modelSettingsText({ state: 'missing', size: 200 * MB, disk: 0 })).toBe('去水印选“AI 精修”时需要，第一次使用时下载（200.0 MB）。')
    expect(modelSettingsText({ state: 'missing', size: 200 * MB, disk: 50 * MB })).toBe('去水印选“AI 精修”时需要，第一次使用时下载（200.0 MB）；没下完的部分占 50.0 MB。')
    expect(modelSettingsText({ state: 'error', size: 200 * MB, message: '连不上' })).toBe('模型下载失败：连不上。去水印选“AI 精修”时需要，第一次使用时下载（200.0 MB）。')
  })
})
