// compress-dmg.mjs 用到的逻辑，单独放出来方便测试（只能在 macOS 上运行，用的是系统自带的 hdiutil）
import { execFileSync } from 'node:child_process'
import { renameSync, rmSync } from 'node:fs'

/** dmg 的格式，例如 UDZO（zlib）、ULMO（LZMA） */
export function dmgFormat(file) {
  // imageinfo 会在 stderr 打印“已弃用”的提示，不影响结果
  const plist = execFileSync('hdiutil', ['imageinfo', '-plist', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const format = /<key>Format<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1]
  if (!format) throw new Error(`读不出 ${file} 的格式`)
  return format
}

/**
 * 把 dmg 改成 LZMA 压缩（ULMO）：比 electron-builder 打出的 zlib 压缩（UDZO）小约四分之一，
 * macOS 10.15 起才能打开（应用本身要求 macOS 12）。先转到临时文件并校验，成功了才替换原文件。
 * 已经是 ULMO 的不再转，返回 false
 */
export function compressDmg(file) {
  if (dmgFormat(file) === 'ULMO') return false
  const tmp = file.replace(/\.dmg$/, '.ulmo.dmg')
  rmSync(tmp, { force: true })
  try {
    execFileSync('hdiutil', ['convert', file, '-format', 'ULMO', '-o', tmp, '-quiet'])
    execFileSync('hdiutil', ['verify', tmp, '-quiet'], { stdio: 'ignore' })
    renameSync(tmp, file)
  } finally {
    rmSync(tmp, { force: true })
  }
  return true
}
