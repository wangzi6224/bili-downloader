import { existsSync } from 'node:fs'

export { sanitize } from '@shared/filename'

/** 目标已存在时追加 (1)、(2)… */
export function uniquePath(base: string, ext: string): string {
  let p = `${base}${ext}`
  for (let i = 1; existsSync(p); i++) p = `${base} (${i})${ext}`
  return p
}
