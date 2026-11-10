import { resolve } from 'node:path'
import {
  assertWebsiteChanged,
  listPageWorkflowRuns,
  resolveDeploymentBase,
  REPOSITORY
} from './deployment-changes.mjs'

const ACTIVE_RUN_STATUSES = new Set(['queued', 'in_progress', 'waiting', 'requested', 'pending'])

function runChecked(runCommand, command, args, label, cwd) {
  const result = runCommand(command, args, { cwd })
  if (result?.status !== 0) {
    const detail = result?.error?.message || (result?.status == null ? '命令未能启动' : `退出码 ${result.status}`)
    throw new Error(`${label}失败：${detail}`)
  }
  return result.stdout ?? ''
}

export function runWebsiteRelease({ args = [], runCommand, cwd, repoCwd, repo = REPOSITORY }) {
  if (typeof runCommand !== 'function') throw new TypeError('runCommand 必须是函数')
  const gitCwd = repoCwd ?? (cwd ? resolve(cwd, '..') : undefined)

  const publish = args.includes('--publish')
  if (publish && !args.includes('--confirm-website-changes')) {
    throw new Error('发布前必须确认 website/ 自上次网页部署后有改动')
  }
  if (publish && !args.includes('--confirm-separate-from-app')) {
    throw new Error('发布前必须确认桌面应用发布流程已结束')
  }

  runChecked(runCommand, 'npm', ['test'], '网站单元测试', cwd)
  runChecked(runCommand, 'npm', ['run', 'build'], '网站静态构建', cwd)
  if (!publish) return { published: false }

  const branch = runChecked(runCommand, 'git', ['branch', '--show-current'], '检查当前分支', gitCwd).trim()
  if (branch !== 'main') throw new Error(`网页发布只允许从 main 派发，当前分支是 ${branch || '(detached HEAD)'}`)

  const status = runChecked(runCommand, 'git', ['status', '--porcelain'], '检查工作区', gitCwd)
  if (status.trim()) throw new Error('工作区有未提交改动；请先提交并推送，再发布网页')

  const head = runChecked(runCommand, 'git', ['rev-parse', 'HEAD'], '读取本地提交', gitCwd).trim()
  const remoteRef = runChecked(runCommand, 'git', ['ls-remote', 'origin', 'refs/heads/main'], '检查 origin/main', gitCwd).trim()
  const remoteHead = remoteRef.split(/\s+/)[0]
  if (!remoteHead || remoteHead !== head) throw new Error('本地 main 与 origin/main 不一致；请先同步后再发布网页')

  const websiteRuns = listPageWorkflowRuns({ runCommand, cwd: gitCwd, repo })
  const activeWebsiteRun = websiteRuns.find((run) => ACTIVE_RUN_STATUSES.has(run.status))
  if (activeWebsiteRun) throw new Error(`官网 Pages 工作流正在运行（${activeWebsiteRun.status}），请结束后再派发`)
  const deploymentBase = resolveDeploymentBase({ runs: websiteRuns, runCommand, cwd: gitCwd, repo })
  assertWebsiteChanged({ baseSha: deploymentBase.headSha, runCommand, cwd: gitCwd })

  const appRunsOutput = runChecked(
    runCommand,
    'gh',
    ['run', 'list', '--repo', repo, '--workflow', 'release.yml', '--limit', '50', '--json', 'status'],
    '检查桌面应用发布状态',
    gitCwd
  )
  let appRuns
  try {
    appRuns = JSON.parse(appRunsOutput)
  } catch (error) {
    throw new Error(`桌面应用工作流记录返回的数据无法解析：${error.message}`)
  }
  if (!Array.isArray(appRuns)) throw new Error('桌面应用工作流记录必须是数组')
  const activeRun = appRuns.find((run) => ACTIVE_RUN_STATUSES.has(run.status))
  if (activeRun) throw new Error(`桌面应用发布正在运行（${activeRun.status}），请结束后再派发网页发布`)

  runChecked(
    runCommand,
    'gh',
    [
      'workflow', 'run', 'deploy-pages.yml', '--repo', repo, '--ref', 'main',
      '-f', 'confirm_website_changes=true',
      '-f', 'confirm_separate_release=true'
    ],
    '派发 GitHub Pages 工作流',
    gitCwd
  )
  return { published: true, branch, head }
}
