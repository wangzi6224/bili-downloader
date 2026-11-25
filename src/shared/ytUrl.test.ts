import { describe, expect, it } from 'vitest'
import { extractYtInputs, isYtHost, needsYtLogin, parseYtInput, ytTargetUrl, type YtTarget } from './ytUrl'

const ID = 'dQw4w9WgXcQ'

describe('parseYtInput', () => {
  it.each<[string, YtTarget]>([
    [`https://www.youtube.com/watch?v=${ID}`, { type: 'video', id: ID }],
    [`youtube.com/watch?v=${ID}&t=42s`, { type: 'video', id: ID }],
    [`https://m.youtube.com/watch?v=${ID}`, { type: 'video', id: ID }],
    [`https://youtu.be/${ID}?si=abc`, { type: 'video', id: ID }],
    [`https://www.youtube.com/shorts/${ID}`, { type: 'video', id: ID }],
    [`https://www.youtube.com/live/${ID}?feature=share`, { type: 'video', id: ID }],
    [`https://www.youtube-nocookie.com/embed/${ID}`, { type: 'video', id: ID }],
    [`https://music.youtube.com/watch?v=${ID}`, { type: 'video', id: ID, music: true }],
    [`https://www.youtube.com/watch?v=${ID}&list=RD${ID}`, { type: 'video', id: ID }],
    [`https://www.youtube.com/watch?v=${ID}&list=PLabc123`, { type: 'playlist', id: 'PLabc123', video: ID }],
    [`https://music.youtube.com/watch?v=${ID}&list=OLAK5uy_x`, { type: 'playlist', id: 'OLAK5uy_x', video: ID, music: true }],
    [`https://youtu.be/${ID}?list=PLabc123`, { type: 'playlist', id: 'PLabc123', video: ID }],
    ['https://www.youtube.com/playlist?list=PLabc123', { type: 'playlist', id: 'PLabc123' }],
    ['https://music.youtube.com/playlist?list=OLAK5uy_x', { type: 'playlist', id: 'OLAK5uy_x', music: true }],
    ['https://music.youtube.com/browse/VLPLabc123', { type: 'playlist', id: 'PLabc123', music: true }],
    ['https://www.youtube.com/playlist?list=WL', { type: 'feed', feed: 'watchlater' }],
    ['https://www.youtube.com/playlist?list=LL', { type: 'feed', feed: 'liked' }],
    ['https://www.youtube.com/feed/subscriptions', { type: 'feed', feed: 'subscriptions' }],
    ['https://www.youtube.com/feed/history', { type: 'feed', feed: 'history' }],
    ['稍后观看', { type: 'feed', feed: 'watchlater' }],
    ['Watch Later', { type: 'feed', feed: 'watchlater' }],
    ['喜欢的视频', { type: 'feed', feed: 'liked' }],
    ['https://www.youtube.com/@Google', { type: 'channel', url: 'https://www.youtube.com/@Google/videos', tab: 'videos' }],
    ['https://www.youtube.com/@Google/shorts', { type: 'channel', url: 'https://www.youtube.com/@Google/shorts', tab: 'shorts' }],
    ['https://www.youtube.com/@Google/streams', { type: 'channel', url: 'https://www.youtube.com/@Google/streams', tab: 'streams' }],
    ['https://www.youtube.com/@Google/playlists', { type: 'channel', url: 'https://www.youtube.com/@Google/playlists', tab: 'playlists' }],
    ['https://www.youtube.com/@Google/featured', { type: 'channel', url: 'https://www.youtube.com/@Google/videos', tab: 'videos' }],
    ['https://www.youtube.com/@%E4%B8%AD%E6%96%87', { type: 'channel', url: 'https://www.youtube.com/@中文/videos', tab: 'videos' }],
    [
      'https://www.youtube.com/@Google/search?query=gemini ai',
      { type: 'channel', url: 'https://www.youtube.com/@Google/search?query=gemini%20ai', tab: 'search', query: 'gemini ai' }
    ],
    ['https://www.youtube.com/@Google/search?query=', { type: 'channel', url: 'https://www.youtube.com/@Google/videos', tab: 'videos' }],
    [
      'https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw/videos',
      { type: 'channel', url: 'https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw/videos', tab: 'videos' }
    ],
    ['https://www.youtube.com/c/Google', { type: 'channel', url: 'https://www.youtube.com/c/Google/videos', tab: 'videos' }],
    ['https://www.youtube.com/user/Google/streams', { type: 'channel', url: 'https://www.youtube.com/user/Google/streams', tab: 'streams' }]
  ])('%s', (input, want) => {
    expect(parseYtInput(input)).toEqual(want)
  })

  it.each([
    '',
    ID,
    'https://www.bilibili.com/video/BV1xx411c7mD',
    'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
    'ftp://youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=short',
    'https://youtu.be/short',
    'https://youtu.be/',
    'https://www.youtube.com/',
    'https://www.youtube.com/feed/playlists',
    'https://www.youtube.com/feed/library',
    'https://www.youtube.com/feed/trending',
    'https://www.youtube.com/@',
    'https://www.youtube.com/channel',
    'https://www.youtube.com/playlist?list=a',
    'https://music.youtube.com/browse/MPREb_x',
    'http://[bad'
  ])('不认：%s', (input) => {
    expect(parseYtInput(input)).toBeNull()
  })
})

