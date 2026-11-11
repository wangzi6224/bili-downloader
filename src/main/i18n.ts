import { app } from 'electron'
import { effectiveLanguage, getLanguage, setLanguage, type Lang, type LanguageSetting } from '@shared/i18n'

/** 系统首选语言：getLocale() 受打包时保留的语言包影响，不能反映真实的系统语言 */
function systemLanguages(): string[] {
  try {
    return app.getPreferredSystemLanguages()
  } catch {
    return []
  }
}

/** 按设置确定主进程的界面语言；语言变了返回 true */
export function applyLanguage(setting: LanguageSetting | undefined): boolean {
  const before: Lang = getLanguage()
  setLanguage(effectiveLanguage(setting, systemLanguages()))
  return getLanguage() !== before
}
