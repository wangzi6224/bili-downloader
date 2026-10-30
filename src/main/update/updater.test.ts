import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateState } from '@shared/types'

const m = vi.hoisted(() => ({
  blocker: undefined as string | undefined,
  send: vi.fn(),
  openExternal: vi.fn(),
  quitConfirmed: vi.fn(),
  installBlocker: vi.fn(),
  prepare: vi.fn(),
  replaceAfterExit: vi.fn()
}))

vi.mock('electron', () => ({ app: { getVersion: () => '0.4.0' }, shell: { openExternal: m.openExternal } }))
vi.mock('../logger', () => ({ logDir: () => '/logs' }))
vi.mock('../quitGuard', () => ({ quitConfirmed: m.quitConfirmed }))
vi.mock('../windows', () => ({ send: m.send }))
vi.mock('./install', () => ({ installBlocker: m.installBlocker, prepare: m.prepare, replaceAfterExit: m.replaceAfterExit }))

type Handler = (req: IncomingMessage, res: ServerResponse) => void

const PAYLOAD = randomBytes(256 * 1024)
const SHA = createHash('sha512').update(PAYLOAD).digest('base64')
const ARCH = process.arch
/** 当前系统在 update.json 里的键和安装包后缀：macOS 是 x64 / zip，Linux 是 linux-x64 / AppImage */
const KEY = process.platform === 'darwin' ? ARCH : `${process.platform}-${ARCH}`
const EXT = process.platform === 'darwin' ? 'zip' : process.platform === 'win32' ? 'exe' : 'AppImage'
const ORIGINAL_PLATFORM = Object.getOwnPropertyDescriptor(process, 'platform')!
const ORIGINAL_ARCH = Object.getOwnPropertyDescriptor(process, 'arch')!
const ORIGINAL_FEED = process.env.BILI_UPDATE_FEED
// 假时钟会替换全局的 setTimeout，先留一份真的用来等本地 http 服务
const realTimeout = globalThis.setTimeout.bind(globalThis)

let server: Server
let base = ''
let feed: { status: number; body: unknown }
let serveZip: Handler
const requests: { url: string; range?: string }[] = []
const zipRequests = (): typeof requests => requests.filter((r) => r.url === '/a.zip')

/** 支持断点续传的下载源 */
const ranged =
  (data: Buffer): Handler =>
  (req, res) => {
    const from = Number(/^bytes=(\d+)-$/.exec(req.headers.range ?? '')?.[1] ?? 0)
    res.writeHead(from ? 206 : 200, { 'Content-Length': data.length - from })
    res.end(data.subarray(from))
  }
/** 不理会 Range，总是返回整个文件 */
const whole =
  (data: Buffer): Handler =>
  (_req, res) => {
    res.writeHead(200, { 'Content-Length': data.length })
    res.end(data)
  }
const status =
  (code: number): Handler =>
  (_req, res) => {
    res.writeHead(code)
    res.end('x')
  }
/** 发出一小段就不动了 */
const hang: Handler = (_req, res) => {
  res.writeHead(200, { 'Content-Length': PAYLOAD.length })
  res.write(PAYLOAD.subarray(0, 1024))
}
/** 前 n 次用 first 处理，之后用 then */
const times =
  (n: number, first: Handler, then: Handler): Handler =>
  (req, res) =>
    (n-- > 0 ? first : then)(req, res)

const FILE = (): { url: string; sha512: string; size: number } => ({ url: `${base}/a.zip`, sha512: SHA, size: PAYLOAD.length })
const manifest = (version = '0.5.0', files: Record<string, unknown> = { [KEY]: FILE() }) => ({
  version,
  date: '2026-10-20',
  page: `${base}/release/v${version}`,
  notes: [
    { version: '0.4.0', date: '2026-10-01', body: '当前版本' },
    { version: '0.5.0', date: '2026-10-20', body: '新版本' },
    { version: '0.4.5', date: '2026-10-10', body: '中间版本' }
  ],
  files
})

