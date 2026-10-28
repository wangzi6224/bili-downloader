import { join } from 'node:path'
import { app } from 'electron'
import type { HistoryEntry, ParseRecord } from '@shared/types'
import { readJson, writeJson } from './store'

const MAX_PARSES = 300

const downloadsFile = (): string => join(app.getPath('userData'), 'downloads.json')
const parsesFile = (): string => join(app.getPath('userData'), 'parses.json')

let downloads: Map<string, HistoryEntry> | undefined
let parses: ParseRecord[] | undefined

function loadDownloads(): Map<string, HistoryEntry> {
  downloads ??= new Map((readJson<HistoryEntry[]>(downloadsFile()) ?? []).map((e) => [e.key, e]))
  return downloads
}

function loadParses(): ParseRecord[] {
  parses ??= readJson<ParseRecord[]>(parsesFile()) ?? []
  return parses
}

/** 下载历史：用条目 key 判断是否下载过 */
export function recordDownload(entry: HistoryEntry): void {
  const map = loadDownloads()
  map.set(entry.key, entry)
  writeJson(downloadsFile(), [...map.values()])
}

export const downloadedKeys = (): string[] => [...loadDownloads().keys()]

export function clearDownloads(): void {
  downloads = new Map()
  writeJson(downloadsFile(), [])
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
