import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@shared/i18n'
import type { EnqueueRequest, MediaItem, ParseResult, Settings } from '@shared/types'
import type { DownloadManager } from '../download/manager'

const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: never[]) => unknown>(),
  send: vi.fn(),
  listBrowserProfiles: vi.fn(),
  readBrowserCookies: vi.fn(),
  resolveBatch: vi.fn(),
  recordParse: vi.fn(),
  ytProxy: vi.fn(),
  encryptionAvailable: true,
  engines: [] as unknown[]
}))

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => h.encryptionAvailable,
    encryptString: (text: string) => Buffer.from(`enc:${text}`),
    decryptString: (data: Buffer) => `dec:${data.toString()}`
  }
}))
vi.mock('../ipc', () => ({ handle: (channel: string, fn: (...args: never[]) => unknown) => h.handlers.set(channel, fn) }))
vi.mock('../windows', () => ({ send: h.send }))
vi.mock('../auth/browserImport', () => ({ listBrowserProfiles: h.listBrowserProfiles, readBrowserCookies: h.readBrowserCookies }))
vi.mock('../bili/resolve', () => ({ resolveBatch: h.resolveBatch }))
vi.mock('../history', () => ({ recordParse: h.recordParse }))
vi.mock('../net/network', () => ({ ytProxy: h.ytProxy }))
vi.mock('../download/mux', () => ({ ffmpegPath: () => '/bin/ffmpeg' }))
vi.mock('./engine', async () => {
  const { EventEmitter: EE } = await import('node:events')
  class YtEngine extends EE {
    status = vi.fn(() => ({ state: 'ready' }))
    ensure = vi.fn(async () => '/yt-dlp')
    checkUpdate = vi.fn(async () => undefined)
    cancel = vi.fn()
    use = vi.fn(async <T>(fn: (exe: string) => Promise<T>) => fn('/yt-dlp'))
    constructor(public dir: string) {
      super()
      h.engines.push(this)
    }
  }
  return { YtEngine }
})

const { ImportError } = await import('../auth/importError')
const { registerYoutubeIpc, setupYoutube, systemVault } = await import('./setup')
const { setYoutube, youtube, YoutubeService } = await import('./service')
type YoutubeDeps = import('./service').YoutubeDeps
type FakeEngine = EventEmitter & {
  dir: string
  status: ReturnType<typeof vi.fn>
  ensure: ReturnType<typeof vi.fn>
  checkUpdate: ReturnType<typeof vi.fn>
  cancel: ReturnType<typeof vi.fn>
  use: ReturnType<typeof vi.fn>
}

const call = (channel: string, ...args: unknown[]): Promise<unknown> => {
  const fn = h.handlers.get(channel)
  if (!fn) throw new Error(`没有注册 ${channel}`)
  return Promise.resolve((fn as (...a: unknown[]) => unknown)(...args))
}

beforeEach(() => {
  h.handlers.clear()
  h.engines.length = 0
  h.encryptionAvailable = true
  vi.clearAllMocks()
})

describe('systemVault', () => {
  it('系统安全存储可用时加密，解密时交给它', () => {
    const v = systemVault()
    const data = v.encrypt('秘密')
    expect(data.toString()).toBe('enc:秘密')
    expect(v.decrypt(data)).toBe('dec:enc:秘密')
  })

  it('不可用时存成带前缀的明文；解密两种都认', () => {
    h.encryptionAvailable = false
    const v = systemVault()
    const data = v.encrypt('秘密')
    expect(data.toString()).toBe('plain:秘密')
    expect(v.decrypt(data)).toBe('秘密')
    expect(v.decrypt(Buffer.from('xyz'))).toBe('dec:xyz')
  })
})

