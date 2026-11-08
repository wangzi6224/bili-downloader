import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { readJsonArray, writeJson } from '../store'

/**
 * 应用崩溃（或被强制结束）时，正在转码的 ffmpeg 不会跟着退出，会在后台把整段视频转完才停，长视频要占很久 CPU。
 * 关掉它的标准输入也没用，只认 q。所以转码时把进程号和输出文件记到文件里，下次启动时结束还活着的。
 * 进程号可能已经被别的程序复用：只有命令行里带着记下的输出文件路径，才确认是我们的 ffmpeg
 */
export interface JobRecord {
  pid: number
  /** 输出文件路径，只有这次转码会用到，用来确认进程身份 */
  output: string
}

let file: string | undefined
const live = new Map<number, string>()

function save(): void {
  if (!file) return
  try {
    writeJson(file, [...live].map(([pid, output]) => ({ pid, output })))
  } catch (e) {
    console.warn('记录转码进程失败：', (e as Error).message)
  }
}

/** 读进程的命令行；进程不存在或读不到时返回 undefined */
export function commandLine(pid: number, platform: NodeJS.Platform = process.platform): string | undefined {
  try {
    process.kill(pid, 0)
  } catch {
    return undefined
  }
  try {
    // Linux 直接读 /proc，精简的系统里不一定装了 ps；参数之间用 \0 分隔
    if (platform === 'linux') return readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' ').trim() || undefined
    const out =
      platform === 'win32'
        ? execFileSync(
            'powershell.exe',
            [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              // 路径里常有中文：按 UTF-8 输出，不然按系统代码页解出来对不上
              `[Console]::OutputEncoding=[Text.Encoding]::UTF8; (Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`
            ],
            { encoding: 'utf8', timeout: 15_000, windowsHide: true }
          )
        : // macOS：-ww 不按终端宽度截断命令行
          execFileSync('ps', ['-ww', '-o', 'args=', '-p', String(pid)], { encoding: 'utf8', timeout: 5000 })
    return out.trim() || undefined
  } catch {
    return undefined
  }
}

/** 结束上次留下、还在运行的转码进程，返回结束了几个 */
export function killLeftovers(records: JobRecord[], readCmd: (pid: number) => string | undefined = commandLine): number {
  let n = 0
  for (const r of records) {
    if (!Number.isInteger(r?.pid) || r.pid <= 0 || typeof r.output !== 'string' || !r.output) continue
    if (!readCmd(r.pid)?.includes(r.output)) continue
    try {
      process.kill(r.pid, 'SIGKILL')
      n++
    } catch {
      // 刚好自己结束了
    }
  }
  return n
}

/** 启动时调用：结束上次崩溃留下的转码进程，之后的转码记在这个文件里 */
export function initOrphans(path: string): void {
  file = path
  const n = killLeftovers(readJsonArray<JobRecord>(path))
  if (n) console.warn(`结束了上次没退出的 ${n} 个转码进程`)
  live.clear()
  save()
}

/** 转码开始时登记，返回结束时调用的注销函数 */
export function trackJob(pid: number | undefined, output: string): () => void {
  if (!pid) return () => {}
  live.set(pid, output)
  save()
  return () => {
    live.delete(pid)
    save()
  }
}
