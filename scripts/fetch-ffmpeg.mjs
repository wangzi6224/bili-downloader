// 下载 x64 / arm64 两个架构的静态 ffmpeg 到 resources/ffmpeg/<arch>/，打包时按架构放进 app
// 来源：https://github.com/eugeneware/ffmpeg-static/releases（上游未提供校验值，这里固定首次下载的 sha256）
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const TAG = 'b6.1.1'
const BASE = `https://github.com/eugeneware/ffmpeg-static/releases/download/${TAG}`
const GZ_SHA256 = {
  arm64: '8923876afa8db5585022d7860ec7e589af192f441c56793971276d450ed3bbfa',
  x64: '929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106'
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'ffmpeg')

async function download(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

for (const [arch, sha] of Object.entries(GZ_SHA256)) {
  const dir = join(root, arch)
  const bin = join(dir, 'ffmpeg')
  const stamp = join(dir, '.sha256')
  if (existsSync(bin) && existsSync(stamp) && readFileSync(stamp, 'utf8') === sha) {
    console.log(`ffmpeg ${arch}: 已是 ${TAG}，跳过`)
    continue
  }
  console.log(`ffmpeg ${arch}: 下载 ${TAG}…`)
  const gz = await download(`${BASE}/ffmpeg-darwin-${arch}.gz`)
  const actual = createHash('sha256').update(gz).digest('hex')
  if (actual !== sha) throw new Error(`ffmpeg ${arch} 校验失败：期望 ${sha}，实际 ${actual}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(bin, gunzipSync(gz))
  chmodSync(bin, 0o755)
  writeFileSync(join(dir, 'LICENSE'), await download(`${BASE}/darwin-${arch}.LICENSE`))
  writeFileSync(stamp, sha)
  console.log(`ffmpeg ${arch}: 完成`)
}
