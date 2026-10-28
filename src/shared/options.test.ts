import { describe, expect, it } from 'vitest'
import { DEFAULT_OPTIONS, normalizeOptions } from './options'
import type { CodecPref } from './types'

describe('normalizeOptions', () => {
  it('空选项补齐默认值，画质默认最高', () => {
    expect(normalizeOptions({})).toEqual({ ...DEFAULT_OPTIONS, qn: 127 })
    expect(normalizeOptions({}, 80).qn).toBe(80)
    expect(normalizeOptions({ qn: 64 }, 80).qn).toBe(64)
  })

  it('旧版的 codec 换算成编码顺序，已有 codecOrder 时以它为准', () => {
    expect(normalizeOptions({ codec: 'hevc' }).codecOrder).toEqual(['hevc', 'avc', 'av1'])
    expect(normalizeOptions({ codec: 'hevc', codecOrder: ['av1', 'avc', 'hevc'] }).codecOrder).toEqual(['av1', 'avc', 'hevc'])
  })

  it('旧版的 audioOnly 换算成输出类型，已有 output 时以它为准', () => {
    expect(normalizeOptions({ audioOnly: true }).output).toBe('audio')
    expect(normalizeOptions({ audioOnly: false }).output).toBe('full')
    expect(normalizeOptions({ audioOnly: true, output: 'video' }).output).toBe('video')
  })

  it('去掉旧字段', () => {
    const o = normalizeOptions({ codec: 'av1', audioOnly: true })
    expect(o).not.toHaveProperty('codec')
    expect(o).not.toHaveProperty('audioOnly')
  })

  it('编码顺序去重、去掉不认识的，缺的按默认顺序补在后面', () => {
    expect(normalizeOptions({ codecOrder: ['av1'] }).codecOrder).toEqual(['av1', 'avc', 'hevc'])
    expect(normalizeOptions({ codecOrder: ['hevc', 'hevc', 'vp9' as CodecPref] }).codecOrder).toEqual(['hevc', 'avc', 'av1'])
  })

  it('不修改传入的对象和默认值', () => {
    const raw = { codec: 'hevc' as CodecPref, audioOnly: true, codecOrder: undefined }
    const before = structuredClone(raw)
    const defaults = structuredClone(DEFAULT_OPTIONS)
    normalizeOptions(raw).codecOrder.reverse()
    expect(raw).toEqual(before)
    expect(DEFAULT_OPTIONS).toEqual(defaults)
  })
})
