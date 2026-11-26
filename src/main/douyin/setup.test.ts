import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnqueueRequest, MediaItem, ParseResult, Settings } from '@shared/types'
import type { DownloadManager } from '../download/manager'

const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: never[]) => unknown>(),
  send: vi.fn(),
  main: vi.fn<() => unknown>(),
  listBrowserProfiles: vi.fn(),
  readBrowserCookies: vi.fn(),
  setCookies: vi.fn(),
  resolveBatch: vi.fn(),
  recordParse: vi.fn(),
  proxy: vi.fn(),
  openLogin: vi.fn(),
  createWindow: vi.fn(),
  clearStorage: vi.fn(),
  supported: true,
  notifications: [] as unknown[],
  bridges: [] as unknown[]
}))

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  class Notification extends EventEmitter {
    static isSupported = (): boolean => h.supported
    show = vi.fn()
    constructor(public options: Record<string, unknown>) {
      super()
      h.notifications.push(this)
    }
  }
  return {
    Notification,
    session: { fromPartition: (partition: string) => ({ partition, clearStorageData: () => h.clearStorage(partition) }) }
  }
})
vi.mock('../ipc', () => ({ handle: (channel: string, fn: (...args: never[]) => unknown) => h.handlers.set(channel, fn) }))
vi.mock('../windows', () => ({ send: h.send, getMainWindow: h.main }))
vi.mock('../auth/browserImport', () => ({ listBrowserProfiles: h.listBrowserProfiles, readBrowserCookies: h.readBrowserCookies }))
vi.mock('../auth/session', async (orig) => ({ ...(await orig<typeof import('../auth/session')>()), setCookies: h.setCookies }))
vi.mock('../bili/resolve', () => ({ resolveBatch: h.resolveBatch }))
vi.mock('../history', () => ({ recordParse: h.recordParse }))
vi.mock('../net/network', () => ({ chromiumProxy: h.proxy }))
vi.mock('./login', () => ({ openDyLoginWindow: h.openLogin }))
vi.mock('./transport/window', () => ({ createDyWindow: h.createWindow }))
vi.mock('./transport/page', () => {
  class PageBridge {
    request = vi.fn(async () => ({ status: 200, body: JSON.stringify({ status_code: 0, user: { sec_uid: 'SEC-test-user-setup-abcdef', nickname: '测试用户' } }) }))
    verify = vi.fn()
    dispose = vi.fn()
    constructor(public open: (account: string | null) => Promise<unknown>) {
      h.bridges.push(this)
    }
  }
  return { PageBridge }
})

const { registerDouyinIpc, setupDouyin } = await import('./setup')
const { douyin, setDouyin } = await import('./service')
const { DY_SITE } = await import('./cookies')
const { dyUserAgent } = await import('./ua')

type Bridge = { open: (account: string | null) => Promise<unknown>; request: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }
type FakeNotification = { options: Record<string, unknown>; show: ReturnType<typeof vi.fn>; emit: (name: string) => boolean }

const call = (channel: string, ...args: unknown[]): Promise<unknown> => {
  const fn = h.handlers.get(channel)
  if (!fn) throw new Error(`没有注册 ${channel}`)
  return Promise.resolve((fn as (...a: unknown[]) => unknown)(...args))
}

beforeEach(() => {
  h.handlers.clear()
  h.notifications.length = 0
  h.bridges.length = 0
  h.supported = true
  vi.clearAllMocks()
  h.proxy.mockReturnValue({ mode: 'direct' })
  h.main.mockReturnValue(null)
  h.openLogin.mockResolvedValue(true)
})
afterEach(() => setDouyin(undefined as never))

