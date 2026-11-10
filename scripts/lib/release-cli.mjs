export function releaseExists(tag, { offline = false, runCommand } = {}) {
  if (offline) return false
  if (typeof runCommand !== 'function') throw new TypeError('runCommand 必须是函数')
  return runCommand('gh', ['release', 'view', tag], { stdio: 'ignore' })?.status === 0
}

export function assertReleaseMode({ offline = false, checkOnly = false, dryRun = false } = {}) {
  if (offline && !checkOnly && !dryRun) {
    throw new Error('--offline 只允许与 --check 或 --dry-run 一起使用')
  }
}

export function createGithubRelease({ tag, head, notesFile, prerelease = false, assets, manifestFile, cwd, runCommand }) {
  if (typeof runCommand !== 'function') throw new TypeError('runCommand 必须是函数')
  const args = [
    'release', 'create', tag,
    '--target', head,
    '--title', tag,
    '--notes-file', notesFile,
    ...(prerelease ? ['--prerelease'] : []),
    ...assets,
    manifestFile
  ]
  const result = runCommand('gh', args, { cwd, stdio: 'inherit' })
  if (result?.status !== 0) {
    const detail = result?.error?.message || (result?.status == null ? '命令未能启动' : `退出码 ${result.status}`)
    throw new Error(`gh release create 失败：${detail}`)
  }
  return args
}
