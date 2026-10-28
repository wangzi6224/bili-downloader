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

describe('nfo 的回退和可选字段', () => {
  const bare: MediaItem = { key: 'pgc:1', kind: 'pgc', title: '电影 "终"', index: 2, cid: 99 }
  // 年中的时间戳，任何时区下年份都一样
  const JUNE = 1718409600

  it('没有可选信息时 movie 只写标题和 uniqueid，引号会转义', () => {
    expect(movieNfo(bare)).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<movie>',
        '  <title>电影 &quot;终&quot;</title>',
        '  <uniqueid type="bilibili" default="true">99</uniqueid>',
        '</movie>',
        ''
      ].join('\n')
    )
  })

  it('uniqueid 依次用 bvid、ep 号、cid', () => {
    expect(movieNfo({ ...bare, epId: 7 })).toContain('>ep7</uniqueid>')
    expect(movieNfo({ ...bare, epId: 7, bvid: 'BV1' })).toContain('>BV1</uniqueid>')
  })

  it('合集名和标题相同或没有合集名时不写 originaltitle', () => {
    expect(movieNfo(item, {}, item.title)).not.toContain('originaltitle')
    expect(movieNfo(item, {})).not.toContain('originaltitle')
  })

  it('简介和发布时间回退到整体元数据，UP 主写成 studio 和 director', () => {
    const x = movieNfo(bare, { desc: '整体简介', pubdate: JUNE, owner: 'UP', url: 'https://b23.tv/x' })
    expect(x).toContain('<plot>整体简介</plot>')
    expect(x).toContain('<premiered>2024-06-15</premiered>')
    expect(x).toContain('<year>2024</year>')
    expect(x).toContain('<studio>UP</studio>')
    expect(x).toContain('<director>UP</director>')
    expect(x).toContain('<website>https://b23.tv/x</website>')
  })

  it('tvshow 的全部字段', () => {
    const x = tvshowNfo('番剧', { desc: '剧情', pubdate: JUNE, owner: '出品方', genres: ['日常', '搞笑'], url: 'https://b23.tv/ss' })
    expect(x).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<tvshow>',
        '  <title>番剧</title>',
        '  <plot>剧情</plot>',
        '  <premiered>2024-06-15</premiered>',
        '  <studio>出品方</studio>',
        '  <genre>日常</genre>',
        '  <genre>搞笑</genre>',
        '  <website>https://b23.tv/ss</website>',
        '</tvshow>',
        ''
      ].join('\n')
    )
    expect(tvshowNfo('番剧')).toBe('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<tvshow>\n  <title>番剧</title>\n</tvshow>\n')
  })

  it('episode 的全部字段，没有 ep 号时用 cid', () => {
    const x = episodeNfo({ ...bare, desc: '本集简介', pubdate: JUNE, duration: 1440 }, '番剧')
    expect(x).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<episodedetails>',
        '  <title>电影 &quot;终&quot;</title>',
        '  <showtitle>番剧</showtitle>',
        '  <season>1</season>',
        '  <episode>2</episode>',
        '  <plot>本集简介</plot>',
        '  <aired>2024-06-15</aired>',
        '  <runtime>24</runtime>',
        '  <uniqueid type="bilibili" default="true">99</uniqueid>',
        '</episodedetails>',
        ''
      ].join('\n')
    )
    expect(episodeNfo(bare, '番剧')).not.toMatch(/<plot>|<aired>|<runtime>/)
  })
})