describe('registerDouyinIpc', () => {
  const controller = {
    parseAndRecord: vi.fn(async (input: string) => ({ title: input }) as unknown as ParseResult),
    login: vi.fn(async () => 'login'),
    listBrowsers: vi.fn(() => ['b']),
    importBrowser: vi.fn(async () => 'browser'),
    importCookie: vi.fn(async () => 'cookie'),
    check: vi.fn(async () => 'checked'),
    status: vi.fn(() => []),
    verify: vi.fn(async () => [])
  }
  const accounts = {
    snapshot: vi.fn(() => ({ accounts: [] })),
    select: vi.fn(() => 'selected'),
    remove: vi.fn(async () => 'removed'),
    current: vi.fn<() => string | undefined>(() => 'acc1')
  }
  const service = {
    loadPage: vi.fn(async () => ({ items: [] })),
    streamInfo: vi.fn(async () => ({ qualities: [] })),
    lists: vi.fn(async () => ({ entries: [] }))
  }
  const enqueue = vi.fn(async (_req: EnqueueRequest) => '提示')

  beforeEach(() => {
    registerDouyinIpc({ controller: controller as never, accounts: accounts as never, service: service as never, enqueue })
  })

  it('解析、翻页、取流选项、账号里的列表', async () => {
    expect(await call('dy:parse', 'https://v.douyin.com/test/')).toEqual({ title: 'https://v.douyin.com/test/' })
    const source = { url: 'u', cursor: 'c' }
    await call('dy:parseMore', source, 2)
    expect(service.loadPage).toHaveBeenCalledWith(source, 2)
    const item = { key: 'dy:1' } as MediaItem
    await call('dy:streamInfo', item)
    expect(service.streamInfo).toHaveBeenCalledWith(item)
    await call('dy:lists', 'folders', '0')
    expect(service.lists).toHaveBeenCalledWith('folders', '0')
  })

  it('批量解析逐个走解析记录，进度带上平台', async () => {
    h.resolveBatch.mockImplementation(async (inputs: string[], progress: (d: number, t: number, title?: string) => void, resolve: (i: string) => Promise<unknown>) => {
      await resolve(inputs[0])
      progress(1, 2, '第一个')
      return 'batch'
    })
    expect(await call('dy:parseBatch', ['a', 'b'])).toBe('batch')
    expect(controller.parseAndRecord).toHaveBeenCalledWith('a')
    expect(h.send).toHaveBeenCalledWith('parse:progress', { done: 1, total: 2, title: '第一个', site: 'douyin' })
  })

  it('入队时带上当前抖音账号', async () => {
    const req = { title: 't', items: [], dyAccount: 'other' } as unknown as EnqueueRequest
    expect(await call('dy:enqueue', req)).toBe('提示')
    expect(enqueue).toHaveBeenCalledWith({ ...req, dyAccount: 'acc1' })
    accounts.current.mockReturnValueOnce(undefined)
    await call('dy:enqueue', req)
    expect(enqueue.mock.calls.at(-1)![0].dyAccount).toBeUndefined()
  })

  it('账号相关的通道交给对应的方法', async () => {
    expect(await call('dy:accounts')).toEqual({ accounts: [] })
    expect(await call('dy:login')).toBe('login')
    expect(await call('dy:listBrowsers', 'chrome')).toEqual(['b'])
    expect(controller.listBrowsers).toHaveBeenCalledWith('chrome')
    expect(await call('dy:importBrowser', 'p1')).toBe('browser')
    expect(controller.importBrowser).toHaveBeenCalledWith('p1')
    expect(await call('dy:importCookie', 'text')).toBe('cookie')
    expect(controller.importCookie).toHaveBeenCalledWith('text')
    expect(await call('dy:selectAccount', 'a')).toBe('selected')
    expect(accounts.select).toHaveBeenCalledWith('a')
    expect(await call('dy:removeAccount', 'a')).toBe('removed')
    expect(accounts.remove).toHaveBeenCalledWith('a')
    expect(await call('dy:checkAccount', 'a')).toBe('checked')
    expect(controller.check).toHaveBeenCalledWith('a')
    expect(await call('dy:status')).toEqual([])
    await call('dy:verify', null)
    expect(controller.verify).toHaveBeenCalledWith(null)
  })
})

