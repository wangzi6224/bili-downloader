import { afterEach, describe, expect, it, vi } from 'vitest'
import { pingHost, preferCdn } from './cdn'

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

describe('preferCdn：其余情况', () => {
  it('跳过解析不了的地址，取第一个 upos 地址来改写', () => {
    expect(preferCdn(['not a url', MCDN], 'upos-sz-mirrorcos.bilivideo.com')).toEqual([
      'https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/99/91/137649199/137649199-1-30080.m4s?e=abc&os=mcdn',
      'not a url',
      MCDN
    ])
  })

  it('列表里已有改写后的地址时挪到最前，不重复', () => {
    const onMirror = UPOS.replace('upos-sz-estgcos', 'upos-sz-mirrorali')
    expect(preferCdn([UPOS, onMirror], 'upos-sz-mirrorali.bilivideo.com')).toEqual([onMirror, UPOS])
  })
})

describe('pingHost', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('用 HEAD 请求测延迟，读完就取消响应体', async () => {
    const cancel = vi.fn(async () => {})
    const fetch = vi.fn(async () => ({ body: { cancel } }))
    vi.stubGlobal('fetch', fetch)
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1234)
    expect(await pingHost('upos-sz-mirrorali.bilivideo.com')).toBe(234)
    expect(fetch).toHaveBeenCalledWith('https://upos-sz-mirrorali.bilivideo.com/', expect.objectContaining({ method: 'HEAD' }))
    expect(timeout).toHaveBeenCalledWith(5000)
    expect(cancel).toHaveBeenCalled()
  })

  it('没有响应体也算成功，超时可以自定义', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ body: null })))
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    expect(await pingHost('h', 100)).toBeTypeOf('number')
    expect(timeout).toHaveBeenCalledWith(100)
  })

  it('连不上时返回 null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('ECONNREFUSED'))))
    expect(await pingHost('h')).toBeNull()
  })
})
