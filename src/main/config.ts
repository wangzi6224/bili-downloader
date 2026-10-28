import { readFile, writeFile } from 'node:fs/promises'
import { app, dialog, type BrowserWindow } from 'electron'
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
    title: '导出配置',
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
  return `已导出到 ${r.filePath}`
}

export async function importConfig(win: BrowserWindow | null, subs: SubscriptionManager): Promise<string | null> {
  const opts = { title: '导入配置', filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile' as const] }
  const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (r.canceled || !r.filePaths[0]) return null
  let data: ConfigFile
  try {
    data = JSON.parse(await readFile(r.filePaths[0], 'utf8'))
  } catch {
    throw new Error('这个文件不是有效的 JSON')
  }
  if (data.app !== 'bili-downloader' || !data.settings) throw new Error('这不是本应用导出的配置文件')
  const current = getSettings()
  // 令牌只属于这台电脑
  updateSettings({ ...data.settings, mcp: { ...data.settings.mcp, token: current.mcp.token } })
  // 同一来源以导入的为准，其余保留
  const imported = Array.isArray(data.subscriptions) ? data.subscriptions : []
  const inputs = new Set(imported.map((s) => s.input))
  subs.replaceAll([...subs.list().filter((s) => !inputs.has(s.input)), ...imported])
  return `已导入设置和 ${imported.length} 个订阅（来自 ${app.getName()} 导出的 ${data.exportedAt?.slice(0, 10) ?? ''}）`
}
