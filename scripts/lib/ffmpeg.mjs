// fetch-ffmpeg.mjs 用到的纯逻辑，单独放出来方便测试
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 目录里已经是这个校验值的 ffmpeg（下载完会写 .sha256 记录），不用再下载 */
export function isUpToDate(dir, sha256) {
  const stamp = join(dir, '.sha256')
  return existsSync(join(dir, 'ffmpeg')) && existsSync(stamp) && readFileSync(stamp, 'utf8') === sha256
}

/** 下载内容和固定的 sha256 不一致就抛错 */
export function verifySha256(data, sha256, label) {
  const actual = createHash('sha256').update(data).digest('hex')
  if (actual !== sha256) throw new Error(`${label} 校验失败：期望 ${sha256}，实际 ${actual}`)
}

/** 随 ffmpeg 一起打包的 LICENSE：构建方的说明（可能没有）在前，许可证原文在后 */
export const licenseText = (notice, licenses) => [notice, ...licenses.map(String)].filter(Boolean).join('\n')
