// 下载当前系统用的静态 ffmpeg 到 resources/ffmpeg/<系统>-<架构>/，打包时按系统和架构放进 app（mac 上下两个架构）
// darwin-x64：https://github.com/eugeneware/ffmpeg-static/releases（evermeet.cx 构建，GPLv3；上游未提供校验值，这里固定首次下载的 sha256）
// darwin-arm64：https://ffmpeg.martin-riedl.de（GPLv3；ffmpeg-static 的 arm64 带 --enable-nonfree，不可再分发，所以不用它）
//        固定的 sha256 与该构建旁边发布的 ffmpeg.zip.sha256 一致
// linux-x64：同样来自 ffmpeg-static（johnvansickle.com 构建，GPLv3，完全静态链接）；固定首次下载的 sha256。
//        martin-riedl 的 Linux 构建带 --enable-nonfree，不用它
// win32-x64：ffmpeg-static 的 Gyan essentials 构建（GPLv3），固定首次下载的 sha256。
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { binaryName, isUpToDate, licenseText, verifySha256 } from './lib/ffmpeg.mjs'

const STATIC_BASE = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1'
const FFMPEG_SRC = 'https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.0.2'
const SOURCES = {
  'darwin-arm64': {
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
  'darwin-x64': {
    version: '6.1.1',
    url: `${STATIC_BASE}/ffmpeg-darwin-x64.gz`,
    sha256: '929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106',
    license: [`${STATIC_BASE}/darwin-x64.LICENSE`]
  },
  'linux-x64': {
    // ffmpeg-static 的 b6.1.1 只是发布批次，这个二进制自报的版本是 7.0.2
    version: '7.0.2',
    url: `${STATIC_BASE}/ffmpeg-linux-x64.gz`,
    sha256: 'bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa',
    notice: [
      'FFmpeg 7.0.2 static build for Linux x64 by John Van Sickle (https://johnvansickle.com/ffmpeg/),',
      'redistributed by ffmpeg-static (https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1),',
      'configured with --enable-gpl --enable-version3: licensed under the GNU GPL version 3.',
      'FFmpeg source: https://ffmpeg.org/releases/ffmpeg-7.0.2.tar.xz',
      ''
    ].join('\n'),
    license: [`${STATIC_BASE}/linux-x64.LICENSE`]
  },
  'win32-x64': {
    version: '6.1.1',
    url: `${STATIC_BASE}/ffmpeg-win32-x64.gz`,
    sha256: '8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77',
    notice: [
      'FFmpeg 6.1.1 static Windows x64 essentials build by Gyan (https://www.gyan.dev/ffmpeg/builds/),',
      'configured with GPL v3; source: https://github.com/FFmpeg/FFmpeg/commit/e38092ef93',
      ''
    ].join('\n'),
    license: [`${STATIC_BASE}/win32-x64.LICENSE`]
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'ffmpeg')

async function download(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

const targets = Object.entries(SOURCES).filter(([target]) => target.startsWith(`${process.platform}-`))
if (!targets.length) throw new Error(`没有 ${process.platform} 用的 ffmpeg`)

for (const [target, src] of targets) {
  const dir = join(root, target)
  const bin = join(dir, binaryName(process.platform))
  if (isUpToDate(dir, src.sha256, binaryName(process.platform))) {
    console.log(`ffmpeg ${target}: 已是 ${src.version}，跳过`)
    continue
  }
  console.log(`ffmpeg ${target}: 下载 ${src.version}…`)
  const archive = await download(src.url)
  verifySha256(archive, src.sha256, `ffmpeg ${target}`)
  mkdirSync(dir, { recursive: true })
  if (src.url.endsWith('.zip')) {
    const zip = join(dir, 'ffmpeg.zip')
    writeFileSync(zip, archive)
    execFileSync('unzip', ['-o', '-q', zip, 'ffmpeg', '-d', dir])
    rmSync(zip)
  } else {
    writeFileSync(bin, gunzipSync(archive))
  }
  if (process.platform !== 'win32') chmodSync(bin, 0o755)
  const licenses = await Promise.all(src.license.map(download))
  writeFileSync(join(dir, 'LICENSE'), licenseText(src.notice, licenses))
  writeFileSync(join(dir, '.sha256'), src.sha256)
  console.log(`ffmpeg ${target}: 完成`)
}
