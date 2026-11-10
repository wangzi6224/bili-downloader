import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runAppReleasePreflight } from './lib/release-preflight.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

try {
  const { buildScript } = runAppReleasePreflight({
    platform: process.platform,
    cwd: root,
    nodePath: process.execPath,
    npmExecPath: process.env.npm_execpath,
    runCommand(command, args, options) {
      console.log(`\n$ ${[command, ...args].join(' ')}`)
      const result = spawnSync(command, args, { ...options, stdio: 'inherit' })
      if (result.error) return { status: null, error: result.error }
      return { status: result.status }
    }
  })
  console.log(`\n✓ 本机预检通过：${buildScript}。现在可以按发布流程提交并推送 tag。`)
} catch (error) {
  console.error(`\n✗ 本机预检未通过：${error.message}`)
  process.exitCode = 1
}
