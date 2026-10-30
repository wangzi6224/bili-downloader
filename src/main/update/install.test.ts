import { execFile, execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
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
const { APPIMAGE_SCRIPT, SCRIPT, appBundle, installBlocker, prepare, replaceAfterExit, stageAppImage, unpack } = await import('./install')

const isDarwin = process.platform === 'darwin'
const isWindows = process.platform === 'win32'
const isRoot = process.getuid?.() === 0 || isWindows
const run = promisify(execFile)

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
const setPlatform = (value: string): void => {
  Object.defineProperty(process, 'platform', { ...platform, value })
}
const ORIGINAL_APPIMAGE = process.env.APPIMAGE

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bili-install-'))
  m.app.isPackaged = true
  m.spawn.mockReset()
  delete process.env.APPIMAGE
})
afterEach(() => {
  Object.defineProperty(process, 'platform', platform)
  if (ORIGINAL_APPIMAGE === undefined) delete process.env.APPIMAGE
  else process.env.APPIMAGE = ORIGINAL_APPIMAGE
  rmSync(dir, { recursive: true, force: true })
})

describe.skipIf(isWindows)('appBundle', () => {
  it('从可执行文件往上三级就是 .app', () => {
    m.app.exe = '/Applications/B站下载器.app/Contents/MacOS/B站下载器'
    expect(appBundle()).toBe('/Applications/B站下载器.app')
    expect(m.app.getPath).toHaveBeenCalledWith('exe')
  })
})

