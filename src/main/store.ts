import { chmodSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return undefined
  }
}

/** 存的是列表的文件：内容不是数组（例如被手改成了 {}）时当作空列表，免得后面遍历时崩溃 */
export function readJsonArray<T>(file: string): T[] {
  const data = readJson<unknown>(file)
  return Array.isArray(data) ? (data as T[]) : []
}

/**
 * 先写临时文件再改名，避免写到一半崩溃留下损坏的文件。
 * 软链接写到它指向的文件（不把链接换成普通文件），已有文件的权限保持不变（例如 0600 的配置不会变成所有人可读）
 */
export function writeTextAtomic(file: string, text: string): void {
  let target = file
  let mode: number | undefined
  try {
    target = realpathSync(file)
    mode = statSync(target).mode & 0o777
  } catch {
    // 还不存在
  }
  mkdirSync(dirname(target), { recursive: true })
  const tmp = `${target}.tmp`
  writeFileSync(tmp, text)
  if (mode !== undefined) chmodSync(tmp, mode)
  renameSync(tmp, target)
}

export function writeJson(file: string, data: unknown): void {
  writeTextAtomic(file, JSON.stringify(data, null, 2))
}
