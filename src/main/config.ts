import { readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dialog, type BrowserWindow } from 'electron'
import { t } from '@shared/i18n'
import type { Settings, Subscription } from '@shared/types'
import { getSettings, updateSettings } from './settings'
import type { SubscriptionManager } from './subscriptions'

interface ConfigFile {
  app: 'bili-downloader'
  version: 1
  exportedAt: string
  settings: Settings
  subscriptions: Subscription[]
}

/** 导出设置和订阅（不含登录信息；MCP 令牌也不导出） */
export async function exportConfig(win: BrowserWindow | null, subs: SubscriptionManager): Promise<string | null> {
  const opts = {
    title: t('config.exportTitle'),
    defaultPath: `bili-downloader-config-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  }
  const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (r.canceled || !r.filePath) return null
  const s = getSettings()
  const data: ConfigFile = {
    app: 'bili-downloader',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { ...s, mcp: { ...s.mcp, token: '' } },
    subscriptions: subs.list()
  }
  await writeFile(r.filePath, JSON.stringify(data, null, 2))
  return t('config.exported', { path: r.filePath })
}

export async function importConfig(win: BrowserWindow | null, subs: SubscriptionManager): Promise<string | null> {
  const opts = { title: t('config.importTitle'), filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile' as const] }
  const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (r.canceled || !r.filePaths[0]) return null
  let data: ConfigFile
  try {
    data = JSON.parse(await readFile(r.filePaths[0], 'utf8'))
  } catch {
    throw new Error(t('config.invalidJson'))
  }
  if (data.app !== 'bili-downloader' || !data.settings) throw new Error(t('config.notOurs'))
  const current = getSettings()
  // 令牌只属于这台电脑
  updateSettings({ ...data.settings, mcp: { ...data.settings.mcp, token: current.mcp.token } })
  // 同一来源以导入的为准，其余保留
  const imported = Array.isArray(data.subscriptions) ? data.subscriptions : []
  const key = (s: Subscription): string => JSON.stringify([s.input, s.accountMid])
  const inputs = new Set(imported.map(key))
  const retained = subs.list().filter((s) => !inputs.has(key(s)))
  const ids = new Set(retained.map((s) => s.id))
  for (const sub of imported) {
    const entry = sub.id && ids.has(sub.id) ? { ...sub, id: randomUUID() } : sub
    ids.add(entry.id)
    retained.push(entry)
  }
  subs.replaceAll(retained)
  return t('config.imported', { count: imported.length, app: t('common.appName'), date: data.exportedAt?.slice(0, 10) ?? '' })
}
