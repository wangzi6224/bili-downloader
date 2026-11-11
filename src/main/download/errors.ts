import { t } from '@shared/i18n'
import { BiliError, isTransient } from '../bili/http'

/** 网络类错误：断连、超时、CDN 返回异常，值得自动重试 */
export class DownloadError extends Error {}

/** 磁盘类错误：空间不足、无权限、目录不可用，重试没有意义 */
export class DiskError extends Error {}

/** ffmpeg 合并、转码失败；stderr 是 ffmpeg 原始输出的末尾，用来判断要不要换编码器重试 */
export class FfmpegError extends Error {
  stderr?: string
  constructor(message: string, stderr?: string) {
    super(message)
    this.stderr = stderr
  }
}

export class AbortError extends Error {
  constructor() {
    super('aborted')
    this.name = 'AbortError'
  }
}

/** 把文件系统错误翻译成用户看得懂的话 */
export function toDiskError(e: unknown, path?: string): DiskError {
  const code = (e as { code?: string }).code
  const where = path ? t('download.atPath', { path }) : ''
  switch (code) {
    case 'ENOSPC':
      return new DiskError(t('download.diskFull'))
    case 'EACCES':
    case 'EPERM':
      return new DiskError(t('download.noWritePermission', { where }))
    case 'EROFS':
      return new DiskError(t('download.readOnlyDisk', { where }))
    case 'ENOENT':
      return new DiskError(t('download.dirMissing', { where }))
    default:
      return new DiskError(t('download.writeFailed', { code: code ?? (e as Error).message, where }))
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
