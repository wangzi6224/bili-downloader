import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Settings, Subscription } from '@shared/types'
import type { SubscriptionManager } from './subscriptions'

const h = vi.hoisted(() => ({ showSaveDialog: vi.fn(), showOpenDialog: vi.fn(), getSettings: vi.fn(), updateSettings: vi.fn() }))
vi.mock('electron', () => ({
  app: { getName: () => 'B站下载器' },
  dialog: { showSaveDialog: h.showSaveDialog, showOpenDialog: h.showOpenDialog }
}))
vi.mock('./settings', () => ({ getSettings: h.getSettings, updateSettings: h.updateSettings }))
const { exportConfig, importConfig } = await import('./config')

const SETTINGS = { theme: 'dark', concurrency: 3, mcp: { enabled: true, port: 39231, token: 'local-token' } } as unknown as Settings
const sub = (input: string, title = input): Subscription => ({ input, title }) as Subscription
const win = {} as BrowserWindow

let dir = ''
let list: Subscription[] = []
const subs = { list: vi.fn(() => list), replaceAll: vi.fn() }
const manager = subs as unknown as SubscriptionManager

beforeEach(() => {
  vi.clearAllMocks()
  dir = mkdtempSync(join(tmpdir(), 'config-'))
  list = [sub('a', '旧的 a'), sub('b')]
  h.getSettings.mockReturnValue(SETTINGS)
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('exportConfig', () => {
  it('导出设置和订阅，不导出 MCP 令牌', async () => {
    const path = join(dir, 'out.json')
    h.showSaveDialog.mockResolvedValue({ canceled: false, filePath: path })
    expect(await exportConfig(win, manager)).toBe(`已导出到 ${path}`)
    const [parent, opts] = h.showSaveDialog.mock.calls[0]
    expect(parent).toBe(win)
    expect(opts.defaultPath).toMatch(/^bili-downloader-config-\d{4}-\d{2}-\d{2}\.json$/)
    const data = JSON.parse(readFileSync(path, 'utf8'))
    expect(data).toMatchObject({ app: 'bili-downloader', version: 1, subscriptions: list })
    expect(data.settings).toEqual({ ...SETTINGS, mcp: { ...SETTINGS.mcp, token: '' } })
    expect(Date.parse(data.exportedAt)).not.toBeNaN()
  })

  it('没有窗口时单独弹出对话框', async () => {
    h.showSaveDialog.mockResolvedValue({ canceled: false, filePath: join(dir, 'x.json') })
    await exportConfig(null, manager)
    expect(h.showSaveDialog.mock.calls[0]).toHaveLength(1)
  })

  it('取消时什么都不做', async () => {
    h.showSaveDialog.mockResolvedValue({ canceled: true, filePath: join(dir, 'x.json') })
    expect(await exportConfig(win, manager)).toBeNull()
    h.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '' })
    expect(await exportConfig(win, manager)).toBeNull()
  })
})

describe('importConfig', () => {
  const file = (data: unknown): string => {
    const path = join(dir, 'in.json')
    writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data))
    h.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [path] })
    return path
  }

  it('保留本机的 MCP 令牌，同一来源的订阅以导入的为准', async () => {
    const imported = { ...SETTINGS, theme: 'light', mcp: { ...SETTINGS.mcp, token: '' } }
    file({ app: 'bili-downloader', version: 1, exportedAt: '2026-10-01T08:00:00.000Z', settings: imported, subscriptions: [sub('a', '新的 a'), sub('c')] })
    expect(await importConfig(win, manager)).toBe('已导入设置和 2 个订阅（来自 B站下载器 导出的 2026-10-01）')
    expect(h.showOpenDialog.mock.calls[0][0]).toBe(win)
    expect(h.updateSettings).toHaveBeenCalledWith({ ...imported, mcp: { ...imported.mcp, token: 'local-token' } })
    expect(subs.replaceAll).toHaveBeenCalledWith([sub('b'), sub('a', '新的 a'), sub('c')])
  })

  it('订阅不是数组时当作没有，原有订阅都保留', async () => {
    file({ app: 'bili-downloader', settings: SETTINGS, subscriptions: 'oops' })
    expect(await importConfig(null, manager)).toContain('0 个订阅')
    expect(h.showOpenDialog.mock.calls[0]).toHaveLength(1)
    expect(subs.replaceAll).toHaveBeenCalledWith(list)
  })

  it('取消时什么都不做', async () => {
    h.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    expect(await importConfig(win, manager)).toBeNull()
    h.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] })
    expect(await importConfig(win, manager)).toBeNull()
    expect(h.updateSettings).not.toHaveBeenCalled()
  })

  it.each([
    ['{oops', '这个文件不是有效的 JSON'],
    [{ app: 'other', settings: {} }, '这不是本应用导出的配置文件'],
    [{ app: 'bili-downloader' }, '这不是本应用导出的配置文件']
  ])('拒绝不对的文件：%s', async (data, msg) => {
    file(data)
    await expect(importConfig(win, manager)).rejects.toThrow(msg)
    expect(h.updateSettings).not.toHaveBeenCalled()
    expect(subs.replaceAll).not.toHaveBeenCalled()
  })

  it('设置有误（例如命名模板）时不改订阅', async () => {
    file({ app: 'bili-downloader', settings: SETTINGS, subscriptions: [sub('c')] })
    h.updateSettings.mockImplementation(() => {
      throw new Error('命名模板有误：模板不能为空')
    })
    await expect(importConfig(win, manager)).rejects.toThrow('命名模板有误')
    expect(subs.replaceAll).not.toHaveBeenCalled()
  })
})
