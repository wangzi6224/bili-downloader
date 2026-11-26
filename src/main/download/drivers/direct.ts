// 直链下载：几个文件并行下到任务的临时目录，进度合在一起报
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { AbortError, DownloadError } from '../errors'
import { fetchFile } from '../fetchFile'
import type { DriverContext } from './types'

export interface DirectPart {
  /** 临时目录里的文件名 */
  name: string
  /** 主地址和备用地址 */
  urls: string[]
  /** 续传指纹：同一份内容保持不变，不要放会过期的签名地址 */
  fingerprint: string
  /** 拿到真实大小之前显示用的估算值 */
  estimate: number
}

export interface DirectOptions {
  headers: Record<string, string>
  /** 同时下几个文件；缺省全部一起 */
  concurrency?: number
  /** 分段下载失败后改用单连接再试一次（有的 CDN 会掐掉并发分段） */
  singleFallback?: boolean
}

/** 下完返回各文件在临时目录里的路径，顺序同 parts；已经下好的跳过 */
export async function fetchParts(parts: DirectPart[], ctx: DriverContext, o: DirectOptions): Promise<string[]> {
  mkdirSync(ctx.tmp, { recursive: true })
  const sizes = parts.map((p) => p.estimate)
  const done = parts.map(() => 0)
  const report = (): void => ctx.onProgress(done.reduce((a, b) => a + b, 0), sizes.reduce((a, b) => a + b, 0))
  const paths = parts.map((p) => join(ctx.tmp, p.name))

  const one = async (i: number): Promise<void> => {
    const part = parts[i]
    const dest = paths[i]
    if (!existsSync(dest)) {
      const run = (threads: number): Promise<void> =>
        fetchFile({
          urls: part.urls,
          dest,
          fingerprint: part.fingerprint,
          threads,
          headers: o.headers,
          signal: ctx.signal,
          onProgress: (d, total) => {
            done[i] = d
            if (total) sizes[i] = total
            report()
          }
        })
      const threads = ctx.settings().threads
      try {
        await run(threads)
      } catch (e) {
        if (!o.singleFallback || threads <= 1 || !(e instanceof DownloadError)) throw e
        if (ctx.signal.aborted) throw new AbortError()
        await run(1)
      }
    }
    done[i] = sizes[i] = statSync(dest).size
    report()
  }

  // 一个失败后不再开始新的；已经在下的让它们自己结束
  let next = 0
  let failed = false
  const worker = async (): Promise<void> => {
    while (!failed && next < parts.length) {
      try {
        await one(next++)
      } catch (e) {
        failed = true
        throw e
      }
    }
  }
  const workers = Math.max(1, Math.min(o.concurrency ?? parts.length, parts.length))
  await Promise.all(Array.from({ length: workers }, worker))
  return paths
}
