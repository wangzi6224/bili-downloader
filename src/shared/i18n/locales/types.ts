import type zh from './zh-CN'

/** 带单复数的文案：按 Intl.PluralRules 的分类取，缺的分类用 other */
export type Plural = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }
export type Text = string | Plural

/** 以简体中文为基准：其他语言必须有同样的命名空间和 key，缺了 TypeScript 会报错 */
export type Messages = { [N in keyof typeof zh]: { [K in keyof (typeof zh)[N]]: Text } }

export type Key = { [N in keyof typeof zh]: `${N & string}.${keyof (typeof zh)[N] & string}` }[keyof typeof zh]
