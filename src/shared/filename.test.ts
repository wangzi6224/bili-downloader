import { describe, expect, it } from 'vitest'
import { sanitize } from './filename'

describe('sanitize', () => {
  it('replaces path separators and colons', () => {
    expect(sanitize('A/B:C')).toBe('A／B：C')
  })

  it('strips illegal characters and control chars', () => {
    expect(sanitize('a*b?c"d<e>f|g\\h\x01')).toBe('a b c d e f g h')
    expect(sanitize('tab\there')).toBe('tab here')
  })

  it('trims leading dots/dashes and trailing dots/spaces', () => {
    expect(sanitize('..hidden. . ')).toBe('hidden')
    expect(sanitize('-flag')).toBe('flag')
  })

  it('falls back for empty names', () => {
    expect(sanitize('   ')).toBe('未命名')
  })

  it('limits byte length without breaking characters', () => {
    const s = sanitize('测'.repeat(200))
    expect(new TextEncoder().encode(s).length).toBeLessThanOrEqual(180)
    expect(s).toBe('测'.repeat(60))
  })
})
