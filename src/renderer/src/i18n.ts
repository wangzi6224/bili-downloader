import { setLanguage, t, translate, type Lang } from '@shared/i18n'
import { useStore } from './store'

/** 切换界面语言：先改模块里的当前语言，再更新 store 让组件重新渲染 */
export function applyLanguage(lang: Lang): void {
  setLanguage(lang)
  document.documentElement.lang = lang
  document.title = translate(lang, 'common.appName')
  useStore.getState().set({ lang })
}

/** 组件里用：订阅语言变化，切换后跟着重新渲染 */
export function useT(): typeof t {
  useStore((s) => s.lang)
  return t
}
