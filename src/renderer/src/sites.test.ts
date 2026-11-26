import { describe, expect, it } from 'vitest'
import { t } from '@shared/i18n'
import { SITES } from '@shared/site'
import { nextSite, SITE_TEXT, siteName } from './sites'

describe('平台界面配置', () => {
  it('每个平台都有名字', () => {
    expect(SITES.map((s) => siteName(s, t))).toEqual(['B站', 'YouTube', '抖音'])
  })

  it('快捷键依次切换并回到开头', () => {
    expect(SITES.map(nextSite)).toEqual(['youtube', 'douyin', 'bili'])
  })

  it('空状态标签和各处文字都取得到', () => {
    for (const site of SITES) {
      const text = SITE_TEXT[site]
      for (const key of [text.emptyTitle, text.searchTasks, text.clipboardHint, text.subsEmptyHint, text.accountTab, ...text.kinds]) {
        expect(t(key)).not.toBe(key)
      }
    }
  })
})
