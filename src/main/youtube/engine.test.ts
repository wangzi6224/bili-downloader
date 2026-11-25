import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { makeZip } from '../../test/zip'
import { assetFor, CHECK_INTERVAL, compareVersions, defaultDeps, reason, sumFor, YtEngine, type EngineDeps } from './engine'

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'engine-'))
})
afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(dir, { recursive: true, force: true })
})

const zipFor = (version: string): Buffer =>
  makeZip([
    { name: '_internal/', method: 0 },
    { name: '_internal/lib.so', data: 'lib' },
    { name: 'yt-dlp_macos', data: `#!${version}`, mode: 0o100755 }
  ])
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex')

/** 假的 GitHub：每个版本一个压缩包，run 时返回版本号 */
type FakeDeps = EngineDeps & {
  latestVersion: string
  clock: number
  latest: Mock<EngineDeps['latest']>
  fetchText: Mock<EngineDeps['fetchText']>
  download: Mock<EngineDeps['download']>
  run: Mock<EngineDeps['run']>
}

function fakeDeps(over: Partial<EngineDeps> = {}): FakeDeps {
  const d: FakeDeps = {
    platform: 'darwin' as NodeJS.Platform,
    arch: 'arm64',
    latestVersion: '2026.11.23',
    clock: 1_000_000,
    latest: vi.fn(async () => d.latestVersion),
    fetchText: vi.fn(async (url: string) => {
      const v = /download\/([^/]+)\//.exec(url)![1]
      return `${sha(zipFor(v))}  yt-dlp_macos.zip\n${'0'.repeat(64)}  yt-dlp.exe\n`
    }),
    download: vi.fn(async (url: string, dest: string, _s: AbortSignal, onProgress: (d: number, t: number) => void) => {
      const v = /download\/([^/]+)\//.exec(url)![1]
      const buf = zipFor(v)
      onProgress(0, buf.length)
      // 间隔太短的进度不报
      onProgress(1, buf.length)
      writeFileSync(dest, buf)
      onProgress(buf.length, buf.length)
    }),
    run: vi.fn(async (exe: string) => `${readFileSync(exe, 'utf8').slice(2)}\n`),
    now: () => d.clock,
    ...(over as Partial<FakeDeps>)
  }
  return d
}

describe('辅助函数', () => {
  it('按系统和架构挑单目录压缩包', () => {
    expect(assetFor('darwin', 'x64')).toBe('yt-dlp_macos.zip')
    expect(assetFor('darwin', 'arm64')).toBe('yt-dlp_macos.zip')
    expect(assetFor('win32', 'x64')).toBe('yt-dlp_win.zip')
    expect(assetFor('win32', 'arm64')).toBe('yt-dlp_win_arm64.zip')
    expect(assetFor('linux', 'x64')).toBe('yt-dlp_linux.zip')
    expect(assetFor('linux', 'arm64')).toBe('yt-dlp_linux_aarch64.zip')
    expect(assetFor('linux', 'ppc64')).toBeUndefined()
    expect(assetFor('freebsd', 'x64')).toBeUndefined()
  })

  it('错误原因：Error 取 message，其他转成字符串', () => {
    expect([reason(new Error('a')), reason('b'), reason(3)]).toEqual(['a', 'b', '3'])
  })

  it('版本号按数字比较', () => {
    expect(compareVersions('2026.11.23', '2026.9.1')).toBeGreaterThan(0)
    expect(compareVersions('2026.11.23', '2026.11.23.1')).toBeLessThan(0)
    expect(compareVersions('2026.11.23.1', '2026.11.23')).toBeGreaterThan(0)
    expect(compareVersions('2026.11.23', '2026.11.23')).toBe(0)
  })

  it('从校验清单里找对应文件', () => {
    const sums = `${'a'.repeat(64)}  yt-dlp_macos.zip\r\n${'B'.repeat(64)} *yt-dlp_win.zip\nbad line\n`
    expect(sumFor(sums, 'yt-dlp_macos.zip')).toBe('a'.repeat(64))
    expect(sumFor(sums, 'yt-dlp_win.zip')).toBe('b'.repeat(64))
    expect(sumFor(sums, 'yt-dlp_linux.zip')).toBeUndefined()
  })
})

