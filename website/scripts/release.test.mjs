import assert from 'node:assert/strict'
import test from 'node:test'
import { runWebsiteRelease } from './lib/release.mjs'

function mockRunner(responses = []) {
  const calls = []
  const runCommand = (command, args, options) => {
    calls.push({ command, args, options })
    const response = responses.shift()
    return response ?? { status: 0, stdout: '' }
  }
  return { calls, runCommand }
}

const publishArgs = ['--publish', '--confirm-website-changes', '--confirm-separate-from-app']

test('默认只运行测试和静态构建，不访问 GitHub', () => {
  const runner = mockRunner()

  assert.deepEqual(runWebsiteRelease({ runCommand: runner.runCommand, cwd: '/repo/website' }), { published: false })
  assert.deepEqual(runner.calls.map(({ command, args }) => [command, args]), [
    ['npm', ['test']],
    ['npm', ['run', 'build']]
  ])
})

test('网站测试或构建失败时不会检查或派发发布', () => {
  const runner = mockRunner([{ status: 1, stdout: '', error: new Error('test failed') }])

  assert.throws(
    () => runWebsiteRelease({ args: publishArgs, runCommand: runner.runCommand }),
    /网站单元测试失败/
  )
  assert.equal(runner.calls.length, 1)
  assert.equal(runner.calls.some(({ command }) => command === 'gh'), false)
})

test('静态构建失败时不会访问发布状态或派发 Pages', () => {
  const runner = mockRunner([{ status: 0 }, { status: 2, stderr: 'next build failed' }])

  assert.throws(
    () => runWebsiteRelease({ args: publishArgs, runCommand: runner.runCommand }),
    /网站静态构建失败：退出码 2/
  )
  assert.equal(runner.calls.length, 2)
  assert.equal(runner.calls.some(({ command }) => command === 'gh'), false)
})

test('发布缺少确认参数时拒绝执行', () => {
  const runner = mockRunner()

  assert.throws(
    () => runWebsiteRelease({ args: ['--publish'], runCommand: runner.runCommand }),
    /必须确认 website\//
  )
  assert.equal(runner.calls.length, 0)
})

test('通过构建、改动、同步和应用空闲检查后才派发 Pages', () => {
  const runner = mockRunner([
    { status: 0 }, // npm test
    { status: 0 }, // npm run build
    { status: 0, stdout: 'main\n' }, // branch
    { status: 0, stdout: '' }, // clean
    { status: 0, stdout: 'local-sha\n' }, // HEAD
    { status: 0, stdout: 'local-sha\trefs/heads/main\n' }, // origin/main
    { status: 0, stdout: '[{"databaseId":100,"headSha":"deployed-sha","status":"completed","conclusion":"success"}]' }, // Pages runs
    { status: 0, stdout: 'Not Found\n404' }, // deployment marker not written by the previous workflow version
    { status: 0, stdout: '{"jobs":[{"name":"deploy","conclusion":"success"}]}' }, // successful deploy job
    { status: 1 }, // website diff
    { status: 0, stdout: '[{"status":"completed"}]' }, // app runs
    { status: 0 } // workflow dispatch
  ])

  const result = runWebsiteRelease({ args: publishArgs, runCommand: runner.runCommand, cwd: '/repo/website' })

  assert.deepEqual(result, { published: true, branch: 'main', head: 'local-sha' })
  assert.deepEqual(runner.calls.slice(0, 2).map(({ args }) => args), [['test'], ['run', 'build']])
  assert.equal(runner.calls[0].options.cwd, '/repo/website')
  assert.equal(runner.calls.find(({ args }) => args[0] === 'diff').options.cwd, '/repo')
  assert.deepEqual(runner.calls.at(-1).args, [
    'workflow', 'run', 'deploy-pages.yml', '--repo', 'wangzi6224/bili-downloader', '--ref', 'main',
    '-f', 'confirm_website_changes=true', '-f', 'confirm_separate_release=true'
  ])
})

test('工作区未提交时不派发', () => {
  const runner = mockRunner([
    { status: 0 }, { status: 0 }, { status: 0, stdout: 'main' }, { status: 0, stdout: ' M website/app/page.tsx' }
  ])

  assert.throws(
    () => runWebsiteRelease({ args: publishArgs, runCommand: runner.runCommand }),
    /工作区有未提交改动/
  )
  assert.equal(runner.calls.some(({ command, args }) => command === 'gh' && args[0] === 'workflow'), false)
})

