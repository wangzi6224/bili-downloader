import { afterEach, describe, expect, it } from 'vitest'
import { getLanguage, setLanguage } from '@shared/i18n'

const doc = { documentElement: { lang: '' }, title: '' }
Object.assign(globalThis, { document: doc, window: { api: { platform: 'darwin' } } })

const { applyLanguage, useT } = await import('./i18n')
const { useStore } = await import('./store')

afterEach(() => setLanguage('zh-CN'))

describe('applyLanguage', () => {
  it('同时更新当前语言、页面语言、标题和 store', () => {
    applyLanguage('en')
    expect(getLanguage()).toBe('en')
    expect(doc.documentElement.lang).toBe('en')
    expect(doc.title).toBe('Bili Downloader')
    expect(useStore.getState().lang).toBe('en')
  })

  it('useT 是函数（组件里订阅语言变化）', () => {
    expect(typeof useT).toBe('function')
  })
})
