// release.mjs 用到的纯逻辑，单独放出来方便测试
import { createHash } from 'node:crypto'

const MAC = { os: 'macOS', script: 'build:mac' }
const LINUX = { os: 'Linux', script: 'build:linux' }
const WINDOWS = { os: 'Windows', script: 'build:win' }

/**
 * 每个 Release 上传的安装包。updateKey 是它在 update.json 里的键（应用按 src/main/update/manifest.ts 的 assetKey 取），
 * 没有 updateKey 的只给用户手动下载；build 是在哪个系统上用哪个命令打出来的。
 * Linux 包的架构名是 electron-builder 起的：AppImage 用 x86_64，deb 用 amd64
 */
export const PACKAGES = [
  { arch: 'arm64', ext: 'zip', updateKey: 'arm64', build: MAC },
  { arch: 'arm64', ext: 'dmg', build: MAC },
  { arch: 'x64', ext: 'zip', updateKey: 'x64', build: MAC },
  { arch: 'x64', ext: 'dmg', build: MAC },
  { arch: 'x86_64', ext: 'AppImage', updateKey: 'linux-x64', build: LINUX },
  { arch: 'amd64', ext: 'deb', build: LINUX },
  { arch: 'x64', ext: 'exe', updateKey: 'win32-x64', build: WINDOWS }
]
/** update.json 里最多带几个版本的说明，跳过了多个版本的用户能看到中间的变化 */
export const MAX_NOTES = 30

/** CHANGELOG.md 里每个 “## 版本号 - 日期” 是一段，其他二级标题（例如“未发布”）不算 */
export function parseChangelog(text) {
  const notes = []
  let cur
  for (const line of text.split('\n')) {
    const m = /^##\s+v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*(?:[-–—]\s*(\S+))?\s*$/.exec(line)
    if (m) notes.push((cur = { version: m[1], date: m[2] ?? '', lines: [] }))
    else if (/^##?\s/.test(line)) cur = undefined
    else cur?.lines.push(line)
  }
  return notes.map(({ lines, ...n }) => ({ ...n, body: lines.join('\n').trim() }))
}

/** 安装包文件名，和 electron-builder.yml 里的 artifactName 一致 */
export const assetName = (version, arch, ext) => `bili-downloader-${version}-${arch}.${ext}`

/** 预发布版本（如 1.0.0-beta.1）不会被 releases/latest 选中，正式版用户收不到 */
export const isPrerelease = (version) => version.includes('-')

/** update.json 里一个安装包：下载地址、sha512（base64，应用下载后按它校验）和大小 */
export function manifestAsset(repo, version, name, data) {
  return {
    url: `https://github.com/${repo}/releases/download/v${version}/${encodeURIComponent(name)}`,
    sha512: createHash('sha512').update(data).digest('base64'),
    size: data.length
  }
}

/** update.json 的内容，应用里由 src/main/update/manifest.ts 的 parseManifest 校验 */
export function buildManifest({ repo, version, date, notes, files }) {
  return { version, date, page: `https://github.com/${repo}/releases/tag/v${version}`, notes, files }
}
