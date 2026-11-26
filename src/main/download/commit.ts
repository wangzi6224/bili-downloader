// 多文件作品落盘：先复制到下载目录里的暂存目录（临时目录可能在另一个盘上），全部成功后整个目录改名
import { mkdirSync, renameSync } from 'node:fs'
import { copyFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { AbortError, toDiskError } from './errors'

/**
 * 把 files 放进 dir（dir 还不存在）。staging 是同一目录下的暂存目录，中途失败或取消时由调用方删掉。
 * 返回成品路径，顺序同 files
 */
export async function commitFiles(
  files: { path: string; name: string }[],
  dir: string,
  staging: string,
  signal: AbortSignal
): Promise<string[]> {
  try {
    mkdirSync(staging, { recursive: true })
    for (const file of files) {
      if (signal.aborted) throw new AbortError()
      await copyFile(file.path, join(staging, basename(file.name)))
    }
    if (signal.aborted) throw new AbortError()
    renameSync(staging, dir)
  } catch (e) {
    throw e instanceof AbortError ? e : toDiskError(e, dir)
  }
  return files.map((file) => join(dir, basename(file.name)))
}
