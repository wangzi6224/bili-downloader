import { describe, expect, it } from 'vitest'
import { DEFAULT_OPTIONS, normalizeOptions, DEFAULT_YT_OPTIONS, normalizeYtOptions } from './options'
import type { CodecPref } from './types'

describe('normalizeOptions', () => {
  it('空选项补齐默认值，画质默认最高', () => {
    expect(normalizeOptions({})).toEqual({ ...DEFAULT_OPTIONS, qn: 127 })
    expect(normalizeOptions({}, 80).qn).toBe(80)
    expect(normalizeOptions({ qn: 64 }, 80).qn).toBe(64)
  })

  it('去水印只认 auto，其他值（包括旧数据里没有的）都当作不处理', () => {
    expect(normalizeOptions({ watermark: 'auto' }).watermark).toBe('auto')
    expect(normalizeOptions({ watermark: 'ai' }).watermark).toBe('ai')
    expect(normalizeOptions({ watermark: 'yes' as never }).watermark).toBe('off')
    expect(normalizeOptions({}).watermark).toBe('off')
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

describe('normalizeYtOptions', () => {
  it('空的补齐默认值，不修改默认值', () => {
    const o = normalizeYtOptions()
    expect(o).toEqual(DEFAULT_YT_OPTIONS)
    o.codecOrder.reverse()
    expect(DEFAULT_YT_OPTIONS.codecOrder).toEqual(['avc', 'vp9', 'av1'])
  })

  it('编码去重、补齐；不认识的取值退回默认', () => {
    expect(normalizeYtOptions({
      codecOrder: ['av1', 'av1', 'hevc' as 'avc'],
      audio: 'flac' as 'best',
      container: 'avi' as 'mp4',
      sponsorblock: 'cut' as 'off'
    })).toMatchObject({ codecOrder: ['av1', 'avc', 'vp9'], audio: 'best', container: 'mp4', sponsorblock: 'off' })
  })

  it('字幕语言只留合法的语言代码，去重', () => {
    expect(normalizeYtOptions({ subtitleLangs: ['en', 'zh-Hans', 'en', '', 'a b', 3 as unknown as string, 'x'.repeat(21)] }).subtitleLangs)
      .toEqual(['en', 'zh-Hans'])
    expect(normalizeYtOptions({ subtitleLangs: 'en' as unknown as string[] }).subtitleLangs).toEqual([])
  })

  it('合法的取值原样保留；编码顺序缺失时按默认顺序', () => {
    expect(normalizeYtOptions({
      codecOrder: undefined,
      audio: 'opus',
      container: 'mkv',
      sponsorblock: 'mark',
      autoSubs: true,
      hdr: true
    })).toEqual({ ...DEFAULT_YT_OPTIONS, audio: 'opus', container: 'mkv', sponsorblock: 'mark', autoSubs: true, hdr: true })
  })

  it('旧数据里编码顺序为空时按默认顺序补齐（normalizeOptions）', () => {
    expect(normalizeOptions({ codecOrder: undefined }).codecOrder).toEqual(['avc', 'hevc', 'av1'])
  })

  it('normalizeOptions 带 yt 时一并规范化，没有时不加', () => {
    expect(normalizeOptions({}).yt).toBeUndefined()
    expect(normalizeOptions({ yt: { container: 'webm' } as never }).yt).toEqual({ ...DEFAULT_YT_OPTIONS, container: 'webm' })
  })
})
