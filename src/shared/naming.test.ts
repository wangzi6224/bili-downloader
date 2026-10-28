import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATES, MEDIA_LIBRARY_PGC, renderTemplate, validateTemplate } from './naming'

describe('renderTemplate', () => {
  it('drops optional segments whose variables are empty', () => {
    expect(renderTemplate(DEFAULT_TEMPLATES.single, { title: '电影名', series: '' })).toBe('电影名')
    expect(renderTemplate(DEFAULT_TEMPLATES.single, { title: '第1话', series: '番剧' })).toBe('番剧 - 第1话')
  })

  it('builds folders and pads numbers', () => {
    expect(renderTemplate(DEFAULT_TEMPLATES.multi, { title: '函数', series: '合集', index: 3 })).toBe('合集/03 - 函数')
    expect(renderTemplate('{series}/{index:003}', { series: 'a', index: 7 })).toBe('a/007')
  })

  it('omits empty directory levels', () => {
    expect(renderTemplate('{owner}/{series}/{title}', { title: 't', owner: 'up' })).toBe('up/t')
  })

  it('formats dates', () => {
    const sec = new Date(2024, 0, 2, 3, 4, 5).getTime() / 1000
    expect(renderTemplate('{pubdate}', { pubdate: sec })).toBe('2024-01-02')
    expect(renderTemplate('{pubdate:YYYYMMDD-HHmm}', { pubdate: sec })).toBe('20240102-0304')
  })

  it('sanitizes each level and keeps slashes inside values out of the path', () => {
    expect(renderTemplate('{series}/{title}', { series: 'A/B', title: 'x:y' })).toBe('A／B/x：y')
  })

  it('does not re-expand braces that came from values', () => {
    expect(renderTemplate('<{title}>', { title: '{index}' })).toBe('{index}')
  })

  it('supports the media library preset', () => {
    expect(renderTemplate(MEDIA_LIBRARY_PGC, { series: '间谍过家家', index: 1, title: '第1话' })).toBe(
      '间谍过家家/间谍过家家 S01E01 第1话'
    )
  })

  it('falls back to the title when everything is empty', () => {
    expect(renderTemplate('<{series}>', { title: '标题' })).toBe('标题')
  })
})

describe('validateTemplate', () => {
  it.each([
    ['', '模板不能为空'],
    ['{foo}', '不认识的变量 {foo}'],
    ['<{title}', '可选段 <…> 没有闭合'],
    ['<<{title}>>', '可选段 <…> 不能嵌套'],
    ['{title', '变量的花括号没有写完整']
  ])('rejects %s', (tpl, msg) => {
    expect(validateTemplate(tpl)).toBe(msg)
  })

  it('accepts defaults', () => {
    for (const t of Object.values(DEFAULT_TEMPLATES)) expect(validateTemplate(t)).toBeNull()
  })
})
