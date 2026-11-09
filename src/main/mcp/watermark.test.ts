import { describe, expect, it } from 'vitest'
import { fmtSeconds, sumSeconds } from './watermark'

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
