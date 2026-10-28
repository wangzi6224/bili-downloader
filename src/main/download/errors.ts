import { BiliError, isTransient } from '../bili/http'

/** 网络类错误：断连、超时、CDN 返回异常，值得自动重试 */
export class DownloadError extends Error {}

/** 磁盘类错误：空间不足、无权限、目录不可用，重试没有意义 */
export class DiskError extends Error {}

/** ffmpeg 合并失败 */
export class FfmpegError extends Error {}

export class AbortError extends Error {
  constructor() {
    super('aborted')
    this.name = 'AbortError'
  }
}

/** 把文件系统错误翻译成用户看得懂的话 */
export function toDiskError(e: unknown, path?: string): DiskError {
  const code = (e as { code?: string }).code
  const where = path ? `：${path}` : ''
  switch (code) {
    case 'ENOSPC':
      return new DiskError('磁盘空间不足')
    case 'EACCES':
    case 'EPERM':
      return new DiskError(`没有写入权限${where}`)
    case 'EROFS':
      return new DiskError(`目标磁盘是只读的${where}`)
    case 'ENOENT':
      return new DiskError(`下载目录不存在或外接磁盘已断开${where}`)
    default:
      return new DiskError(`写入文件失败（${code ?? (e as Error).message}）${where}`)
  }
}

export function isRetryable(e: unknown): boolean {
  if (e instanceof DiskError || e instanceof FfmpegError || e instanceof AbortError) return false
  if (e instanceof DownloadError) return true
  // 接口返回的业务错误（如视频不存在）不重试，网络失败、412、5xx 重试
  if (e instanceof BiliError) return isTransient(e)
  // fetch 本身失败（DNS、连接被重置等）
  return e instanceof TypeError
}

/** 第 n 次（从 0 开始）自动重试前的等待时间：30 秒起翻倍，最长 5 分钟 */
export const retryDelay = (n: number): number => Math.min(30_000 * 2 ** n, 300_000)
