import { describe, expect, it } from 'vitest'
import { isSite, siteOf, siteOfKind, ytItemUrl, ytKey, ytWatchUrl } from './site'

describe('site', () => {
  it('按条目类型区分平台', () => {
    expect(['ugc', 'pgc', 'cheese', 'audio'].map((k) => siteOfKind(k as 'ugc'))).toEqual(['bili', 'bili', 'bili', 'bili'])
    expect(siteOfKind('youtube')).toBe('youtube')
    expect(siteOf({ kind: 'youtube' })).toBe('youtube')
    expect(siteOf({ item: { kind: 'ugc' } })).toBe('bili')
  })

  it('isSite 只认两个平台', () => {
    expect([isSite('bili'), isSite('youtube'), isSite('x'), isSite(undefined)]).toEqual([true, true, false, false])
  })

  it('YouTube 的下载记录键和地址', () => {
    expect(ytKey('dQw4w9WgXcQ')).toBe('yt:dQw4w9WgXcQ')
    expect(ytWatchUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(ytItemUrl({ kind: 'youtube', ytId: 'x1' })).toBe('https://www.youtube.com/watch?v=x1')
    expect(ytItemUrl({ kind: 'youtube' })).toBeUndefined()
    expect(ytItemUrl({ kind: 'ugc', ytId: 'x1' })).toBeUndefined()
  })
})
