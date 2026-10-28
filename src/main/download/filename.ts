import { existsSync } from 'node:fs'

export { sanitize } from '@shared/filename'

/** 目标已存在（或被 taken 判为已占用）时追加 (1)、(2)… */
export function uniquePath(base: string, ext: string, taken: (path: string) => boolean = () => false): string {
  let p = `${base}${ext}`
  for (let i = 1; existsSync(p) || taken(p); i++) p = `${base} (${i})${ext}`
  return p
}
