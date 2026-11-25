import type { ChildProcess, spawn as nodeSpawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UnsupportedError } from '../bili/http'
import { AbortError } from '../download/errors'
import { baseArgs, killTree, parseProgress, PROGRESS_ARGS, PROGRESS_PREFIX, runYtdlp, type YtEnv } from './run'

/** 假的子进程：测试里手动 emit stdout / stderr / close / error */
class FakeChild extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  pid: number | undefined = 4321
  exitCode: number | null = null
  kill = vi.fn(() => true)
}

const asChild = (c: FakeChild): ChildProcess => c as unknown as ChildProcess

/** 第一次调用返回 yt-dlp 进程，之后（taskkill）各返回一个新的假进程 */
function fakeSpawn(): { spawn: typeof nodeSpawn; child: FakeChild; calls: unknown[][]; others: FakeChild[] } {
  const child = new FakeChild()
  const others: FakeChild[] = []
  const calls: unknown[][] = []
  const spawn = vi.fn((...args: unknown[]) => {
    calls.push(args)
    if (calls.length === 1) return child
    const p = new FakeChild()
    others.push(p)
    return p
  })
  return { spawn: spawn as unknown as typeof nodeSpawn, child, calls, others }
}

const ENV: YtEnv = { exe: '/bin/yt-dlp', jsRuntime: '/app/node' }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseProgress', () => {
  const line = (o: object): string => `${PROGRESS_PREFIX}${JSON.stringify(o)}`

  it('不是进度行、JSON 坏了时返回空', () => {
    expect(parseProgress('[download] 50%')).toBeUndefined()
    expect(parseProgress(`${PROGRESS_PREFIX}{bad`)).toBeUndefined()
  })

  it('下载中：总大小优先 total_bytes，没有时用估算值并取整', () => {
    expect(parseProgress(line({ status: 'downloading', downloaded_bytes: 10, total_bytes: 100, filename: 'a.mp4' }))).toEqual({
      status: 'downloading',
      downloaded: 10,
      total: 100,
      filename: 'a.mp4'
    })
    expect(parseProgress(line({ status: 'downloading', downloaded_bytes: 10, total_bytes: null, total_bytes_estimate: 99.6 }))).toEqual({
      status: 'downloading',
      downloaded: 10,
      total: 100,
      filename: undefined
    })
  })

  it('finished、error 原样保留，其他状态当作下载中；缺字段时下载量为 0、总量为空', () => {
    expect(parseProgress(line({ status: 'finished', downloaded_bytes: 5, total_bytes: 5 }))?.status).toBe('finished')
    expect(parseProgress(line({ status: 'error' }))).toEqual({ status: 'error', downloaded: 0, total: undefined, filename: undefined })
    expect(parseProgress(line({ status: 'whatever', total_bytes: 0 }))).toEqual({ status: 'downloading', downloaded: 0, total: undefined, filename: undefined })
    expect(parseProgress(line({}))?.status).toBe('downloading')
  })

  it('进度参数里用的是同一个前缀', () => {
    expect(PROGRESS_ARGS.join(' ')).toContain(`download:${PROGRESS_PREFIX}%(progress)j`)
  })
})

describe('baseArgs', () => {
  it('最少的参数：不读配置、UTF-8、只用指定的 Node、直连、不缓存', () => {
    expect(baseArgs(ENV)).toEqual([
      '--ignore-config',
      '--encoding', 'utf-8',
      '--no-color',
      '--no-warnings',
      '--no-js-runtimes',
      '--js-runtimes', 'node:/app/node',
      '--proxy', '',
      '--no-cache-dir'
    ])
  })

  it('带上 ffmpeg、代理、cookie 和缓存目录', () => {
    const args = baseArgs({ ...ENV, ffmpeg: '/ff', proxy: 'socks5://127.0.0.1:1080', cookies: '/c.txt', cacheDir: '/cache' })
    expect(args.join(' ')).toContain('--ffmpeg-location /ff --proxy socks5://127.0.0.1:1080 --cookies /c.txt --cache-dir /cache')
    expect(args).not.toContain('--no-cache-dir')
  })
})

