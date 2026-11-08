// 打包前检查 resources/ffmpeg/<系统>-<架构>/ 里随包的 ffmpeg 能不能去水印（见 scripts/lib/ffmpeg.mjs 的 checkFfmpeg）。
// Windows、Linux 的二进制开发机上通常没有，靠发布流程在各系统上跑这一步。
// 和当前机器架构不同的二进制（例如 Apple 芯片上的 x64）启动不了时只提示，不算失败
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { binaryName, checkFfmpeg } from './lib/ffmpeg.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'ffmpeg')
const dirs = existsSync(root) ? readdirSync(root).filter((d) => d.startsWith(`${process.platform}-`)) : []
if (!dirs.length) throw new Error(`没有 ${process.platform} 用的 ffmpeg，先运行 npm run fetch-ffmpeg`)

let failed = false
for (const target of dirs) {
  const bin = join(root, target, binaryName(process.platform))
  const run = (args) => {
    const r = spawnSync(bin, args, { maxBuffer: 64 << 20 })
    return { status: r.status, stdout: r.stdout ?? Buffer.alloc(0), stderr: String(r.stderr ?? ''), error: r.error }
  }
  const { errors, warnings, hw } = checkFfmpeg(run)
  const native = target === `${process.platform}-${process.arch}`
  if (errors.length && !native && errors[0].startsWith('启动失败')) {
    console.warn(`ffmpeg ${target}: 当前机器上启动不了，跳过检查（${errors[0]}）`)
    continue
  }
  for (const w of warnings) console.warn(`ffmpeg ${target}: ${w}`)
  if (errors.length) {
    failed = true
    for (const e of errors) console.error(`ffmpeg ${target}: ${e}`)
  } else {
    console.log(`ffmpeg ${target}: 去水印需要的功能都在${hw.length ? `，硬件编码器：${hw.join('、')}` : '，没有硬件编码器'}`)
  }
}
if (failed) process.exit(1)