describe('registerYoutubeIpc', () => {
  const engine = {
    status: vi.fn(() => ({ state: 'ready' as const })),
    ensure: vi.fn(async () => '/yt-dlp'),
    checkUpdate: vi.fn(async () => undefined),
    cancel: vi.fn()
  }
  const accounts = {
    snapshot: vi.fn(() => ({ accounts: [] })),
    add: vi.fn(async () => ({ id: 'a' })),
    select: vi.fn(),
    remove: vi.fn(),
    check: vi.fn(async () => ({ id: 'a' })),
    current: vi.fn(() => 'acc1')
  }
  const service = { loadPage: vi.fn(async () => ({ items: [] })), streamInfo: vi.fn(async () => ({ qualities: [] })) }
  const parseAndRecord = vi.fn(async (input: string) => ({ title: input }) as unknown as ParseResult)
  const enqueue = vi.fn(async (_req: EnqueueRequest) => '提示')

  beforeEach(() => {
    registerYoutubeIpc({
      engine: engine as never,
      accounts: accounts as never,
      service: service as never,
      parseAndRecord,
      enqueue
    })
  })

  it('组件状态、准备、检查更新、取消', async () => {
    expect(await call('yt:engine:status')).toEqual({ state: 'ready' })
    expect(await call('yt:engine:prepare')).toEqual({ state: 'ready' })
    expect(engine.ensure).toHaveBeenCalled()
    await call('yt:engine:check')
    expect(engine.checkUpdate).toHaveBeenCalledWith(true)
    await call('yt:engine:cancel')
    expect(engine.cancel).toHaveBeenCalled()
  })

  it('解析、翻页、批量解析、取流选项', async () => {
    expect(await call('yt:parse', 'https://youtu.be/x')).toEqual({ title: 'https://youtu.be/x' })
    await call('yt:parseMore', 'https://u', 2)
    expect(service.loadPage).toHaveBeenCalledWith('https://u', 2)
    const item = { key: 'yt:a' } as MediaItem
    await call('yt:streamInfo', item)
    expect(service.streamInfo).toHaveBeenCalledWith(item)

    h.resolveBatch.mockImplementation(async (inputs: string[], onProgress: (d: number, t: number, title?: string) => void, resolve: (i: string) => Promise<ParseResult>) => {
      onProgress(1, inputs.length, '标题')
      return [await resolve(inputs[0])]
    })
    expect(await call('yt:parseBatch', ['a', 'b'])).toEqual([{ title: 'a' }])
    expect(h.send).toHaveBeenCalledWith('parse:progress', { done: 1, total: 2, title: '标题' })
    expect(parseAndRecord).toHaveBeenCalledWith('a')
  })

  it('加入下载时带上当前 YouTube 账号', async () => {
    const req = { title: 'x', items: [] } as unknown as EnqueueRequest
    expect(await call('yt:enqueue', req)).toBe('提示')
    expect(enqueue).toHaveBeenCalledWith({ ...req, ytAccount: 'acc1' })
  })

  it('账号：列表、导入 cookie、切换、删除、检查', async () => {
    expect(await call('yt:accounts')).toEqual({ accounts: [] })
    await call('yt:importCookie', 'SAPISID=abc; SID=x')
    expect(accounts.add).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'SAPISID', value: 'abc' }),
      expect.objectContaining({ name: 'SID', value: 'x' })
    ])
    await call('yt:selectAccount', 'a')
    expect(accounts.select).toHaveBeenCalledWith('a')
    await call('yt:selectAccount')
    expect(accounts.select).toHaveBeenLastCalledWith(undefined)
    await call('yt:removeAccount', 'a')
    expect(accounts.remove).toHaveBeenCalledWith('a')
    await call('yt:checkAccount', 'a')
    expect(accounts.check).toHaveBeenCalledWith('a')
  })

  it('列出浏览器配置档时按 YouTube 判断登录', async () => {
    h.listBrowserProfiles.mockReturnValue([{ id: 'chrome::Default' }])
    expect(await call('yt:listBrowsers', 'chrome')).toEqual([{ id: 'chrome::Default' }])
    const [key, site] = h.listBrowserProfiles.mock.calls[0]
    expect(key).toBe('chrome')
    expect(site).toMatchObject({ key: 'SAPISID' })
    expect(site.host('.youtube.com')).toBe(true)
    expect(site.host('.bilibili.com')).toBe(false)
  })

  it('从浏览器导入：读出 YouTube 的 cookie 加成账号', async () => {
    const cookies = [{ name: 'SAPISID', value: 'v' }]
    h.readBrowserCookies.mockResolvedValue(cookies)
    expect(await call('yt:importBrowser', 'chrome::Default')).toEqual({ id: 'a' })
    expect(h.readBrowserCookies).toHaveBeenCalledWith('chrome::Default', expect.objectContaining({ key: 'SAPISID' }))
    expect(accounts.add).toHaveBeenCalledWith(cookies)
  })

  it('从浏览器导入：浏览器里没登录时换成 YouTube 的提示，其他错误原样抛出', async () => {
    h.readBrowserCookies.mockRejectedValueOnce(new ImportError('no_login', '没有 B站登录'))
    await expect(call('yt:importBrowser', 'x')).rejects.toThrow(t('ytLogin.noLoginInBrowser'))
    const locked = new ImportError('locked', '浏览器锁着')
    h.readBrowserCookies.mockRejectedValueOnce(locked)
    await expect(call('yt:importBrowser', 'x')).rejects.toBe(locked)
    h.readBrowserCookies.mockResolvedValueOnce([])
    accounts.add.mockRejectedValueOnce(new Error('已失效'))
    await expect(call('yt:importBrowser', 'x')).rejects.toThrow('已失效')
  })
})

