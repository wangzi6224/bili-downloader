import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return undefined
  }
}

/** 先写临时文件再改名，避免写到一半崩溃留下损坏的 JSON */
export function writeJson(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, file)
}
