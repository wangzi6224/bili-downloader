import { describe, expect, it } from 'vitest'
import { parseDanmakuXml, toAss } from './danmaku'
import { toSrt } from './subtitle'

const XML = `<?xml version="1.0" encoding="UTF-8"?><i><chatserver>chat.bilibili.com</chatserver>
<d p="1.5,1,25,16777215,1700000000,0,abc,1,10">第一条</d>
<d p="0.5,5,25,16711680,1700000000,0,abc,2,10">顶部 &amp; 红色</d>
<d p="2,4,18,65280,1700000000,0,abc,3,10">底部小字</d>
<d p="3,7,25,16777215,1700000000,0,abc,4,10">[高级弹幕]</d>
</i>`

describe('danmaku', () => {
  it('parses xml, drops advanced danmaku and sorts by time', () => {
    const list = parseDanmakuXml(XML)
    expect(list.map((d) => d.text)).toEqual(['顶部 & 红色', '第一条', '底部小字'])
    expect(list[0]).toMatchObject({ time: 0.5, mode: 5, color: 0xff0000 })
  })

  it('converts to ass', () => {
    const ass = toAss(parseDanmakuXml(XML), { fontSize: 25, opacity: 0.8, duration: 8 })
    expect(ass).toMatchSnapshot()
  })
})

describe('subtitle', () => {
  it('converts to srt', () => {
    expect(
      toSrt([
        { from: 0.5, to: 2.25, content: '你好' },
        { from: 3661.001, to: 3662, content: 'World ' }
      ])
    ).toBe('1\n00:00:00,500 --> 00:00:02,250\n你好\n\n2\n01:01:01,001 --> 01:01:02,000\nWorld\n')
  })
})
