import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
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

/** 先写临时文件再改名，避免写到一半崩溃留下损坏的 JSON */
export function writeJson(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, file)
}
