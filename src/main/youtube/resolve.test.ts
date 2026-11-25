import { describe, expect, it } from 'vitest'
import type { YtTarget } from '@shared/ytUrl'
import channelJson from './__fixtures__/channel.json'
import channelPlaylistsJson from './__fixtures__/channel_playlists.json'
import playlistJson from './__fixtures__/playlist.json'
import searchJson from './__fixtures__/search.json'
import videoJson from './__fixtures__/video.json'
import videoSmallJson from './__fixtures__/video_small.json'
import {
  entryToItem,
  hasMoreAfter,
  listResult,
  pageRange,
  pageResult,
  pubdateOf,
  thumbOf,
  videoResult,
  videoToItem,
  YT_PAGE,
  YT_PLAYLIST_KEY
} from './resolve'
import type { YtFlatEntry, YtPlaylistInfo, YtVideoInfo } from './types'

const VIDEO = videoJson as unknown as YtVideoInfo
const SMALL = videoSmallJson as unknown as YtVideoInfo
const PLAYLIST = playlistJson as unknown as YtPlaylistInfo
const CHANNEL = channelJson as unknown as YtPlaylistInfo
const CHANNEL_PLAYLISTS = channelPlaylistsJson as unknown as YtPlaylistInfo
const SEARCH = searchJson as unknown as YtPlaylistInfo

const entry = (o: Partial<YtFlatEntry> = {}): YtFlatEntry => ({ id: 'abcdefghijk', title: '标题', ...o })
const PL_TARGET: YtTarget = { type: 'playlist', id: PLAYLIST.id }

