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
const downloadId = (e: HistoryEntry): string => JSON.stringify([e.key, e.accountMid, e.path])

function loadDownloads(): Map<string, HistoryEntry> {
  downloads ??= new Map(readJsonArray<HistoryEntry>(downloadsFile()).map((e) => [downloadId(e), e]))
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

/** 每份文件保留发起账号，只用来显示；是否下载过按条目 key 判断，不分账号。 */
export function recordDownload(entry: HistoryEntry): void {
  const map = loadDownloads()
  map.set(downloadId(entry), entry)
  saveDownloads()
}

export const downloadRecords = (): HistoryEntry[] => [...loadDownloads().values()]

/** 下载过的条目 key。不分账号：同一个视频哪个账号下的都是同一份文件，不必再下一遍 */
export function downloadedKeys(): string[] {
  return [...new Set(downloadRecords().map((e) => e.key))]
}

/** 文件被删掉了，之后再选中不算“已下载” */
export function removeDownloads(files: Pick<HistoryEntry, 'key' | 'path'>[]): void {
  const map = loadDownloads()
  const removed = new Set(files.map((e) => JSON.stringify([e.key, e.path])))
  for (const [id, entry] of map) {
    if (removed.has(JSON.stringify([entry.key, entry.path]))) map.delete(id)
  }
  saveDownloads()
}

export function clearDownloads(): void {
  downloads = new Map()
  saveDownloads()
}

/** 解析记录：每个账号对同一个链接只保留最新一条，最多 300 条 */
export function recordParse(rec: ParseRecord): void {
  parses = [rec, ...loadParses().filter((p) => p.input !== rec.input || p.accountMid !== rec.accountMid)].slice(0, MAX_PARSES)
  writeJson(parsesFile(), parses)
}

export const parseRecords = (): ParseRecord[] => loadParses()

export function removeParse(input: string, accountMid?: number | null): ParseRecord[] {
  parses = loadParses().filter((p) => p.input !== input || (accountMid !== undefined && (p.accountMid ?? null) !== accountMid))
  writeJson(parsesFile(), parses)
  return parses
}

export function clearParses(): void {
  parses = []
  writeJson(parsesFile(), [])
}