beforeAll(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterAll(() => {
  if (ORIGINAL_FEED === undefined) delete process.env.BILI_UPDATE_FEED
  else process.env.BILI_UPDATE_FEED = ORIGINAL_FEED
  vi.restoreAllMocks()
})

// 每个用例用新的服务和端口，上一个用例断开的连接不会被复用
beforeEach(async () => {
  server = createServer((req, res) => {
    requests.push({ url: req.url!, range: req.headers.range })
    if (req.url === '/update.json') {
      res.writeHead(feed.status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(feed.body))
    } else if (req.url === '/a.zip') serveZip(req, res)
    else status(404)(req, res)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  server.closeAllConnections()
  await new Promise<void>((r) => server.close(() => r()))
})

let root: string
let dir: string
let prefs: string
const zipPath = (v = '0.5.0'): string => join(dir, `bili-downloader-${v}-${ARCH}.${EXT}`)

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'bili-updater-'))
  dir = join(root, 'updates')
  prefs = join(root, 'prefs.json')
  feed = { status: 200, body: manifest() }
  serveZip = ranged(PAYLOAD)
  requests.length = 0
  m.blocker = undefined
  vi.clearAllMocks()
  m.installBlocker.mockImplementation(() => m.blocker)
  m.prepare.mockResolvedValue('/stage/B站下载器.app')
})

afterEach(() => {
  Object.defineProperty(process, 'platform', ORIGINAL_PLATFORM)
  vi.useRealTimers()
  rmSync(root, { recursive: true, force: true })
})

/** FEED 在模块加载时就定下来了，所以每次都重新导入 */
async function load(feedUrl: string | null = `${base}/update.json`) {
  vi.resetModules()
  if (feedUrl === null) delete process.env.BILI_UPDATE_FEED
  else process.env.BILI_UPDATE_FEED = feedUrl
  const { Updater } = await import('./updater')
  return new Updater(dir, prefs)
}

/**
 * 等到 cond 成立：每轮先真等几毫秒，让本地 http 服务收发数据，
 * 开着假时钟时再把它往前拨 advance 毫秒（重试退避、看门狗）
 */
async function until(cond: () => boolean, advance = 0): Promise<void> {
  const end = performance.now() + 4000
  while (!cond()) {
    if (performance.now() > end) throw new Error('等待超时')
    await new Promise((r) => realTimeout(r, 5))
    if (advance) await vi.advanceTimersByTimeAsync(advance)
  }
}

type U = Awaited<ReturnType<typeof load>>
const statusOf = (u: U): UpdateState['status'] => u.getState().status
const prompts = (): number => m.send.mock.calls.filter((c) => c[0] === 'update:prompt').length
const sentStatuses = (): string[] =>
  m.send.mock.calls.filter((c) => c[0] === 'update:state').map((c) => (c[1] as UpdateState).status)
const errorOf = (u: U): string => {
  const s = u.getState()
  return s.status === 'error' ? s.error : ''
}

async function readyUpdater(): Promise<U> {
  mkdirSync(dir, { recursive: true })
  writeFileSync(zipPath(), PAYLOAD)
  const u = await load()
  await u.check(true)
  expect(statusOf(u)).toBe('ready')
  return u
}

