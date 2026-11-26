import { describe, expect, it } from 'vitest'
import { dyTargetUrl, dyVideoUrl, extractDyInputs, extractDyUrls, isDyHost, isDyText, needsDyLogin, parseDyInput, type DyTarget } from './douyinUrl'
import { parseInput } from './parseUrl'

const ID = '7123456789012345678'
const SEC = 'MS4wLjABAAAAabcdefghijklmnopqrstuvwxyz0123456789_-ABCDE'
const video: DyTarget = { type: 'video', id: ID }

describe('parseDyInput', () => {
  it.each([
    `https://www.douyin.com/video/${ID}`,
    `www.douyin.com/note/${ID}?previous_page=app_code_link`,
    `https://www.douyin.com/slides/${ID}`,
    `https://www.iesdouyin.com/share/video/${ID}/?region=CN&mid=1`,
    `https://m.douyin.com/share/note/${ID}`,
    `https://www.douyin.com/user/${SEC}?modal_id=${ID}`,
    `https://www.douyin.com/jingxuan?modal_id=${ID}`,
    `https://www.douyin.com/user/self?showTab=like&vid=${ID}`,
    `https://www.douyin.com/discover?modal_id=${ID}`
  ])('作品链接 %s', (url) => {
    expect(parseDyInput(url)).toEqual(video)
  })

  it('分享口令里夹着中文和表情时只取链接', () => {
    const text = `7.64 复制打开抖音，看看【某某的作品】好看 # 风景 https://v.douyin.com/iAbC_d-1/ 05/11 Mfb:/ w@F.hb`
    expect(parseDyInput(text)).toEqual({ type: 'short', url: 'https://v.douyin.com/iAbC_d-1/' })
    expect(parseDyInput(`看看https://www.douyin.com/video/${ID}，很好看😀`)).toEqual(video)
    expect(parseDyInput('v.douyin.com/abc123')).toEqual({ type: 'short', url: 'https://v.douyin.com/abc123/' })
  })

  it('博主主页', () => {
    const user = { type: 'user', secUid: SEC }
    expect(parseDyInput(`https://www.douyin.com/user/${SEC}`)).toEqual(user)
    expect(parseDyInput(`https://www.iesdouyin.com/share/user/12345678901234567?sec_uid=${SEC}`)).toEqual(user)
    expect(parseDyInput(`https://www.iesdouyin.com/share/user/?sec_uid=${SEC}`)).toEqual(user)
    expect(parseDyInput('https://www.douyin.com/user/short')).toBeNull()
  })

  it('自己的列表和收藏夹', () => {
    expect(parseDyInput('https://www.douyin.com/user/self')).toEqual({ type: 'self', tab: 'post' })
    expect(parseDyInput('https://www.douyin.com/user/self?showTab=like')).toEqual({ type: 'self', tab: 'likes' })
    expect(parseDyInput('https://www.douyin.com/user/self?showTab=watch_later')).toEqual({ type: 'self', tab: 'watchlater' })
    expect(parseDyInput('https://www.douyin.com/user/self?showTab=record')).toEqual({ type: 'self', tab: 'history' })
    expect(parseDyInput('https://www.douyin.com/user/self?showTab=unknown')).toEqual({ type: 'self', tab: 'post' })
    expect(parseDyInput('https://www.douyin.com/user/self?showTab=favorite_collection&collect_id=123')).toEqual({ type: 'self', tab: 'collection', folder: '123' })
    expect(parseDyInput('https://www.douyin.com/user/self?showTab=favorite_collection&collect_id=abc')).toEqual({ type: 'self', tab: 'collection' })
  })

  it('合集和短剧', () => {
    const mix = { type: 'mix', id: ID }
    for (const url of [
      `https://www.douyin.com/collection/${ID}`,
      `https://www.douyin.com/mix/${ID}`,
      `https://www.iesdouyin.com/share/mix/detail/${ID}/`,
      `https://www.iesdouyin.com/share/playlet/detail/${ID}`,
      `https://www.douyin.com/series/${ID}`,
      `https://www.douyin.com/discover?mix_id=${ID}`
    ])
      expect(parseDyInput(url)).toEqual(mix)
  })

  it('认得但不支持的页面', () => {
    const what = (url: string) => (parseDyInput(url) as { what?: string } | null)?.what
    expect(what('https://live.douyin.com/123456')).toBe('live')
    expect(what('https://webcast.amemv.com/douyin/webcast/reflow/123')).toBe('live')
    expect(what('https://www.douyin.com/follow/live/123')).toBe('live')
    expect(what('https://www.iesdouyin.com/share/live/123')).toBe('live')
    expect(what('https://www.douyin.com/vsdetail/123')).toBe('live')
    expect(what('https://www.douyin.com/search/%E9%A3%8E')).toBe('search')
    expect(what('https://www.douyin.com/jingxuan/search/a')).toBe('search')
    expect(what(`https://www.douyin.com/music/${ID}`)).toBe('music')
    expect(what(`https://www.douyin.com/hashtag/${ID}`)).toBe('topic')
    expect(what(`https://www.douyin.com/challenge/${ID}`)).toBe('topic')
  })

  it('认不出的输入', () => {
    for (const s of [
      '',
      ID,
      'https://www.douyin.com/',
      'https://v.douyin.com/',
      'https://www.douyin.com/video/abc',
      'https://www.douyin.com/collection/abc',
      'https://douyin.com.evil.com/video/7123456789012345678',
      'https://notdouyin.com/video/7123456789012345678',
      'https://www.douyin.community/video/7123456789012345678',
      'https://www.bilibili.com/video/BV1xx411c7mD',
      'name@douyin.com'
    ])
      expect(parseDyInput(s)).toBeNull()
  })

  it('跳过认不出的链接，取下一个认得的', () => {
    expect(parseDyInput(`https://www.douyin.com/ 和 https://www.douyin.com/video/${ID}`)).toEqual(video)
  })

  it('写错的端口号不抛错', () => {
    expect(parseDyInput('https://www.douyin.com:abc/video/1')).toBeNull()
  })
})

