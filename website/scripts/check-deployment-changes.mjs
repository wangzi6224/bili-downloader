import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertWebsiteChanged,
  listPageWorkflowRuns,
  resolveDeploymentBase
} from './lib/deployment-changes.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const repo = process.env.GITHUB_REPOSITORY || 'wangzi6224/bili-downloader'

try {
  const runCommand = (command, args, options) => {
    const result = spawnSync(command, args, { ...options, encoding: 'utf8' })
    if (result.error) return { status: null, error: result.error }
    return { status: result.status, stdout: result.stdout }
  }
  const listedRuns = listPageWorkflowRuns({ runCommand, cwd: repoRoot, repo })
  const runs = listedRuns.filter((run) => String(run.databaseId) !== process.env.GITHUB_RUN_ID)
  const deploymentBase = resolveDeploymentBase({ runs, runCommand, cwd: repoRoot, repo })
  assertWebsiteChanged({
    baseSha: deploymentBase.headSha,
    head: process.env.GITHUB_SHA || 'HEAD',
    runCommand,
    cwd: repoRoot
  })
  console.log(`✓ website/ 自上次 Pages 部署（${deploymentBase.headSha}，${deploymentBase.source}）以来有改动`)
} catch (error) {
  console.error(`✗ 官网部署检查失败：${error.message}`)
  process.exitCode = 1
}
