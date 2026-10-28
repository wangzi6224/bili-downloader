import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { format } from 'node:util'
import { app } from 'electron'

const MAX_BYTES = 5 * 1024 * 1024

export const logDir = (): string => join(app.getPath('userData'), 'logs')

/** 把主进程的 console 输出同时写进 logs/main.log，超过 5MB 轮转一次 */
export function initLogger(): void {
  const dir = logDir()
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'main.log')

  const write = (level: string, args: unknown[]): void => {
    try {
      if (existsSync(file) && statSync(file).size > MAX_BYTES) renameSync(file, join(dir, 'main.old.log'))
      appendFileSync(file, `${new Date().toISOString()} [${level}] ${format(...args)}\n`)
    } catch {
      // 日志写不进去不能影响应用本身
    }
  }

  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      original(...args)
      write(level, args)
    }
  }

  process.on('uncaughtException', (e) => console.error('uncaughtException', e))
  process.on('unhandledRejection', (e) => console.error('unhandledRejection', e))
  console.info(`启动 ${app.getName()} ${app.getVersion()}（${process.arch}，Electron ${process.versions.electron}）`)
}
