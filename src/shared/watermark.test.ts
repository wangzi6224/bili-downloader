import { describe, expect, it } from 'vitest'
import {
  clampRegion,
  cornerName,
  defaultRegion,
  delogoFilter,
  isVideoTask,
  markWatermarkText,
  padRegion,
  stripWatermarkNotes,
  withWatermarkNote,
  WM_MARK,
  WM_NOTE
} from './watermark'

describe('clampRegion', () => {
  it('取整，并离四边至少留 1 像素', () => {
    expect(clampRegion({ x: 10.4, y: 5.6, w: 100.2, h: 20.4 }, 1920, 1080)).toEqual({ x: 10, y: 6, w: 101, h: 20 })
    expect(clampRegion({ x: 0, y: 0, w: 50, h: 20 }, 1920, 1080)).toEqual({ x: 1, y: 1, w: 49, h: 19 })
    expect(clampRegion({ x: 1800, y: 1050, w: 200, h: 100 }, 1920, 1080)).toEqual({ x: 1800, y: 1050, w: 119, h: 29 })
    expect(clampRegion({ x: -30, y: -30, w: 2000, h: 2000 }, 1920, 1080)).toEqual({ x: 1, y: 1, w: 1918, h: 1078 })
  })

  it('收完太小、整个在画面外或不是数字时返回 null', () => {
    expect(clampRegion({ x: 10, y: 10, w: 3, h: 20 }, 1920, 1080)).toBeNull()
    expect(clampRegion({ x: 10, y: 10, w: 20, h: 3 }, 1920, 1080)).toBeNull()
    expect(clampRegion({ x: 3000, y: 10, w: 20, h: 20 }, 1920, 1080)).toBeNull()
    expect(clampRegion({ x: Number.NaN, y: 10, w: 20, h: 20 }, 1920, 1080)).toBeNull()
    expect(clampRegion({ x: 10, y: 10, w: 20, h: 20 }, Number.POSITIVE_INFINITY, 1080)).toBeNull()
  })
})

describe('padRegion', () => {
  it('按高度的比例外扩，至少 min 像素', () => {
    expect(padRegion({ x: 100, y: 50, w: 200, h: 40 })).toEqual({ x: 90, y: 40, w: 220, h: 60 })
    expect(padRegion({ x: 100, y: 50, w: 200, h: 8 })).toEqual({ x: 96, y: 46, w: 208, h: 16 })
    expect(padRegion({ x: 100, y: 50, w: 200, h: 40 }, 0.5, 2)).toEqual({ x: 80, y: 30, w: 240, h: 80 })
  })
})

describe('其他', () => {
  it('delogoFilter', () => {
    expect(delogoFilter({ x: 1, y: 2, w: 30, h: 40 })).toBe('delogo=x=1:y=2:w=30:h=40')
  })

  it('cornerName 按框的中心判断', () => {
    expect(cornerName({ x: 10, y: 10, w: 50, h: 20 }, 1920, 1080)).toBe('左上角')
    expect(cornerName({ x: 1700, y: 10, w: 200, h: 20 }, 1920, 1080)).toBe('右上角')
    expect(cornerName({ x: 10, y: 1000, w: 200, h: 20 }, 1920, 1080)).toBe('左下角')
    expect(cornerName({ x: 1700, y: 1000, w: 200, h: 20 }, 1920, 1080)).toBe('右下角')
  })

  it('defaultRegion 放在右上角，竖屏按短边算大小；画面太小时退回整幅', () => {
    expect(defaultRegion(1920, 1080)).toEqual({ x: 1542, y: 22, w: 356, h: 86 })
    expect(defaultRegion(1080, 1920)).toEqual({ x: 702, y: 22, w: 356, h: 86 })
    expect(defaultRegion(40, 40)).toEqual({ x: 1, y: 1, w: 38, h: 38 })
    expect(defaultRegion(2, 2)).toEqual({ x: 1, y: 1, w: 1, h: 1 })
  })

  it('isVideoTask：音频分区和只下音频的不算', () => {
    expect(isVideoTask({ item: { kind: 'ugc' }, options: { output: 'full' } })).toBe(true)
    expect(isVideoTask({ item: { kind: 'pgc' }, options: { output: 'video' } })).toBe(true)
    expect(isVideoTask({ item: { kind: 'ugc' }, options: { output: 'audio' } })).toBe(false)
    expect(isVideoTask({ item: { kind: 'audio' }, options: { output: 'full' } })).toBe(false)
  })
})

describe('提示', () => {
  it('提示都带去水印标记，文案不变', () => {
    expect(WM_NOTE.hdr()).toBe(`${WM_MARK}去水印：暂不支持 HDR 和杜比视界视频，已保留原视频`)
    expect(WM_NOTE.none()).toBe(`${WM_MARK}去水印：没有识别到水印，已保留原视频（可以在任务上点“去水印…”手动框选）`)
    expect(markWatermarkText(WM_NOTE.moved())).toBe(WM_NOTE.moved())
  })

  it('失败原因已经是去水印报错时不重复前缀', () => {
    expect(WM_NOTE.failed(`${WM_MARK}去水印失败：磁盘空间不足`)).toBe(`${WM_MARK}去水印失败：磁盘空间不足，已保留原视频`)
    // 没带标记的旧写法也认
    expect(WM_NOTE.failed('去水印失败：磁盘空间不足')).toBe(`${WM_MARK}去水印失败：磁盘空间不足，已保留原视频`)
    expect(WM_NOTE.failed('没找到视频画面')).toBe(`${WM_MARK}去水印失败：没找到视频画面，已保留原视频`)
    expect(WM_NOTE.aiFailed(`${WM_MARK}去水印失败：编码器不可用`)).toBe(`${WM_MARK}去水印：AI 精修没能完成（去水印失败：编码器不可用），这次改用了快速去除`)
  })

  it('stripWatermarkNotes 只去掉去水印的提示', () => {
    expect(stripWatermarkNotes(undefined)).toBeUndefined()
    expect(stripWatermarkNotes(WM_NOTE.none())).toBeUndefined()
    expect(stripWatermarkNotes(`没有 CC 字幕；${WM_NOTE.hdr()}；该清晰度没有 AVC`)).toBe('没有 CC 字幕；该清晰度没有 AVC')
  })

  it('stripWatermarkNotes 不看界面语言：别的语言的提示靠标记认出，旧数据靠中文前缀认出', () => {
    const en = markWatermarkText('Watermark removal did not finish, original video kept')
    expect(stripWatermarkNotes(`No CC subtitles；${en}`)).toBe('No CC subtitles')
    expect(stripWatermarkNotes('No CC subtitles；去水印没有完成（应用中途退出了），已保留原视频')).toBe('No CC subtitles')
  })

  it('withWatermarkNote 替换旧的去水印提示', () => {
    expect(withWatermarkNote(undefined, undefined)).toBeUndefined()
    expect(withWatermarkNote(`没有 CC 字幕；${WM_NOTE.none()}`, WM_NOTE.interrupted())).toBe(`没有 CC 字幕；${WM_NOTE.interrupted()}`)
    expect(withWatermarkNote(WM_NOTE.none(), undefined)).toBeUndefined()
  })
})
