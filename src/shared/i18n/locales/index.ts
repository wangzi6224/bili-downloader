import type { Lang } from '..'
import en from './en'
import fr from './fr'
import hi from './hi'
import it from './it'
import ja from './ja'
import ko from './ko'
import ru from './ru'
import zh from './zh-CN'
import type { Messages } from './types'

export type { Key, Messages, Plural, Text } from './types'

export const DICTS: Record<Lang, Record<string, Record<string, import('./types').Text>>> = {
  en,
  'zh-CN': zh,
  ja,
  ko,
  fr,
  it,
  ru,
  hi
} satisfies Record<Lang, Messages>
