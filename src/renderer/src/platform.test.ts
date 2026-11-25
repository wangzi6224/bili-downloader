import { describe, expect, it } from 'vitest'
import { setLanguage } from '@shared/i18n'
import { isSettingsShortcut, isSiteShortcut, platformText } from './platform'

describe('platformText', () => {
  it('macOS 用访达、程序坞或菜单栏和 ⌘ 快捷键', () => {
    const t = platformText('darwin')
    expect(t.isMac).toBe(true)
    expect(t.fileManager).toBe('访达')
    expect(t.reopenFrom).toBe('程序坞或菜单栏图标')
    expect(t.quitKey).toBe('⌘Q')
    expect(t.browsers).toBe('Chrome、Edge、Brave、Arc、Vivaldi、Opera、Chromium、Firefox、Safari')
    expect(t.av1Hint).toBe('最省空间，需 M1 以后的 Mac')
  })

  it('文字是 getter，切换语言后读取到的是新语言', () => {
    const t = platformText('darwin')
    for (const k of ['fileManager', 'reopenFrom', 'av1Hint', 'browsers', 'chromiumAuthHint'] as const) {
      expect(Object.getOwnPropertyDescriptor(t, k)?.get).toBeTypeOf('function')
    }
    setLanguage('en')
    try {
      expect(t.browsers).toBe('Chrome, Edge, Brave, Arc, Vivaldi, Opera, Chromium, Firefox, Safari')
    } finally {
      setLanguage('zh-CN')
    }
  })

  it('Windows 显示文件资源管理器、托盘和 DPAPI 登录说明', () => {
    const t = platformText('win32')
    expect(t.isMac).toBe(false)
    expect(t.fileManager).toBe('文件资源管理器')
    expect(t.reopenFrom).toBe('托盘图标')
    expect(t.quitKey).toBe('Ctrl+Q')
    expect(t.pasteKey).toBe('Ctrl+V')
    expect(t.chromiumAuthHint).toContain('Windows 用户的身份')
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

describe('isSiteShortcut', () => {
  const key = (k: string, mods: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }) =>
    ({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, ...mods })

  it('macOS 上是 ⌘⇧Y，按 Shift 时 key 是大写也算', () => {
    expect(isSiteShortcut(key('Y', { metaKey: true, shiftKey: true }), 'darwin')).toBe(true)
    expect(isSiteShortcut(key('y', { metaKey: true, shiftKey: true }), 'darwin')).toBe(true)
  })

  it('macOS 上同时按 Ctrl、或只按 Ctrl 不算', () => {
    expect(isSiteShortcut(key('Y', { metaKey: true, ctrlKey: true, shiftKey: true }), 'darwin')).toBe(false)
    expect(isSiteShortcut(key('Y', { ctrlKey: true, shiftKey: true }), 'darwin')).toBe(false)
  })

  it('Windows 和 Linux 上是 Ctrl+Shift+Y，按 ⊞/Super 不算', () => {
    for (const platform of ['win32', 'linux']) {
      expect(isSiteShortcut(key('Y', { ctrlKey: true, shiftKey: true }), platform)).toBe(true)
      expect(isSiteShortcut(key('y', { ctrlKey: true, shiftKey: true }), platform)).toBe(true)
      expect(isSiteShortcut(key('Y', { metaKey: true, shiftKey: true }), platform)).toBe(false)
      expect(isSiteShortcut(key('Y', { ctrlKey: true, metaKey: true, shiftKey: true }), platform)).toBe(false)
    }
  })

  it('不按 Shift、或按的不是 Y 都不算', () => {
    expect(isSiteShortcut(key('y', { metaKey: true }), 'darwin')).toBe(false)
    expect(isSiteShortcut(key('y', { ctrlKey: true }), 'win32')).toBe(false)
    expect(isSiteShortcut(key('T', { metaKey: true, shiftKey: true }), 'darwin')).toBe(false)
  })
})