describe('ytTargetUrl', () => {
  it('转成规范链接', () => {
    expect(ytTargetUrl({ type: 'video', id: ID })).toBe(`https://www.youtube.com/watch?v=${ID}`)
    expect(ytTargetUrl({ type: 'video', id: ID, music: true })).toBe(`https://music.youtube.com/watch?v=${ID}`)
    expect(ytTargetUrl({ type: 'playlist', id: 'PLx' })).toBe('https://www.youtube.com/playlist?list=PLx')
    expect(ytTargetUrl({ type: 'playlist', id: 'PLx', music: true })).toBe('https://music.youtube.com/playlist?list=PLx')
    expect(ytTargetUrl({ type: 'channel', url: 'https://www.youtube.com/@a/videos', tab: 'videos' })).toBe('https://www.youtube.com/@a/videos')
    expect(ytTargetUrl({ type: 'feed', feed: 'watchlater' })).toBe('https://www.youtube.com/playlist?list=WL')
    expect(ytTargetUrl({ type: 'feed', feed: 'liked' })).toBe('https://www.youtube.com/playlist?list=LL')
    expect(ytTargetUrl({ type: 'feed', feed: 'subscriptions' })).toBe('https://www.youtube.com/feed/subscriptions')
    expect(ytTargetUrl({ type: 'feed', feed: 'history' })).toBe('https://www.youtube.com/feed/history')
  })
})

describe('其他', () => {
  it('needsYtLogin：个人列表要登录', () => {
    expect(needsYtLogin({ type: 'feed', feed: 'history' })).toBe(true)
    expect(needsYtLogin({ type: 'playlist', id: 'WL' })).toBe(true)
    expect(needsYtLogin({ type: 'playlist', id: 'PLx' })).toBe(false)
    expect(needsYtLogin({ type: 'video', id: ID })).toBe(false)
  })

  it('isYtHost', () => {
    expect(['youtube.com', 'www.youtube.com', 'music.youtube.com', 'youtu.be', 'm.youtube.com'].every(isYtHost)).toBe(true)
    expect(['youtube.co', 'evil-youtube.com', 'bilibili.com'].some(isYtHost)).toBe(false)
  })

  it('extractYtInputs：从文字里找链接，去掉重复和不认识的，保持顺序', () => {
    const text = `看这个 https://youtu.be/${ID}，还有 youtube.com/watch?v=${ID}&t=1
      https://www.youtube.com/playlist?list=PLabc123 和 https://www.youtube.com/watch?v=${ID}&list=PLabc123
      https://www.youtube.com/feed/trending https://www.bilibili.com/video/BV1 https://www.youtube.com/@Google）`
    expect(extractYtInputs(text)).toEqual([
      `https://youtu.be/${ID}`,
      'https://www.youtube.com/playlist?list=PLabc123',
      `https://www.youtube.com/watch?v=${ID}&list=PLabc123`,
      'https://www.youtube.com/@Google'
    ])
  })
})
