/** 和系统有关的文案；platform 是 preload 传过来的 process.platform */
export interface PlatformText {
  isMac: boolean
  /** “在访达中显示” */
  fileManager: string
  /** 窗口转到后台后从哪里重新打开 */
  reopenFrom: string
  quitKey: string
  pasteKey: string
  av1Hint: string
  /** 能从哪些浏览器导入登录 */
  browsers: string
  /** 导入 Chrome 系浏览器时系统可能弹出的授权 */
  chromiumAuthHint: string
}

const MAC: PlatformText = {
  isMac: true,
  fileManager: '访达',
  reopenFrom: '程序坞图标',
  quitKey: '⌘Q',
  pasteKey: '⌘V',
  av1Hint: '最省空间，需 M1 以后的 Mac',
  browsers: 'Chrome、Edge、Brave、Arc、Vivaldi、Chromium、Firefox；Safari 暂不支持',
  chromiumAuthHint: '导入 Chrome 系浏览器时 macOS 会弹出钥匙串授权，请点“允许”。'
}

const LINUX: PlatformText = {
  isMac: false,
  fileManager: '文件管理器',
  reopenFrom: '托盘图标',
  quitKey: 'Ctrl+Q',
  pasteKey: 'Ctrl+V',
  av1Hint: '最省空间，较旧的电脑播放可能卡顿',
  browsers: 'Chrome、Edge、Brave、Vivaldi、Chromium、Firefox',
  chromiumAuthHint: 'Chrome 系浏览器的登录信息存在系统密钥环里，导入时如果弹出解锁密钥环，请输入登录密码。'
}

export const platformText = (platform: string): PlatformText => (platform === 'darwin' ? MAC : LINUX)

/** ⌘,（macOS）/ Ctrl+,（Linux）打开设置，和各自系统上的其他应用一致 */
export function isSettingsShortcut(e: { metaKey: boolean; ctrlKey: boolean; key: string }, platform: string): boolean {
  return e.key === ',' && (platform === 'darwin' ? e.metaKey : e.ctrlKey)
}
