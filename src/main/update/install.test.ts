import { execFile, execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  app: { isPackaged: true, exe: '/Applications/B站下载器.app/Contents/MacOS/B站下载器', getPath: vi.fn() },
  spawn: vi.fn()
}))
m.app.getPath.mockImplementation(() => m.app.exe)

vi.mock('electron', () => ({ app: m.app }))
// 只替换 spawn，免得测试里真的启动替换脚本；execFile 保持真实，unpack 要用真的 ditto / plutil
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: m.spawn
}))
const { SCRIPT, appBundle, installBlocker, replaceAfterExit, unpack } = await import('./install')

const isDarwin = process.platform === 'darwin'
const isRoot = process.getuid?.() === 0
const run = promisify(execFile)

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bili-install-'))
  m.app.isPackaged = true
  m.spawn.mockReset()
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('appBundle', () => {
  it('从可执行文件往上三级就是 .app', () => {
    m.app.exe = '/Applications/B站下载器.app/Contents/MacOS/B站下载器'
    expect(appBundle()).toBe('/Applications/B站下载器.app')
    expect(m.app.getPath).toHaveBeenCalledWith('exe')
  })
})

describe('installBlocker', () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
  const setPlatform = (value: string): void => {
    Object.defineProperty(process, 'platform', { ...platform, value })
  }
  const bundleAt = (path: string): string => {
    m.app.exe = join(path, 'Contents/MacOS/B站下载器')
    return path
  }

  beforeEach(() => setPlatform('darwin'))
  afterEach(() => {
    Object.defineProperty(process, 'platform', platform)
    // 恢复权限，afterEach 才能删掉临时目录
    for (const p of [join(dir, 'Apps'), join(dir, 'Apps/B站下载器.app')]) {
      if (existsSync(p)) chmodSync(p, 0o755)
    }
  })

  it('依次检查：开发模式 → 系统 → 路径 → 隔离运行 → 写权限', () => {
    // 每一步都让后面的条件也不满足，确认先报的是前面那一条
    m.app.isPackaged = false
    setPlatform('linux')
    m.app.exe = '/opt/bili/bin/bili'
    expect(installBlocker()).toContain('开发模式')

    m.app.isPackaged = true
    expect(installBlocker()).toBe('自动安装只支持 macOS')

    setPlatform('darwin')
    m.app.exe = '/private/var/AppTranslocation/X/d/bin/bili'
    expect(installBlocker()).toBe('找不到应用所在的位置（/private/var/AppTranslocation/X）')

    // 隔离路径不存在也不会去查权限
    bundleAt('/Volumes/AppTranslocation/B站下载器.app')
    expect(installBlocker()).toContain('应用是从“下载”文件夹里直接打开的')
  })

  it('在磁盘映像里运行时提示先拖到“应用程序”', () => {
    bundleAt('/Volumes/B站下载器-不存在/B站下载器.app')
    expect(installBlocker()).toBe('应用正在磁盘映像里运行，请先把应用拖到“应用程序”文件夹，从那里打开后再更新')
  })

  it('应用和所在目录都可写时可以安装', () => {
    const bundle = bundleAt(join(dir, 'Apps/B站下载器.app'))
    mkdirSync(join(bundle, 'Contents/MacOS'), { recursive: true })
    expect(installBlocker()).toBeUndefined()
  })

  it.skipIf(isRoot)('所在目录不可写时报没有权限', () => {
    const bundle = bundleAt(join(dir, 'Apps/B站下载器.app'))
    mkdirSync(join(bundle, 'Contents/MacOS'), { recursive: true })
    chmodSync(join(dir, 'Apps'), 0o555)
    expect(installBlocker()).toBe(`没有权限修改 ${join(dir, 'Apps')}`)
  })

  it.skipIf(isRoot)('.app 本身不可写时同样报没有权限', () => {
    const bundle = bundleAt(join(dir, 'Apps/B站下载器.app'))
    mkdirSync(join(bundle, 'Contents/MacOS'), { recursive: true })
    chmodSync(bundle, 0o555)
    expect(installBlocker()).toBe(`没有权限修改 ${join(dir, 'Apps')}`)
  })
})

