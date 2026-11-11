import { afterEach, describe, expect, it } from 'vitest'
import {
  effectiveLanguage,
  getLanguage,
  isLanguageSetting,
  pluralTemplate,
  joinList,
  LANGS,
  onLanguageChange,
  resolveLanguage,
  setLanguage,
  t,
  translate
} from '.'
import { DICTS, type Text } from './locales'

afterEach(() => setLanguage('zh-CN'))

describe('resolveLanguage', () => {
  it.each([
    [['zh-CN'], 'zh-CN'],
    [['zh-TW', 'en'], 'zh-CN'],
    [['zh-Hans-HK'], 'zh-CN'],
    [['zh_CN'], 'zh-CN'],
    [['en-GB'], 'en'],
    [['ja-JP'], 'ja'],
    [['ko'], 'ko'],
    [['fr-CA'], 'fr'],
    [['it-IT'], 'it'],
    [['ru-RU'], 'ru'],
    [['hi-IN'], 'hi'],
    [['pt-BR', 'fr-FR'], 'en'],
    [[], 'en']
  ])('%j → %s', (preferred, lang) => {
    expect(resolveLanguage(preferred)).toBe(lang)
  })

  it('手动选择优先于系统语言，非法值当作跟随系统', () => {
    expect(effectiveLanguage('ko', ['zh-CN'])).toBe('ko')
    expect(effectiveLanguage('system', ['ja'])).toBe('ja')
    expect(effectiveLanguage('xx' as never, ['ja'])).toBe('ja')
    expect(effectiveLanguage(undefined, [])).toBe('en')
    expect(isLanguageSetting('system')).toBe(true)
    expect(isLanguageSetting('de')).toBe(false)
  })
})

describe('t', () => {
  it('按当前语言取文案、换参数，切换时通知', () => {
    const seen: string[] = []
    const off = onLanguageChange((l) => seen.push(l))
    setLanguage('en')
    setLanguage('en')
    expect(getLanguage()).toBe('en')
    expect(t('common.appName')).toBe('Bili Downloader')
    expect(t('login.profileLabel', { browser: 'Chrome', profile: 'Work' })).toBe('Chrome (Work)')
    off()
    setLanguage('ja')
    expect(seen).toEqual(['en'])
  })

  it('缺少的参数原样保留', () => {
    expect(translate('zh-CN', 'login.notLoggedInList')).toBe('未登录 B站：{list}')
    expect(translate('zh-CN', 'login.notLoggedInList', {})).toBe('未登录 B站：{list}')
  })

  it('单复数按 count 选，缺的分类用 other', () => {
    const dict = DICTS.en as Record<string, Record<string, Text>>
    dict.__test = { n: { one: '{count} video', other: '{count} videos' }, m: { other: '{count} items' } }
    try {
      expect(translate('en', '__test.n' as never, { count: 1 })).toBe('1 video')
      expect(translate('en', '__test.n' as never, { count: 3 })).toBe('3 videos')
      expect(translate('en', '__test.m' as never, { count: 1 })).toBe('1 items')
      expect(translate('en', '__test.n' as never)).toBe('{count} videos')
      setLanguage('en')
      expect(pluralTemplate('__test.n' as never, 1)).toBe('{count} video')
      expect(pluralTemplate('__test.n' as never, 2)).toBe('{count} videos')
    } finally {
      delete dict.__test
    }
  })

  it('列表按语言习惯连接', () => {
    expect(joinList(['Chrome', 'Edge'], 'zh-CN')).toBe('Chrome、Edge')
    expect(joinList(['Chrome', 'Edge', 'Brave'], 'en')).toBe('Chrome, Edge, Brave')
    setLanguage('ja')
    expect(joinList(['A', 'B'])).toBe('A、B')
  })
})

describe('字典', () => {
  const placeholders = (text: Text): string[] => {
    const all = typeof text === 'string' ? [text] : Object.values(text)
    return [...new Set(all.flatMap((s) => [...s!.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort()
  }
  const zh = DICTS['zh-CN']

  it.each(LANGS.filter((l) => l !== 'zh-CN'))('%s 的 key 和参数与简体中文一致', (lang) => {
    const dict = DICTS[lang]
    expect(Object.keys(dict).sort()).toEqual(Object.keys(zh).sort())
    for (const ns of Object.keys(zh)) {
      expect(Object.keys(dict[ns]).sort(), ns).toEqual(Object.keys(zh[ns]).sort())
      for (const key of Object.keys(zh[ns])) {
        expect(placeholders(dict[ns][key]), `${ns}.${key}`).toEqual(placeholders(zh[ns][key]))
      }
    }
  })

  it.each(LANGS.filter((l) => l !== 'zh-CN'))('%s 每个命名空间都已翻译，单复数只用在带 count 的文案上', (lang) => {
    const dict = DICTS[lang]
    for (const ns of Object.keys(zh)) {
      expect(dict[ns], `${lang} 的 ${ns} 还在沿用简体中文`).not.toBe(zh[ns])
      for (const [key, text] of Object.entries(dict[ns])) {
        if (typeof text !== 'string') expect(placeholders(text), `${ns}.${key}`).toContain('count')
      }
    }
  })
})