describe('链接工具', () => {
  it('规范链接可以原样再识别', () => {
    const targets = [
      video,
      { type: 'user', secUid: SEC },
      { type: 'self', tab: 'likes' },
      { type: 'self', tab: 'collection', folder: '9' },
      { type: 'mix', id: ID },
      { type: 'short', url: 'https://v.douyin.com/abc/' }
    ] satisfies DyTarget[]
    for (const t of targets) expect(parseDyInput(dyTargetUrl(t))).toEqual(t)
    expect(dyTargetUrl({ type: 'unsupported', what: 'live' })).toBe('')
    expect(dyVideoUrl(ID)).toBe(`https://www.douyin.com/video/${ID}`)
  })

  it('只有自己的列表一定要登录', () => {
    expect(needsDyLogin({ type: 'self', tab: 'likes' })).toBe(true)
    expect(needsDyLogin({ type: 'user', secUid: SEC })).toBe(false)
  })

  it('从多行文字里提取链接，去重并跳过不支持的', () => {
    const a = `https://www.douyin.com/video/${ID}`
    const text = `1 ${a}。\n2 https://www.douyin.com/note/${ID}\n3 https://live.douyin.com/1\n4 https://v.douyin.com/xyz/ \n5 https://www.douyin.com/`
    expect(extractDyInputs(text)).toEqual([a, 'https://v.douyin.com/xyz/'])
    expect(extractDyUrls('(https://www.douyin.com/video/1).')).toEqual(['https://www.douyin.com/video/1'])
    expect(extractDyUrls('没有链接')).toEqual([])
  })

  it('认域名', () => {
    expect([isDyHost('www.douyin.com'), isDyHost('v.douyin.com'), isDyHost('iesdouyin.com'), isDyHost('douyin.com.cn')]).toEqual([true, true, true, false])
    expect([isDyText('看 v.douyin.com/a 吧'), isDyText('BV1xx411c7mD')]).toEqual([true, false])
  })
})

describe('B站解析器让开抖音链接', () => {
  it('主页的长串和短链码不会被认成 B站视频', () => {
    expect(parseInput('https://www.douyin.com/user/MS4wLjABAAAAxxBV1xx411c7mDxxxxxxxx')).toBeNull()
    expect(parseInput('https://v.douyin.com/av12345/')).toBeNull()
    expect(parseInput('复制这条 https://v.douyin.com/abc/ av170001')).toBeNull()
    expect(parseInput('BV1xx411c7mD')).not.toBeNull()
  })
})