const plist = (id: string, version: string): string => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${id}</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
</dict></plist>
`

function fakeApp(path: string, id: string, version: string): string {
  mkdirSync(join(path, 'Contents/MacOS'), { recursive: true })
  writeFileSync(join(path, 'Contents/Info.plist'), plist(id, version))
  writeFileSync(join(path, 'Contents/MacOS/B站下载器'), '#!/bin/sh\n')
  return path
}

/** 和发布脚本一样用 ditto 打包，保留外层的 .app 目录 */
function zipOf(src: string, name: string): string {
  const zip = join(dir, name)
  execFileSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', src, zip])
  return zip
}

describe.runIf(isDarwin)('unpack', () => {
  const ID = 'com.example.bili-downloader'
  let stage: string

  beforeEach(() => {
    const own = fakeApp(join(dir, 'Applications/B站下载器.app'), ID, '0.4.0')
    m.app.exe = join(own, 'Contents/MacOS/B站下载器')
    stage = join(dir, 'stage')
  })

  it('解压出指定版本的本应用，并清掉解压目录里的旧东西', async () => {
    const next = fakeApp(join(dir, 'build/B站下载器.app'), ID, '0.5.0')
    // Electron Framework 里有符号链接，ditto 要能原样还原
    symlinkSync('MacOS', join(next, 'Contents/Link'))
    const zip = zipOf(next, 'new.zip')
    mkdirSync(stage)
    writeFileSync(join(stage, 'leftover.txt'), 'x')

    const out = await unpack(zip, stage, '0.5.0')
    expect(out).toBe(join(stage, 'B站下载器.app'))
    expect(existsSync(join(stage, 'leftover.txt'))).toBe(false)
    expect(lstatSync(join(out, 'Contents/Link')).isSymbolicLink()).toBe(true)
  })

  it('不是本应用时拒绝', async () => {
    const zip = zipOf(fakeApp(join(dir, 'build/Other.app'), 'com.other.app', '0.5.0'), 'other.zip')
    await expect(unpack(zip, stage, '0.5.0')).rejects.toThrow('安装包不是本应用（com.other.app）')
  })

  it('版本不符时拒绝', async () => {
    const zip = zipOf(fakeApp(join(dir, 'build/B站下载器.app'), ID, '0.6.0'), 'v.zip')
    await expect(unpack(zip, stage, '0.5.0')).rejects.toThrow('安装包的版本是 0.6.0，不是 0.5.0')
  })

  it('压缩包里没有 .app 时拒绝', async () => {
    mkdirSync(join(dir, 'payload'))
    writeFileSync(join(dir, 'payload/readme.txt'), 'hi')
    const zip = zipOf(join(dir, 'payload'), 'empty.zip')
    await expect(unpack(zip, stage, '0.5.0')).rejects.toThrow('安装包里没有找到应用')
  })

  it('不是 zip 时解压失败', async () => {
    writeFileSync(join(dir, 'bad.zip'), 'not a zip')
    await expect(unpack(join(dir, 'bad.zip'), stage, '0.5.0')).rejects.toThrow()
  })
})

describe('replaceAfterExit', () => {
  it('写好替换脚本，带上进程号和路径在后台启动', () => {
    const unref = vi.fn()
    m.spawn.mockReturnValue({ unref })
    m.app.exe = '/Applications/B站下载器.app/Contents/MacOS/B站下载器'
    const log = join(dir, 'update.log')

    replaceAfterExit('/tmp/stage/B站下载器.app', dir, log)

    const script = join(dir, 'install.sh')
    expect(readFileSync(script, 'utf8')).toBe(SCRIPT)
    expect(statSync(script).mode & 0o100).toBeTruthy()
    expect(existsSync(log)).toBe(true)
    expect(m.spawn).toHaveBeenCalledWith(
      '/bin/sh',
      [script, String(process.pid), '/tmp/stage/B站下载器.app', '/Applications/B站下载器.app'],
      { detached: true, stdio: ['ignore', expect.any(Number), expect.any(Number)] }
    )
    expect(unref).toHaveBeenCalled()
    closeSync((m.spawn.mock.calls[0][2] as { stdio: number[] }).stdio[1])
  })
})

describe.runIf(isDarwin)('install.sh', () => {
  let env: NodeJS.ProcessEnv
  let target: string
  let next: string
  let backup: string
  const calls = (): string => readFileSync(join(dir, 'calls.log'), 'utf8')
  /** 一个已经退出的进程号，脚本不用等 */
  const exitedPid = (): string => String(spawnSync('/usr/bin/true').pid)
  const runScript = (pid: string) => run('/bin/sh', [join(dir, 'install.sh'), pid, next, target], { env })

  beforeEach(() => {
    // 用垫片顶替 open / xattr，只记录参数
    const bin = join(dir, 'bin')
    mkdirSync(bin)
    for (const cmd of ['open', 'xattr']) {
      writeFileSync(join(bin, cmd), `#!/bin/sh\necho "${cmd} $*" >> "$CALLS"\n`, { mode: 0o755 })
    }
    env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, CALLS: join(dir, 'calls.log') }
    // 先确认垫片生效，绝不能调到真的 open
    expect(execFileSync('/bin/sh', ['-c', 'command -v open; command -v xattr'], { env }).toString()).toBe(
      `${join(bin, 'open')}\n${join(bin, 'xattr')}\n`
    )
    writeFileSync(join(dir, 'install.sh'), SCRIPT, { mode: 0o755 })

    target = join(dir, 'Applications/B站下载器.app')
    next = join(dir, 'stage/B站下载器.app')
    backup = join(dir, 'Applications/.B站下载器.app.old')
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, 'version'), 'old')
    mkdirSync(next, { recursive: true })
    writeFileSync(join(next, 'version'), 'new')
  })

  it('旧进程退出后换成新版本，去掉隔离标记并重新打开', async () => {
    // 上次留下的备份要先清掉
    mkdirSync(backup)
    const { stdout } = await runScript(exitedPid())
    expect(stdout).toContain('已替换为新版本')
    expect(readFileSync(join(target, 'version'), 'utf8')).toBe('new')
    expect(existsSync(next)).toBe(false)
    expect(existsSync(backup)).toBe(false)
    expect(calls()).toBe(`xattr -dr com.apple.quarantine ${target}\nopen ${target}\n`)
  })

  it('等旧进程退出后才开始替换', async () => {
    const sleeper = execFile('/bin/sleep', ['0.3'])
    const t = Date.now()
    const { stdout } = await runScript(String(sleeper.pid))
    expect(Date.now() - t).toBeGreaterThanOrEqual(250)
    expect(stdout).toContain('已替换为新版本')
  })

  it('新版本移不过去时恢复旧版本，照样重新打开', async () => {
    rmSync(next, { recursive: true })
    const { stdout } = await runScript(exitedPid())
    expect(stdout).toContain('替换失败，恢复旧版本')
    expect(readFileSync(join(target, 'version'), 'utf8')).toBe('old')
    expect(existsSync(backup)).toBe(false)
    expect(calls()).toContain(`open ${target}\n`)
  })

  it('旧版本移不走时什么都不换', async () => {
    rmSync(target, { recursive: true })
    const { stdout } = await runScript(exitedPid())
    expect(stdout).toContain('无法移动旧版本，保持不变')
    expect(readFileSync(join(next, 'version'), 'utf8')).toBe('new')
    expect(calls()).toContain(`open ${target}\n`)
  })
})