describe('thumbOf', () => {
  it('取面积最大的，没有 url 的不要，缺宽高按 0', () => {
    expect(
      thumbOf([
        { url: 'small', width: 100, height: 100 },
        { url: '', width: 9999, height: 9999 },
        { url: 'nosize' },
        { url: 'big', width: 200, height: 200 }
      ])
    ).toBe('big')
    expect(thumbOf([{ url: 'a' }, { url: 'b', width: 10 }])).toBe('a')
  })

  it('没有缩略图时按视频 id 拼固定地址，也没有 id 时为空', () => {
    expect(thumbOf([], 'dQw4w9WgXcQ')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
    expect(thumbOf(null, 'x')).toBe('https://i.ytimg.com/vi/x/hqdefault.jpg')
    expect(thumbOf(undefined)).toBe('')
  })
})

describe('pubdateOf', () => {
  it('依次用 timestamp、release_timestamp、upload_date（按 UTC）', () => {
    expect(pubdateOf({ timestamp: 1, release_timestamp: 2, upload_date: '20240101' })).toBe(1)
    expect(pubdateOf({ timestamp: null, release_timestamp: 2, upload_date: '20240101' })).toBe(2)
    expect(pubdateOf({ upload_date: '20240101' })).toBe(1704067200)
    expect(pubdateOf({ upload_date: '2024-01-01' })).toBeUndefined()
    expect(pubdateOf({ upload_date: null })).toBeUndefined()
    expect(pubdateOf({})).toBeUndefined()
  })
})

describe('videoToItem', () => {
  it('真实样本：key、封面、作者、时间、时长', () => {
    expect(videoToItem(VIDEO, 1)).toEqual({
      key: 'yt:dQw4w9WgXcQ',
      kind: 'youtube',
      title: VIDEO.title,
      index: 1,
      cid: 0,
      ytId: 'dQw4w9WgXcQ',
      cover: 'https://i.ytimg.com/vi_webp/dQw4w9WgXcQ/maxresdefault.webp',
      duration: 213,
      pubdate: 1256453853,
      desc: VIDEO.description,
      owner: 'Rick Astley',
      channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw'
    })
  })

  it('缺字段时：作者退回 uploader，封面退回 thumbnail，其余为空', () => {
    const item = videoToItem({ id: '', title: 'T', uploader: 'U', thumbnail: 'thumb.jpg', duration: null, description: null, channel_id: null }, 2)
    expect(item).toMatchObject({ key: 'yt:', cover: 'thumb.jpg', owner: 'U', index: 2 })
    expect(item.duration).toBeUndefined()
    expect(item.desc).toBeUndefined()
    expect(item.channelId).toBeUndefined()
    const bare = videoToItem({ id: '', title: 'T', channel: '' }, 1)
    expect(bare.cover).toBeUndefined()
    expect(bare.owner).toBeUndefined()
  })
})

describe('可用性标记', () => {
  it.each<[Partial<YtFlatEntry>, object]>([
    [{ live_status: 'is_upcoming' }, { unavailable: '还没开始的直播或首映' }],
    [{ live_status: 'is_live' }, { unavailable: '正在直播，结束后才能下载' }],
    [{ title: '[Private video]' }, { unavailable: '私享或已删除的视频' }],
    [{ title: '[Deleted video]' }, { unavailable: '私享或已删除的视频' }],
    [{ availability: 'premium_only' }, { unavailable: 'YouTube Premium 专享，暂不支持' }],
    [{ availability: 'subscriber_only' }, { needVip: true, badge: '会员' }],
    [{ availability: 'needs_auth' }, { badge: '需登录' }],
    [{ live_status: 'was_live' }, { badge: '直播回放' }],
    [{ live_status: 'post_live' }, { badge: '直播回放' }]
  ])('%o', (o, want) => {
    expect(entryToItem(entry(o), 1)).toMatchObject(want)
    expect(videoToItem({ id: 'x', title: 'T', ...o } as YtVideoInfo, 1)).toMatchObject(want)
  })

  it('正常的视频不加标记', () => {
    const item = entryToItem(entry({ live_status: 'not_live', availability: 'public' }), 1)
    expect(item.unavailable).toBeUndefined()
    expect(item.needVip).toBeUndefined()
    expect(item.badge).toBeUndefined()
  })
})

describe('entryToItem', () => {
  it('视频项：作者优先自己的，没有时用列表的', () => {
    const e = PLAYLIST.entries![0]
    const item = entryToItem(e, 3, '列表作者')
    expect(item).toMatchObject({ key: `yt:${e.id}`, ytId: e.id, index: 3, owner: 'Peso Pluma', duration: 235, channelId: e.channel_id })
    expect(item.cover).toContain('i.ytimg.com')
    expect(item.lazy).toBeUndefined()
    expect(entryToItem(CHANNEL.entries![0], 1, 'Google').owner).toBe('Google')
  })

  it('视频项缺字段时：标题用 id，封面用固定地址', () => {
    const item = entryToItem({ id: 'abcdefghijk', title: null, duration: null, description: null, channel_id: null }, 1)
    expect(item).toMatchObject({ title: 'abcdefghijk', cover: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg' })
    expect(item.duration).toBeUndefined()
    expect(item.desc).toBeUndefined()
    expect(item.owner).toBeUndefined()
    expect(item.channelId).toBeUndefined()
    expect(entryToItem(entry({ description: '简介' }), 1).desc).toBe('简介')
  })

  it('播放列表项（ie_key 为 YoutubeTab）：ytpl: 前缀、展开时再解析、作者用频道名', () => {
    const e = CHANNEL_PLAYLISTS.entries![0]
    expect(entryToItem(e, 1, 'Google')).toEqual({
      key: `${YT_PLAYLIST_KEY}PLAeFjVYtuU34`,
      kind: 'youtube',
      title: 'Project Suncatcher',
      index: 1,
      cid: 0,
      cover: expect.stringContaining('i.ytimg.com'),
      owner: 'Google',
      channelId: 'UCK8sQmJBp8GCxrOtXWBpyEA',
      lazy: true,
      pages: undefined,
      badge: '播放列表'
    })
  })

  it('url 带 list= 的也算播放列表；缺字段时标题用 id、没有封面', () => {
    const item = entryToItem({ id: 'PLx', ie_key: 'Youtube', url: 'https://www.youtube.com/watch?v=abc&list=PLx', title: null, playlist_count: 12 }, 1)
    expect(item).toMatchObject({ key: 'ytpl:PLx', title: 'PLx', lazy: true, pages: 12 })
    expect(item.cover).toBeUndefined()
    expect(item.owner).toBeUndefined()
    expect(item.channelId).toBeUndefined()
    expect(item.ytId).toBeUndefined()
    expect(entryToItem({ id: 'PLy', url: 'https://www.youtube.com/playlist?list=PLy' }, 1).key).toBe('ytpl:PLy')
  })
})

describe('videoResult', () => {
  it('单个视频：一组一项并默认选中', () => {
    const r = videoResult(VIDEO)
    expect(r).toMatchObject({
      kind: 'youtube',
      title: VIDEO.title,
      cover: 'https://i.ytimg.com/vi_webp/dQw4w9WgXcQ/maxresdefault.webp',
      owner: 'Rick Astley',
      meta: { owner: 'Rick Astley', pubdate: 1256453853, genres: ['Music'], url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      defaultSelected: ['yt:dQw4w9WgXcQ']
    })
    expect(r.groups).toEqual([{ id: 'video', title: '视频', items: [videoToItem(VIDEO, 1)] }])
    expect(videoResult(SMALL).owner).toBe('jawed')
  })

  it('缺链接、分类、封面时用默认值', () => {
    const r = videoResult({ id: '', title: 'T', description: null, categories: null })
    expect(r.cover).toBe('')
    expect(r.meta).toEqual({ desc: undefined, owner: undefined, pubdate: undefined, genres: undefined, url: 'https://www.youtube.com/watch?v=' })
  })
})

describe('listResult', () => {
  const URL_ = 'https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI'

  it('播放列表第一页：全选可用项，知道总数时分页', () => {
    const r = listResult(PLAYLIST, PL_TARGET, URL_)
    expect(r).toMatchObject({
      kind: 'youtube',
      title: 'Popular Music Videos',
      owner: 'Music',
      meta: { desc: undefined, owner: 'Music', url: PLAYLIST.webpage_url },
      paging: { source: { type: 'yt', url: URL_ }, page: 1, total: 182, hasMore: true }
    })
    expect(r.cover).toBe(thumbOf(PLAYLIST.thumbnails))
    expect(r.groups[0].title).toBe('播放列表')
    expect(r.groups[0].items.map((i) => i.index)).toEqual([1, 2, 3, 4, 5])
    expect(r.defaultSelected).toEqual(PLAYLIST.entries!.map((e) => `yt:${e.id}`))
  })

  it('从播放列表里某个视频点进来时只选它；不在第一页时全选', () => {
    const id = PLAYLIST.entries![2].id
    expect(listResult(PLAYLIST, { ...PL_TARGET, video: id } as YtTarget, URL_).defaultSelected).toEqual([`yt:${id}`])
    expect(listResult(PLAYLIST, { ...PL_TARGET, video: 'zzzzzzzzzzz' } as YtTarget, URL_).defaultSelected).toHaveLength(5)
  })

  it('不可用的项不默认选中', () => {
    const pl: YtPlaylistInfo = { id: 'p', entries: [entry({ id: 'a' }), entry({ id: 'b', title: '[Private video]' })] }
    expect(listResult(pl, PL_TARGET, 'u').defaultSelected).toEqual(['yt:a'])
  })

  it('频道：不知道总数且不满一页时不分页，条目作者退回频道名', () => {
    const r = listResult(CHANNEL, { type: 'channel', url: 'https://www.youtube.com/@Google/videos', tab: 'videos' }, 'u')
    expect(r.title).toBe('Google - Videos')
    expect(r.groups[0].title).toBe('频道视频')
    expect(r.paging).toBeUndefined()
    expect(r.meta?.desc).toContain('Here to help')
    expect(r.groups[0].items.every((i) => i.owner === 'Google')).toBe(true)
  })

  it('频道播放列表页：条目是播放列表', () => {
    const r = listResult(CHANNEL_PLAYLISTS, { type: 'channel', url: 'u', tab: 'playlists' }, 'u')
    expect(r.groups[0].items.every((i) => i.key.startsWith(YT_PLAYLIST_KEY) && i.lazy && i.owner === 'Google')).toBe(true)
  })

  it('不知道总数但满一页时还有下一页', () => {
    const pl: YtPlaylistInfo = { id: 'p', entries: Array.from({ length: YT_PAGE }, (_, i) => entry({ id: `v${i}` })) }
    expect(listResult(pl, { type: 'feed', feed: 'watchlater' }, 'u')).toMatchObject({
      groups: [{ title: '我的列表' }],
      paging: { page: 1, total: 0, hasMore: true }
    })
  })

  it('知道总数且只有一页时也带分页信息（显示总数）；没有缩略图时用第一项的封面', () => {
    const r = listResult(SEARCH, { type: 'video', id: 'x' }, 'u')
    expect(r.paging).toEqual({ source: { type: 'yt', url: 'u' }, page: 1, total: 3, hasMore: false })
    expect(r.cover).toBe(entryToItem(SEARCH.entries![0], 1).cover)
    expect(r.groups[0].title).toBe('视频')
  })

  it('什么都没有时：标题退回作者再退回链接，封面为空，链接用传入的', () => {
    const r = listResult({ id: 'p', title: '', uploader: 'U' }, PL_TARGET, 'u')
    expect([r.title, r.owner, r.cover, r.meta?.url]).toEqual(['U', 'U', '', 'u'])
    expect(r.groups[0].items).toEqual([])
    expect(r.defaultSelected).toEqual([])
    expect(listResult({ id: 'p' }, PL_TARGET, 'u').title).toBe('u')
    // 只有播放列表项且没有封面
    expect(listResult({ id: 'p', entries: [{ id: 'PLx', ie_key: 'YoutubeTab' }] }, PL_TARGET, 'u').cover).toBe('')
  })
})

describe('pageResult / pageRange / hasMoreAfter', () => {
  it('第 n 页的序号接着前几页', () => {
    const r = pageResult(PLAYLIST, 2)
    expect(r.items.map((i) => i.index)).toEqual([51, 52, 53, 54, 55])
    expect(r).toMatchObject({ page: 2, total: 182, hasMore: true })
    expect(r.items[0].owner).toBe('Peso Pluma')
    expect(pageResult(PLAYLIST, 4).hasMore).toBe(false)
    expect(pageResult(CHANNEL, 2).items[0].owner).toBe('Google')
  })

  it('没有条目、没有总数时', () => {
    expect(pageResult({ id: 'p' }, 3)).toEqual({ items: [], page: 3, total: 0, hasMore: false })
  })

  it('--playlist-items 区间', () => {
    expect(pageRange(1)).toBe('1:50')
    expect(pageRange(3)).toBe('101:150')
  })

  it('知道总数时按总数，否则看这页满没满', () => {
    expect(hasMoreAfter(101, 2, 50)).toBe(true)
    expect(hasMoreAfter(100, 2, 50)).toBe(false)
    expect(hasMoreAfter(null, 1, 50)).toBe(true)
    expect(hasMoreAfter(undefined, 1, 49)).toBe(false)
    expect(hasMoreAfter(0, 1, 50)).toBe(true)
  })
})
