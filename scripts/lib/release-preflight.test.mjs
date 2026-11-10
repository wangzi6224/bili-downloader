import { describe, expect, it, vi } from 'vitest'
import { runAppReleasePreflight } from './release-preflight.mjs'

function successfulRunner() {
  return vi.fn(() => ({ status: 0 }))
}

describe('runAppReleasePreflight', () => {
  it.each([
    ['darwin', 'build:mac'],
    ['linux', 'build:linux'],
    ['win32', 'build:win']
  ])('在 %s 上依次离线检查并构建 %s', (platform, buildScript) => {
    const runCommand = successfulRunner()

    const result = runAppReleasePreflight({ platform, runCommand, cwd: '/repo', nodePath: 'node' })

    expect(result).toEqual({ platform, buildScript })
    expect(runCommand.mock.calls).toEqual([
      ['node', ['scripts/release.mjs', '--check', '--offline'], { cwd: '/repo' }],
      ['npm', ['run', buildScript], { cwd: '/repo' }]
    ])
  })

  it('使用 npm 提供的 CLI 路径兼容 Windows', () => {
    const runCommand = successfulRunner()

    runAppReleasePreflight({ platform: 'win32', runCommand, nodePath: 'node', npmExecPath: '/npm/cli.js' })

    expect(runCommand.mock.calls[1]).toEqual(['node', ['/npm/cli.js', 'run', 'build:win'], { cwd: undefined }])
  })

  it('版本检查失败时不运行安装包构建', () => {
    const runCommand = vi.fn(() => ({ status: 1 }))

    expect(() => runAppReleasePreflight({ platform: 'darwin', runCommand })).toThrow('版本与更新日志检查失败')
    expect(runCommand).toHaveBeenCalledTimes(1)
  })

  it('本机构建失败时阻止预检通过', () => {
    const runCommand = vi.fn().mockReturnValueOnce({ status: 0 }).mockReturnValueOnce({ status: 2 })

    expect(() => runAppReleasePreflight({ platform: 'darwin', runCommand })).toThrow('build:mac 本机构建失败')
    expect(runCommand).toHaveBeenCalledTimes(2)
  })

  it('命令启动错误和缺少退出码都会被视为失败', () => {
    const launchError = vi.fn(() => ({ status: null, error: new Error('spawn failed') }))
    const missingStatus = vi.fn(() => undefined)

    expect(() => runAppReleasePreflight({ platform: 'darwin', runCommand: launchError })).toThrow('spawn failed')
    expect(() => runAppReleasePreflight({ platform: 'darwin', runCommand: missingStatus })).toThrow('命令未能启动')
  })

  it('拒绝不支持的平台且不运行命令', () => {
    const runCommand = successfulRunner()

    expect(() => runAppReleasePreflight({ platform: 'aix', runCommand })).toThrow('不支持在 aix 上构建')
    expect(runCommand).not.toHaveBeenCalled()
  })

  it('要求注入命令运行器，避免测试或调用意外执行外部命令', () => {
    expect(() => runAppReleasePreflight({ platform: 'darwin' })).toThrow('runCommand 必须是函数')
  })
})