describe('check', () => {
  it('初始状态是 idle，带当前版本', async () => {
    const u = await load()
    expect(u.getState()).toEqual({ status: 'idle', current: '0.4.0' })
  })

  it('已是最新版本', async () => {
    feed.body = manifest('0.4.0')
    const u = await load()
    const s = await u.check(true)
    expect(s).toMatchObject({ status: 'latest', current: '0.4.0' })
    expect(s.checkedAt).toEqual(expect.any(Number))
    expect(sentStatuses()).toEqual(['checking', 'latest'])
    expect(requests[0].url).toBe('/update.json')
  })

  it('发现新版本：只带当前版本之后的说明，后台检查时弹窗提示', async () => {
    const u = await load()
    const s = await u.check(false)
    expect(s).toMatchObject({
      status: 'available',
      info: { version: '0.5.0', date: '2026-10-20', page: `${base}/release/v0.5.0`, size: PAYLOAD.length, skipped: false }
    })
    if (s.status !== 'available') throw new Error(s.status)
    expect(s.info.blocker).toBeUndefined()
    expect(s.info.notes.map((n) => n.version)).toEqual(['0.5.0', '0.4.5'])
    expect(prompts()).toBe(1)
  })

  it('不能自动安装时带上原因，已下载的安装包也不算就绪', async () => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(zipPath(), PAYLOAD)
    m.blocker = '开发模式下不能自动安装'
    const u = await load()
    const s = await u.check(true)
    expect(s).toMatchObject({ status: 'available', info: { blocker: '开发模式下不能自动安装' } })
  })

  it('之前下载好的安装包校验通过时直接就绪', async () => {
    const u = await readyUpdater()
    expect(zipRequests()).toHaveLength(0)
    // 已就绪就不再检查
    await u.check(true)
    expect(requests).toHaveLength(1)
  })

  it('缓存的安装包大小不对或读不了时当作没有', async () => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(zipPath(), PAYLOAD.subarray(1))
    let u = await load()
    expect((await u.check(true)).status).toBe('available')

    writeFileSync(zipPath(), PAYLOAD)
    chmodSync(zipPath(), 0o000)
    u = await load()
    expect((await u.check(true)).status).toBe(process.platform === 'win32' || process.getuid?.() === 0 ? 'ready' : 'available')
  })

  it('macOS 和 Linux 的安装包在同一份清单里，各取各的', async () => {
    const other = { url: 'https://example.com/other', sha512: 'x', size: 1 }
    feed.body = manifest('0.5.0', { arm64: other, x64: other, 'linux-x64': other, [KEY]: FILE() })
    const u = await load()
    expect((await u.check(true)).status).toBe('available')
    expect((u.getState() as { info: { size: number } }).info.size).toBe(PAYLOAD.length)
  })

  it('新版本缺当前架构的安装包', async () => {
    feed.body = manifest('0.5.0', { 'not-this-arch': FILE() })
    const u = await load()
    await u.check(true)
    expect(errorOf(u)).toBe(`检查更新失败：新版本 0.5.0 没有 ${KEY} 的安装包`)
  })

  it('Windows 取 win32-x64 清单项并下载、校验和交接 NSIS 安装器', async () => {
    Object.defineProperty(process, 'platform', { ...ORIGINAL_PLATFORM, value: 'win32' })
    // 清单的键和安装包的文件名都按本机架构取，Apple 芯片的 Mac 上跑测试时也要当成 x64
    Object.defineProperty(process, 'arch', { ...ORIGINAL_ARCH, value: 'x64' })
    const installer = join(dir, 'bili-downloader-0.5.0-x64.exe')
    feed.body = manifest('0.5.0', { 'win32-x64': FILE() })
    m.prepare.mockResolvedValue(installer)
    try {
      const u = await load()
      expect((await u.check(true)).status).toBe('available')
      u.download()
      await until(() => statusOf(u) === 'ready')
      expect(readFileSync(installer)).toEqual(PAYLOAD)
      await u.install()
      expect(m.prepare).toHaveBeenCalledWith(installer, join(dir, 'stage'), '0.5.0')
      expect(m.replaceAfterExit).toHaveBeenCalledWith(installer, dir, join('/logs', 'update.log'))
    } finally {
      Object.defineProperty(process, 'platform', ORIGINAL_PLATFORM)
      Object.defineProperty(process, 'arch', ORIGINAL_ARCH)
    }
  })

  it('还没有发布过版本（404）', async () => {
    feed.status = 404
    const u = await load()
    await u.check(true)
    expect(errorOf(u)).toBe('检查更新失败：服务器上还没有发布任何版本')
    expect(u.getState().checkedAt).toEqual(expect.any(Number))
  })

  it('服务器出错（500）', async () => {
    feed.status = 500
    const u = await load()
    await u.check(true)
    expect(errorOf(u)).toBe('检查更新失败：HTTP 500')
  })

  it('清单格式不对', async () => {
    feed.body = { version: 'x' }
    const u = await load()
    await u.check(true)
    expect(errorOf(u)).toBe('检查更新失败：更新信息格式不对：version')
  })

  it('同一个版本只弹一次，手动检查和跳过的版本不弹', async () => {
    const u = await load()
    await u.check(false)
    await u.check(false)
    expect(prompts()).toBe(1)
    // 后台检查发现过新版本后，再查时不先切到 checking
    expect(sentStatuses()).toEqual(['checking', 'available', 'available'])

    feed.body = manifest('0.6.0', { [KEY]: FILE() })
    await u.check(false)
    expect(prompts()).toBe(2)

    m.send.mockClear()
    await (await load()).check(true)
    expect(prompts()).toBe(0)

    writeFileSync(prefs, JSON.stringify({ skipVersion: '0.6.0' }))
    const skipped = await (await load()).check(false)
    expect(skipped).toMatchObject({ status: 'available', info: { skipped: true } })
    expect(prompts()).toBe(0)
  })

  it('后台检查失败时保留之前发现的新版本，手动检查失败才报错', async () => {
    const u = await load()
    const before = await u.check(false)
    feed.status = 500
    m.send.mockClear()
    const after = await u.check(false)
    expect(after).toEqual(before)
    expect(sentStatuses()).toEqual(['available'])

    await u.check(true)
    expect(errorOf(u)).toBe('检查更新失败：HTTP 500')
    expect('info' in u.getState()).toBe(false)
  })

  it('检查中再调用会等同一次的结果，查完可以再查', async () => {
    const u = await load()
    const first = u.check(true)
    const second = u.check(true)
    expect(await second).toBe(await first)
    expect((await second).status).not.toBe('checking')
    expect(requests).toHaveLength(1)
    await u.check(true)
    expect(requests).toHaveLength(2)
  })

  it('没有设置测试地址时去 GitHub 取，且不接受本机 http 地址', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json(manifest()))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const u = await load(null)
      await u.check(true)
      expect(fetchMock.mock.calls[0][0]).toBe('https://github.com/wangzi6224/bili-downloader/releases/latest/download/update.json')
      await u.check(true)
      expect(errorOf(u)).toBe('检查更新失败：更新信息格式不对：page')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('download', () => {
  async function available(): Promise<U> {
    const u = await load()
    await u.check(true)
    expect(statusOf(u)).toBe('available')
    return u
  }
  const part = (): string => `${zipPath()}.part`

  it('没有可下载的新版本时什么都不做', async () => {
    const u = await load()
    u.download()
    expect(statusOf(u)).toBe('idle')
    feed.status = 500
    await u.check(true)
    u.download()
    expect(statusOf(u)).toBe('error')
    expect(zipRequests()).toHaveLength(0)
  })

  it('不能自动安装时报出原因', async () => {
    m.blocker = '自动安装只支持 macOS'
    const u = await available()
    expect(() => u.download()).toThrow('自动安装只支持 macOS')
  })

  it('下载并校验后就绪，只留下这次的安装包', async () => {
    mkdirSync(join(dir, 'stage'), { recursive: true })
    for (const name of [`bili-downloader-0.4.5-${ARCH}.${EXT}`, 'install.sh', `bili-downloader-0.6.0-${ARCH}.${EXT}.part`]) {
      writeFileSync(join(dir, name), 'old')
    }
    const u = await available()
    u.download()
    expect(u.getState()).toMatchObject({ status: 'downloading', done: 0, total: PAYLOAD.length })
    await until(() => statusOf(u) === 'ready')
    expect(readFileSync(zipPath())).toEqual(PAYLOAD)
    expect(readdirSync(dir)).toEqual([`bili-downloader-0.5.0-${ARCH}.${EXT}`])
    expect(zipRequests()).toEqual([{ url: '/a.zip', range: undefined }])
  })

  it('已有一部分时用 Range 续传（206）', async () => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(part(), PAYLOAD.subarray(0, 1000))
    const u = await available()
    u.download()
    await until(() => statusOf(u) === 'ready')
    expect(zipRequests()[0].range).toBe('bytes=1000-')
    expect(readFileSync(zipPath())).toEqual(PAYLOAD)
  })

  it('服务器不支持续传（200）时从头写', async () => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(part(), Buffer.alloc(1000, 1))
    serveZip = whole(PAYLOAD)
    const u = await available()
    u.download()
    await until(() => statusOf(u) === 'ready')
    expect(zipRequests()[0].range).toBe('bytes=1000-')
    expect(readFileSync(zipPath())).toEqual(PAYLOAD)
  })

  it('.part 不比安装包小时删掉重下', async () => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(part(), Buffer.alloc(PAYLOAD.length + 10))
    const u = await available()
    u.download()
    await until(() => statusOf(u) === 'ready')
    expect(zipRequests()[0].range).toBeUndefined()
    expect(readFileSync(zipPath())).toEqual(PAYLOAD)
  })

  it('安装包已经在本地且完好时不再下载', async () => {
    const u = await available()
    mkdirSync(dir, { recursive: true })
    writeFileSync(zipPath(), PAYLOAD)
    u.download()
    await until(() => statusOf(u) === 'ready')
    expect(zipRequests()).toHaveLength(0)
  })

  it('校验不通过时删掉 .part 并报错，不重试', async () => {
    const bad = Buffer.from(PAYLOAD)
    bad[0] ^= 0xff
    serveZip = whole(bad)
    const u = await available()
    u.download()
    await until(() => statusOf(u) === 'error')
    expect(errorOf(u)).toBe('下载更新失败：安装包校验不通过（文件损坏或被篡改），请重试')
    expect(existsSync(part())).toBe(false)
    expect(zipRequests()).toHaveLength(1)
    // 出错后可以再下
    serveZip = ranged(PAYLOAD)
    u.download()
    await until(() => statusOf(u) === 'ready')
  })

  it('出错后退避重试，成功就停', async () => {
    serveZip = times(1, status(500), ranged(PAYLOAD))
    const u = await available()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    u.download()
    await until(() => statusOf(u) === 'ready', 1000)
    expect(zipRequests()).toHaveLength(2)
    expect(console.warn).toHaveBeenCalledWith('下载更新出错，第 1 次重试', expect.any(Error))
  })

  it('最多试 4 次', async () => {
    serveZip = status(500)
    const u = await available()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    u.download()
    await until(() => statusOf(u) === 'error', 1000)
    expect(errorOf(u)).toBe('下载更新失败：HTTP 500')
    expect(zipRequests()).toHaveLength(4)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(zipRequests()).toHaveLength(4)
  })

  it('一分钟没收到数据就断开重连', async () => {
    serveZip = times(1, hang, ranged(PAYLOAD))
    const u = await available()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    u.download()
    await until(() => u.getState().status === 'downloading' && (u.getState() as { done: number }).done > 0)
    const sent = m.send.mock.calls.length
    await vi.advanceTimersByTimeAsync(65_000)
    await until(() => statusOf(u) === 'ready', 1000)
    expect(zipRequests()).toHaveLength(2)
    // 隔了很久之后的进度会推送出去。断开前收到的数据不一定已经写进 .part（Windows 上常常没有），重连可能是续传也可能从头下
    const later = m.send.mock.calls.slice(sent).map((c) => c[1] as { status: string })
    expect(later.some((s) => s.status === 'downloading')).toBe(true)
  })

  it('取消后回到 available，不重试，下载中不再检查', async () => {
    serveZip = hang
    const u = await available()
    u.download()
    await until(() => u.getState().status === 'downloading' && (u.getState() as { done: number }).done > 0)
    expect((await u.check(true)).status).toBe('downloading')
    // 下载中再点下载不会开第二个
    u.download()
    u.cancel()
    await until(() => statusOf(u) === 'available')
    expect(zipRequests()).toHaveLength(1)
    expect(requests.filter((r) => r.url === '/update.json')).toHaveLength(1)
    expect(console.error).not.toHaveBeenCalledWith('下载更新失败', expect.anything())
  })
})

