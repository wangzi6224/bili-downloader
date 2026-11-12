import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthState, LoginTarget } from '@shared/types'
import { DEFAULT_OPTIONS } from '@shared/options'
import type { ToolResult } from '../mcp/tools'

const h = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  expired: new Set<string>(),
  userData: '',
  send: vi.fn(),
  configureLoginSession: vi.fn(async () => {})
}))

vi.mock('electron', () => ({
  app: { getVersion: () => 'test', getPath: () => h.userData },
  session: {
    fromPartition: (partition: string) => ({
      cookies: {
        get: async (filter: { name?: string }) => {
          const value = h.cookies.get(partition)
          if (filter.name === 'buvid3') return [{ value: 'device' }]
          return value ? [{ name: 'SESSDATA', value, domain: '.bilibili.com' }] : []
        },
        set: async ({ value }: { value: string }) => { h.cookies.set(partition, value) },
        flushStore: async () => {}
      },
      clearStorageData: async () => { h.cookies.delete(partition) }
    })
  }
}))
vi.mock('../net/network', () => ({ configureLoginSession: h.configureLoginSession }))
vi.mock('../windows', () => ({ send: h.send }))

let directory: string
let file: string
let registry: typeof import('./accounts').accounts
let guard: typeof import('./authGuard')
let scope: typeof import('./scope')
let http: typeof import('../bili/http')
let loginCookie: (value: string, target?: LoginTarget) => Promise<AuthState>
const loopbackFetch = globalThis.fetch

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  h.cookies.clear()
  h.expired.clear()
  directory = mkdtempSync(join(tmpdir(), 'bili-accounts-'))
  h.userData = directory
  file = join(directory, 'accounts.json')
  registry = (await import('./accounts')).accounts
  guard = await import('./authGuard')
  scope = await import('./scope')
  http = await import('../bili/http')
  const { biliSession } = await import('./session')
  registry.init(file)
  loginCookie = (value, target) => registry.login(async () => {
    await biliSession().cookies.set({ url: 'https://www.bilibili.com', name: 'SESSDATA', value })
    return guard.checkAuth()
  }, target)
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const credential = new Headers(init.headers).get('cookie')?.match(/SESSDATA=([^;]*)/)?.[1]
    const mid = Number(credential?.split('-')[0])
    const loggedIn = !!credential && mid > 0 && !h.expired.has(credential)
    if (url === http.NAV_URL) {
      return Response.json(loggedIn
        ? { code: 0, data: { isLogin: true, mid, uname: `用户${mid}`, face: '', vipStatus: mid === 2 ? 1 : 0 } }
        : { code: -101, data: { isLogin: false } })
    }
    return Response.json(loggedIn ? { code: 0, data: { mid } } : { code: -101 })
  }))
})

