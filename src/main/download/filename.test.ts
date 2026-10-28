import { describe, expect, it } from 'vitest'
import { buildRelBase, sanitize } from './filename'

describe('sanitize', () => {
  it('replaces path separators and colons', () => {
    expect(sanitize('A/B:C')).toBe('A／B：C')
  })

  it('strips illegal characters and control chars', () => {
    expect(sanitize('a*b?c"d<e>f|g\\h\x01')).toBe('a b c d e f g h')
  })

  it('trims leading dots and trailing dots/spaces', () => {
    expect(sanitize('..hidden. . ')).toBe('hidden')
  })

  it('falls back for empty names', () => {
    expect(sanitize('///'.replace(/\//g, ''))).toBe('未命名')
  })

  it('limits byte length without breaking characters', () => {
    const s = sanitize('测'.repeat(200))
    expect(Buffer.byteLength(s)).toBeLessThanOrEqual(180)
    expect(s).toBe('测'.repeat(60))
  })
})

describe('buildRelBase', () => {
  it('uses folder and padded index for multiple items', () => {
    expect(buildRelBase('合集', { title: '第一集', index: 3 }, true, 120)).toBe('合集/003 - 第一集')
  })

  it('uses the title alone for a single-item resource', () => {
    expect(buildRelBase('电影名', { title: '电影名', index: 1 }, false, 1)).toBe('电影名')
  })

  it('joins title and item title for a single pick out of many', () => {
    expect(buildRelBase('番剧', { title: '第1话 开始', index: 1 }, false, 12)).toBe('番剧 - 第1话 开始')
  })
})
