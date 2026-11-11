import { afterEach, describe, expect, it, vi } from 'vitest'

const preferred = vi.fn<() => string[]>()
vi.mock('electron', () => ({ app: { getPreferredSystemLanguages: () => preferred() } }))

const { applyLanguage } = await import('./i18n')
const { getLanguage, setLanguage } = await import('@shared/i18n')

afterEach(() => setLanguage('zh-CN'))

describe('applyLanguage', () => {
  it('跟随系统：用系统首选语言，不支持的用英语', () => {
    preferred.mockReturnValue(['ja-JP', 'en-US'])
    expect(applyLanguage('system')).toBe(true)
    expect(getLanguage()).toBe('ja')
    preferred.mockReturnValue(['es-ES', 'fr-FR'])
    applyLanguage('system')
    expect(getLanguage()).toBe('en')
  })

  it('手动选择的语言优先；没变时返回 false', () => {
    preferred.mockReturnValue(['zh-Hans-CN'])
    expect(applyLanguage('ru')).toBe(true)
    expect(applyLanguage('ru')).toBe(false)
    expect(getLanguage()).toBe('ru')
  })

  it('拿不到系统语言时用英语', () => {
    preferred.mockImplementation(() => {
      throw new Error('not ready')
    })
    applyLanguage(undefined)
    expect(getLanguage()).toBe('en')
  })
})
