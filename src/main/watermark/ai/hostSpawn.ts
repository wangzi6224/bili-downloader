// 在 Electron 里用 utilityProcess 启动推理子进程：独立进程，崩溃或卡死不影响主进程，随时可以结束
import { join } from 'node:path'
import { utilityProcess } from 'electron'
import { t } from '@shared/i18n'
import type { HostReply } from './hostCore'
import type { HostChannel } from './pool'

export function spawnHost(): HostChannel {
  const child = utilityProcess.fork(join(__dirname, 'refineHost.js'), [], { serviceName: t('wm.hostServiceName'), stdio: 'ignore' })
  let exited = false
  child.on('exit', () => (exited = true))
  return {
    send: (m) => {
      if (!exited) child.postMessage(m)
    },
    onMessage: (cb) => child.on('message', (m: HostReply) => cb(m)),
    onExit: (cb) => child.on('exit', (code) => cb(code)),
    kill: () => {
      if (!exited) child.kill()
    }
  }
}
