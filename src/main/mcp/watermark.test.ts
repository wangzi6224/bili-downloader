import { describe, expect, it } from 'vitest'
import { t } from '@shared/i18n'
import type { TaskInfo } from '@shared/types'
import { fakeWatermark, makeTask, mediaItem } from '../../test/fakeQueue'
import { batchWatermark, fmtSeconds, sumSeconds } from './watermark'

describe('fmtSeconds', () => {
  it('按量级换单位：秒、分钟、小时', () => {
    expect(fmtSeconds([0, 0.4])).toBe('约 1 秒')
    expect(fmtSeconds([15, 25])).toBe('约 15～25 秒')
    expect(fmtSeconds([20, 120])).toBe('约 1～2 分钟')
    expect(fmtSeconds([215, 315])).toBe('约 4～5 分钟')
    expect(fmtSeconds([600, 630])).toBe('约 10～11 分钟')
    expect(fmtSeconds([3600, 9000])).toBe('约 1～2.5 小时')
    expect(fmtSeconds([60, 5400])).toBe('约 0.1～1.5 小时')
    expect(fmtSeconds([7200, 7200])).toBe('约 2 小时')
  })
})

describe('sumSeconds', () => {
  it('合计；可信度按最不可信的那个', () => {
    expect(sumSeconds([])).toBeUndefined()
    expect(
      sumSeconds([
        { seconds: [10, 20], basis: 'measured' },
        { seconds: [5, 6], basis: 'calibrated' }
      ])
    ).toEqual({ seconds: [15, 26], basis: 'calibrated' })
    expect(sumSeconds([{ seconds: [1, 2], basis: 'measured' }, { seconds: [1, 2], basis: 'default' }])?.basis).toBe('default')
  })
})

describe('batchWatermark 的抖音任务', () => {
  const douyin = (id: string, over: Partial<TaskInfo> = {}): TaskInfo =>
    makeTask(id, { item: mediaItem(`dy:${id}`, { kind: 'douyin', cid: 0 }), ...over })
  const hint = (tasks: TaskInfo[]) => batchWatermark({ watermark: 'off' }, tasks, 'b1', fakeWatermark())?.hint

  it('只有抖音任务的批次不提示会识别水印', () => {
    const r = batchWatermark({ watermark: 'off' }, [douyin('a'), douyin('b', { status: 'downloading' })], 'b1', fakeWatermark())
    expect(r).toMatchObject({ option: 'off', checked: 0, found: 0, removed: 0, not_found: 0 })
    expect(r!.hint).toBeUndefined()
  })

  it('混着还没下完的 B站视频时照常提示', () => {
    expect(hint([makeTask('x')])).toBe(t('mcpWm.willDetect'))
    expect(hint([douyin('a'), makeTask('x')])).toBe(t('mcpWm.willDetect'))
  })

  it('B站视频都下完了、只剩抖音任务没下完时不提示', () => {
    expect(hint([douyin('a'), makeTask('x', { status: 'done' })])).toBeUndefined()
  })
})
