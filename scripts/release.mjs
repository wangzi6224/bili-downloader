// 发布新版本到 GitHub Releases：取 CHANGELOG.md 里当前版本的说明，生成 dist/update.json（应用内更新读这个文件），
// 再用 gh 创建 Release，上传两个架构的 zip（自动更新用）和 dmg（手动安装用）。
// 平时由 GitHub Actions 在推送 v版本号 的 tag 后运行（.github/workflows/release.yml）；也可以在本机 npm run release（检查、打包、发布）
// 参数：--check 只检查版本号、tag 和更新日志，不用先打包；--dry-run 只生成 update.json 不上传
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const dryRun = process.argv.includes('--dry-run')
const checkOnly = process.argv.includes('--check')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const tag = `v${version}`
/** 在 GitHub Actions 里由推送 tag 触发时，是推送的那个 tag */
const pushedTag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined
const ARCHS = ['arm64', 'x64']
/** update.json 里最多带几个版本的说明，跳过了多个版本的用户能看到中间的变化 */
const MAX_NOTES = 30

const sh = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8' }).trim()

function fail(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

/** CHANGELOG.md 里每个 “## 版本号 - 日期” 是一段，其他二级标题（例如“未发布”）不算 */
function readChangelog() {
  const notes = []
  let cur
  for (const line of readFileSync(join(root, 'CHANGELOG.md'), 'utf8').split('\n')) {
    const m = /^##\s+v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*(?:[-–—]\s*(\S+))?\s*$/.exec(line)
    if (m) notes.push((cur = { version: m[1], date: m[2] ?? '', lines: [] }))
    else if (/^##?\s/.test(line)) cur = undefined
    else cur?.lines.push(line)
  }
  return notes.map(({ lines, ...n }) => ({ ...n, body: lines.join('\n').trim() }))
}

const notes = readChangelog().slice(0, MAX_NOTES)
const current = notes.find((n) => n.version === version)
if (!current?.body) fail(`CHANGELOG.md 里没有 ${version} 的说明，先加上一段 “## ${version} - YYYY-MM-DD”`)
if (pushedTag && pushedTag !== tag) fail(`推送的 tag ${pushedTag} 和 package.json 里的版本 ${version} 不一致`)
if (!dryRun && spawnSync('gh', ['release', 'view', tag], { cwd: root, stdio: 'ignore' }).status === 0) {
  fail(`${tag} 已经发布过了，先改 package.json 里的版本号`)
}
if (checkOnly) {
  console.log(`✓ ${tag} 可以发布`)
  process.exit(0)
}

const repo = process.env.GITHUB_REPOSITORY || sh('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'])
const base = `https://github.com/${repo}/releases/download/${tag}`

const assets = []
const files = {}
for (const arch of ARCHS) {
  for (const ext of ['zip', 'dmg']) {
    const name = `bili-downloader-${version}-${arch}.${ext}`
    const file = join(dist, name)
    if (!existsSync(file)) fail(`找不到 dist/${name}，先运行 npm run build:mac`)
    assets.push(file)
    if (ext === 'zip') {
      const sha512 = createHash('sha512').update(readFileSync(file)).digest('base64')
      files[arch] = { url: `${base}/${encodeURIComponent(name)}`, sha512, size: statSync(file).size }
    }
  }
}

const manifest = {
  version,
  date: new Date().toISOString(),
  page: `https://github.com/${repo}/releases/tag/${tag}`,
  notes,
  files
}
const manifestFile = join(dist, 'update.json')
const notesFile = join(dist, 'release-notes.md')
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2))
writeFileSync(notesFile, `${current.body}\n`)
console.log(`已生成 dist/update.json（${version}，${notes.length} 个版本的说明）`)
if (dryRun) process.exit(0)

if (sh('git', ['status', '--porcelain'])) fail('还有未提交的修改，先提交再发布')
const head = sh('git', ['rev-parse', 'HEAD'])
// Actions 里检出的就是已推送的 tag，而且只拉了这一个提交，查不到远端分支
if (!pushedTag && !sh('git', ['branch', '-r', '--contains', head])) fail('当前提交还没有推送到 GitHub，先 git push')

// 预发布版本（如 1.0.0-beta.1）不会被 releases/latest 选中，正式版用户收不到
const pre = version.includes('-') ? ['--prerelease'] : []
execFileSync(
  'gh',
  ['release', 'create', tag, '--target', head, '--title', tag, '--notes-file', notesFile, ...pre, ...assets, manifestFile],
  { cwd: root, stdio: 'inherit' }
)
console.log(`✓ 已发布 ${tag}：${manifest.page}`)
