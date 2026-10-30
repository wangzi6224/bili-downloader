import { describe, expect, it } from 'vitest'
import { isSettingsShortcut, platformText } from './platform'

describe('platformText', () => {
  it('macOS 用访达、程序坞和 ⌘ 快捷键', () => {
    const t = platformText('darwin')
    expect(t.isMac).toBe(true)
    expect(t.fileManager).toBe('访达')
    expect(t.reopenFrom).toBe('程序坞图标')
    expect(t.quitKey).toBe('⌘Q')
    expect(t.browsers).toContain('Arc')
  })

  it('Windows 显示文件资源管理器、托盘和 DPAPI 登录说明', () => {
    const t = platformText('win32')
    expect(t.isMac).toBe(false)
    expect(t.fileManager).toBe('文件资源管理器')
    expect(t.reopenFrom).toBe('托盘图标')
    expect(t.quitKey).toBe('Ctrl+Q')
    expect(t.pasteKey).toBe('Ctrl+V')
    expect(t.chromiumAuthHint).toContain('DPAPI')
    expect(t.chromiumAuthHint).toContain('应用内登录')
    expect(t.chromiumAuthHint).not.toContain('密钥环')
  })

  it('其他系统用文件管理器、托盘和 Ctrl 快捷键，不提 Mac 专属的东西', () => {
    for (const t of [platformText('linux'), platformText('')]) {
      expect(t.isMac).toBe(false)
      expect(t.fileManager).toBe('文件管理器')
      expect(t.reopenFrom).toBe('托盘图标')
      expect(t.quitKey).toBe('Ctrl+Q')
      expect(t.pasteKey).toBe('Ctrl+V')
      expect(Object.values(t).join()).not.toMatch(/Mac|Arc|Safari|钥匙串|⌘/)
    }
  })
})

describe('isSettingsShortcut', () => {
  const key = (k: string, mods: { metaKey?: boolean; ctrlKey?: boolean }) => ({ key: k, metaKey: false, ctrlKey: false, ...mods })

  it('macOS 上是 ⌘,', () => {
    expect(isSettingsShortcut(key(',', { metaKey: true }), 'darwin')).toBe(true)
    expect(isSettingsShortcut(key(',', { ctrlKey: true }), 'darwin')).toBe(false)
  })

  it('Linux 上是 Ctrl+,', () => {
    expect(isSettingsShortcut(key(',', { ctrlKey: true }), 'linux')).toBe(true)
    expect(isSettingsShortcut(key(',', { metaKey: true }), 'linux')).toBe(false)
  })

  it('Windows 上是 Ctrl+,', () => {
    expect(isSettingsShortcut(key(',', { ctrlKey: true }), 'win32')).toBe(true)
    expect(isSettingsShortcut(key(',', { metaKey: true }), 'win32')).toBe(false)
  })

  it('别的键不算', () => {
    expect(isSettingsShortcut(key('.', { metaKey: true, ctrlKey: true }), 'darwin')).toBe(false)
    expect(isSettingsShortcut(key(',', {}), 'linux')).toBe(false)
  })
})
