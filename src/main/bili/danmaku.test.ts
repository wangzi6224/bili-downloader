import { deflateRawSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchDanmakuXml, parseDanmakuXml, toAss, type Danmaku } from './danmaku'
import { BASE_HEADERS } from './http'
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

describe('parseDanmakuXml', () => {
  it('解码各种实体，&amp;lt; 只解一层', () => {
    const [d] = parseDanmakuXml('<d p="0,1,25,16777215">&lt;b&gt; &quot;q&quot; &apos;s&apos; &#65;&#128512; &amp;lt; &amp;#65;</d>')
    expect(d.text).toBe(`<b> "q" 's' A😀 &lt; &#65;`)
  })

  it('保留逆向弹幕（6），丢掉代码弹幕（8）', () => {
    const list = parseDanmakuXml('<d p="1,6,25,0">逆向</d><d p="2,8,25,0">代码</d>')
    expect(list.map((d) => d.mode)).toEqual([6])
  })
})

describe('toAss', () => {
  const dm = (time: number, text: string, extra: Partial<Danmaku> = {}): Danmaku => ({ time, mode: 1, size: 25, color: 0xffffff, text, ...extra })
  const events = (ass: string) => ass.split('\n').filter((l) => l.startsWith('Dialogue:'))
  const ys = (ass: string) => events(ass).map((l) => Number(/\\(?:pos\(960|move\(1920),(\d+)/.exec(l)?.[1]))
  // 字号 200 时每行 406 像素，1080 高只放得下 2 行
  const twoRows = { fontSize: 200, opacity: 1, duration: 8 }

  it('滚动弹幕的行都被占满时放到最早空出来的那一行', () => {
    const ass = toAss([dm(0, '很长很长的一条'), dm(0.1, 'a'), dm(0.2, 'b'), dm(30, 'c')], twoRows)
    // 第三条时两行都没空：第二行的短弹幕先离开，所以放到第二行；30 秒后第一行已空
    expect(ys(ass)).toEqual([0, 406, 406, 0])
  })

  it('顶部和底部弹幕各自分配行，占满时复用最早结束的一行', () => {
    const top = toAss([dm(0, '一', { mode: 5 }), dm(1, '二', { mode: 5 }), dm(2, '三', { mode: 5 }), dm(4, '四', { mode: 5 })], twoRows)
    expect(ys(top)).toEqual([0, 406, 0, 406])
    expect(events(top)[0]).toContain('{\\an8\\pos(960,0)}')
    const bottom = toAss([dm(0, '一', { mode: 4 }), dm(1, '二', { mode: 4 }), dm(2, '三', { mode: 4 })], twoRows)
    expect(ys(bottom)).toEqual([1080, 674, 1080])
    expect(events(bottom)[0]).toContain('{\\an2\\pos(960,1080)}')
  })

  it('滚动弹幕从右边进入，移动到自身宽度之外', () => {
    // 半角字符按 0.55 个字宽估算：2 × 50 × 0.55 = 55
    const [line] = events(toAss([dm(0, 'ab')], { fontSize: 25, opacity: 1, duration: 8 }))
    expect(line).toBe('Dialogue: 1,0:00:00.00,0:00:08.00,Danmaku,,0,0,0,,{\\an7\\move(1920,0,-55,0)}ab')
  })

  it.each([
    [1, '00'],
    [0.8, '33'],
    [0.5, '80'],
    [0, 'FF']
  ])('不透明度 %s 对应 alpha %s', (opacity, alpha) => {
    const ass = toAss([], { fontSize: 25, opacity, duration: 8 })
    expect(ass).toContain(`Style: Danmaku,PingFang SC,50,&H${alpha}FFFFFF,&H${alpha}FFFFFF,&H${alpha}000000,&H${alpha}000000,`)
  })

  it('超过 1 小时的时间带小时位', () => {
    const [scroll, fixed] = events(toAss([dm(3725.5, 'a'), dm(3725.56, 'b', { mode: 5 })], { fontSize: 25, opacity: 1, duration: 8 }))
    expect(scroll).toMatch(/^Dialogue: 1,1:02:05\.50,1:02:13\.50,/)
    expect(fixed).toMatch(/^Dialogue: 2,1:02:05\.56,1:02:09\.56,/)
  })

  it('字号按 25 为基准缩放，和基准相同时不写 \\fs', () => {
    const [big, normal, small] = events(toAss([dm(0, 'a', { size: 36 }), dm(0, 'b'), dm(0, 'c', { size: 18 })], { fontSize: 25, opacity: 1, duration: 8 }))
    expect(big).toContain('\\fs72}')
    expect(normal).not.toContain('\\fs')
    expect(small).toContain('\\fs36}')
  })

  it('颜色转成 ASS 的 BGR 顺序，白色不写颜色', () => {
    const lines = events(
      toAss([dm(0, 'a', { color: 0x123456 }), dm(1, 'b', { color: 0xffffff }), dm(2, 'c', { color: 0 })], { fontSize: 25, opacity: 1, duration: 8 })
    )
    expect(lines[0]).toContain('\\c&H563412&}')
    expect(lines[1]).not.toContain('\\c&H')
    expect(lines[2]).toContain('\\c&H000000&}')
  })

  it('转义反斜杠、花括号和换行', () => {
    const [line] = events(toAss([dm(0, 'a\\b{c}\nd\r\ne')], { fontSize: 25, opacity: 1, duration: 8 }))
    expect(line.endsWith('}a＼b｛c｝\\Nd\\Ne')).toBe(true)
  })
})

describe('fetchDanmakuXml', () => {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
  const xml = '<?xml version="1.0" encoding="UTF-8"?><i><d p="1,1,25,16777215">你好</d></i>'

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('解压未声明的 raw deflate', async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array(deflateRawSync(Buffer.from(xml)))))
    expect(await fetchDanmakuXml(123)).toBe(xml)
    expect(fetchMock).toHaveBeenCalledWith('https://api.bilibili.com/x/v1/dm/list.so?oid=123', {
      headers: { ...BASE_HEADERS, 'Accept-Encoding': 'identity' }
    })
  })

  it('以 < 开头的明文直接返回', async () => {
    fetchMock.mockResolvedValue(new Response(xml))
    expect(await fetchDanmakuXml(1)).toBe(xml)
  })

  it('HTTP 错误时报错', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 404 }))
    await expect(fetchDanmakuXml(1)).rejects.toThrow('弹幕下载失败（HTTP 404）')
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
