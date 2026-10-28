import { describe, expect, it } from 'vitest'
import { encWbi, getMixinKey, keyFromUrl } from './wbi'

// 文档中的示例值
const IMG = '7cd084941338484aae1ad9425b84077c'
const SUB = '4932caff0ff746eab6f01bf08b70ac45'

describe('wbi', () => {
  it('computes mixin key', () => {
    expect(getMixinKey(IMG, SUB)).toBe('ea1db124af3c7062474693fa704f4ff8')
  })

  it('signs params', () => {
    expect(encWbi({ foo: '114', bar: '514', zab: 1919810 }, IMG, SUB, 1702204169)).toBe(
      'bar=514&foo=114&wts=1702204169&zab=1919810&w_rid=8f6f2b5b3d485fe1886cec6a0be8c5d4'
    )
  })

  it('extracts key from url', () => {
    expect(keyFromUrl(`https://i0.hdslb.com/bfs/wbi/${IMG}.png`)).toBe(IMG)
  })
})
