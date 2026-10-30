// npm run build:mac 打完包后运行：把 dist/ 里当前版本的 dmg 改成 LZMA 压缩（见 lib/dmg.mjs），zip 不动（应用内更新用 ditto 解压）
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compressDmg } from './lib/dmg.mjs'
import { PACKAGES, assetName } from './lib/release.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const mb = (file) => `${(statSync(file).size / 1048576).toFixed(1)} MB`

for (const { arch, ext } of PACKAGES.filter((p) => p.ext === 'dmg')) {
  const file = join(root, 'dist', assetName(version, arch, ext))
  if (!existsSync(file)) throw new Error(`找不到 ${file}，先运行 electron-builder --mac`)
  const before = mb(file)
  if (compressDmg(file)) console.log(`${basename(file)}：${before} → ${mb(file)}`)
  else console.log(`${basename(file)}：已经是 LZMA 压缩，跳过`)
}
