import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TEMPLATES } from '@shared/naming'
import type { Settings } from '@shared/types'

const h = vi.hoisted(() => ({ userData: '', downloads: '' }))
vi.mock('electron', () => ({ app: { getPath: (name: string) => (name === 'downloads' ? h.downloads : h.userData) } }))

let settings: typeof import('./settings')
const file = (): string => join(h.userData, 'settings.json')
const saved = (): Settings => JSON.parse(readFileSync(file(), 'utf8'))

/** 设置缓存在模块里，模拟重新启动应用 */
async function restart(): Promise<void> {
  vi.resetModules()
  settings = await import('./settings')
}

beforeEach(async () => {
  h.userData = mkdtempSync(join(tmpdir(), 'settings-'))
  h.downloads = mkdtempSync(join(tmpdir(), 'downloads-'))
  await restart()
})
afterEach(() => {
  rmSync(h.userData, { recursive: true, force: true })
  rmSync(h.downloads, { recursive: true, force: true })
})

describe('getSettings', () => {
  it('第一次启动生成默认设置并立即写入文件，重启后 MCP 令牌不变', async () => {
    expect(existsSync(file())).toBe(false)
    const s = settings.getSettings()
    expect(s.downloadDir).toBe(join(h.downloads, 'Bilibili'))
    expect(s.naming).toEqual(DEFAULT_TEMPLATES)
    expect(s.mcp).toMatchObject({ enabled: false, port: 39231 })
    expect(s.mcp.token).toMatch(/^[0-9a-f]{48}$/)
    expect(saved()).toEqual(s)
    await restart()
    expect(settings.getSettings().mcp.token).toBe(s.mcp.token)
  })

  it('迁移旧版设置', () => {
    writeFileSync(
      file(),
      JSON.stringify({
        extras: { cover: true, subtitle: false, danmaku: true },
        defaults: { danmaku: false, qn: 80 },
        naming: { single: '{坏模板}', multi: '{title}' },
        danmaku: { opacity: 0.5 },
        mcp: { enabled: true },
        concurrency: 3
      })
    )
    const s = settings.getSettings()
    // 新版 defaults 里的值优先于旧版 extras
    expect(s.defaults).toMatchObject({ cover: true, subtitle: false, danmaku: false })
    expect(s.defaults).not.toHaveProperty('qn')
    expect(s.naming).toEqual({ ...DEFAULT_TEMPLATES, multi: '{title}' })
    expect(s.danmaku).toEqual({ fontSize: 25, opacity: 0.5, duration: 8 })
    expect(s.mcp).toMatchObject({ enabled: true, port: 39231 })
    expect(s.mcp.token).toMatch(/^[0-9a-f]{48}$/)
    expect(s.concurrency).toBe(3)
    expect(saved()).not.toHaveProperty('extras')
  })

  it.each([
    ['顶层的 defaultCodec', { defaultCodec: 'hevc' }, ['hevc', 'avc', 'av1']],
    ['defaults 里的旧 codec', { defaults: { codec: 'av1' } }, ['av1', 'avc', 'hevc']],
    ['新旧都有时以新的 codecOrder 为准', { defaultCodec: 'hevc', defaults: { codecOrder: ['av1', 'hevc', 'avc'] } }, ['av1', 'hevc', 'avc']],
    ['都没有时用默认顺序', {}, ['avc', 'hevc', 'av1']]
  ])('迁移编码偏好：%s（回归）', (_, legacy, order) => {
    writeFileSync(file(), JSON.stringify(legacy))
    const s = settings.getSettings()
    expect(s.defaults.codecOrder).toEqual(order)
    expect(s.defaults).not.toHaveProperty('codec')
    expect(saved()).not.toHaveProperty('defaultCodec')
  })

  it('设置文件损坏时用默认值', () => {
    writeFileSync(file(), '{oops')
    expect(settings.getSettings().concurrency).toBe(2)
  })
})

describe('updateSettings', () => {
  it('合并修改、写入文件并通知监听者', () => {
    const fn = vi.fn()
    settings.onSettingsChange(fn)
    const next = settings.updateSettings({ theme: 'dark' })
    expect(next.theme).toBe('dark')
    expect(settings.getSettings()).toBe(next)
    expect(saved().theme).toBe('dark')
    expect(fn).toHaveBeenCalledWith(next)
  })

  it.each([
    ['concurrency', 9, 5],
    ['concurrency', 0, 1],
    ['concurrency', 2.6, 3],
    ['threads', Number.NaN, 1],
    ['threads', 9.6, 8],
    ['autoRetry', -3, 0],
    ['autoRetry', 25, 20],
    ['speedLimit', -5, 0],
    ['speedLimit', 100.4, 100]
  ] as const)('%s = %s 修正为 %s', (key, value, want) => {
    expect(settings.updateSettings({ [key]: value })[key]).toBe(want)
  })

  it('MCP 端口限制在 1024–65535', () => {
    const { mcp } = settings.getSettings()
    expect(settings.updateSettings({ mcp: { ...mcp, port: 80 } }).mcp.port).toBe(1024)
    expect(settings.updateSettings({ mcp: { ...mcp, port: 70000 } }).mcp.port).toBe(65535)
  })

  it('默认下载选项换算旧字段，不保存画质', () => {
    const legacy = { codec: 'av1', audioOnly: true, qn: 80 } as unknown as Settings['defaults']
    const { defaults } = settings.updateSettings({ defaults: legacy })
    expect(defaults.codecOrder).toEqual(['av1', 'avc', 'hevc'])
    expect(defaults.output).toBe('audio')
    expect(defaults).not.toHaveProperty('qn')
  })

  it('命名模板有误时报错，什么都不改', () => {
    const before = settings.getSettings()
    const fn = vi.fn()
    settings.onSettingsChange(fn)
    expect(() => settings.updateSettings({ naming: { ...before.naming, multi: '<{title}' } })).toThrow('命名模板有误：可选段 <…> 没有闭合')
    expect(settings.getSettings()).toBe(before)
    expect(saved().naming).toEqual(before.naming)
    expect(fn).not.toHaveBeenCalled()
  })
})
