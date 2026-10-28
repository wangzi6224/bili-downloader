import { describe, expect, it } from 'vitest'
import { fmtDate, inline, parseMarkdown, type Block } from './markdown'

const text = (t: string) => ({ type: 'text', text: t }) as const

describe('inline', () => {
  it('纯文本是一个文本节点，空字符串没有节点', () => {
    expect(inline('普通文字')).toEqual([text('普通文字')])
    expect(inline('')).toEqual([])
  })

  it('粗体、代码和链接，前后的文字保留', () => {
    expect(inline('修复 **下载** 失败，运行 `npm i`，详见 [说明](https://example.com/a)。')).toEqual([
      text('修复 '),
      { type: 'strong', text: '下载' },
      text(' 失败，运行 '),
      { type: 'code', text: 'npm i' },
      text('，详见 '),
      { type: 'link', text: '说明', href: 'https://example.com/a' },
      text('。')
    ])
  })

  it('标记在开头和结尾时不产生空文本', () => {
    expect(inline('**新**`x`')).toEqual([
      { type: 'strong', text: '新' },
      { type: 'code', text: 'x' }
    ])
  })

  it('只认 https 链接，其它照原样保留', () => {
    expect(inline('[a](http://x.com) [b](javascript:alert(1))')).toEqual([text('[a](http://x.com) [b](javascript:alert(1))')])
  })

  it('没闭合的标记照原样保留', () => {
    expect(inline('**半个 `也是')).toEqual([text('**半个 `也是')])
  })
})

describe('parseMarkdown', () => {
  /** 把块转成便于比较的简写：内容只看拼起来的文字 */
  const flat = (blocks: Block[]): unknown[] =>
    blocks.map((b) => {
      const join = (nodes: { text: string }[]): string => nodes.map((n) => n.text).join('')
      if (b.type === 'list') return [b.ordered ? 'ol' : 'ul', ...b.items.map(join)]
      return [b.type === 'heading' ? 'h' : 'p', join(b.content)]
    })

  it('空文本没有块', () => {
    expect(parseMarkdown('')).toEqual([])
    expect(parseMarkdown('\n\n  \n')).toEqual([])
  })

  it('一到四级标题，标题内容也解析行内标记', () => {
    expect(parseMarkdown('## 新功能 `v1`')).toEqual([{ type: 'heading', content: [text('新功能 '), { type: 'code', text: 'v1' }] }])
    expect(flat(parseMarkdown('# 一\n#### 四\n##### 五'))).toEqual([['h', '一'], ['h', '四'], ['p', '##### 五']])
  })

  it('连续的行合成一个段落，空行分段', () => {
    expect(flat(parseMarkdown('第一行\n  第二行\n\n第二段'))).toEqual([
      ['p', '第一行 第二行'],
      ['p', '第二段']
    ])
  })

  it('无序列表支持 - * +，有序列表用数字加点', () => {
    expect(flat(parseMarkdown('- 一\n* 二\n+ 三'))).toEqual([['ul', '一', '二', '三']])
    expect(flat(parseMarkdown('1. 一\n2. 二'))).toEqual([['ol', '一', '二']])
  })

  it('有序和无序列表之间切换时拆成两个列表', () => {
    expect(flat(parseMarkdown('- a\n1. b\n2. c\n- d'))).toEqual([
      ['ul', 'a'],
      ['ol', 'b', 'c'],
      ['ul', 'd']
    ])
  })

  it('缩进两格以上的续行接在上一条后面', () => {
    expect(flat(parseMarkdown('- 第一条\n  接着写\n    再接着\n- 第二条'))).toEqual([['ul', '第一条 接着写 再接着', '第二条']])
  })

  it('列表后面不缩进的行结束列表，另起段落', () => {
    expect(flat(parseMarkdown('- 条目\n说明文字\n继续'))).toEqual([
      ['ul', '条目'],
      ['p', '说明文字 继续']
    ])
  })

  it('段落后面紧跟列表时先结束段落', () => {
    expect(flat(parseMarkdown('改动如下：\n- a\n- b'))).toEqual([
      ['p', '改动如下：'],
      ['ul', 'a', 'b']
    ])
  })

  it('标题打断段落和列表', () => {
    expect(flat(parseMarkdown('段落\n## 标题\n- a\n### 再一个\n文字'))).toEqual([
      ['p', '段落'],
      ['h', '标题'],
      ['ul', 'a'],
      ['h', '再一个'],
      ['p', '文字']
    ])
  })

  it('没有列表时缩进的行算普通段落', () => {
    expect(flat(parseMarkdown('    缩进的行'))).toEqual([['p', '缩进的行']])
  })

  it('列表条目里的行内标记', () => {
    expect(parseMarkdown('1. **重要** 修复')).toEqual([
      { type: 'list', ordered: true, items: [[{ type: 'strong', text: '重要' }, text(' 修复')]] }
    ])
  })
})

describe('fmtDate', () => {
  it('能解析的日期显示成中文格式', () => {
    expect(fmtDate('2026-01-05T12:00:00')).toBe('2026/1/5')
  })

  it('无效日期原样返回', () => {
    expect(fmtDate('下周')).toBe('下周')
    expect(fmtDate('')).toBe('')
  })
})