describe('安装', () => {
  it('没装时下载最新版，校验、解压、试运行后可用；同时调用只装一次', async () => {
    const deps = fakeDeps()
    const engine = new YtEngine(dir, deps)
    expect(engine.status()).toEqual({ state: 'missing' })
    expect(engine.exePath()).toBeUndefined()
    const stages: string[] = []
    const dones: number[] = []
    engine.on('status', (s) => {
      stages.push(s.stage ?? s.state)
      if (s.stage === 'download') dones.push(s.done)
    })
    const [a, b] = await Promise.all([engine.ensure(), engine.ensure()])
    expect(a).toBe(join(dir, '2026.11.23', 'yt-dlp_macos'))
    expect(b).toBe(a)
    expect(deps.download).toHaveBeenCalledTimes(1)
    expect(deps.run).toHaveBeenCalledWith(join(dir, '2026.11.23.partial', 'yt-dlp_macos'), ['--version'], expect.any(AbortSignal))
    expect(new Set(stages)).toEqual(new Set(['download', 'verify', 'extract', 'warmup', 'ready']))
    expect(dones).toEqual([0, 0, zipFor('2026.11.23').length])
    expect(engine.status()).toMatchObject({ state: 'ready', version: '2026.11.23' })
    expect(readdirSync(dir).sort()).toEqual(['2026.11.23', 'current.json'])
    expect(readFileSync(join(dir, '2026.11.23', '_internal', 'lib.so'), 'utf8')).toBe('lib')
    // 已装好的直接用，重启后也认
    expect(await engine.ensure()).toBe(a)
    expect(new YtEngine(dir, deps).status()).toMatchObject({ state: 'ready', version: '2026.11.23' })
  })

  it('校验不通过：删掉下载的文件，报错，状态为出错', async () => {
    const deps = fakeDeps({ fetchText: vi.fn(async () => `${'0'.repeat(64)}  yt-dlp_macos.zip`) })
    const engine = new YtEngine(dir, deps)
    await expect(engine.ensure()).rejects.toThrow('校验没通过')
    expect(engine.status()).toMatchObject({ state: 'error', message: expect.stringContaining('校验') })
    expect(existsSync(join(dir, '2026.11.23.zip.download'))).toBe(false)
    expect(existsSync(join(dir, 'current.json'))).toBe(false)
  })

  it('清单里没有这个系统的包、系统不支持、连不上 GitHub 都给出原因', async () => {
    await expect(new YtEngine(dir, fakeDeps({ fetchText: vi.fn(async () => '') })).ensure()).rejects.toThrow('yt-dlp_macos.zip')
    await expect(new YtEngine(dir, fakeDeps({ platform: 'aix' })).ensure()).rejects.toThrow('aix')
    const offline = fakeDeps({ latest: vi.fn(async () => Promise.reject(new Error('ENOTFOUND'))) })
    await expect(new YtEngine(dir, offline).ensure()).rejects.toThrow('下载 YouTube 组件失败：ENOTFOUND')
    const broken = fakeDeps({ download: vi.fn(async () => Promise.reject('reset')) })
    await expect(new YtEngine(dir, broken).ensure()).rejects.toThrow('reset')
  })

  it('压缩包里没有程序、试运行版本不对、被杀毒软件拦下', async () => {
    const empty = makeZip([{ name: 'README', data: 'x' }])
    const noExe = fakeDeps({
      fetchText: vi.fn(async () => `${sha(empty)}  yt-dlp_macos.zip`),
      download: vi.fn(async (_u: string, dest: string) => writeFileSync(dest, empty))
    })
    await expect(new YtEngine(dir, noExe).ensure()).rejects.toThrow('无法运行：yt-dlp_macos.zip')
    await expect(new YtEngine(dir, fakeDeps({ run: vi.fn(async () => '') })).ensure()).rejects.toThrow('no output')
    await expect(new YtEngine(dir, fakeDeps({ run: vi.fn(async () => 'Traceback') })).ensure()).rejects.toThrow('Traceback')
    const blocked = fakeDeps({ run: vi.fn(async () => Promise.reject(Object.assign(new Error('spawn'), { code: 'EPERM' }))) })
    await expect(new YtEngine(dir, blocked).ensure()).rejects.toThrow('白名单')
    const crashed = fakeDeps({ run: vi.fn(async () => Promise.reject(new Error('exit 1'))) })
    await expect(new YtEngine(dir, crashed).ensure()).rejects.toThrow('无法运行：exit 1')
  })

  it('取消下载：状态回到未安装', async () => {
    let started!: () => void
    const begun = new Promise<void>((r) => (started = r))
    const deps = fakeDeps({
      download: vi.fn((_u: string, _d: string, signal: AbortSignal) => {
        started()
        return new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
      })
    })
    const engine = new YtEngine(dir, deps)
    const p = engine.ensure()
    await begun
    engine.cancel()
    await expect(p).rejects.toThrow('aborted')
    expect(engine.status()).toEqual({ state: 'missing', message: undefined })
  })

  it('试运行时取消：状态回到未安装', async () => {
    const engine = new YtEngine(dir, fakeDeps({
      run: vi.fn((_e: string, _a: string[], signal: AbortSignal) => {
        queueMicrotask(() => engine.cancel())
        return new Promise<string>((_, reject) => signal.addEventListener('abort', () => reject(new Error('killed'))))
      })
    }))
    await expect(engine.ensure()).rejects.toThrow('aborted')
    expect(engine.status().state).toBe('missing')
  })

  it('启动时清掉上次没装完的残留和旧版本', () => {
    mkdirSync(join(dir, '2026.1.1'), { recursive: true })
    mkdirSync(join(dir, 'x.partial'))
    writeFileSync(join(dir, 'x.zip.download'), '')
    new YtEngine(dir, fakeDeps())
    expect(readdirSync(dir)).toEqual([])
  })
})

