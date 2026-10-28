import { describe, expect, it } from 'vitest'
import { parseInput } from './parseUrl'

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
    ]
  ])('%s', (input, expected) => {
    expect(parseInput(input)).toEqual(expected)
  })

  it.each(['', 'hello world', 'https://www.youtube.com/watch?v=abc', 'step123'])('rejects %s', (input) => {
    expect(parseInput(input)).toBeNull()
  })
})