describe('setupYoutube', () => {
  let userData = ''
  let settings: Settings
  const manager = { ytLoginChanged: vi.fn(), ytAccountRemoved: vi.fn() }
  const enqueue = vi.fn(async () => undefined)
  let setup: ReturnType<typeof setupYoutube> | undefined

  const start = (): ReturnType<typeof setupYoutube> => {
    setup = setupYoutube({ userData, settings: () => settings, manager: manager as unknown as DownloadManager, enqueue })
    return setup
  }
  const engineOf = (): FakeEngine => h.engines.at(-1) as FakeEngine
  const depsOf = (s: ReturnType<typeof setupYoutube>): YoutubeDeps => (s.service as unknown as { deps: YoutubeDeps }).deps

  beforeEach(() => {
    vi.useFakeTimers()
    userData = mkdtempSync(join(tmpdir(), 'yt-setup-'))
    settings = { youtube: { autoUpdate: true } } as Settings
    h.ytProxy.mockResolvedValue('http://proxy:1')
  })
  afterEach(() => {
    setup?.stop()
    setup = undefined
    setYoutube(undefined)
    vi.useRealTimers()
    rmSync(userData, { recursive: true, force: true })
  })

  it('启动时删掉上次残留的临时 cookie 文件，创建组件、账号和服务', () => {
    const leftover = join(userData, 'tmp', 'yt-cookies')
    mkdirSync(leftover, { recursive: true })
    writeFileSync(join(leftover, 'old.txt'), 'SAPISID')
    const s = start()
    expect(existsSync(leftover)).toBe(false)
    expect(engineOf().dir).toBe(join(userData, 'engines', 'yt-dlp'))
    expect(s.engine).toBe(engineOf())
    expect(s.service).toBeInstanceOf(YoutubeService)
    expect(youtube()).toBe(s.service)
    expect(s.accounts.snapshot()).toEqual({ current: undefined, accounts: [] })
    expect(h.handlers.has('yt:parse')).toBe(true)
  })

  it('服务的运行环境：应用自己当 JS 运行时、ffmpeg、代理、缓存目录；代理取不到时为空', async () => {
    const deps = depsOf(start())
    expect(await deps.env()).toEqual({
      jsRuntime: process.execPath,
      ffmpeg: '/bin/ffmpeg',
      proxy: 'http://proxy:1',
      cacheDir: join(userData, 'yt-cache')
    })
    expect(h.ytProxy).toHaveBeenCalledWith(settings)
    h.ytProxy.mockRejectedValueOnce(new Error('坏了'))
    expect((await deps.env()).proxy).toBe('')
  })

  it('服务用组件运行，cookie 和当前账号来自账号管理', async () => {
    const s = start()
    const deps = depsOf(s)
    expect(await deps.useEngine(async (exe) => `用 ${exe}`)).toBe('用 /yt-dlp')
    expect(engineOf().use).toHaveBeenCalled()
    expect(deps.currentAccount()).toBeUndefined()
    expect(await deps.cookies(undefined)).toBeUndefined()
    const spy = vi.spyOn(s.accounts, 'cookieFile').mockResolvedValue({ file: '/f', done: async () => undefined })
    vi.spyOn(s.accounts, 'current').mockReturnValue('acc')
    expect(deps.currentAccount()).toBe('acc')
    expect(await deps.cookies('acc')).toMatchObject({ file: '/f' })
    expect(spy).toHaveBeenCalledWith('acc', join(userData, 'tmp', 'yt-cookies'))
  })

  it('yt-dlp 解不开校验时强制检查一次更新，失败也不抛', async () => {
    const deps = depsOf(start())
    engineOf().checkUpdate.mockRejectedValueOnce(new Error('离线'))
    deps.onEngineError!()
    await vi.advanceTimersByTimeAsync(0)
    expect(engineOf().checkUpdate).toHaveBeenCalledWith(true)
  })

  it('转发组件状态、账号变化、登录和删除账号', () => {
    const s = start()
    engineOf().emit('status', { state: 'downloading' })
    expect(h.send).toHaveBeenCalledWith('yt:engine:status', { state: 'downloading' })
    s.accounts.emit('changed', { accounts: [] })
    expect(h.send).toHaveBeenCalledWith('yt:accountsChanged', { accounts: [] })
    s.accounts.emit('login', 'a')
    expect(manager.ytLoginChanged).toHaveBeenCalledWith('a')
    s.accounts.emit('removed', 'b')
    expect(manager.ytAccountRemoved).toHaveBeenCalledWith('b')
  })

  it('parseAndRecord：去掉首尾空白，记进解析记录（数所有分组的条目）', async () => {
    const s = start()
    vi.setSystemTime(123_000)
    const parsed = {
      kind: 'youtube',
      title: '列表',
      cover: 'c',
      groups: [{ id: 'a', title: 'a', items: [{}, {}] }, { id: 'b', title: 'b', items: [{}] }]
    } as unknown as ParseResult
    const parse = vi.spyOn(s.service, 'parse').mockResolvedValue(parsed)
    expect(await s.parseAndRecord('  https://youtu.be/x  ')).toEqual({ ...parsed, input: 'https://youtu.be/x' })
    expect(parse).toHaveBeenCalledWith('  https://youtu.be/x  ')
    expect(h.recordParse).toHaveBeenCalledWith({ input: 'https://youtu.be/x', title: '列表', kind: 'youtube', cover: 'c', count: 3, at: 123_000 })
    // 界面通道用的也是它
    parse.mockResolvedValueOnce(parsed)
    expect(await call('yt:parse', 'x')).toMatchObject({ input: 'x' })
  })

  it('parseAndRecord：不是 YouTube 链接时报错，不记录', async () => {
    const s = start()
    await expect(s.parseAndRecord('https://www.bilibili.com/video/BV1xx')).rejects.toThrow(t('yt.notYoutubeLink'))
    expect(h.recordParse).not.toHaveBeenCalled()
  })

  it('开了自动更新：启动 10 秒后检查一次，之后每 6 小时一次，失败不抛', async () => {
    start()
    const engine = engineOf()
    engine.checkUpdate.mockRejectedValue(new Error('离线'))
    await vi.advanceTimersByTimeAsync(9_999)
    expect(engine.checkUpdate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(engine.checkUpdate).toHaveBeenCalledTimes(1)
    expect(engine.checkUpdate).toHaveBeenCalledWith()
    await vi.advanceTimersByTimeAsync(6 * 3600_000)
    expect(engine.checkUpdate).toHaveBeenCalledTimes(2)
  })

  it('关了自动更新：不检查', async () => {
    settings = { youtube: { autoUpdate: false } } as Settings
    start()
    await vi.advanceTimersByTimeAsync(7 * 3600_000)
    expect(engineOf().checkUpdate).not.toHaveBeenCalled()
  })

  it('stop：停掉定时检查，取消组件的下载', async () => {
    const s = start()
    const engine = engineOf()
    s.stop()
    expect(engine.cancel).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(7 * 3600_000)
    expect(engine.checkUpdate).not.toHaveBeenCalled()
    setup = undefined
  })
})
