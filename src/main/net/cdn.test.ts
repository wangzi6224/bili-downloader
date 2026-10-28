import { describe, expect, it } from 'vitest'
import { preferCdn } from './cdn'

const UPOS = 'https://upos-sz-estgcos.bilivideo.com/upgcxcode/99/91/137649199/137649199-1-30080.m4s?e=abc&deadline=1&os=upos'
const MCDN = 'https://xy1x2x3x4xy.mcdn.bilivideo.cn:4483/upgcxcode/99/91/137649199/137649199-1-30080.m4s?e=abc&os=mcdn'

describe('preferCdn', () => {
  it('puts the preferred mirror first and keeps the originals as fallbacks', () => {
    expect(preferCdn([MCDN, UPOS], 'upos-sz-mirrorali.bilivideo.com')).toEqual([
      'https://upos-sz-mirrorali.bilivideo.com/upgcxcode/99/91/137649199/137649199-1-30080.m4s?e=abc&os=mcdn',
      MCDN,
      UPOS
    ])
  })

  it('leaves urls alone when no mirror is chosen or nothing is upos-shaped', () => {
    expect(preferCdn([UPOS], '')).toEqual([UPOS])
    expect(preferCdn(['https://example.com/a.m4a'], 'upos-sz-mirrorali.bilivideo.com')).toEqual(['https://example.com/a.m4a'])
  })

  it('does not duplicate when already on the mirror', () => {
    const onMirror = UPOS.replace('upos-sz-estgcos', 'upos-sz-mirrorcos')
    expect(preferCdn([onMirror], 'upos-sz-mirrorcos.bilivideo.com')).toEqual([onMirror])
  })
})
