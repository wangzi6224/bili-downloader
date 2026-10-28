// 下载 x64 / arm64 两个架构的静态 ffmpeg 到 resources/ffmpeg/<arch>/，打包时按架构放进 app
// x64：https://github.com/eugeneware/ffmpeg-static/releases（evermeet.cx 构建，GPLv3；上游未提供校验值，这里固定首次下载的 sha256）
// arm64：https://ffmpeg.martin-riedl.de（GPLv3；ffmpeg-static 的 arm64 带 --enable-nonfree，不可再分发，所以不用它）
//        固定的 sha256 与该构建旁边发布的 ffmpeg.zip.sha256 一致
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const STATIC_BASE = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1'
const FFMPEG_SRC = 'https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.0.2'
const SOURCES = {
  arm64: {
    version: '9.0.2',
    url: 'https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2/ffmpeg.zip',
    sha256: 'c8ed4c4e6978a03c485edbfe4e0a5dc2380f8a30bba5150531b31b094492d924',
    // 构建方只发布二进制，许可证取同版本 FFmpeg 源码里的 LICENSE.md 和 GPLv3 全文，并写明对应源码在哪
    notice: [
      'FFmpeg 9.0.2 static build for macOS arm64 by Martin Riedl (https://ffmpeg.martin-riedl.de),',
      'configured with --enable-gpl --enable-version3: licensed under the GNU GPL version 3 or later.',
      'FFmpeg source: https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz',
      'Build script and library versions: https://git.martin-riedl.de/ffmpeg/build-script',
      ''
    ].join('\n'),
    license: [`${FFMPEG_SRC}/LICENSE.md`, `${FFMPEG_SRC}/COPYING.GPLv3`]
  },
  x64: {
    version: '6.1.1',
    url: `${STATIC_BASE}/ffmpeg-darwin-x64.gz`,
    sha256: '929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106',
    license: [`${STATIC_BASE}/darwin-x64.LICENSE`]
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'ffmpeg')

async function download(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

for (const [arch, src] of Object.entries(SOURCES)) {
  const dir = join(root, arch)
  const bin = join(dir, 'ffmpeg')
  const stamp = join(dir, '.sha256')
  if (existsSync(bin) && existsSync(stamp) && readFileSync(stamp, 'utf8') === src.sha256) {
    console.log(`ffmpeg ${arch}: 已是 ${src.version}，跳过`)
    continue
  }
  console.log(`ffmpeg ${arch}: 下载 ${src.version}…`)
  const archive = await download(src.url)
  const actual = createHash('sha256').update(archive).digest('hex')
  if (actual !== src.sha256) throw new Error(`ffmpeg ${arch} 校验失败：期望 ${src.sha256}，实际 ${actual}`)
  mkdirSync(dir, { recursive: true })
  if (src.url.endsWith('.zip')) {
    const zip = join(dir, 'ffmpeg.zip')
    writeFileSync(zip, archive)
    execFileSync('unzip', ['-o', '-q', zip, 'ffmpeg', '-d', dir])
    rmSync(zip)
  } else {
    writeFileSync(bin, gunzipSync(archive))
  }
  chmodSync(bin, 0o755)
  const licenses = await Promise.all(src.license.map(download))
  writeFileSync(join(dir, 'LICENSE'), [src.notice, ...licenses.map(String)].filter(Boolean).join('\n'))
  writeFileSync(stamp, src.sha256)
  console.log(`ffmpeg ${arch}: 完成`)
}
