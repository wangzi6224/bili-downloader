import { describe, expect, it } from 'vitest'
import type { MediaItem } from '@shared/types'
import { episodeNfo, movieNfo, tvshowNfo } from './nfo'

const item: MediaItem = {
  key: 'ugc:BV1:1',
  kind: 'ugc',
  title: 'A & B <测试>',
  index: 3,
  cid: 1,
  bvid: 'BV1xx411c7mD',
  duration: 125,
  pubdate: 1704067200,
  desc: '简介\x01含控制字符'
}

describe('nfo', () => {
  it('builds an escaped movie nfo', () => {
    const x = movieNfo(item, { owner: 'UP', genres: ['知识'], url: 'https://b23.tv/x' }, '合集')
    expect(x).toContain('<title>A &amp; B &lt;测试&gt;</title>')
    expect(x).toContain('<originaltitle>合集</originaltitle>')
    expect(x).toContain('<plot>简介含控制字符</plot>')
    expect(x).toContain('<premiered>2024-01-01</premiered>')
    expect(x).toContain('<runtime>2</runtime>')
    expect(x).toContain('<genre>知识</genre>')
    expect(x).toContain('<uniqueid type="bilibili" default="true">BV1xx411c7mD</uniqueid>')
    expect(x.startsWith('<?xml')).toBe(true)
  })

  it('builds tvshow and episode nfo', () => {
    expect(tvshowNfo('番剧', { desc: '剧情' })).toContain('<tvshow>\n  <title>番剧</title>\n  <plot>剧情</plot>')
    const ep = episodeNfo({ ...item, kind: 'pgc', epId: 508404 }, '番剧')
    expect(ep).toContain('<showtitle>番剧</showtitle>')
    expect(ep).toContain('<episode>3</episode>')
    expect(ep).toContain('>ep508404</uniqueid>')
  })
})