it('通过 MCP HTTP 验证双账号登录、画质、任务归属、历史和退出', async () => {
  const { LoginFlow } = await import('../mcp/loginFlow')
  const { McpServer } = await import('../mcp/server')
  const { McpTools } = await import('../mcp/tools')
  const { biliSession } = await import('./session')
  const history = await import('../history')
  const { FakeQueue, fakeWatermark, mediaItem } = await import('../../test/fakeQueue')
  const queue = new FakeQueue()
  const item = mediaItem('ugc:BV1:1', { bvid: 'BV1' })
  await loginCookie('1-current')

  let scan = Promise.resolve('2-background')
  const login = new LoginFlow({
    checkAuth: guard.checkAuth,
    authState: guard.activeAuthState,
    accountAuth: (mid) => registry.auth(mid),
    loginGuard: () => registry.loginGuard(),
    onLoginChanged: guard.onLoginChanged,
    listBrowsers: () => [],
    importBrowser: async () => { throw new Error('unexpected browser import') },
    openQr: (target, authorize) => registry.login(async () => {
      const value = await scan
      await biliSession().cookies.set({ url: 'https://www.bilibili.com', name: 'SESSDATA', value })
      return guard.checkAuth()
    }, target, authorize),
    isQrOpen: () => false,
    isLocked: () => false,
    canClose: () => false,
    confirmClose: async () => 'cancel',
    closeBrowser: async () => false
  })
  const tools = new McpTools({
    accounts: registry,
    login,
    queue,
    batchFile: join(directory, 'batches.json'),
    lookup: {} as never,
    authState: () => guard.checkAuthThrottled(60_000),
    settings: () => ({ downloadDir: directory, defaultQn: 80, defaults: DEFAULT_OPTIONS }) as never,
    updateSettings: () => { throw new Error('unexpected settings update') },
    watermark: fakeWatermark(),
    expandLazy: async (items) => items,
    downloadedKeys: history.downloadedKeys,
    downloadRecords: history.downloadRecords,
    parseRecords: history.parseRecords,
    parseAll: async (input) => {
      const { mid } = await protectedApi()
      const title = `账号 ${mid} 的稍后再看`
      history.recordParse({ input, title, kind: 'ugc', cover: '', count: 1, at: Date.now(), accountMid: mid })
      return { result: { title, kind: 'ugc', cover: '', groups: [{ id: 'items', title, items: [item] }], defaultSelected: [] }, complete: true }
    },
    probeQuality: async () => {
      const { mid } = await protectedApi()
      return { item_id: item.key, title: item.title, qualities: [{ qn: mid === 2 ? 120 : 80, label: 'HD', codecs: ['hevc'] }] }
    }
  })
  const reserved = createServer()
  await new Promise<void>((resolve, reject) => {
    reserved.once('error', reject)
    reserved.listen(0, '127.0.0.1', resolve)
  })
  const { port } = reserved.address() as AddressInfo
  await new Promise<void>((resolve, reject) => reserved.close((e) => e ? reject(e) : resolve()))
  const server = new McpServer(tools)
  const token = 'multi-account-integration-token'
  const rpc = (name: string, args: Record<string, unknown> = {}, authorization = token) =>
    loopbackFetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { authorization: `Bearer ${authorization}`, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      signal: AbortSignal.timeout(4000)
    })
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await rpc(name, args)
    expect(response.status).toBe(200)
    const { result } = await response.json() as { result: ToolResult }
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent)
    return result
  }
  const ok = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await call(name, args)
    expect(result.isError).toBeUndefined()
    return result.structuredContent!
  }

  try {
    await server.apply({ enabled: true, port, token })
    expect(server.status().running).toBe(true)
    await ok('start_login', { mode: 'add', method: 'qr', wait_seconds: 0 })
    expect(await ok('get_login_status', { wait_seconds: 1 })).toMatchObject({ status: 'logged_in', account_mid: 2, active_account_mid: 1 })
    const denied = await rpc('logout_account', { account_mid: 2 }, 'wrong')
    expect(denied.status).toBe(401)
    await denied.json()
    expect(registry.status(2)).toBe('ready')

    const url = 'watchlater'
    expect(await ok('parse_link', { url })).toMatchObject({ title: '账号 1 的稍后再看', account_mid: 1 })
    expect(await ok('parse_link', { url, account_mid: 2 })).toMatchObject({ title: '账号 2 的稍后再看', account_mid: 2 })
    expect(await ok('get_download_quality', { url })).toMatchObject({ best_qn: 120, best_account_mids: [2] })
    const a = await ok('download_batch', { url, all: true, request_id: 'same' })
    const b = await ok('download_batch', { url, all: true, request_id: 'same', qn: 120, account_mid: 2 })
    expect(a.batch_id).not.toBe(b.batch_id)
    expect(queue.list().map((task) => [task.accountMid, task.item.key, task.options.qn])).toEqual([[1, item.key, 80], [2, item.key, 120]])
    expect(await ok('control_tasks', { action: 'pause', account_mid: 1 })).toMatchObject({ affected: 1 })
    expect(queue.list().map((task) => task.status)).toEqual(['paused', 'queued'])
    for (const task of queue.list()) history.recordDownload({
      key: task.item.key, title: task.title, groupTitle: task.groupTitle, path: join(directory, task.id),
      at: Date.now(), accountMid: task.accountMid
    })
    expect(await ok('list_download_history', { account_mid: 2 })).toMatchObject({ total: 1, records: [{ account_mid: 2 }] })
    expect(await ok('list_parse_history', { account_mid: 1 })).toMatchObject({ total: 1, records: [{ account_mid: 1 }] })

    expect(await ok('switch_account', { account_mid: 2 })).toMatchObject({ active_account_mid: 2 })
    let finishScan!: (cookie: string) => void
    scan = new Promise<string>((resolve) => { finishScan = resolve })
    await ok('start_login', { mode: 'reauth', method: 'qr', account_mid: 1, wait_seconds: 0 })
    expect(await ok('get_login_status', { account_mid: 1 })).toMatchObject({ status: 'waiting_user', step: 'qr' })
    expect(await ok('logout_account', { account_mid: 1 })).toMatchObject({ status: 'removed', active_account_mid: 2 })
    finishScan('1-late')
    expect(await ok('get_login_status', { wait_seconds: 1 })).toMatchObject({ status: 'failed', reason: 'revoked', next: 'none' })
    expect((await call('parse_link', { url, account_mid: 1 })).structuredContent).toMatchObject({ error: { code: 'NOT_LOGGED_IN' } })
    expect(await ok('parse_link', { url })).toMatchObject({ account_mid: 2 })
    expect(await ok('list_parse_history', { account_mid: 1 })).toMatchObject({ total: 1, records: [{ account_mid: 1 }] })
    expect([...h.cookies.values()]).toEqual(['2-background'])
  } finally {
    login.dispose()
    await server.stop()
    tools.batches.flush()
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(directory, { recursive: true, force: true })
})

