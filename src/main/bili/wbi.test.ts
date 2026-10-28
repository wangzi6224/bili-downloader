import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { encWbi, getMixinKey, keyFromUrl } from './wbi'

// 文档中的示例值
const IMG = '7cd084941338484aae1ad9425b84077c'
const SUB = '4932caff0ff746eab6f01bf08b70ac45'

const signed = (query: string): string =>
  `${query}&w_rid=${createHash('md5').update(query + getMixinKey(IMG, SUB)).digest('hex')}`

afterEach(() => {
  vi.useRealTimers()
})

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

  it('签名前去掉值里的 !\'()*', () => {
    expect(encWbi({ q: "a!b'c(d)e*f" }, IMG, SUB, 1)).toBe(signed('q=abcdef&wts=1'))
  })

  it('中文和空格按 encodeURIComponent 编码', () => {
    expect(encWbi({ keyword: '中文 测试' }, IMG, SUB, 1)).toBe(signed('keyword=%E4%B8%AD%E6%96%87%20%E6%B5%8B%E8%AF%95&wts=1'))
  })

  it('不传 wts 时用当前时间的秒数（四舍五入）', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1702204168_600)
    expect(encWbi({ foo: '114', bar: '514', zab: 1919810 }, IMG, SUB)).toBe(
      'bar=514&foo=114&wts=1702204169&zab=1919810&w_rid=8f6f2b5b3d485fe1886cec6a0be8c5d4'
    )
  })
})
