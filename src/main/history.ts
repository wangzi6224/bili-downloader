import { join } from 'node:path'
import { app } from 'electron'
import type { HistoryEntry, ParseRecord } from '@shared/types'
import { readJsonArray, writeJson } from './store'

const MAX_PARSES = 300

const downloadsFile = (): string => join(app.getPath('userData'), 'downloads.json')
const parsesFile = (): string => join(app.getPath('userData'), 'parses.json')

let downloads: Map<string, HistoryEntry> | undefined
let parses: ParseRecord[] | undefined
const downloadListeners = new Set<() => void>()

function loadDownloads(): Map<string, HistoryEntry> {
  downloads ??= new Map(readJsonArray<HistoryEntry>(downloadsFile()).map((e) => [e.key, e]))
  return downloads
}

function loadParses(): ParseRecord[] {
  parses ??= readJsonArray<ParseRecord>(parsesFile())
  return parses
}

export function onDownloadsChanged(listener: () => void): () => void {
  downloadListeners.add(listener)
  return () => { downloadListeners.delete(listener) }
}

function saveDownloads(): void {
  writeJson(downloadsFile(), [...loadDownloads().values()])
  for (const listener of downloadListeners) listener()
}

/** 下载历史：用条目 key 判断是否下载过 */
export function recordDownload(entry: HistoryEntry): void {
  const map = loadDownloads()
  map.set(entry.key, entry)
  saveDownloads()
}

export const downloadedKeys = (): string[] => [...loadDownloads().keys()]

/** 文件被删掉了，之后再选中不算“已下载” */
export function removeDownloads(keys: string[]): void {
  const map = loadDownloads()
  for (const k of keys) map.delete(k)
  saveDownloads()
}

export function clearDownloads(): void {
  downloads = new Map()
  saveDownloads()
}

/** 解析记录：同一个链接只保留最新一条，最多 300 条 */
export function recordParse(rec: ParseRecord): void {
  parses = [rec, ...loadParses().filter((p) => p.input !== rec.input)].slice(0, MAX_PARSES)
  writeJson(parsesFile(), parses)
}

export const parseRecords = (): ParseRecord[] => loadParses()

export function removeParse(input: string): ParseRecord[] {
  parses = loadParses().filter((p) => p.input !== input)
  writeJson(parsesFile(), parses)
  return parses
}

export function clearParses(): void {
  parses = []
  writeJson(parsesFile(), [])
}
