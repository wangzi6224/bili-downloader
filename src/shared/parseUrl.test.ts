import { describe, expect, it } from 'vitest'
import { extractInputs, parseInput } from './parseUrl'

describe('parseInput', () => {
  it.each([
    ['https://www.bilibili.com/video/BV1GJ411x7h7/?spm_id_from=333.1007', { type: 'ugc', bvid: 'BV1GJ411x7h7' }],
    ['https://www.bilibili.com/video/BV1GJ411x7h7?p=3', { type: 'ugc', bvid: 'BV1GJ411x7h7', page: 3 }],
    ['https://m.bilibili.com/video/BV1GJ411x7h7', { type: 'ugc', bvid: 'BV1GJ411x7h7' }],
    ['BV1GJ411x7h7', { type: 'ugc', bvid: 'BV1GJ411x7h7' }],
    ['bv1GJ411x7h7', { type: 'ugc', bvid: 'BV1GJ411x7h7' }],
    ['https://www.bilibili.com/video/av170001', { type: 'ugc', aid: 170001 }],
    ['av170001', { type: 'ugc', aid: 170001 }],
    ['https://www.bilibili.com/list/ml123?bvid=BV1GJ411x7h7&oid=1', { type: 'ugc', bvid: 'BV1GJ411x7h7' }],
    ['https://www.bilibili.com/bangumi/play/ep508404?from_spmid=666.25', { type: 'pgc', epId: 508404 }],
    ['https://www.bilibili.com/bangumi/play/ss41410', { type: 'pgc', seasonId: 41410 }],
    ['https://www.bilibili.com/bangumi/media/md28339956', { type: 'pgc', mediaId: 28339956 }],
    ['ep508404', { type: 'pgc', epId: 508404 }],
    ['ss41410', { type: 'pgc', seasonId: 41410 }],
    ['https://b23.tv/AbCdEfG', { type: 'short', url: 'https://b23.tv/AbCdEfG' }],
    ['b23.tv/AbCdEfG', { type: 'short', url: 'https://b23.tv/AbCdEfG' }],
    [
      '【某个视频标题-哔哩哔哩】 https://b23.tv/AbCdEfG',
      { type: 'short', url: 'https://b23.tv/AbCdEfG' }
    ],
    [
      '【标题】 https://www.bilibili.com/video/BV1GJ411x7h7/?share_source=copy_web',
      { type: 'ugc', bvid: 'BV1GJ411x7h7' }
    ],
    ['https://www.bilibili.com/medialist/detail/ml1052622027', { type: 'fav', mediaId: 1052622027 }],
    ['https://www.bilibili.com/list/ml1052622027', { type: 'fav', mediaId: 1052622027 }],
    ['https://space.bilibili.com/486906719/favlist?fid=1052622027&ftype=create', { type: 'fav', mediaId: 1052622027 }],
    ['https://space.bilibili.com/486906719', { type: 'space', mid: 486906719 }],
    ['https://space.bilibili.com/486906719/video?keyword=MV', { type: 'space', mid: 486906719, keyword: 'MV' }],
    ['https://space.bilibili.com/486906719/upload/video', { type: 'space', mid: 486906719 }],
    [
      'https://space.bilibili.com/486906719/channel/collectiondetail?sid=1234',
      { type: 'spaceSeason', mid: 486906719, seasonId: 1234 }
    ],
    [
      'https://space.bilibili.com/486906719/channel/seriesdetail?sid=99',
      { type: 'spaceSeries', mid: 486906719, seriesId: 99 }
    ],
    ['https://space.bilibili.com/486906719/lists/1234?type=season', { type: 'spaceSeason', mid: 486906719, seasonId: 1234 }],
    ['https://space.bilibili.com/486906719/lists/99?type=series', { type: 'spaceSeries', mid: 486906719, seriesId: 99 }],
    ['https://www.bilibili.com/watchlater/#/list', { type: 'watchlater' }],
    ['https://www.bilibili.com/list/watchlater?bvid=BV1GJ411x7h7', { type: 'watchlater' }],
    ['稍后再看', { type: 'watchlater' }],
    ['https://www.bilibili.com/cheese/play/ep9', { type: 'cheese', epId: 9 }],
    ['https://www.bilibili.com/cheese/play/ss1', { type: 'cheese', seasonId: 1 }],
    ['https://www.bilibili.com/audio/au13598', { type: 'audio', sid: 13598 }],
    ['au13598', { type: 'audio', sid: 13598 }],
    ['https://www.bilibili.com/audio/am10624', { type: 'audioMenu', amid: 10624 }]
  ])('%s', (input, expected) => {
    expect(parseInput(input)).toEqual(expected)
  })

  it.each(['', 'hello world', 'https://www.youtube.com/watch?v=abc', 'step123'])('rejects %s', (input) => {
    expect(parseInput(input)).toBeNull()
  })
})

describe('extractInputs', () => {
  it('collects every link from multi-line text', () => {
    expect(
      extractInputs('第一个 https://www.bilibili.com/video/BV1GJ411x7h7\nBV1xx411c7mD, ep508404\n无关文字\nhttps://www.bilibili.com/video/BV1GJ411x7h7')
    ).toEqual(['https://www.bilibili.com/video/BV1GJ411x7h7', 'BV1xx411c7mD', 'ep508404'])
  })
})
