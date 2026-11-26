// 各平台界面上的差异：文字、空状态、快捷切换顺序。组件按这里的表取，新增平台漏写会编译报错
import type { Key } from '@shared/i18n'
import { SITES } from '@shared/site'
import type { Site } from '@shared/types'

export interface SiteText {
  /** 切换器和徽章上的名字；没有时用 name */
  nameKey?: Key
  name?: string
  emptyTitle: Key
  emptyHint: Key
  /** 空状态下面的支持范围标签 */
  kinds: Key[]
  searchTasks: Key
  clipboardHint: Key
  subsEmptyHint: Key
  accountTab: Key
}

export const SITE_TEXT: Record<Site, SiteText> = {
  bili: {
    nameKey: 'ytUi.siteBili',
    emptyTitle: 'tasks.emptyTitle',
    emptyHint: 'tasks.emptyHint',
    kinds: [
      'tasks.kindVideo',
      'tasks.kindPart',
      'tasks.kindCollection',
      'tasks.kindBangumi',
      'tasks.kindMovie',
      'tasks.kindCourse',
      'tasks.kindFavorites',
      'tasks.kindUploader',
      'tasks.kindShortLink'
    ],
    searchTasks: 'tasks.search',
    clipboardHint: 'settings.clipboardHint',
    subsEmptyHint: 'subs.emptyHint',
    accountTab: 'subs.account'
  },
  youtube: {
    name: 'YouTube',
    emptyTitle: 'ytUi.emptyTitle',
    emptyHint: 'ytUi.emptyHint',
    kinds: ['ytUi.kindVideo', 'ytUi.kindShorts', 'ytUi.kindPlaylist', 'ytUi.kindChannel', 'ytUi.kindMusic', 'ytUi.kindLive'],
    searchTasks: 'ytUi.searchTasks',
    clipboardHint: 'ytUi.clipboardHint',
    subsEmptyHint: 'ytUi.subsEmptyHint',
    accountTab: 'ytUi.myLists'
  },
  douyin: {
    nameKey: 'dyUi.siteName',
    emptyTitle: 'dyUi.emptyTitle',
    emptyHint: 'dyUi.emptyHint',
    kinds: ['dyUi.kindVideo', 'dyUi.kindImages', 'dyUi.kindUser', 'dyUi.kindMix', 'dyUi.kindFavorites'],
    searchTasks: 'dyUi.searchTasks',
    clipboardHint: 'dyUi.clipboardHint',
    subsEmptyHint: 'dyUi.subsEmptyHint',
    accountTab: 'dyUi.myLists'
  }
}

export const siteName = (site: Site, t: (key: Key) => string): string => {
  const s = SITE_TEXT[site]
  return s.nameKey ? t(s.nameKey) : s.name!
}

/** 快捷键依次切换：B站 → YouTube → 抖音 → B站 */
export const nextSite = (site: Site): Site => SITES[(SITES.indexOf(site) + 1) % SITES.length]
