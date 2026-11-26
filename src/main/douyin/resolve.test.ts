import { describe, expect, it } from 'vitest'
import { t } from '@shared/i18n'
import { awemeCover, awemeItem, awemeSeconds, awemeTitle, firstUrl, imageUrl, listResult, singleResult } from './resolve'
import type { DyAweme } from './types'

const ID = '7000000000000000001'
const url = (u: string) => ({ url_list: [u] })
const video = (over: Partial<DyAweme> = {}): DyAweme => ({
  aweme_id: ID,
  desc: '示例标题\n第二行',
  create_time: 1_700_000_000,
  author: { nickname: '示例博主', sec_uid: 'fake_sec_uid_abcdefghij_0001' },
  video: { duration: 12_400, play_addr: url('https://cdn.example.com/v.mp4'), cover: url('https://img.example.com/c.jpg') },
  ...over
})

describe('基础取值', () => {
  it('标题取描述的第一个非空行', () => {
    expect(awemeTitle({ aweme_id: ID, desc: '\n   \n  正文  \n其余' })).toBe('正文')
  })

  it('标题按字符截到 80 个，不切开表情', () => {
    expect(awemeTitle({ aweme_id: ID, desc: '😀'.repeat(90) })).toBe('😀'.repeat(80))
  })

  it('没有描述时用固定的兜底名', () => {
    expect(awemeTitle({ aweme_id: ID })).toBe(`抖音_${ID}`)
    expect(awemeTitle({ aweme_id: ID, desc: ' \n ' })).toBe(`抖音_${ID}`)
  })

  it('取第一个非空地址', () => {
    expect(firstUrl({ url_list: ['', 'b', 'c'] })).toBe('b')
    expect(firstUrl({})).toBeUndefined()
    expect(firstUrl()).toBeUndefined()
  })

  it('图片优先用 jpeg 地址，否则用第一个非空的', () => {
    expect(imageUrl({ url_list: ['a.webp', 'b.JPEG?x=1', 'c.jpg'] })).toBe('b.JPEG?x=1')
    expect(imageUrl({ url_list: ['', 'a.webp'] })).toBe('a.webp')
    expect(imageUrl({})).toBeUndefined()
  })

  it('封面：图文用第一张图，视频优先原始封面', () => {
    expect(awemeCover({ aweme_id: ID, images: [{ url_list: ['i.jpg'] }] })).toBe('i.jpg')
    expect(awemeCover({ aweme_id: ID, images: [], video: { origin_cover: url('o'), cover: url('c') } })).toBe('o')
    expect(awemeCover({ aweme_id: ID, video: { cover: url('c') } })).toBe('c')
    expect(awemeCover({ aweme_id: ID })).toBeUndefined()
  })

  it('时长从毫秒换成秒，优先用视频里的', () => {
    expect(awemeSeconds({ aweme_id: ID, duration: 9000, video: { duration: 12_600 } })).toBe(13)
    expect(awemeSeconds({ aweme_id: ID, duration: 9000 })).toBe(9)
    expect(awemeSeconds({ aweme_id: ID })).toBe(0)
  })
})

describe('awemeItem', () => {
  it('视频条目', () => {
    expect(awemeItem(video(), 3)).toEqual({
      key: `dy:${ID}`,
      kind: 'douyin',
      dyId: ID,
      cid: 0,
      title: '示例标题',
      index: 3,
      cover: 'https://img.example.com/c.jpg',
      duration: 12,
      pubdate: 1_700_000_000,
      desc: '示例标题\n第二行',
      owner: '示例博主',
      secUid: 'fake_sec_uid_abcdefghij_0001'
    })
  })

  it('图文条目带图片数和角标，没有时长', () => {
    const item = awemeItem(video({ images: [{ url_list: [] }, { url_list: ['b.jpg'] }], is_top: 1 }), 1)
    expect(item).toMatchObject({ images: 2, badge: t('dy.imagesBadge'), pinned: true })
    expect(item.duration).toBeUndefined()
    expect(item).not.toHaveProperty('unavailable')
  })

  it('没有时长和描述时对应字段留空', () => {
    const item = awemeItem({ aweme_id: ID, desc: '', video: { play_addr: url('x') } }, 1)
    expect(item.duration).toBeUndefined()
    expect(item.desc).toBeUndefined()
    expect(item.owner).toBeUndefined()
  })

  it('删除的作品标记为不可下载', () => {
    expect(awemeItem(video({ status: { is_delete: true } }), 1).unavailable).toBe(t('dy.errDeleted'))
  })

  it('只有画质列表里有地址也能下', () => {
    expect(awemeItem(video({ video: { bit_rate: [{}, { play_addr: url('x') }] } }), 1).unavailable).toBeUndefined()
  })

  it.each([
    ['没有视频', { video: undefined }],
    ['视频没有任何地址', { video: { bit_rate: [{ play_addr: { url_list: [''] } }], play_addr: {} } }],
    ['图文没有任何图片地址', { images: [{ url_list: [] }, {}] }]
  ])('%s时标记没有可下载内容', (_name, over) => {
    expect(awemeItem(video(over), 1).unavailable).toBe(t('dy.noStream'))
  })
})

describe('解析结果', () => {
  it('单个作品默认选中', () => {
    const r = singleResult(video())
    expect(r).toMatchObject({
      kind: 'douyin',
      title: '示例标题',
      cover: 'https://img.example.com/c.jpg',
      owner: '示例博主',
      meta: { owner: '示例博主', desc: '示例标题\n第二行', pubdate: 1_700_000_000, url: `https://www.douyin.com/video/${ID}` },
      defaultSelected: [`dy:${ID}`]
    })
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0].items).toHaveLength(1)
  })

  it('不可下载的单个作品不选中，没有封面时留空串', () => {
    const r = singleResult({ aweme_id: ID })
    expect(r.cover).toBe('')
    expect(r.defaultSelected).toEqual([])
  })

  it('列表按顺序编号，封面取第一个有封面的条目，不选不可下载的', () => {
    const r = listResult({
      title: '示例列表',
      url: 'https://www.douyin.com/collection/1',
      awemes: [{ aweme_id: '7000000000000000002' }, video()]
    })
    expect(r.cover).toBe('https://img.example.com/c.jpg')
    expect(r.groups[0].items.map((i) => i.index)).toEqual([1, 2])
    expect(r.defaultSelected).toEqual([`dy:${ID}`])
    expect(r).not.toHaveProperty('paging')
    expect(r).not.toHaveProperty('note')
  })

  it('列表带上指定的封面、分页和提示', () => {
    const paging = { source: { type: 'dy' as const, url: 'u', cursor: 'c' }, page: 1, total: 2, hasMore: true }
    const r = listResult({ title: 't', url: 'u', owner: 'o', cover: 'avatar', awemes: [], paging, note: '提示' })
    expect(r).toMatchObject({ cover: 'avatar', owner: 'o', meta: { owner: 'o', url: 'u' }, paging, note: '提示' })
    expect(listResult({ title: 't', url: 'u', awemes: [] }).cover).toBe('')
  })
})
