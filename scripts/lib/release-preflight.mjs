const BUILD_SCRIPTS = Object.freeze({
  darwin: 'build:mac',
  linux: 'build:linux',
  win32: 'build:win'
})

function checked(runCommand, command, args, label, options) {
  const result = runCommand(command, args, options)
  if (result?.status !== 0) {
    const detail = result?.error?.message || (result?.status == null ? '命令未能启动' : `退出码 ${result.status}`)
    throw new Error(`${label}失败：${detail}`)
  }
}

export function runAppReleasePreflight({ platform, runCommand, cwd, nodePath = process.execPath, npmExecPath }) {
  if (typeof runCommand !== 'function') throw new TypeError('runCommand 必须是函数')

  const buildScript = BUILD_SCRIPTS[platform]
  if (!buildScript) throw new Error(`不支持在 ${platform} 上构建桌面安装包`)

  checked(
    runCommand,
    nodePath,
    ['scripts/release.mjs', '--check', '--offline'],
    '版本与更新日志检查',
    { cwd }
  )

  const npm = npmExecPath
    ? { command: nodePath, args: [npmExecPath, 'run', buildScript] }
    : { command: 'npm', args: ['run', buildScript] }
  checked(runCommand, npm.command, npm.args, `${buildScript} 本机构建`, { cwd })

  return { platform, buildScript }
}
