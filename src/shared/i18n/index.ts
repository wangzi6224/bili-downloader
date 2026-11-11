import { DICTS, type Key, type Text } from './locales'

/** 支持的界面语言，和仓库里的 README 一致 */
export const LANGS = ['en', 'zh-CN', 'ja', 'ko', 'fr', 'it', 'ru', 'hi'] as const
export type Lang = (typeof LANGS)[number]
/** 设置里的语言：system 跟随系统 */
export type LanguageSetting = 'system' | Lang
export type { Key }

/** 设置页里用各语言自己的写法列出 */
export const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  ja: '日本語',
  ko: '한국어',
  fr: 'Français',
  it: 'Italiano',
  ru: 'Русский',
  hi: 'हिन्दी'
}

/** 日期、数字格式化用的 locale */
export const DATE_LOCALE: Record<Lang, string> = {
  en: 'en-US',
  'zh-CN': 'zh-CN',
  ja: 'ja-JP',
  ko: 'ko-KR',
  fr: 'fr-FR',
  it: 'it-IT',
  ru: 'ru-RU',
  hi: 'hi-IN'
}

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v)
export const isLanguageSetting = (v: unknown): v is LanguageSetting => v === 'system' || isLang(v)

/**
 * 系统语言（首选语言列表的第一项）对应的界面语言：中文一律用简体中文，其余按主语言匹配，不支持的用英语。
 * 只看第一项：系统语言不在支持范围内就用英语，不去猜第二首选语言
 */
export function resolveLanguage(preferred: readonly string[]): Lang {
  const first = (preferred[0] ?? '').replace('_', '-').toLowerCase()
  const base = first.split('-')[0]
  if (base === 'zh') return 'zh-CN'
  return LANGS.find((l) => l === base) ?? 'en'
}

export const effectiveLanguage = (setting: LanguageSetting | undefined, preferred: readonly string[]): Lang =>
  setting && setting !== 'system' && isLang(setting) ? setting : resolveLanguage(preferred)

// ---------- 当前语言（主进程、渲染进程各有一份） ----------

// 放在进程级的 globalThis 上：同一进程里模块被重复加载（打包出的多个入口、测试里 resetModules）时仍共用一份语言
interface I18nState {
  current: Lang
  listeners: Set<(lang: Lang) => void>
}
const STATE = Symbol.for('bili-downloader.i18n')
const store = globalThis as Record<symbol, unknown>
const state = (store[STATE] ??= { current: 'en', listeners: new Set() } satisfies I18nState) as I18nState

export const getLanguage = (): Lang => state.current

export function setLanguage(lang: Lang): void {
  if (lang === state.current) return
  state.current = lang
  for (const fn of state.listeners) fn(lang)
}

export function onLanguageChange(fn: (lang: Lang) => void): () => void {
  state.listeners.add(fn)
  return () => state.listeners.delete(fn)
}

export type Params = Record<string, string | number>

const pluralRules = new Map<Lang, Intl.PluralRules>()
function pluralForm(lang: Lang, n: number): Intl.LDMLPluralRule {
  let rules = pluralRules.get(lang)
  if (!rules) pluralRules.set(lang, (rules = new Intl.PluralRules(DATE_LOCALE[lang])))
  return rules.select(n)
}

/** 取当前语言的文案。{name} 换成参数；带单复数的文案按 count 参数选 */
export function t(key: Key, params?: Params): string {
  return translate(state.current, key, params)
}

/** 按 count 选好单复数、还没换参数的文案 */
function pickText(lang: Lang, key: Key, count: unknown): string {
  const [ns, name] = key.split('.') as [string, string]
  const pick = (dict: Record<string, Record<string, Text>>): Text | undefined => dict[ns]?.[name]
  const text = pick(DICTS[lang]) ?? pick(DICTS.en)!
  return typeof text === 'string' ? text : (text[pluralForm(lang, Number(count ?? 0))] ?? text.other)
}

export function translate(lang: Lang, key: Key, params?: Params): string {
  const s = pickText(lang, key, params?.count)
  if (!params) return s
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m))
}

/** 按 count 选好单复数，但保留 {占位符}：界面要把数字换成带样式的元素时用 */
export const pluralTemplate = (key: Key, count: number): string => pickText(state.current, key, count)

const listFormats = new Map<Lang, Intl.ListFormat>()

/** 列表连接：中文、日文用顿号，其他语言按 Intl 的习惯 */
export function joinList(items: readonly string[], lang: Lang = state.current): string {
  if (lang === 'zh-CN' || lang === 'ja') return items.join('、')
  let fmt = listFormats.get(lang)
  if (!fmt) listFormats.set(lang, (fmt = new Intl.ListFormat(DATE_LOCALE[lang], { style: 'short', type: 'unit' })))
  return fmt.format(items)
}
