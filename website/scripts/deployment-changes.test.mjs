import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertDeploymentHistoryKnown,
  assertWebsiteChanged,
  findLastSuccessfulDeployment,
  listPageWorkflowRuns,
  readDeploymentMarker,
  resolveDeploymentBase,
  BOOTSTRAP_DEPLOYMENT_SHA
} from './lib/deployment-changes.mjs'
import { serializeDeploymentMarker } from './lib/deployment-marker.mjs'

function mockRunner(responses = []) {
  const calls = []
  const runCommand = (command, args, options) => {
    calls.push({ command, args, options })
    return responses.shift() ?? { status: 0, stdout: '' }
  }
  return { calls, runCommand }
}

test('只把 deploy job 成功的 workflow 认作官网部署', () => {
  const runner = mockRunner([
    { status: 0, stdout: '[{"databaseId":9,"headSha":"build-only","conclusion":"success"},{"databaseId":8,"headSha":"deployed","conclusion":"success"}]' },
    { status: 0, stdout: '{"jobs":[{"name":"build","conclusion":"success"}]}' },
    { status: 0, stdout: '{"jobs":[{"name":"deploy","conclusion":"success"}]}' }
  ])
  const runs = listPageWorkflowRuns({ runCommand: runner.runCommand, cwd: '/repo' })

  assert.equal(findLastSuccessfulDeployment({ runs, runCommand: runner.runCommand, cwd: '/repo' }).headSha, 'deployed')
  assert.deepEqual(runner.calls.map(({ args }) => args[0]), ['run', 'run', 'run'])
  assert.deepEqual(runner.calls[2].args.slice(0, 4), ['run', 'view', '8', '--repo'])
})

test('持久部署标记优先于易过期的 Actions 历史', () => {
  const sha = 'a'.repeat(40)
  const runner = mockRunner([{ status: 0, stdout: `${JSON.stringify({ sha, version: '1.0.1' })}\n200` }])

  assert.deepEqual(resolveDeploymentBase({ runs: [], runCommand: runner.runCommand, cwd: '/repo' }), {
    headSha: sha,
    source: 'marker'
  })
  assert.equal(runner.calls.length, 1)
  assert.equal(runner.calls[0].command, 'curl')
})

test('无部署标记时从成功 workflow 回退，并用已知线上提交作为历史兜底', () => {
  const runner = mockRunner([
    { status: 0, stdout: 'Not Found\n404' },
    { status: 0, stdout: '{"jobs":[{"name":"deploy","conclusion":"success"}]}' }
  ])
  const deployment = { databaseId: 12, headSha: 'deployed-sha', conclusion: 'success' }
  assert.deepEqual(resolveDeploymentBase({ runs: [deployment], runCommand: runner.runCommand }), {
    headSha: 'deployed-sha',
    source: 'workflow-history'
  })

  const noRuns = mockRunner([{ status: 0, stdout: 'Not Found\n404' }])
  assert.deepEqual(resolveDeploymentBase({ runs: [], runCommand: noRuns.runCommand }), {
    headSha: BOOTSTRAP_DEPLOYMENT_SHA,
    source: 'bootstrap'
  })
})

test('部署标记请求异常或内容无效时安全失败', () => {
  const requestFailed = mockRunner([{ status: null, error: new Error('network unavailable') }])
  assert.throws(() => readDeploymentMarker({ runCommand: requestFailed.runCommand }), /network unavailable/)

  const invalidSha = mockRunner([{ status: 0, stdout: '{"sha":"short"}\n200' }])
  assert.throws(() => readDeploymentMarker({ runCommand: invalidSha.runCommand }), /sha 无效/)
})

test('部署标记写入器只接受版本号和完整 Git SHA', () => {
  const sha = 'b'.repeat(40)
  assert.deepEqual(JSON.parse(serializeDeploymentMarker({ sha, version: '1.0.1' })), { sha, version: '1.0.1' })
  assert.throws(() => serializeDeploymentMarker({ sha: 'short', version: '1.0.1' }), /GITHUB_SHA/)
  assert.throws(() => serializeDeploymentMarker({ sha, version: '' }), /版本号/)
})

test('也能通过成功的 Pages deploy step 识别部署记录', () => {
  const runner = mockRunner([
    { status: 0, stdout: '[{"databaseId":10,"headSha":"deployed-sha","conclusion":"success"}]' },
    { status: 0, stdout: '{"jobs":[{"name":"pages","conclusion":"success","steps":[{"name":"Deploy to GitHub Pages","conclusion":"success"}]}]}' }
  ])
  const runs = listPageWorkflowRuns({ runCommand: runner.runCommand })

  assert.equal(findLastSuccessfulDeployment({ runs, runCommand: runner.runCommand }).headSha, 'deployed-sha')
})

test('diff 为空时拒绝重复部署，有 website diff 时放行', () => {
  const unchanged = mockRunner([{ status: 0 }])
  assert.throws(
    () => assertWebsiteChanged({ baseSha: 'deployed-sha', head: 'main-sha', runCommand: unchanged.runCommand, cwd: '/repo' }),
    /没有改动/
  )
  assert.deepEqual(unchanged.calls[0].args, ['diff', '--quiet', 'deployed-sha..main-sha', '--', 'website/'])

  const changed = mockRunner([{ status: 1 }])
  assert.deepEqual(
    assertWebsiteChanged({ baseSha: 'deployed-sha', head: 'main-sha', runCommand: changed.runCommand, cwd: '/repo' }),
    { baseSha: 'deployed-sha' }
  )
})

test('没有历史部署时要求仓库至少包含 website 文件', () => {
  const firstDeploy = mockRunner([{ status: 0, stdout: 'website/app/page.jsx\n' }])
  assert.deepEqual(assertWebsiteChanged({ runCommand: firstDeploy.runCommand, cwd: '/repo' }), { baseSha: null })

  const emptyRepo = mockRunner([{ status: 0, stdout: '' }])
  assert.throws(() => assertWebsiteChanged({ runCommand: emptyRepo.runCommand, cwd: '/repo' }), /没有可发布的 website/)
})

test('有网页工作流历史但找不到实际部署时 fail closed', () => {
  assert.doesNotThrow(() => assertDeploymentHistoryKnown({ runs: [], lastDeployment: undefined }))
  assert.doesNotThrow(() => assertDeploymentHistoryKnown({ runs: [{ databaseId: 1 }], lastDeployment: { headSha: 'ok' } }))
  assert.doesNotThrow(() => assertDeploymentHistoryKnown({ runs: [{ databaseId: 1, conclusion: 'failure' }], lastDeployment: undefined }))
  assert.throws(
    () => assertDeploymentHistoryKnown({ runs: [{ databaseId: 1, conclusion: 'success' }], lastDeployment: undefined }),
    /无法确认成功部署记录/
  )
  assert.throws(
    () => assertDeploymentHistoryKnown({ runs: Array.from({ length: 100 }, (_, databaseId) => ({ databaseId, conclusion: 'failure' })), lastDeployment: undefined }),
    /无法确认成功部署记录/
  )
})

test('工作流记录损坏或 diff 命令异常时安全失败', () => {
  const invalidRuns = mockRunner([{ status: 0, stdout: '{}' }])
  assert.throws(() => listPageWorkflowRuns({ runCommand: invalidRuns.runCommand }), /必须是数组/)

  const diffError = mockRunner([{ status: 128, stderr: 'missing object' }])
  assert.throws(
    () => assertWebsiteChanged({ baseSha: 'missing-sha', runCommand: diffError.runCommand }),
    /检查网页目录改动失败：退出码 128/
  )
})