describe.skipIf(isWindows)('installBlocker', () => {
  const bundleAt = (path: string): string => {
    m.app.exe = join(path, 'Contents/MacOS/B站下载器')
    return path
  }

  beforeEach(() => setPlatform('darwin'))
  afterEach(() => {
    // 恢复权限，afterEach 才能删掉临时目录
    for (const p of [join(dir, 'Apps'), join(dir, 'Apps/B站下载器.app')]) {
      if (existsSync(p)) chmodSync(p, 0o755)
    }
  })

  it('依次检查：开发模式 → 系统 → 路径 → 隔离运行 → 写权限', () => {
    // 每一步都让后面的条件也不满足，确认先报的是前面那一条
    m.app.isPackaged = false
    setPlatform('win32')
    m.app.exe = '/opt/bili/bin/bili'
    expect(installBlocker()).toContain('开发模式')

    m.app.isPackaged = true
    expect(installBlocker()).toBe('没有权限修改 /opt/bili/bin')

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

describe.skipIf(isWindows)('installBlocker（Linux）', () => {
  beforeEach(() => setPlatform('linux'))
  afterEach(() => {
    if (existsSync(join(dir, 'Apps'))) chmodSync(join(dir, 'Apps'), 0o755)
  })

  const appImageAt = (path: string): string => {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, '#!/bin/sh\n', { mode: 0o755 })
    process.env.APPIMAGE = path
    return path
  }

  it('开发模式优先', () => {
    m.app.isPackaged = false
    expect(installBlocker()).toContain('开发模式')
  })

  it('不是从 AppImage 运行的（deb 等方式安装）不能自动安装', () => {
    expect(installBlocker()).toBe('只有 AppImage 版支持自动安装')
  })

  it('AppImage 和所在目录都可写时可以安装', () => {
    appImageAt(join(dir, 'Apps/bili-downloader.AppImage'))
    expect(installBlocker()).toBeUndefined()
  })

  it.skipIf(isRoot)('所在目录不可写时报没有权限', () => {
    appImageAt(join(dir, 'Apps/bili-downloader.AppImage'))
    chmodSync(join(dir, 'Apps'), 0o555)
    expect(installBlocker()).toBe(`没有权限修改 ${join(dir, 'Apps')}`)
  })

  it.skipIf(isRoot)('AppImage 本身不可写时同样报没有权限', () => {
    const file = appImageAt(join(dir, 'Apps/bili-downloader.AppImage'))
    chmodSync(file, 0o555)
    expect(installBlocker()).toBe(`没有权限修改 ${join(dir, 'Apps')}`)
  })
})

describe('Windows NSIS updates', () => {
  beforeEach(() => setPlatform('win32'))

  it('允许从可写的用户级安装目录自动更新', () => {
    const exe = join(dir, 'Apps/B站下载器.exe')
    mkdirSync(join(dir, 'Apps'), { recursive: true })
    writeFileSync(exe, 'app')
    m.app.exe = exe
    expect(installBlocker()).toBeUndefined()
  })

  it('准备阶段保留 NSIS 安装器并创建等待进程退出的静默安装交接', async () => {
    const exe = join(dir, 'updates/bili-downloader-0.5.0-x64.exe')
    const appExe = join(dir, 'Apps/B站下载器.exe')
    const work = join(dir, 'updates')
    const log = join(dir, 'logs/update.log')
    mkdirSync(work, { recursive: true })
    mkdirSync(join(dir, 'Apps'), { recursive: true })
    mkdirSync(join(dir, 'logs'), { recursive: true })
    writeFileSync(exe, 'installer')
    writeFileSync(appExe, 'app')
    m.app.exe = appExe
    m.spawn.mockReturnValue({ unref: vi.fn() })

    await expect(prepare(exe, join(dir, 'stage'), '0.5.0')).resolves.toBe(exe)
    replaceAfterExit(exe, work, log)

    const [command, args, options] = m.spawn.mock.calls[0]
    expect(command).toBe('powershell.exe')
    expect(args).toContain('-File')
    expect(args).toContain(exe)
    expect(args).toContain(appExe)
    expect(args).toContain(log)
    const script = args[args.indexOf('-File') + 1] as string
    const scriptText = readFileSync(script, 'utf8')
    expect(scriptText.startsWith('\uFEFF')).toBe(true)
    expect(scriptText).toContain("'/S'")
    expect(scriptText).toContain('Wait-Process')
    if (isWindows) {
      const quoted = script.replace(/'/g, "''")
      const parse = `$tokens = $null; $errors = $null; [System.Management.Automation.Language.Parser]::ParseFile('${quoted}', [ref]$tokens, [ref]$errors) | Out-Null; if ($errors.Count) { $errors | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }`
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', parse])
    }
    expect(options).toMatchObject({ detached: true, windowsHide: true, cwd: work })
  }, isWindows ? 20_000 : 5_000)
})

describe.skipIf(isWindows)('stageAppImage / prepare', () => {
  const download = (): string => {
    const file = join(dir, 'update/bili-downloader-0.5.0-x64.AppImage')
    mkdirSync(join(dir, 'update'))
    writeFileSync(file, 'new-version', { mode: 0o644 })
    return file
  }

  it('复制到原来的 AppImage 旁边，加上可执行权限', () => {
    mkdirSync(join(dir, 'Apps'))
    process.env.APPIMAGE = join(dir, 'Apps/B站下载器.AppImage')
    const next = stageAppImage(download())
    expect(next).toBe(join(dir, 'Apps/.B站下载器.AppImage.new'))
    expect(readFileSync(next, 'utf8')).toBe('new-version')
    expect(statSync(next).mode & 0o777).toBe(0o755)
  })

  it('不是从 AppImage 运行时拒绝', () => {
    expect(() => stageAppImage(download())).toThrow('只有 AppImage 版支持自动安装')
  })

  it('Linux 上 prepare 放好 AppImage，出错时变成 rejected', async () => {
    setPlatform('linux')
    mkdirSync(join(dir, 'Apps'))
    process.env.APPIMAGE = join(dir, 'Apps/a.AppImage')
    const file = download()
    await expect(prepare(file, join(dir, 'stage'), '0.5.0')).resolves.toBe(join(dir, 'Apps/.a.AppImage.new'))
    delete process.env.APPIMAGE
    await expect(prepare(file, join(dir, 'stage'), '0.5.0')).rejects.toThrow('只有 AppImage 版支持自动安装')
  })

  it('macOS 上 prepare 走解压（先清空解压目录）', async () => {
    setPlatform('darwin')
    const stage = join(dir, 'stage')
    await expect(prepare(join(dir, 'missing.zip'), stage, '0.5.0')).rejects.toThrow()
    expect(existsSync(stage)).toBe(true)
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
  it.skipIf(isWindows)('写好替换脚本，带上进程号和路径在后台启动', () => {
    setPlatform('darwin')
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
      { cwd: dir, detached: true, stdio: ['ignore', expect.any(Number), expect.any(Number)] }
    )
    expect(unref).toHaveBeenCalled()
    closeSync((m.spawn.mock.calls[0][2] as { stdio: number[] }).stdio[1])
  })

  it.skipIf(isWindows)('Linux 上用 AppImage 的替换脚本，目标是正在运行的 AppImage', () => {
    setPlatform('linux')
    m.spawn.mockReturnValue({ unref: vi.fn() })
    process.env.APPIMAGE = '/home/u/Apps/bili.AppImage'

    replaceAfterExit('/home/u/Apps/.bili.AppImage.new', dir, join(dir, 'update.log'))

    const script = join(dir, 'install.sh')
    expect(readFileSync(script, 'utf8')).toBe(APPIMAGE_SCRIPT)
    expect(m.spawn).toHaveBeenCalledWith(
      '/bin/bash',
      [script, String(process.pid), '/home/u/Apps/.bili.AppImage.new', '/home/u/Apps/bili.AppImage'],
      { cwd: dir, detached: true, stdio: ['ignore', expect.any(Number), expect.any(Number)] }
    )
    closeSync((m.spawn.mock.calls[0][2] as { stdio: number[] }).stdio[1])
  })
})

// 只用到 bash 和常见命令，macOS 和 Linux 上都真的跑一遍
describe.skipIf(isWindows)('install.sh（AppImage）', () => {
  let target: string
  let next: string
  const exitedPid = (): string => String(spawnSync('true').pid)
  const runScript = (pid: string, env: NodeJS.ProcessEnv = process.env) =>
    run('/bin/bash', [join(dir, 'install.sh'), pid, next, target], { env })

  /** 重新启动是在后台进行的，等它写下记录 */
  async function launchLog(): Promise<string> {
    const file = join(dir, 'launched')
    for (let i = 0; i < 100 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 20))
    return readFileSync(file, 'utf8')
  }

  /** 假的 AppImage：被启动时记下自己是哪个版本、看到的 AppImage 变量、工作目录，以及 9 号文件描述符是否开着 */
  const fakeAppImage = (path: string, version: string): void =>
    writeFileSync(
      path,
      `#!/bin/sh\nif [ -e /dev/fd/9 ]; then fd=open; else fd=closed; fi\n` +
        `echo "${version} APPIMAGE=\${APPIMAGE-unset} APPDIR=\${APPDIR-unset} PWD=$(pwd -P) fd9=$fd" > "${join(dir, 'launched')}"\n`,
      { mode: 0o755 }
    )

  beforeEach(() => {
    writeFileSync(join(dir, 'install.sh'), APPIMAGE_SCRIPT, { mode: 0o755 })
    mkdirSync(join(dir, 'Apps'))
    target = join(dir, 'Apps/bili.AppImage')
    next = join(dir, 'Apps/.bili.AppImage.new')
    fakeAppImage(target, 'old')
    fakeAppImage(next, 'new')
  })

  it('旧进程退出后换成新版本，去掉旧 AppImage 的环境变量再启动', async () => {
    const env = { ...process.env, APPIMAGE: target, APPDIR: '/tmp/.mount_old', ARGV0: 'x', OWD: '/' }
    const { stdout } = await runScript(exitedPid(), env)
    expect(stdout).toContain('已替换为新版本')
    expect(existsSync(next)).toBe(false)
    // macOS 的临时目录在软链接后面，比较真实路径
    expect(await launchLog()).toBe(`new APPIMAGE=unset APPDIR=unset PWD=${realpathSync(join(dir, 'Apps'))} fd9=closed\n`)
  })

  it('旧版本打开的文件不会传给新版本（不然旧 AppImage 的挂载卸载不掉）', async () => {
    // 模拟旧版本留下的、没有设置 close-on-exec 的文件描述符
    const held = openSync(join(dir, 'held'), 'w')
    // 这个文件里的 spawn 被换成了假的
    const { spawn } = await vi.importActual<typeof import('node:child_process')>('node:child_process')
    const child = spawn('/bin/bash', [join(dir, 'install.sh'), exitedPid(), next, target], {
      stdio: ['ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', held]
    })
    await new Promise((r) => child.on('exit', r))
    closeSync(held)
    expect(await launchLog()).toMatch(/^new .* fd9=closed$/m)
  })

  it('等旧进程退出后才开始替换', async () => {
    const sleeper = execFile('sleep', ['0.3'])
    const t = Date.now()
    const { stdout } = await runScript(String(sleeper.pid))
    expect(Date.now() - t).toBeGreaterThanOrEqual(250)
    expect(stdout).toContain('已替换为新版本')
  })

  it('替换失败时保留旧版本，照样重新打开', async () => {
    rmSync(next)
    const { stdout } = await runScript(exitedPid())
    expect(stdout).toContain('替换失败，保持旧版本')
    expect(await launchLog()).toMatch(/^old /)
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
