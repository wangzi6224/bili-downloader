import { app, powerMonitor } from 'electron'
import { hideMainWindow, showDialog } from './windows'

/** 这次退出已经确认过 */
let confirmed = false
/** 询问弹窗还开着，再按 ⌘Q 不重复弹 */
let asking = false

// 关机、注销时不拦，免得弹窗卡住系统关机
void app.whenReady().then(() =>
  powerMonitor.on('shutdown', () => {
    confirmed = true
  })
)

/** 界面里已经提醒过的退出（关闭窗口询问里的“完全退出”、安装更新）直接放行 */
export function quitConfirmed(): void {
  confirmed = true
  app.quit()
}

/** 在 before-quit 里调用：还有未完成的任务就拦下这次退出并弹窗询问，返回是否放行 */
export function allowQuit(e: Electron.Event, pending: number): boolean {
  if (confirmed || pending === 0) return true
  e.preventDefault()
  if (!asking) {
    asking = true
    void ask(pending).finally(() => {
      asking = false
    })
  }
  return false
}

async function ask(pending: number): Promise<void> {
  const { response } = await showDialog({
    type: 'warning',
    message: `还有 ${pending} 个任务没下载完，确定要退出吗？`,
    detail: '退出后这些任务会暂停，下次打开后点“全部继续”就能接着下载，已下载的部分不会丢。',
    buttons: ['后台运行', '退出', '取消'],
    defaultId: 0,
    cancelId: 2
  })
  if (response === 0) hideMainWindow()
  else if (response === 1) quitConfirmed()
}
