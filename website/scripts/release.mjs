import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runWebsiteRelease } from './lib/release.mjs'

const website = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(website, '..')
const args = process.argv.slice(2)
const { version } = JSON.parse(readFileSync(resolve(website, 'package.json'), 'utf8'))

if (args.includes('--help')) {
  console.log('用法：npm run release [-- --publish --confirm-website-changes --confirm-separate-from-app]')
  console.log('默认只运行网站单元测试和静态构建；带齐三个参数后，构建通过才会检查并派发 Pages。')
  process.exit(0)
}

try {
  const result = runWebsiteRelease({
    args,
    cwd: website,
    repoCwd: repoRoot,
    runCommand(command, commandArgs, options) {
      console.log(`\n$ ${[command, ...commandArgs].join(' ')}`)
      const executable = command === 'npm' && process.env.npm_execpath ? process.execPath : command
      const executableArgs = command === 'npm' && process.env.npm_execpath
        ? [process.env.npm_execpath, ...commandArgs]
        : commandArgs
      const child = spawnSync(executable, executableArgs, { ...options, encoding: 'utf8' })
      if (child.stdout) process.stdout.write(child.stdout)
      if (child.stderr) process.stderr.write(child.stderr)
      if (child.error) return { status: null, error: child.error }
      return { status: child.status, stdout: child.stdout }
    }
  })
  if (result.published) {
    console.log(`\n✓ 已派发官网 v${version} 独立部署：${result.head}`)
  } else {
    console.log(`\n✓ 官网 v${version} 测试与静态构建通过；未派发部署。`)
  }
} catch (error) {
  console.error(`\n✗ 网站发布预检未通过：${error.message}`)
  process.exitCode = 1
}