describe('setupDouyin', () => {
  let userData = ''
  let settings: Settings
  const manager = { siteLoginChanged: vi.fn(), siteAccountRemoved: vi.fn(), siteVerified: vi.fn(), schedule: vi.fn() }
  const enqueue = vi.fn(async (_req: EnqueueRequest) => undefined)
  const showWindow = vi.fn()

  beforeEach(() => {
    userData = mkdtempSync(join(tmpdir(), 'dy-setup-'))
    settings = { notify: true } as Settings
  })
  afterEach(() => rmSync(userData, { recursive: true, force: true }))

  const start = () => {
    const setup = setupDouyin({ userData, settings: () => settings, manager: manager as unknown as DownloadManager, enqueue, showWindow })
    return { setup, bridge: h.bridges.at(-1) as Bridge }
  }

  it('装配服务并注册界面通道；停止时关掉所有网页', () => {
    const { setup, bridge } = start()
    expect(douyin()).toBe(setup.service)
    expect([...h.handlers.keys()].filter((k) => k.startsWith('dy:')).sort()).toEqual([
      'dy:accounts', 'dy:checkAccount', 'dy:enqueue', 'dy:importBrowser', 'dy:importCookie', 'dy:listBrowsers', 'dy:lists', 'dy:login',
      'dy:parse', 'dy:parseBatch', 'dy:parseMore', 'dy:removeAccount', 'dy:selectAccount', 'dy:status', 'dy:streamInfo', 'dy:verify'
    ])
    setup.stop()
    expect(bridge.dispose).toHaveBeenCalledWith()
  })

  it('页面桥按账号的分区建窗口，用同一个 UA 和应用的代理', async () => {
    const { setup, bridge } = start()
    const { id, partition } = setup.accounts.prepare()
    await bridge.open(id)
    await bridge.open(null)
    expect(h.createWindow.mock.calls).toEqual([
      [{ partition, userAgent: dyUserAgent(), proxy: { mode: 'direct' } }],
      [{ partition: 'persist:douyin-guest', userAgent: dyUserAgent(), proxy: { mode: 'direct' } }]
    ])
  })

  it('扫码登录和导入浏览器登录接到对应的实现；账号变化推给界面', async () => {
    const { setup } = start()
    await setup.controller.login()
    const [account] = setup.accounts.snapshot().accounts
    expect(h.openLogin).toHaveBeenCalledWith({ partition: `persist:douyin-${account.id}`, userAgent: dyUserAgent(), proxy: { mode: 'direct' } })
    expect(h.send).toHaveBeenCalledWith('dy:accountsChanged', setup.accounts.snapshot())
    expect(manager.siteLoginChanged).toHaveBeenCalledWith('douyin', account.id)
    expect(setup.service.currentAccount()).toBe(account.id)
    expect(setup.service.hasAccount(account.id)).toBe(true)

    h.listBrowserProfiles.mockReturnValue([])
    setup.controller.listBrowsers('chrome')
    expect(h.listBrowserProfiles).toHaveBeenCalledWith('chrome', DY_SITE)
    const cookies = [{ name: 'sessionid', value: 'test-session' }]
    h.readBrowserCookies.mockResolvedValue(cookies)
    await setup.controller.importBrowser('chrome:Default')
    expect(h.readBrowserCookies).toHaveBeenCalledWith('chrome:Default', DY_SITE)
    expect(h.setCookies).toHaveBeenCalledWith(expect.objectContaining({ partition: expect.stringMatching(/^persist:douyin-/) }), cookies)
    // 同一个抖音账号再次登录：旧分区清掉
    expect(h.clearStorage).toHaveBeenCalledWith(`persist:douyin-${account.id}`)
  })

  it('解析记录写进历史', async () => {
    const { setup } = start()
    vi.spyOn(setup.service, 'parse').mockResolvedValue({ kind: 'douyin', title: 't', cover: '', groups: [], defaultSelected: [] })
    await call('dy:parse', 'x')
    expect(h.recordParse).toHaveBeenCalledWith(expect.objectContaining({ input: 'x', kind: 'douyin' }))
  })

  it('限速状态变化推给界面并让队列重新调度', () => {
    const { setup } = start()
    setup.gate.expire('acc')
    expect(h.send).toHaveBeenCalledWith('dy:statusChanged', [{ account: 'acc', state: 'expired' }])
    expect(manager.schedule).toHaveBeenCalled()
  })

  it('要验证时发系统通知，点通知打开主窗口', () => {
    const { setup } = start()
    setup.gate.requireVerify(null)
    const [notification] = h.notifications as FakeNotification[]
    expect(notification.options).toEqual({ title: 'B站下载器', body: '抖音要求完成安全验证，请在应用里点“去验证”后再试' })
    expect(notification.show).toHaveBeenCalled()
    notification.emit('click')
    expect(showWindow).toHaveBeenCalled()
  })

  it('主窗口在后台时照常通知', () => {
    h.main.mockReturnValue({ isFocused: () => false })
    start().setup.gate.requireVerify(null)
    expect(h.notifications).toHaveLength(1)
  })

  it.each([
    ['关了通知', () => (settings.notify = false)],
    ['主窗口在前台', () => h.main.mockReturnValue({ isFocused: () => true })],
    ['系统不支持通知', () => (h.supported = false)]
  ])('%s时不发通知', (_name, arrange) => {
    arrange()
    start().setup.gate.requireVerify(null)
    expect(h.notifications).toHaveLength(0)
  })
})
