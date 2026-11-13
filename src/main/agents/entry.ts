import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeTextAtomic } from '../store'
import type { StdioEntry } from './configFile'

/**
 * agent 启动桥接进程的方式：用应用自己的可执行文件当 Node 跑 bridge.js（ELECTRON_RUN_AS_NODE），
 * 不依赖用户装没装 Node。--app 是桥接进程在应用没开时要拉起的东西。
 */
export interface EntryInput {
  platform: NodeJS.Platform
  /** process.execPath */
  execPath: string
  /** Linux AppImage 的路径（process.env.APPIMAGE）：execPath 在临时挂载目录里，每次启动都不一样 */
  appImage?: string
  /** 桥接脚本：用 installBridge 复制到数据目录里的那份 */
  bridge: string
  userData: string
  /** 拉起应用时额外带的参数：开发版的项目目录、自定义的 --user-data-dir */
  appArgs?: string[]
}

export function bridgeEntry({ platform, execPath, appImage, bridge, userData, appArgs = [] }: EntryInput): StdioEntry {
  const command = platform === 'linux' && appImage ? appImage : execPath
  // macOS 上要用 open 打开整个 .app，直接运行里面的可执行文件不会走正常的启动流程
  const bundle = platform === 'darwin' ? /^(.*?\.app)\//.exec(execPath)?.[1] : undefined
  const app = bundle ?? command
  return {
    command,
    args: [bridge, '--user-data', userData, '--app', app, ...appArgs.flatMap((a) => ['--app-arg', a])],
    env: { ELECTRON_RUN_AS_NODE: '1' }
  }
}

/**
 * 把桥接脚本复制到数据目录，agent 的配置里写这个固定的路径：
 * Linux AppImage 运行时挂载在每次都不一样的临时目录，应用退出后里面的 bridge.js 就找不到了；
 * 每次启动都核对一遍，应用升级后跟着更新
 */
export function installBridge(source: string, dir: string): string {
  const dest = join(dir, 'mcp-bridge.js')
  const code = readFileSync(source, 'utf8')
  let current: string | undefined
  try {
    current = readFileSync(dest, 'utf8')
  } catch {
    // 第一次
  }
  if (current !== code) writeTextAtomic(dest, code)
  return dest
}