describe('killTree', () => {
  it('已退出或没有 pid 时什么都不做', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    const { spawn } = fakeSpawn()
    const exited = new FakeChild()
    exited.exitCode = 0
    killTree(asChild(exited), 'linux', spawn)
    const noPid = new FakeChild()
    noPid.pid = undefined
    killTree(asChild(noPid), 'win32', spawn)
    expect(kill).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
    expect(exited.kill).not.toHaveBeenCalled()
    expect(noPid.kill).not.toHaveBeenCalled()
  })

  it('POSIX：结束整个进程组', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    const c = new FakeChild()
    killTree(asChild(c), 'darwin')
    expect(kill).toHaveBeenCalledWith(-4321, 'SIGTERM')
    expect(c.kill).not.toHaveBeenCalled()
  })

  it('POSIX：进程组结束失败时退回只结束它自己', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH')
    })
    const c = new FakeChild()
    killTree(asChild(c), 'linux')
    expect(c.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('Windows：用 taskkill 结束进程树，taskkill 启动失败时退回 kill', () => {
    const proc = new FakeChild()
    const spawn = vi.fn(() => proc)
    const c = new FakeChild()
    killTree(asChild(c), 'win32', spawn as unknown as typeof nodeSpawn)
    expect(spawn).toHaveBeenCalledWith('taskkill', ['/pid', '4321', '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    expect(c.kill).not.toHaveBeenCalled()
    proc.emit('error', new Error('ENOENT'))
    expect(c.kill).toHaveBeenCalledWith()
  })
})

describe('runYtdlp', () => {
  it('启动参数：公共参数在前，环境变量让 Node 模式运行、输出 UTF-8；POSIX 上 detached', async () => {
    const { spawn, child, calls } = fakeSpawn()
    const p = runYtdlp(ENV, ['-J', 'url'], { spawn, platform: 'linux' })
    child.emit('close', 0)
    await p
    const [exe, args, opts] = calls[0] as [string, string[], { env: NodeJS.ProcessEnv; detached: boolean; windowsHide: boolean; stdio: string[] }]
    expect(exe).toBe('/bin/yt-dlp')
    expect(args).toEqual([...baseArgs(ENV), '-J', 'url'])
    expect(opts.env).toMatchObject({ ELECTRON_RUN_AS_NODE: '1', PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' })
    expect(opts.env.PATH).toBe(process.env.PATH)
    expect(opts.detached).toBe(true)
    expect(opts.windowsHide).toBe(true)
    expect(opts.stdio).toEqual(['ignore', 'pipe', 'pipe'])
  })

  it('Windows 上不 detached', async () => {
    const { spawn, child, calls } = fakeSpawn()
    const p = runYtdlp(ENV, [], { spawn, platform: 'win32' })
    child.emit('close', 0)
    await p
    expect((calls[0][2] as { detached: boolean }).detached).toBe(false)
  })

  it('不传 onLine 时整段收集标准输出', async () => {
    const { spawn, child } = fakeSpawn()
    const p = runYtdlp(ENV, [], { spawn, platform: 'linux' })
    child.stdout.emit('data', Buffer.from('{"id":'))
    child.stdout.emit('data', Buffer.from('"中文"}\n'))
    child.stderr.emit('data', Buffer.from('WARNING: x\n'))
    child.emit('close', 0)
    expect(await p).toEqual({ stdout: '{"id":"中文"}\n', stderr: 'WARNING: x\n' })
  })

  it('传 onLine 时逐行回调，跳过空行，最后不带换行的半行在结束时补上', async () => {
    const { spawn, child } = fakeSpawn()
    const lines: string[] = []
    const p = runYtdlp(ENV, [], { spawn, platform: 'linux', onLine: (l) => lines.push(l) })
    child.stdout.emit('data', Buffer.from('a\nb'))
    child.stdout.emit('data', Buffer.from('c\r\n\r\nd'))
    expect(lines).toEqual(['a', 'bc'])
    child.emit('close', 0)
    expect(await p).toEqual({ stdout: '', stderr: '' })
    expect(lines).toEqual(['a', 'bc', 'd'])
  })

  it('最后以换行结束时不多回调', async () => {
    const { spawn, child } = fakeSpawn()
    const onLine = vi.fn()
    const p = runYtdlp(ENV, [], { spawn, platform: 'linux', onLine })
    child.stdout.emit('data', Buffer.from('x\n'))
    child.emit('close', 0)
    await p
    expect(onLine.mock.calls).toEqual([['x']])
  })

  it('stderr 只保留末尾 64KB', async () => {
    const { spawn, child } = fakeSpawn()
    const p = runYtdlp(ENV, [], { spawn, platform: 'linux' })
    child.stderr.emit('data', Buffer.from('HEAD'))
    child.stderr.emit('data', Buffer.from('x'.repeat(70_000)))
    child.stderr.emit('data', Buffer.from('END'))
    child.emit('close', 0)
    const { stderr } = await p
    expect(stderr.length).toBe(64 * 1024)
    expect(stderr.startsWith('HEAD')).toBe(false)
    expect(stderr.endsWith('xEND')).toBe(true)
  })

  it('非 0 退出时按 stderr 分类抛错', async () => {
    const { spawn, child } = fakeSpawn()
    const p = runYtdlp(ENV, [], { spawn, platform: 'linux' })
    child.stderr.emit('data', Buffer.from('ERROR: [youtube] dQw4w9WgXcQ: Video unavailable\n'))
    child.emit('close', 1)
    const e = await p.catch((x: unknown) => x)
    expect(e).toBeInstanceOf(UnsupportedError)
    expect((e as Error).message).toContain('Video unavailable')
  })

  it('非 0 退出且没有输出时报退出码', async () => {
    const { spawn, child } = fakeSpawn()
    const p = runYtdlp(ENV, [], { spawn, platform: 'linux' })
    child.emit('close', 3)
    await expect(p).rejects.toThrow('代码 3')
  })

  it('中止时结束进程组并抛 AbortError；之后不再响应中止', async () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    const { spawn, child } = fakeSpawn()
    const ac = new AbortController()
    const onLine = vi.fn()
    const p = runYtdlp(ENV, [], { spawn, platform: 'linux', signal: ac.signal, onLine })
    child.stdout.emit('data', Buffer.from('half'))
    ac.abort()
    expect(kill).toHaveBeenCalledWith(-4321, 'SIGTERM')
    child.emit('close', null)
    await expect(p).rejects.toBeInstanceOf(AbortError)
    // 半行照样交出去
    expect(onLine).toHaveBeenCalledWith('half')
  })

  it('Windows 上中止时用 taskkill', async () => {
    const { spawn, child, calls } = fakeSpawn()
    const ac = new AbortController()
    const p = runYtdlp(ENV, [], { spawn, platform: 'win32', signal: ac.signal })
    ac.abort()
    expect(calls[1][0]).toBe('taskkill')
    child.emit('close', 1)
    await expect(p).rejects.toBeInstanceOf(AbortError)
  })

  it('正常结束后移除中止监听', async () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    const { spawn, child } = fakeSpawn()
    const ac = new AbortController()
    const p = runYtdlp(ENV, [], { spawn, platform: 'linux', signal: ac.signal })
    child.emit('close', 0)
    await p
    ac.abort()
    expect(kill).not.toHaveBeenCalled()
  })

  it('已经中止时不启动进程，直接拒绝', async () => {
    const { spawn } = fakeSpawn()
    const ac = new AbortController()
    ac.abort()
    await expect(runYtdlp(ENV, [], { spawn, signal: ac.signal })).rejects.toBeInstanceOf(AbortError)
    expect(spawn).not.toHaveBeenCalled()
  })

  it('启动失败（error 事件）时原样抛出，并移除中止监听', async () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    const { spawn, child } = fakeSpawn()
    const ac = new AbortController()
    const p = runYtdlp(ENV, [], { spawn, platform: 'linux', signal: ac.signal })
    const boom = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })
    child.emit('error', boom)
    await expect(p).rejects.toBe(boom)
    ac.abort()
    expect(kill).not.toHaveBeenCalled()
  })

  it('不注入时用真实的 spawn：程序不存在报 ENOENT', async () => {
    await expect(runYtdlp({ exe: '/nonexistent/yt-dlp-test', jsRuntime: 'node' }, [])).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