describe('更新', () => {
  async function installed(deps = fakeDeps()): Promise<YtEngine> {
    const engine = new YtEngine(dir, deps)
    await engine.ensure()
    return engine
  }

  it('没装时不检查；距上次不到一天不检查，force 时检查', async () => {
    const deps = fakeDeps()
    expect((await new YtEngine(dir, deps).checkUpdate(true)).state).toBe('missing')
    expect(deps.latest).not.toHaveBeenCalled()
    const engine = await installed(deps)
    deps.latest.mockClear()
    await engine.checkUpdate()
    expect(deps.latest).not.toHaveBeenCalled()
    await engine.checkUpdate(true)
    expect(deps.latest).toHaveBeenCalledTimes(1)
    deps.clock += CHECK_INTERVAL
    await engine.checkUpdate()
    expect(deps.latest).toHaveBeenCalledTimes(2)
    expect(engine.status()).toMatchObject({ version: '2026.11.23', latest: '2026.11.23', checkedAt: deps.clock })
  })

  it('有新版本时换上；正在用旧版本的进程用完后再删旧目录', async () => {
    const deps = fakeDeps()
    const engine = await installed(deps)
    let release!: () => void
    const using = engine.use((exe) => new Promise<string>((r) => (release = () => r(exe))))
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    deps.latestVersion = '2026.12.1'
    const updating: boolean[] = []
    engine.on('status', (s) => updating.push(Boolean(s.updating)))
    await engine.checkUpdate(true)
    expect(updating).toContain(true)
    expect(engine.status()).toMatchObject({ state: 'ready', version: '2026.12.1' })
    expect(engine.exePath()).toBe(join(dir, '2026.12.1', 'yt-dlp_macos'))
    expect(existsSync(join(dir, '2026.11.23'))).toBe(true)
    release()
    expect(await using).toBe(join(dir, '2026.11.23', 'yt-dlp_macos'))
    expect(readdirSync(dir).sort()).toEqual(['2026.12.1', 'current.json'])
  })

  it('更新失败时旧版本照常能用，并带上原因；检查本身失败只在手动检查时提示', async () => {
    const deps = fakeDeps()
    const engine = await installed(deps)
    deps.latestVersion = '2026.12.1'
    deps.run.mockRejectedValueOnce(new Error('boom'))
    await engine.checkUpdate(true)
    expect(engine.status()).toMatchObject({ state: 'ready', version: '2026.11.23', message: expect.stringContaining('boom') })
    expect(engine.exePath()).toBe(join(dir, '2026.11.23', 'yt-dlp_macos'))

    deps.latest.mockRejectedValue(new Error('offline'))
    deps.clock += CHECK_INTERVAL
    await engine.checkUpdate()
    expect(engine.status().message).toContain('boom')
    await engine.checkUpdate(true)
    expect(engine.status().message).toContain('offline')
  })

  it('use 抛出的错误原样传出，计数照样归还', async () => {
    const engine = await installed()
    await expect(engine.use(async () => Promise.reject(new Error('x')))).rejects.toThrow('x')
    await Promise.all([engine.use(async () => 1), engine.use(async () => 2)])
  })
})

describe('defaultDeps', () => {
  const res = (body: unknown, init: ResponseInit = {}): Response =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), init)

  it('最新版本：先问 GitHub 接口，被限流时看 releases/latest 的跳转', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res({ tag_name: '2026.11.23' }))
      .mockResolvedValueOnce(res('limited', { status: 403 }))
      .mockResolvedValueOnce(res('', { status: 302, headers: { location: 'https://github.com/yt-dlp/yt-dlp/releases/tag/2026.12.1' } }))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(res('', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    const { latest } = defaultDeps()
    const signal = new AbortController().signal
    expect(await latest(signal)).toBe('2026.11.23')
    expect(await latest(signal)).toBe('2026.12.1')
    await expect(latest(signal)).rejects.toThrow('HTTP 404')
  })

  it('接口返回的内容没有版本号时也看跳转；中止时不再重试', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res({}))
      .mockResolvedValueOnce(res('', { status: 302, headers: { location: '/yt-dlp/yt-dlp/releases/tag/2026.10.1' } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await defaultDeps().latest(new AbortController().signal)).toBe('2026.10.1')
    const ac = new AbortController()
    ac.abort()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('aborted')))
    await expect(defaultDeps().latest(ac.signal)).rejects.toThrow('aborted')
  })

  it('fetchText 遇到错误状态码报错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(res('sums')).mockResolvedValueOnce(res('', { status: 500 })))
    const { fetchText } = defaultDeps()
    const signal = new AbortController().signal
    expect(await fetchText('u', signal)).toBe('sums')
    await expect(fetchText('u', signal)).rejects.toThrow('HTTP 500')
  })

  it('run 返回标准输出，失败时报错', async () => {
    const { run } = defaultDeps()
    const signal = new AbortController().signal
    expect((await run(process.execPath, ['-e', 'process.stdout.write("v1")'], signal)).trim()).toBe('v1')
    await expect(run(process.execPath, ['-e', 'process.exit(3)'], signal)).rejects.toThrow()
  })
})
