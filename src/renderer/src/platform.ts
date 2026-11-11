import { joinList, t, type Key } from '@shared/i18n'

/**
 * 和系统有关的文案；platform 是 preload 传过来的 process.platform。
 * 文字都是 getter，每次读取按当前界面语言取，切换语言后不用重新生成
 */
export interface PlatformText {
  isMac: boolean
  /** “在访达中显示” */
  readonly fileManager: string
  /** 窗口转到后台后从哪里重新打开 */
  readonly reopenFrom: string
  quitKey: string
  pasteKey: string
  readonly av1Hint: string
  /** 能从哪些浏览器导入登录 */
  readonly browsers: string
  /** 导入 Chrome 系浏览器时系统可能弹出的授权 */
  readonly chromiumAuthHint: string
}

type Os = 'mac' | 'linux' | 'win'

const TEXT: Record<Os, { fileManager: Key; reopenFrom: Key; av1Hint: Key; chromiumAuthHint: Key; browsers: string[] }> = {
  mac: {
    fileManager: 'platform.macFileManager',
    reopenFrom: 'platform.macReopenFrom',
    av1Hint: 'platform.macAv1Hint',
    chromiumAuthHint: 'platform.macChromiumAuthHint',
    browsers: ['Chrome', 'Edge', 'Brave', 'Arc', 'Vivaldi', 'Opera', 'Chromium', 'Firefox', 'Safari']
  },
  linux: {
    fileManager: 'platform.linuxFileManager',
    reopenFrom: 'platform.trayIcon',
    av1Hint: 'platform.av1Hint',
    chromiumAuthHint: 'platform.linuxChromiumAuthHint',
    browsers: ['Chrome', 'Edge', 'Brave', 'Vivaldi', 'Opera', 'Chromium', 'Firefox']
  },
  win: {
    fileManager: 'platform.winFileManager',
    reopenFrom: 'platform.trayIcon',
    av1Hint: 'platform.av1Hint',
    chromiumAuthHint: 'platform.winChromiumAuthHint',
    browsers: ['Chrome', 'Edge', 'Brave', 'Vivaldi', 'Opera', 'Chromium', 'Firefox']
  }
}

export function platformText(platform: string): PlatformText {
  const os: Os = platform === 'darwin' ? 'mac' : platform === 'win32' ? 'win' : 'linux'
  const k = TEXT[os]
  return {
    isMac: os === 'mac',
    quitKey: os === 'mac' ? '⌘Q' : 'Ctrl+Q',
    pasteKey: os === 'mac' ? '⌘V' : 'Ctrl+V',
    get fileManager() {
      return t(k.fileManager)
    },
    get reopenFrom() {
      return t(k.reopenFrom)
    },
    get av1Hint() {
      return t(k.av1Hint)
    },
    get browsers() {
      return joinList(k.browsers)
    },
    get chromiumAuthHint() {
      return t(k.chromiumAuthHint)
    }
  }
}

/** ⌘,（macOS）/ Ctrl+,（Windows、Linux）打开设置 */
export function isSettingsShortcut(e: { metaKey: boolean; ctrlKey: boolean; key: string }, platform: string): boolean {
  return e.key === ',' && (platform === 'darwin' ? e.metaKey : e.ctrlKey)
}
