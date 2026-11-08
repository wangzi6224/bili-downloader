// fetch-ffmpeg.mjs 用到的纯逻辑，单独放出来方便测试
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 各系统随包二进制的文件名 */
export const binaryName = (platform) => (platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')

/** 目录里已经是这个校验值的 ffmpeg（下载完会写 .sha256 记录），不用再下载 */
export function isUpToDate(dir, sha256, binary = 'ffmpeg') {
  const stamp = join(dir, '.sha256')
  return existsSync(join(dir, binary)) && existsSync(stamp) && readFileSync(stamp, 'utf8') === sha256
}

/** 下载内容和固定的 sha256 不一致就抛错 */
export function verifySha256(data, sha256, label) {
  const actual = createHash('sha256').update(data).digest('hex')
  if (actual !== sha256) throw new Error(`${label} 校验失败：期望 ${sha256}，实际 ${actual}`)
}

/** 随 ffmpeg 一起打包的 LICENSE：构建方的说明（可能没有）在前，许可证原文在后 */
export const licenseText = (notice, licenses) => [notice, ...licenses.map(String)].filter(Boolean).join('\n')

/** 去水印用到的硬件编码器，只是列出来看看：CI 上没有显卡，能不能用要到用户机器上试编码才知道 */
const HW_ENCODERS = /\b(h264|hevc)_(videotoolbox|nvenc|qsv|amf)\b/g

/**
 * 检查随包的 ffmpeg 能不能支撑去水印：delogo 滤镜、libx264 编码、抽 JPEG 预览帧、抽灰度帧识别水印。
 * run(args) 同步运行 ffmpeg，返回 { status, stdout: Buffer, stderr: string, error }。
 * 返回 errors（缺了就不能打包）、warnings（个别情况受影响）和编进去的硬件编码器
 */
export function checkFfmpeg(run) {
  const errors = []
  const warnings = []
  const quiet = ['-hide_banner', '-loglevel', 'error', '-nostdin']
  const src = ['-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=25:d=1']
  const filters = run(['-hide_banner', '-filters'])
  if (filters.error) return { errors: [`启动失败：${filters.error.message}`], warnings, hw: [] }
  if (!/\bdelogo\b/.test(String(filters.stdout))) errors.push('没有 delogo 滤镜')

  const enc = run([...quiet, ...src, '-vf', 'delogo=x=10:y=10:w=60:h=20', '-c:v', 'libx264', '-f', 'null', '-'])
  if (enc.status !== 0) errors.push(`delogo + libx264 编码失败：${enc.stderr.trim().split('\n').pop()}`)

  const jpeg = run([...quiet, ...src, '-frames:v', '1', '-c:v', 'mjpeg', '-q:v', '4', '-f', 'image2pipe', 'pipe:1'])
  if (jpeg.status !== 0 || jpeg.stdout[0] !== 0xff || jpeg.stdout[1] !== 0xd8) errors.push('抽不出 JPEG 预览帧')

  const gray = run([...quiet, ...src, '-frames:v', '1', '-vf', 'scale=64:36,format=gray', '-f', 'rawvideo', 'pipe:1'])
  if (gray.status !== 0 || gray.stdout.length !== 64 * 36) errors.push('抽不出灰度帧')

  const decoders = String(run(['-hide_banner', '-decoders']).stdout)
  if (!/\b(libdav1d|av1)\b/.test(decoders)) warnings.push('不能解码 AV1，AV1 视频没法去水印')

  const encoders = String(run(['-hide_banner', '-encoders']).stdout)
  return { errors, warnings, hw: [...new Set(encoders.match(HW_ENCODERS) ?? [])] }
}
