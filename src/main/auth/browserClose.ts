import { execFile } from 'node:child_process'
import { win32 } from 'node:path'
import { t } from '@shared/i18n'
import { encodeCommand, POWERSHELL } from '../powershell'
import { showDialog } from '../windows'

/**
 * Windows 上 Chrome 系浏览器开着时独占 Cookie 数据库，要导入只能先把它关掉。
 * 只认安装路径，不用 taskkill /IM chrome.exe：Chromium、Canary 的程序也叫 chrome.exe，不能误杀
 */
const EXECUTABLES: Record<string, { name: string; path: string }> = {
  chrome: { name: 'chrome.exe', path: '*\\Google\\Chrome\\Application\\chrome.exe' },
  edge: { name: 'msedge.exe', path: '*\\Microsoft\\Edge\\Application\\msedge.exe' },
  brave: { name: 'brave.exe', path: '*\\BraveSoftware\\Brave-Browser\\Application\\brave.exe' },
  vivaldi: { name: 'vivaldi.exe', path: '*\\Vivaldi\\Application\\vivaldi.exe' },
  chromium: { name: 'chrome.exe', path: '*\\Chromium\\Application\\chrome.exe' },
  // Opera 的程序放在版本号目录里，Opera GX 的目录名不同，不会匹配到
  opera: { name: 'opera.exe', path: '*\\Opera\\*opera.exe' },
  firefox: { name: 'firefox.exe', path: '*\\Mozilla Firefox\\firefox.exe' }
}

const TASKKILL = win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe')
const COMMAND_TIMEOUT = 30_000
/** 优雅关闭后最多等这么久，浏览器要保存会话 */
const GRACE_MS = 10_000
/** 强制结束后文件很快就会释放 */
const FORCE_MS = 5_000
const POLL_MS = 500

/** 关闭靠 PowerShell 和 taskkill，其他系统上就算碰到文件被占用也只能让用户自己退出 */
export const canCloseBrowser = (key: string): boolean => process.platform === 'win32' && Object.hasOwn(EXECUTABLES, key)

export type CloseChoice = 'close' | 'qr' | 'cancel'

/** 要关掉用户的浏览器，由用户本人确认，agent 不能代答。signal 中止时对话框会自动关掉，结果是 cancel */
export async function confirmCloseBrowser(browser: string, appBound: boolean, signal: AbortSignal): Promise<CloseChoice> {
  const { response } = await showDialog({
    type: 'warning',
    message: t('dialogs.closeBrowserMessage', { browser }),
    detail: [
      t('dialogs.closeBrowserRequest', { browser }),
      t('dialogs.closeBrowserRisk', { browser }),
      t(appBound ? 'dialogs.closeBrowserAppBound' : 'dialogs.closeBrowserUnknown', { browser })
    ].join('\n'),
    buttons: [t('dialogs.closeBrowserConfirm', { browser }), t('dialogs.useQrInstead'), t('dialogs.cancel')],
    defaultId: 2,
    cancelId: 2,
    noLink: true,
    signal
  })
  return (['close', 'qr', 'cancel'] as const)[response]
}

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    // 退出码不可靠：浏览器的后台进程没有窗口时，不带 /F 的 taskkill 也会报错。以 Cookie 文件是否释放为准
    execFile(file, args, { windowsHide: true, timeout: COMMAND_TIMEOUT }, (_err, stdout) => resolve(String(stdout ?? '')))
  })
}

async function findPids(key: string): Promise<string[]> {
  const { name, path } = EXECUTABLES[key]
  const script = `Get-CimInstance Win32_Process -Filter "Name='${name}'" | Where-Object { $_.ExecutablePath -like '${path}' } | ForEach-Object { $_.ProcessId }`
  const out = await run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodeCommand(script)])
  return out.match(/\d+/g) ?? []
}

const pidArgs = (pids: string[]): string[] => pids.flatMap((pid) => ['/PID', pid])

/** 等到文件释放；流程被取消时不再等 */
async function waitReleased(isLocked: () => boolean, alive: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms
  for (;;) {
    if (!alive()) return false
    if (!isLocked()) return true
    if (Date.now() >= deadline) return false
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
}

/**
 * 先让浏览器自己退出（保存会话），等不到再强制结束：Edge、Chrome 常留着没有窗口的后台进程，它们不响应普通的关闭。
 * alive 返回 false 表示流程被取消（用户已登录、应用要退出），不再往下走
 */
export async function closeBrowser(key: string, isLocked: () => boolean, alive: () => boolean): Promise<boolean> {
  const pids = await findPids(key)
  if (!alive()) return false
  if (pids.length) await run(TASKKILL, pidArgs(pids))
  if (await waitReleased(isLocked, alive, GRACE_MS)) return true
  if (!alive()) return false
  const rest = await findPids(key)
  if (!alive()) return false
  if (rest.length) await run(TASKKILL, ['/F', '/T', ...pidArgs(rest)])
  return waitReleased(isLocked, alive, FORCE_MS)
}
