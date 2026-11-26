import { describe, expect, it } from 'vitest'
import {
  downloadDirOf, downloadDirPatch, dyKey, isSite, siteConcurrency, siteItemUrl, siteNfoId, siteOf, siteOfKey, siteOfKind, SITES, ytKey, ytWatchUrl
} from './site'
import type { MediaItem, Settings } from './types'

describe('site', () => {
  it('按条目类型区分平台', () => {
    expect(['ugc', 'pgc', 'cheese', 'audio'].map((k) => siteOfKind(k as 'ugc'))).toEqual(['bili', 'bili', 'bili', 'bili'])
    expect(siteOfKind('youtube')).toBe('youtube')
    expect(siteOf({ kind: 'youtube' })).toBe('youtube')
    expect(siteOf({ item: { kind: 'ugc' } })).toBe('bili')
  })

  it('isSite 只认列出的平台', () => {
    expect([isSite('bili'), isSite('youtube'), isSite('x'), isSite(undefined)]).toEqual([true, true, false, false])
  })

  it('YouTube 的下载记录键和地址', () => {
    expect(ytKey('dQw4w9WgXcQ')).toBe('yt:dQw4w9WgXcQ')
    expect(ytWatchUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(siteItemUrl({ kind: 'youtube', ytId: 'x1' })).toBe('https://www.youtube.com/watch?v=x1')
    expect(siteItemUrl({ kind: 'youtube' })).toBeUndefined()
    // B站条目的地址由调用方按 B站规则拼
    expect(siteItemUrl({ kind: 'ugc', ytId: 'x1' })).toBeUndefined()
  })

  it('按记录键认平台；没有认得的前缀按 B站', () => {
    expect([siteOfKey('yt:abc'), siteOfKey('BV1xx411c7mD:1'), siteOfKey('ytpl:abc')]).toEqual(['youtube', 'bili', 'bili'])
  })

  it('认不出的条目类型按 B站', () => {
    expect(siteOfKind('unknown' as 'ugc')).toBe('bili')
  })

  it('平台顺序固定', () => {
    expect(SITES).toEqual(['bili', 'youtube', 'douyin'])
  })

  it('下载目录和改目录的补丁按平台取', () => {
    const s = { downloadDir: '/b', youtube: { downloadDir: '/y', concurrency: 2 }, concurrency: 5 } as Settings
    expect([downloadDirOf(s, 'bili'), downloadDirOf(s, 'youtube')]).toEqual(['/b', '/y'])
    expect(downloadDirPatch(s, 'bili', '/n')).toEqual({ downloadDir: '/n' })
    expect(downloadDirPatch(s, 'youtube', '/n')).toEqual({ youtube: { downloadDir: '/n', concurrency: 2 } })
  })

  it('同时下载上限：B站用总上限，YouTube 用自己的，旧设置没有这一段时用总上限', () => {
    const s = { concurrency: 5, youtube: { concurrency: 2 } } as Settings
    expect([siteConcurrency(s, 'bili'), siteConcurrency(s, 'youtube')]).toEqual([5, 2])
    expect(siteConcurrency({ concurrency: 4 } as Settings, 'youtube')).toBe(4)
  })

  it('NFO 里的唯一标识按平台取', () => {
    const item = (o: Partial<MediaItem>): MediaItem => ({ key: 'k', kind: 'ugc', title: 't', index: 1, cid: 7, ...o })
    expect(siteNfoId(item({ bvid: 'BV1' }))).toEqual({ type: 'bilibili', id: 'BV1' })
    expect(siteNfoId(item({ kind: 'pgc', epId: 3 }))).toEqual({ type: 'bilibili', id: 'ep3' })
    expect(siteNfoId(item({}))).toEqual({ type: 'bilibili', id: '7' })
    expect(siteNfoId(item({ kind: 'youtube', ytId: 'y1' }))).toEqual({ type: 'youtube', id: 'y1' })
    expect(siteNfoId(item({ kind: 'youtube' }))).toEqual({ type: 'youtube', id: 'k' })
  })
})

describe('抖音', () => {
  const item = (o: Partial<MediaItem> = {}): MediaItem => ({ key: 'dy:k', kind: 'douyin', title: 't', index: 1, cid: 0, ...o })

  it('按条目类型和记录键认出抖音', () => {
    expect(siteOfKind('douyin')).toBe('douyin')
    expect(siteOf({ item: { kind: 'douyin' } })).toBe('douyin')
    expect(isSite('douyin')).toBe(true)
    expect(dyKey('700000000000000001')).toBe('dy:700000000000000001')
    expect(siteOfKey(dyKey('700000000000000001'))).toBe('douyin')
  })

  it('原始地址是作品页；没有作品 id 时没有地址', () => {
    expect(siteItemUrl(item({ dyId: '700000000000000001' }))).toBe('https://www.douyin.com/video/700000000000000001')
    expect(siteItemUrl(item())).toBeUndefined()
    expect(siteItemUrl({ kind: 'ugc', dyId: '700000000000000001' })).toBeUndefined()
  })

  it('NFO 唯一标识用作品 id，没有时用记录键', () => {
    expect(siteNfoId(item({ dyId: '700000000000000001' }))).toEqual({ type: 'douyin', id: '700000000000000001' })
    expect(siteNfoId(item())).toEqual({ type: 'douyin', id: 'dy:k' })
  })

  it('用自己的下载目录和同时下载上限，旧设置没有这一段时用总上限', () => {
    const s = { concurrency: 5, douyin: { downloadDir: '/d', concurrency: 1 } } as Settings
    expect(downloadDirOf(s, 'douyin')).toBe('/d')
    expect(downloadDirPatch(s, 'douyin', '/n')).toEqual({ douyin: { downloadDir: '/n', concurrency: 1 } })
    expect(siteConcurrency(s, 'douyin')).toBe(1)
    expect(siteConcurrency({ concurrency: 4 } as Settings, 'douyin')).toBe(4)
  })
})
