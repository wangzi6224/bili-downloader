export const REPOSITORY = 'wangzi6224/bili-downloader'
export const DEPLOYMENT_MARKER_URL = 'https://wangzi6224.github.io/bili-downloader/deployment.json'
export const BOOTSTRAP_DEPLOYMENT_SHA = '06b59147ae26450a663ebf751985dc580174a9f8'
const DEPLOYMENT_RUN_LIMIT = 100

function runChecked(runCommand, command, args, label, cwd) {
  const result = runCommand(command, args, { cwd })
  if (result?.status !== 0) {
    const detail = result?.error?.message || (result?.status == null ? '命令未能启动' : `退出码 ${result.status}`)
    throw new Error(`${label}失败：${detail}`)
  }
  return result.stdout ?? ''
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(stdout)
  } catch (error) {
    throw new Error(`${label}返回的数据无法解析：${error.message}`)
  }
}

export function listPageWorkflowRuns({ runCommand, cwd, repo = REPOSITORY }) {
  const output = runChecked(
    runCommand,
    'gh',
    ['run', 'list', '--repo', repo, '--workflow', 'deploy-pages.yml', '--event', 'workflow_dispatch', '--limit', String(DEPLOYMENT_RUN_LIMIT), '--json', 'databaseId,headSha,status,conclusion'],
    '读取网页工作流记录',
    cwd
  )
  const runs = parseJson(output, '网页工作流记录')
  if (!Array.isArray(runs)) throw new Error('网页工作流记录必须是数组')
  return runs
}

export function findLastSuccessfulDeployment({ runs, runCommand, cwd, repo = REPOSITORY }) {
  for (const run of runs) {
    if (run.conclusion !== 'success' || !run.headSha || !run.databaseId) continue

    const output = runChecked(
      runCommand,
      'gh',
      ['run', 'view', String(run.databaseId), '--repo', repo, '--json', 'jobs'],
      `检查网页工作流 ${run.databaseId} 的部署 job`,
      cwd
    )
    const view = parseJson(output, `网页工作流 ${run.databaseId}`)
    const hasSuccessfulDeploy = Array.isArray(view.jobs) && view.jobs.some((job) => (
      job.conclusion === 'success' && (
        job.name === 'deploy' ||
        job.steps?.some((step) => step.name === 'Deploy to GitHub Pages' && step.conclusion === 'success')
      )
    ))
    if (hasSuccessfulDeploy) return run
  }
  return undefined
}

export function readDeploymentMarker({ runCommand, cwd, markerUrl = DEPLOYMENT_MARKER_URL }) {
  const url = `${markerUrl}?_=${Date.now()}`
  const result = runCommand(
    'curl',
    ['--silent', '--show-error', '--location', '--max-time', '15', '--header', 'Cache-Control: no-cache', '--write-out', '\\n%{http_code}', url],
    { cwd }
  )
  if (result?.status !== 0) {
    const detail = result?.error?.message || (result?.status == null ? '命令未能启动' : `退出码 ${result.status}`)
    throw new Error(`读取 Pages 部署标记失败：${detail}`)
  }

  const output = result.stdout ?? ''
  const separator = output.lastIndexOf('\n')
  if (separator < 0) throw new Error('Pages 部署标记响应缺少 HTTP 状态码')
  const status = Number(output.slice(separator + 1).trim())
  if (status === 404) return undefined
  if (status !== 200) throw new Error(`读取 Pages 部署标记失败：HTTP ${status}`)

  const marker = parseJson(output.slice(0, separator), 'Pages 部署标记')
  if (typeof marker.sha !== 'string' || !/^[a-f0-9]{40}$/i.test(marker.sha)) {
    throw new Error('Pages 部署标记中的 sha 无效')
  }
  return marker.sha
}

export function resolveDeploymentBase({ runs, runCommand, cwd, repo = REPOSITORY, markerUrl }) {
  const markerSha = readDeploymentMarker({ runCommand, cwd, markerUrl })
  if (markerSha) return { headSha: markerSha, source: 'marker' }

  const lastDeployment = findLastSuccessfulDeployment({ runs, runCommand, cwd, repo })
  assertDeploymentHistoryKnown({ runs, lastDeployment })
  return lastDeployment
    ? { headSha: lastDeployment.headSha, source: 'workflow-history' }
    : { headSha: BOOTSTRAP_DEPLOYMENT_SHA, source: 'bootstrap' }
}

export function assertDeploymentHistoryKnown({ runs, lastDeployment }) {
  const ambiguousSuccess = runs.some((run) => run.conclusion === 'success')
  if (!lastDeployment && (ambiguousSuccess || runs.length >= DEPLOYMENT_RUN_LIMIT)) {
    throw new Error('发现网页工作流历史，但无法确认成功部署记录；请先核对 Pages 部署历史，避免误判为首次部署')
  }
}

export function assertWebsiteChanged({ baseSha, head = 'HEAD', runCommand, cwd }) {
  if (!baseSha) {
    const trackedWebsiteFiles = runChecked(runCommand, 'git', ['ls-files', 'website/'], '检查首次网页发布内容', cwd)
    if (!trackedWebsiteFiles.trim()) throw new Error('没有可发布的 website/ 文件')
    return { baseSha: null }
  }

  const result = runCommand('git', ['diff', '--quiet', `${baseSha}..${head}`, '--', 'website/'], { cwd })
  if (result?.status === 0) {
    throw new Error('自上次成功的网页部署后 website/ 没有改动，不派发网页发布')
  }
  if (result?.status === 1) return { baseSha }

  const detail = result?.error?.message || (result?.status == null ? '命令未能启动' : `退出码 ${result.status}`)
  throw new Error(`检查网页目录改动失败：${detail}`)
}