test('本地 main 未同步到 origin/main 时不派发', () => {
  const runner = mockRunner([
    { status: 0 }, { status: 0 }, { status: 0, stdout: 'main' }, { status: 0 },
    { status: 0, stdout: 'local-sha' }, { status: 0, stdout: 'remote-sha\trefs/heads/main' }
  ])

  assert.throws(
    () => runWebsiteRelease({ args: publishArgs, runCommand: runner.runCommand }),
    /本地 main 与 origin\/main 不一致/
  )
  assert.equal(runner.calls.some(({ command }) => command === 'gh'), false)
})

test('自上次成功部署后没有 website/ 改动时不派发', () => {
  const runner = mockRunner([
    { status: 0 }, { status: 0 }, { status: 0, stdout: 'main' }, { status: 0, stdout: '' },
    { status: 0, stdout: 'local-sha' }, { status: 0, stdout: 'local-sha refs/heads/main' },
    { status: 0, stdout: '[{"databaseId":100,"headSha":"deployed-sha","status":"completed","conclusion":"success"}]' },
    { status: 0, stdout: 'Not Found\n404' },
    { status: 0, stdout: '{"jobs":[{"name":"deploy","conclusion":"success"}]}' },
    { status: 0 }
  ])

  assert.throws(
    () => runWebsiteRelease({ args: publishArgs, runCommand: runner.runCommand }),
    /自上次成功的网页部署后 website\/ 没有改动/
  )
  assert.equal(runner.calls.some(({ command, args }) => command === 'gh' && args[0] === 'workflow'), false)
})

test('桌面应用发布仍在运行时不派发官网', () => {
  const runner = mockRunner([
    { status: 0 }, { status: 0 }, { status: 0, stdout: 'main' }, { status: 0 },
    { status: 0, stdout: 'local-sha' }, { status: 0, stdout: 'local-sha refs/heads/main' },
    { status: 0, stdout: '[{"databaseId":100,"headSha":"deployed-sha","status":"completed","conclusion":"success"}]' },
    { status: 0, stdout: 'Not Found\n404' },
    { status: 0, stdout: '{"jobs":[{"name":"deploy","conclusion":"success"}]}' },
    { status: 1 },
    { status: 0, stdout: '[{"status":"in_progress"}]' }
  ])

  assert.throws(
    () => runWebsiteRelease({ args: publishArgs, runCommand: runner.runCommand }),
    /桌面应用发布正在运行/
  )
  assert.equal(runner.calls.some(({ command, args }) => command === 'gh' && args[0] === 'workflow'), false)
})

test('已有 Pages workflow 执行时不派发第二次部署', () => {
  const runner = mockRunner([
    { status: 0 }, { status: 0 }, { status: 0, stdout: 'main' }, { status: 0 },
    { status: 0, stdout: 'local-sha' }, { status: 0, stdout: 'local-sha refs/heads/main' },
    { status: 0, stdout: '[{"status":"in_progress","conclusion":null}]' }
  ])

  assert.throws(
    () => runWebsiteRelease({ args: publishArgs, runCommand: runner.runCommand }),
    /官网 Pages 工作流正在运行/
  )
  assert.equal(runner.calls.some(({ command, args }) => command === 'gh' && args[0] === 'workflow'), false)
})

test('有 Pages 历史但找不到实际部署记录时不派发', () => {
  const runner = mockRunner([
    { status: 0 }, { status: 0 }, { status: 0, stdout: 'main' }, { status: 0 },
    { status: 0, stdout: 'local-sha' }, { status: 0, stdout: 'local-sha refs/heads/main' },
    { status: 0, stdout: '[{"databaseId":101,"headSha":"build-only-sha","status":"completed","conclusion":"success"}]' },
    { status: 0, stdout: 'Not Found\n404' },
    { status: 0, stdout: '{"jobs":[{"name":"build","conclusion":"success"}]}' }
  ])

  assert.throws(
    () => runWebsiteRelease({ args: publishArgs, runCommand: runner.runCommand }),
    /无法确认成功部署记录/
  )
  assert.equal(runner.calls.some(({ command, args }) => command === 'gh' && args[0] === 'workflow'), false)
})

test('拒绝从非 main 分支发布', () => {
  const runner = mockRunner([{ status: 0 }, { status: 0 }, { status: 0, stdout: 'feature' }])

  assert.throws(
    () => runWebsiteRelease({ args: publishArgs, runCommand: runner.runCommand }),
    /只允许从 main 派发/
  )
  assert.equal(runner.calls.some(({ command }) => command === 'gh'), false)
})