describe('install', () => {
  it('还没下载好时拒绝', async () => {
    const u = await load()
    await expect(u.install()).rejects.toThrow('更新还没有下载完成')
  })

  it('下载后又不能安装时拒绝', async () => {
    const u = await readyUpdater()
    m.blocker = '没有权限修改 /Applications'
    await expect(u.install()).rejects.toThrow('没有权限修改 /Applications')
    expect(statusOf(u)).toBe('ready')
  })

  it('安装包损坏时报错并保留版本信息', async () => {
    const u = await readyUpdater()
    writeFileSync(zipPath(), Buffer.alloc(PAYLOAD.length))
    await u.install()
    expect(u.getState()).toMatchObject({ status: 'error', error: '安装更新失败：安装包已损坏，请重新下载', info: { version: '0.5.0' } })
    expect(m.prepare).not.toHaveBeenCalled()
  })

  it('解压校验出错时原样报出', async () => {
    const u = await readyUpdater()
    m.prepare.mockRejectedValueOnce(new Error('安装包不是本应用（com.other）'))
    await u.install()
    expect(u.getState()).toMatchObject({ info: { version: '0.5.0' } })
    expect(m.quitConfirmed).not.toHaveBeenCalled()
    // 出错后状态是 error，要重新检查到 ready 才能再装
    await expect(u.install()).rejects.toThrow('更新还没有下载完成')
  })

  it('非 Error 的异常也能报出来', async () => {
    const u = await readyUpdater()
    m.prepare.mockRejectedValueOnce('坏了')
    await u.install()
    expect(errorOf(u)).toBe('安装更新失败：坏了')
  })

  it('解压后启动替换脚本并退出', async () => {
    const u = await readyUpdater()
    await u.install()
    expect(m.prepare).toHaveBeenCalledWith(zipPath(), join(dir, 'stage'), '0.5.0')
    expect(m.replaceAfterExit).toHaveBeenCalledWith('/stage/B站下载器.app', dir, join('/logs', 'update.log'))
    expect(m.quitConfirmed).toHaveBeenCalled()
    expect(statusOf(u)).toBe('installing')
  })
})

