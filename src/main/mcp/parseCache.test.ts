import { describe, expect, it, vi } from 'vitest'
import type { MediaItem, ParseResult } from '@shared/types'
import { ParseCache } from './parseCache'

const item = (key: string): MediaItem => ({ key, kind: 'ugc', title: key, index: 1, cid: 1 })
const result = (n: number): ParseResult => ({
  kind: 'ugc',
  title: 't',
  cover: '',
  groups: [
    { id: 'a', title: 'a', items: [item(`a${n}`)] },
    { id: 'b', title: 'b', items: [item(`b${n}`)] }
  ],
  defaultSelected: []
})

describe('ParseCache', () => {
  it('拍平各组条目；过期的条目在下次解析时清掉', async () => {
    let now = 0
    let n = 0
    const fetchAll = vi.fn(async () => ({ result: result(++n), complete: true }))
    const c = new ParseCache(fetchAll, () => now)
    expect((await c.get(' x ', 10)).items.map((i) => i.key)).toEqual(['a1', 'b1'])
    expect(fetchAll).toHaveBeenCalledWith('x', 10)
    expect(await c.get('x', 99)).toMatchObject({ complete: true, items: [item('a1'), item('b1')] })
    now = 10 * 60_000
    await c.get('y', 10)
    // x 已经过期被清掉，再取要重新解析
    now += 1
    expect((await c.get('x', 10)).items[0].key).toBe('a3')
    expect(fetchAll).toHaveBeenCalledTimes(3)
  })

  it('缓存比要求的多时只返回前 maxItems 条，算没取全', async () => {
    const c = new ParseCache(vi.fn(async () => ({ result: result(1), complete: true })))
    await c.get('x', 100)
    expect(await c.get('x', 1)).toMatchObject({ complete: false, items: [item('a1')] })
    expect((await c.get('x', 2)).complete).toBe(true)
  })

  it('同一个链接正在解析时等它结束、用它的结果；出错只拿到一部分的不缓存', async () => {
    let release!: (v: { result: ParseResult; complete: boolean; error?: string }) => void
    const fetchAll = vi.fn()
    fetchAll.mockReturnValueOnce(new Promise((r) => (release = r)))
    const c = new ParseCache(fetchAll)
    const a = c.get('x', 10)
    const b = c.get('x', 10)
    release({ result: result(1), complete: false, error: '风控' })
    expect((await a).error).toBe('风控')
    // b 等 a 结束后发现没有缓存，自己再解析一次
    fetchAll.mockResolvedValueOnce({ result: result(2), complete: true })
    expect((await b).items[0].key).toBe('a2')
    expect(fetchAll).toHaveBeenCalledTimes(2)

    // 解析失败时等待的那一方也照常继续
    fetchAll.mockRejectedValueOnce(new Error('网络错误')).mockResolvedValueOnce({ result: result(3), complete: true })
    const d = c.get('y', 10)
    const e = c.get('y', 10)
    await expect(d).rejects.toThrow('网络错误')
    expect((await e).items[0].key).toBe('a3')
  })

  it('分P缓存最多 5000 个视频，超出时丢掉最早记下的；重新记下的算最新', () => {
    const c = new ParseCache(vi.fn())
    c.setParts('v0', [item('v0:1')])
    for (let i = 1; i < 5000; i++) c.setParts(`v${i}`, [])
    c.setParts('v0', [item('v0:2')])
    c.setParts('v5000', [])
    expect(c.partsOf('v0')).toEqual([item('v0:2')])
    expect(c.partsOf('v1')).toBeUndefined()
    expect(c.partsOf('v2')).toEqual([])
  })
})
