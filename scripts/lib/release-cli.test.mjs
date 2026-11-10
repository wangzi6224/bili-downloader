import { describe, expect, it, vi } from 'vitest'
import { assertReleaseMode, createGithubRelease, releaseExists } from './release-cli.mjs'

describe('assertReleaseMode', () => {
  it('只允许检查或预演模式使用 --offline', () => {
    expect(() => assertReleaseMode({ offline: true })).toThrow('--offline 只允许')
    expect(() => assertReleaseMode({ offline: true, checkOnly: true })).not.toThrow()
    expect(() => assertReleaseMode({ offline: true, dryRun: true })).not.toThrow()
    expect(() => assertReleaseMode({})).not.toThrow()
  })
})

describe('releaseExists', () => {
  it('离线时不调用 GitHub CLI', () => {
    const runCommand = vi.fn()

    expect(releaseExists('v1.2.3', { offline: true, runCommand })).toBe(false)
    expect(runCommand).not.toHaveBeenCalled()
  })

  it('通过 gh release view 判断版本是否存在', () => {
    const runCommand = vi.fn(() => ({ status: 0 }))

    expect(releaseExists('v1.2.3', { runCommand })).toBe(true)
    expect(runCommand).toHaveBeenCalledWith('gh', ['release', 'view', 'v1.2.3'], { stdio: 'ignore' })
    runCommand.mockReturnValue({ status: 1 })
    expect(releaseExists('v1.2.3', { runCommand })).toBe(false)
    runCommand.mockReturnValue(undefined)
    expect(releaseExists('v1.2.3', { runCommand })).toBe(false)
  })

  it('在线检查要求注入 GitHub CLI 运行器', () => {
    expect(() => releaseExists('v1.2.3')).toThrow('runCommand 必须是函数')
  })
})

describe('createGithubRelease', () => {
  it('只通过 GitHub CLI 创建正式版本并上传资源', () => {
    const runCommand = vi.fn(() => ({ status: 0 }))

    const args = createGithubRelease({
      tag: 'v1.2.3',
      head: 'abc123',
      notesFile: '/tmp/release-notes.md',
      assets: ['/tmp/app.dmg'],
      manifestFile: '/tmp/update.json',
      cwd: '/repo',
      runCommand
    })

    expect(args).toEqual([
      'release', 'create', 'v1.2.3', '--target', 'abc123', '--title', 'v1.2.3',
      '--notes-file', '/tmp/release-notes.md', '/tmp/app.dmg', '/tmp/update.json'
    ])
    expect(runCommand).toHaveBeenCalledWith('gh', args, { cwd: '/repo', stdio: 'inherit' })
  })

  it('把预发布标记放在资源列表前，并在 gh 失败时抛错', () => {
    const runCommand = vi.fn(() => ({ status: 1 }))

    expect(() => createGithubRelease({
      tag: 'v1.2.3-beta.1',
      head: 'abc123',
      notesFile: '/tmp/release-notes.md',
      prerelease: true,
      assets: ['/tmp/app.dmg'],
      manifestFile: '/tmp/update.json',
      runCommand
    })).toThrow('gh release create 失败：退出码 1')
    expect(runCommand.mock.calls[0][1]).toContain('--prerelease')
  })

  it('报告 gh 启动失败并要求注入 CLI 运行器', () => {
    const runCommand = vi.fn(() => ({ status: null, error: new Error('spawn failed') }))
    const input = {
      tag: 'v1.2.3', head: 'abc123', notesFile: '/tmp/notes.md',
      assets: [], manifestFile: '/tmp/update.json', runCommand
    }

    expect(() => createGithubRelease(input)).toThrow('gh release create 失败：spawn failed')
    expect(() => createGithubRelease({ ...input, runCommand: undefined })).toThrow('runCommand 必须是函数')
    expect(() => createGithubRelease({
      ...input,
      runCommand: () => undefined
    })).toThrow('gh release create 失败：命令未能启动')
  })
})