describe('start / stop', () => {
  it('只留下比当前版本新的安装包', async () => {
    const keep = [
      `bili-downloader-0.5.0-${ARCH}.zip`,
      'bili-downloader-0.6.0-beta.1-x64.zip.part',
      'bili-downloader-0.5.1-x64.AppImage',
      'bili-downloader-0.6.0-x64.AppImage.part',
      'bili-downloader-0.6.0-x64.exe',
      'bili-downloader-0.6.0-x64.exe.part'
    ]
    const drop = [
      `bili-downloader-0.4.0-${ARCH}.zip`,
      'bili-downloader-0.4.0-x64.AppImage',
      'bili-downloader-0.5.0-x64.deb',
      'bili-downloader-0.3.9-x64.zip',
      `bili-downloader-0.4.0-rc.1-${ARCH}.zip`,
      `bili-downloader-latest-${ARCH}.zip`,
      'bili-downloader-0.5.0.zip',
      'install.sh',
      'notes.txt'
    ]
    mkdirSync(join(dir, 'stage/B站下载器.app'), { recursive: true })
    for (const name of [...keep, ...drop]) writeFileSync(join(dir, name), 'x')
    const u = await load()
    u.start(() => false)
    u.stop()
    expect(readdirSync(dir).sort()).toEqual([...keep].sort())
    expect(requests).toHaveLength(0)
  })

  it('目录不存在时跳过清理，清理出错只记日志', async () => {
    const u = await load()
    u.start(() => false)
    u.stop()
    expect(console.warn).not.toHaveBeenCalled()

    // 同名的普通文件让 readdir 出错
    writeFileSync(dir, 'x')
    const v = await load()
    v.start(() => false)
    v.stop()
    expect(console.warn).toHaveBeenCalledWith('清理更新文件失败', expect.any(Error))
  })

  it('开启时立即检查，之后每天按设置再查一次，stop 后不再查', async () => {
    feed.body = manifest('0.4.0')
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const u = await load()
    let enabled = true
    const feedHits = (): number => requests.filter((r) => r.url === '/update.json').length
    u.start(() => enabled)
    await until(() => statusOf(u) === 'latest')
    expect(feedHits()).toBe(1)

    enabled = false
    await vi.advanceTimersByTimeAsync(24 * 3600_000)
    expect(feedHits()).toBe(1)

    enabled = true
    await vi.advanceTimersByTimeAsync(24 * 3600_000)
    await until(() => feedHits() === 2 && statusOf(u) === 'latest')

    u.stop()
    await vi.advanceTimersByTimeAsync(24 * 3600_000)
    await new Promise((r) => realTimeout(r, 20))
    expect(feedHits()).toBe(2)
  })

  it('stop 会中止正在进行的下载', async () => {
    serveZip = hang
    const u = await load()
    await u.check(true)
    u.download()
    await until(() => u.getState().status === 'downloading' && (u.getState() as { done: number }).done > 0)
    u.stop()
    await until(() => statusOf(u) === 'available')
  })
})

describe('skip / openPage', () => {
  it('没有新版本时 skip 什么都不做', async () => {
    const u = await load()
    u.skip()
    expect(existsSync(prefs)).toBe(false)
    expect(statusOf(u)).toBe('idle')
  })

  it('跳过的版本写进偏好设置，状态不变', async () => {
    const u = await load()
    await u.check(true)
    u.skip()
    expect(JSON.parse(readFileSync(prefs, 'utf8'))).toEqual({ skipVersion: '0.5.0' })
    expect(u.getState()).toMatchObject({ status: 'available', info: { version: '0.5.0', skipped: true } })
  })

  it('有新版本时打开它的发布页，否则打开最新发布页', async () => {
    const u = await load()
    u.openPage()
    expect(m.openExternal).toHaveBeenLastCalledWith('https://github.com/wangzi6224/bili-downloader/releases/latest')
    await u.check(true)
    u.openPage()
    expect(m.openExternal).toHaveBeenLastCalledWith(`${base}/release/v0.5.0`)
  })
})