const protectedApi = () => http.api<{ mid: number }>('https://api.bilibili.com/test')

describe('多账号会话', () => {
  it('切换前开始的请求继续使用原账号，两个账号的登录都能在重启后验证', async () => {
    await loginCookie('1-private')
    await loginCookie('2-private')
    await registry.select(1)
    let release!: () => void
    const signal = new Promise<void>((resolve) => { release = resolve })
    const pending = registry.run(1, async () => {
      await signal
      return protectedApi()
    })
    await registry.select(2)
    expect(await registry.run(2, protectedApi)).toEqual({ mid: 2 })
    release()
    expect(await pending).toEqual({ mid: 1 })
    expect(registry.snapshot()).toMatchObject({ activeMid: 2, accounts: [{ mid: 2, vipActive: true }, { mid: 1 }] })
    expect(readFileSync(file, 'utf8')).not.toContain('private')

    vi.resetModules()
    const restarted = (await import('./accounts')).accounts
    restarted.init(file)
    expect(restarted.snapshot()).toMatchObject({ activeMid: 2, accounts: [{ status: 'unchecked' }, { status: 'unchecked' }] })
    expect(restarted.auth(1)).toEqual({ loggedIn: false })
    await restarted.select(2)
    expect(restarted.status(2)).toBe('ready')
    expect((await restarted.select(1)).activeMid).toBe(1)
  })

  it('MCP 添加首个账号时选中它，此后后台添加或刷新账号不会抢占当前会话', async () => {
    await loginCookie('1-first', { mode: 'add', activate: false })
    await loginCookie('2-background', { mode: 'add', activate: false })
    expect(registry.snapshot().activeMid).toBe(1)
    expect(registry.auth(2)).toMatchObject({ loggedIn: true, user: { mid: 2 } })
    await registry.remove(2)
    expect(registry.auth(2)).toEqual({ loggedIn: false, expired: true })
    expect(await registry.run(1, protectedApi)).toEqual({ mid: 1 })
  })

  it('后台过期只更新原账号，扫错号或取消会清理临时会话，重新登录后当前账号不变', async () => {
    const notify = vi.fn()
    registry.connect(notify, { count: () => 0, assign: vi.fn() })
    await loginCookie('1-old')
    await loginCookie('2-current')
    const old = registry.partition(1)!
    h.expired.add('1-old')
    h.send.mockClear()
    await expect(registry.run(1, protectedApi)).rejects.toBeInstanceOf(http.AuthExpiredError)
    expect(registry.status(1)).toBe('expired')
    expect(registry.status(2)).toBe('ready')
    expect(h.send.mock.calls.map(([channel]) => channel)).not.toContain('auth:required')
    const target: LoginTarget = { mode: 'reauth', mid: 1, activate: false }
    await expect(loginCookie('2-wrong', target)).rejects.toThrow('用户1')
    expect([...h.cookies.values()]).toEqual(['1-old', '2-current'])
    await expect(registry.login(async () => ({ loggedIn: false }), target)).resolves.toEqual({ loggedIn: false })
    expect(registry.partition(1)).toBe(old)
    await loginCookie('1-new', target)
    expect(registry.partition(1)).not.toBe(old)
    expect(h.cookies.has(old)).toBe(false)
    expect(notify.mock.calls).toContainEqual([1, 'expired'])
    expect(notify).toHaveBeenLastCalledWith(1, 'ready')
    expect(registry.snapshot().activeMid).toBe(2)
    expect(await registry.run(1, protectedApi)).toEqual({ mid: 1 })
  })

  it.each([
    { mode: 'reauth', mid: 1, activate: false },
    { mode: 'add', activate: false }
  ] satisfies LoginTarget[])('退出使未完成的 $mode 登录失效，并清理临时会话', async (target) => {
    const { biliSession } = await import('./session')
    const notify = vi.fn()
    registry.connect(notify, { count: () => 0, assign: vi.fn() })
    await loginCookie('1-old')
    await loginCookie('2-current')
    let complete!: () => void
    const scanning = new Promise<void>((resolve) => { complete = resolve })
    const attempt = registry.login(async () => {
      await scanning
      await biliSession().cookies.set({ url: 'https://www.bilibili.com', name: 'SESSDATA', value: '1-late' })
      return guard.checkAuth()
    }, target)
    await registry.remove(1)
    expect(notify).toHaveBeenLastCalledWith(1, 'removed')
    const rejected = expect(attempt).rejects.toThrow('账号已退出')
    complete()
    await rejected
    expect(registry.status(1)).toBe('removed')
    expect(notify).toHaveBeenLastCalledWith(1, 'removed')
    expect([...h.cookies.values()]).toEqual(['2-current'])
    expect(registry.snapshot().activeMid).toBe(2)
    await loginCookie('1-new', target)
    expect(registry.status(1)).toBe('ready')
  })

  it('退出期间拒绝同一账号的新重登，旧流程更换登录方式也不能恢复该账号', async () => {
    await loginCookie('1-old')
    const target = { mode: 'reauth', mid: 1, activate: false } as const
    const originalGuard = registry.loginGuard()
    const first = registry.remove(1)
    const second = registry.remove(1)
    await expect(loginCookie('1-during-logout', target)).rejects.toThrow('账号已退出')
    await Promise.all([first, second])
    const oldAttempt = vi.fn()
    await expect(registry.login(oldAttempt, target, originalGuard)).rejects.toThrow('账号已退出')
    expect(oldAttempt).not.toHaveBeenCalled()
    await loginCookie('1-explicit-new-login', target)
    expect(registry.status(1)).toBe('ready')
  })

  it('迁移旧分区，重复添加同一 UID，移除当前账号后回到另一个有效账号', async () => {
    const assign = vi.fn()
    registry.connect(vi.fn(), { count: () => 2, assign })
    h.cookies.set(scope.PARTITION, '1-legacy')
    await guard.checkAuth()
    expect(registry.partition(1)).toBe(scope.PARTITION)
    expect(assign).toHaveBeenCalledWith(1)
    await loginCookie('2-new')
    await loginCookie('2-updated')
    expect(registry.snapshot().accounts).toHaveLength(2)
    await registry.remove(2)
    expect(registry.snapshot().activeMid).toBe(1)
    expect(registry.status(2)).toBe('removed')
    await expect(registry.run(2, protectedApi)).rejects.toBeInstanceOf(http.AuthExpiredError)
    expect([...h.cookies.values()]).toEqual(['1-legacy'])
    await loginCookie('2-returned', { mode: 'reauth', mid: 2, activate: false })
    expect(registry.snapshot().activeMid).toBe(1)
    expect(registry.status(2)).toBe('ready')
  })

  it('只允许有效账号领取旧数据，同时最多处理一次登录，移除最后一个账号后回到登录入口', async () => {
    const notify = vi.fn()
    const assign = vi.fn()
    registry.connect(notify, { count: () => 2, assign })
    expect(() => registry.assignLegacy(1)).toThrow()
    let cancel!: (state: AuthState) => void
    const attempt = registry.login(() => new Promise((resolve) => { cancel = resolve }))
    await expect(loginCookie('2-current')).rejects.toThrow('已有登录操作')
    cancel({ loggedIn: false })
    await attempt
    await loginCookie('1-current')
    registry.assignLegacy(1)
    expect(assign).toHaveBeenCalledWith(1)
    expect(registry.snapshot().legacyCount).toBe(2)
    await registry.remove(1)
    await registry.remove(1)
    expect(scope.activeScope().partition).toBe(scope.GUEST_PARTITION)
    expect(await registry.logout()).toEqual({ loggedIn: false })
    expect(notify).toHaveBeenLastCalledWith(1, 'removed')
  })

  it('发起方放弃的登录不再占着：下一次登录等它收尾后继续，迟到写入的 Cookie 会被清掉', async () => {
    const { biliSession } = await import('./session')
    const abandoned = new AbortController()
    let reading!: () => void
    let partition = ''
    const stuck = registry.login(async () => {
      partition = scope.authScope().partition
      await new Promise<void>((resolve) => { reading = resolve })
      await biliSession().cookies.set({ url: 'https://www.bilibili.com', name: 'SESSDATA', value: '9-late' })
      return guard.checkAuth()
    }, { mode: 'add' }, undefined, abandoned.signal)
    const notAbandoned = registry.login(() => new Promise(() => {}))
    await expect(notAbandoned).rejects.toThrow('已有登录操作')
    abandoned.abort()
    const next = loginCookie('1-current')
    await expect(stuck).rejects.toMatchObject({ code: 'cancelled' })
    await expect(next).resolves.toMatchObject({ loggedIn: true, user: { mid: 1 } })
    reading()
    await vi.waitFor(() => expect(h.cookies.has(partition)).toBe(false))
    expect(registry.snapshot().accounts.map((account) => account.mid)).toEqual([1])
  })

  it('放弃信号在尝试完成之后才来时不影响已完成的登录', async () => {
    const signal = new AbortController()
    const done = registry.login(async () => {
      const { biliSession } = await import('./session')
      await biliSession().cookies.set({ url: 'https://www.bilibili.com', name: 'SESSDATA', value: '1-current' })
      return guard.checkAuth()
    }, { mode: 'add' }, undefined, signal.signal)
    await expect(done).resolves.toMatchObject({ loggedIn: true })
    signal.abort()
    expect(registry.status(1)).toBe('ready')
  })
})
