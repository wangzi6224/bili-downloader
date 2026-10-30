import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { IpcDeps } from './ipc'

type Result = { ok: true; data: unknown } | { ok: false; error: string }
type Handler = (e: unknown, ...args: unknown[]) => Promise<Result>
interface StoredCookie {
  value: string
  expirationDate?: number
}

const h = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  registered: [] as string[],
  /** 假的 cookie 存储，只关心 name → 值和过期时间 */
  jar: new Map<string, StoredCookie>(),
  AUDIO: { qualities: [], audio: true },
  CDN: [
    { host: 'a.example', label: 'A' },
    { host: 'b.example', label: 'B' }
  ],
  // electron
  readText: vi.fn(),
  writeText: vi.fn(),
  showOpenDialog: vi.fn(),
  showItemInFolder: vi.fn(),
  openExternal: vi.fn(),
  // ./auth/*
  checkAuth: vi.fn(),
  ensureLoggedIn: vi.fn(),
  getAuthState: vi.fn(),
  logout: vi.fn(),
  requireLogin: vi.fn(),
  importFromBrowser: vi.fn(),
  listBrowserProfiles: vi.fn(),
  importCookieText: vi.fn(),
  openLoginWindow: vi.fn(),
  cookiesGet: vi.fn(),
  cookiesSet: vi.fn(),
  // ./bili/*
  expandLazy: vi.fn(),
  loadPage: vi.fn(),
  myFavFolders: vi.fn(),
  getPlayInfo: vi.fn(),
  streamInfoFromPlay: vi.fn(),
  resolveBatch: vi.fn(),
  resolveInput: vi.fn(),
  // 其余主进程模块
  exportConfig: vi.fn(),
  importConfig: vi.fn(),
  pingHost: vi.fn(),
  networkStatus: vi.fn(),
  clearDownloads: vi.fn(),
  clearParses: vi.fn(),
  downloadedKeys: vi.fn(),
  parseRecords: vi.fn(),
  recordParse: vi.fn(),
  removeParse: vi.fn(),
  quitConfirmed: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  getMainWindow: vi.fn(),
  hideMainWindow: vi.fn(),
  send: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: Handler) => {
      h.registered.push(channel)
      h.handlers.set(channel, fn)
    }
  },
  clipboard: { readText: h.readText, writeText: h.writeText },
  dialog: { showOpenDialog: h.showOpenDialog },
  shell: { showItemInFolder: h.showItemInFolder, openExternal: h.openExternal }
}))
vi.mock('./auth/authGuard', () => ({
  checkAuth: h.checkAuth,
  ensureLoggedIn: h.ensureLoggedIn,
  getAuthState: h.getAuthState,
  logout: h.logout,
  requireLogin: h.requireLogin
}))
vi.mock('./auth/browserImport', () => ({ importFromBrowser: h.importFromBrowser, listBrowserProfiles: h.listBrowserProfiles }))
vi.mock('./auth/cookieImport', () => ({ importCookieText: h.importCookieText }))
vi.mock('./auth/loginWindow', () => ({ openLoginWindow: h.openLoginWindow }))
vi.mock('./auth/session', () => ({
  biliSession: () => ({ cookies: { get: h.cookiesGet, set: h.cookiesSet } })
}))
vi.mock('./bili/audio', () => ({ AUDIO_STREAM_INFO: h.AUDIO }))
vi.mock('./bili/lists', () => ({ expandLazy: h.expandLazy, loadPage: h.loadPage, myFavFolders: h.myFavFolders }))
vi.mock('./bili/playurl', () => ({ getPlayInfo: h.getPlayInfo, streamInfoFromPlay: h.streamInfoFromPlay }))
vi.mock('./bili/resolve', () => ({ resolveBatch: h.resolveBatch, resolveInput: h.resolveInput }))
vi.mock('./config', () => ({ exportConfig: h.exportConfig, importConfig: h.importConfig }))
vi.mock('./net/cdn', () => ({ CDN_HOSTS: h.CDN, pingHost: h.pingHost }))
vi.mock('./net/network', () => ({ networkStatus: h.networkStatus }))
vi.mock('./history', () => ({
  clearDownloads: h.clearDownloads,
  clearParses: h.clearParses,
  downloadedKeys: h.downloadedKeys,
  parseRecords: h.parseRecords,
  recordParse: h.recordParse,
  removeParse: h.removeParse
}))
vi.mock('./quitGuard', () => ({ quitConfirmed: h.quitConfirmed }))
vi.mock('./settings', () => ({ getSettings: h.getSettings, updateSettings: h.updateSettings }))
vi.mock('./windows', () => ({ getMainWindow: h.getMainWindow, hideMainWindow: h.hideMainWindow, send: h.send }))

const manager = {
  list: vi.fn(),
  pause: vi.fn(),
  pauseMany: vi.fn(),
  pauseAll: vi.fn(),
  resume: vi.fn(),
  resumeMany: vi.fn(),
  resumeAll: vi.fn(),
  remove: vi.fn(),
  redownload: vi.fn(),
  clearFinished: vi.fn()
}
const subs = { list: vi.fn(), add: vi.fn(), update: vi.fn(), remove: vi.fn(), check: vi.fn() }
const mcp = { status: vi.fn() }
const updater = {
  getState: vi.fn(),
  check: vi.fn(),
  download: vi.fn(),
  cancel: vi.fn(),
  install: vi.fn(),
  skip: vi.fn(),
  openPage: vi.fn()
}
const enqueue = vi.fn()
const deps = { manager, subs, mcp, updater, enqueue } as unknown as IpcDeps

const WIN = { id: 'main-window' }
const SETTINGS = { downloadDir: '/dl', closeAction: 'ask', mcp: { enabled: true, port: 39231, token: 'old' } }
const LOGGED_OUT = { loggedIn: false }
const loggedIn = (mid: number) => ({ loggedIn: true, user: { mid, uname: 'u', face: '', vipActive: false, vipLabel: '' } })

let mod: typeof import('./ipc')

beforeEach(async () => {
  vi.resetAllMocks()
  h.handlers.clear()
  h.registered.length = 0
  h.jar.clear()
  h.checkAuth.mockResolvedValue(LOGGED_OUT)
  h.getAuthState.mockReturnValue(LOGGED_OUT)
  h.ensureLoggedIn.mockResolvedValue(undefined)
  h.getSettings.mockReturnValue(SETTINGS)
  h.updateSettings.mockImplementation((patch: object) => ({ ...SETTINGS, ...patch }))
  h.getMainWindow.mockReturnValue(WIN)
  h.cookiesGet.mockImplementation(async ({ name }: { name: string }) => {
    const c = h.jar.get(name)
    return c ? [{ name, ...c }] : []
  })
  h.cookiesSet.mockImplementation(async (c: { name: string } & StoredCookie) => {
    h.jar.set(c.name, { value: c.value, expirationDate: c.expirationDate })
  })
  // ipc.ts 有模块级的 SESSDATA 暂存，每个用例都重新加载
  vi.resetModules()
  mod = await import('./ipc')
  mod.registerIpc(deps)
})

async function invoke(channel: string, ...args: unknown[]): Promise<Result> {
  const fn = h.handlers.get(channel)
  if (!fn) throw new Error(`未注册的频道：${channel}`)
  return fn({}, ...args)
}

/** 调用并断言成功，返回 data */
async function data(channel: string, ...args: unknown[]): Promise<unknown> {
  const r = await invoke(channel, ...args)
  if (!r.ok) throw new Error(`${channel} 失败：${r.error}`)
  return r.data
}

const order = (fn: Mock, i = 0): number => fn.mock.invocationCallOrder[i]

describe('返回值包装', () => {
  it('成功时返回 { ok: true, data }', async () => {
    h.networkStatus.mockReturnValue('直连')
    expect(await invoke('net:status')).toEqual({ ok: true, data: '直连' })
  })

  it('没有返回值时 data 为 undefined', async () => {
    expect(await invoke('dl:pause', 't1')).toStrictEqual({ ok: true, data: undefined })
  })

  it('抛出 Error 时只返回 message，同步抛出和异步拒绝都一样', async () => {
    h.importFromBrowser.mockRejectedValue(new Error('没有权限'))
    expect(await invoke('auth:import', 'chrome::Default')).toEqual({ ok: false, error: '没有权限' })
    h.readText.mockImplementation(() => {
      throw new Error('剪贴板不可用')
    })
    expect(await invoke('clipboard:read')).toEqual({ ok: false, error: '剪贴板不可用' })
  })

  it('抛出非 Error 的值时转成字符串', async () => {
    h.writeText.mockImplementation(() => {
      throw 'boom'
    })
    expect(await invoke('clipboard:write', 't')).toEqual({ ok: false, error: 'boom' })
    h.pingHost.mockRejectedValue(404)
    expect(await invoke('net:pingCdn')).toEqual({ ok: false, error: '404' })
  })

  it('每个频道只注册一次', () => {
    expect(h.registered).toHaveLength(h.handlers.size)
    expect(h.handlers.size).toBe(57)
  })
})

describe('登录', () => {
  it('auth:check 返回检查结果，检查失败时回落到当前状态', async () => {
    h.checkAuth.mockResolvedValueOnce(loggedIn(1))
    expect(await data('auth:check')).toEqual(loggedIn(1))
    h.checkAuth.mockRejectedValueOnce(new Error('断网'))
    h.getAuthState.mockReturnValue({ loggedIn: false, expired: true })
    expect(await data('auth:check')).toEqual({ loggedIn: false, expired: true })
  })

  it('auth:logout 返回退出后的登录状态', async () => {
    h.logout.mockResolvedValue(LOGGED_OUT)
    expect(await data('auth:logout')).toEqual(LOGGED_OUT)
    expect(h.logout).toHaveBeenCalledOnce()
  })
})

describe('解析', () => {
  const RESULT = {
    kind: 'ugc',
    title: '合集',
    cover: 'c.jpg',
    groups: [
      { id: 'a', title: 'a', items: [{}, {}] },
      { id: 'b', title: 'b', items: [{}, {}, {}] }
    ],
    defaultSelected: []
  }

  it('parse 先确认登录，去掉首尾空格，并按条目总数记录历史', async () => {
    h.resolveInput.mockResolvedValue(RESULT)
    const r = await data('parse', '  https://www.bilibili.com/video/BV1xx  ')
    expect(r).toEqual({ ...RESULT, input: 'https://www.bilibili.com/video/BV1xx' })
    expect(order(h.ensureLoggedIn)).toBeLessThan(order(h.resolveInput))
    expect(h.recordParse).toHaveBeenCalledWith({
      input: 'https://www.bilibili.com/video/BV1xx',
      title: '合集',
      kind: 'ugc',
      cover: 'c.jpg',
      count: 5,
      at: expect.any(Number)
    })
  })

  it('没登录时 parse 直接报错，不解析也不记录', async () => {
    h.ensureLoggedIn.mockRejectedValue(new Error('请先登录 B站账号'))
    expect(await invoke('parse', 'x')).toEqual({ ok: false, error: '请先登录 B站账号' })
    expect(h.resolveInput).not.toHaveBeenCalled()
    expect(h.recordParse).not.toHaveBeenCalled()
  })

  it('parseMore 先确认登录再按页加载', async () => {
    const source = { type: 'fav', mediaId: 1 }
    h.loadPage.mockResolvedValue({ items: [] })
    expect(await data('parseMore', source, 3)).toEqual({ items: [] })
    expect(h.loadPage).toHaveBeenCalledWith(source, 3)
    expect(order(h.ensureLoggedIn)).toBeLessThan(order(h.loadPage))

    h.ensureLoggedIn.mockRejectedValue(new Error('登录已过期，请重新登录'))
    h.loadPage.mockClear()
    expect(await invoke('parseMore', source, 4)).toEqual({ ok: false, error: '登录已过期，请重新登录' })
    expect(h.loadPage).not.toHaveBeenCalled()
  })

  it('parseBatch 先确认登录，进度推送给渲染进程', async () => {
    h.resolveBatch.mockImplementation(async (inputs: string[], onProgress: (d: number, t: number, title?: string) => void) => {
      onProgress(1, inputs.length, '第一个')
      onProgress(2, inputs.length)
      return RESULT
    })
    expect(await data('parseBatch', ['a', 'b'])).toBe(RESULT)
    expect(h.resolveBatch).toHaveBeenCalledWith(['a', 'b'], expect.any(Function))
    expect(order(h.ensureLoggedIn)).toBeLessThan(order(h.resolveBatch))
    expect(h.send.mock.calls).toEqual([
      ['parse:progress', { done: 1, total: 2, title: '第一个' }],
      ['parse:progress', { done: 2, total: 2, title: undefined }]
    ])

    h.ensureLoggedIn.mockRejectedValue(new Error('请先登录 B站账号'))
    h.resolveBatch.mockClear()
    expect((await invoke('parseBatch', ['a'])).ok).toBe(false)
    expect(h.resolveBatch).not.toHaveBeenCalled()
  })
})

describe('streamInfo', () => {
  it('音频直接返回固定的流信息', async () => {
    expect(await data('streamInfo', { kind: 'audio', key: 'au:1' })).toBe(h.AUDIO)
    expect(h.getPlayInfo).not.toHaveBeenCalled()
    expect(h.expandLazy).not.toHaveBeenCalled()
  })

  it('普通条目直接取流，清晰度固定传 127', async () => {
    const item = { kind: 'ugc', key: 'ugc:BV1:1', cid: 1 }
    const play = { dash: true }
    const info = { qualities: [{ qn: 80 }] }
    h.getPlayInfo.mockResolvedValue(play)
    h.streamInfoFromPlay.mockReturnValue(info)
    expect(await data('streamInfo', item)).toBe(info)
    expect(h.expandLazy).not.toHaveBeenCalled()
    expect(h.getPlayInfo).toHaveBeenCalledWith(item, 127)
    expect(h.streamInfoFromPlay).toHaveBeenCalledWith(play)
  })

  it('懒加载条目先查详情，用第一个分P取流', async () => {
    const lazy = { kind: 'ugc', key: 'ugc:BV1', lazy: true, cid: 0 }
    const first = { kind: 'ugc', key: 'ugc:BV1:1', cid: 11 }
    const second = { kind: 'ugc', key: 'ugc:BV1:2', cid: 12 }
    h.expandLazy.mockResolvedValue([first, second])
    h.getPlayInfo.mockResolvedValue({})
    h.streamInfoFromPlay.mockReturnValue({ qualities: [] })
    await data('streamInfo', lazy)
    expect(h.expandLazy).toHaveBeenCalledWith([lazy])
    expect(h.getPlayInfo).toHaveBeenCalledWith(first, 127)
  })

  it('失效的条目报出失效原因，不去取流', async () => {
    h.expandLazy.mockResolvedValue([{ kind: 'ugc', key: 'k', cid: 0, unavailable: '视频已失效' }])
    expect(await invoke('streamInfo', { kind: 'ugc', key: 'k', lazy: true })).toEqual({ ok: false, error: '视频已失效' })
    expect(await invoke('streamInfo', { kind: 'pgc', key: 'k2', unavailable: '地区限制' })).toEqual({
      ok: false,
      error: '地区限制'
    })
    expect(h.getPlayInfo).not.toHaveBeenCalled()
  })
})

describe('myFavFolders', () => {
  it('未登录时报错，不请求收藏夹', async () => {
    expect(await invoke('myFavFolders')).toEqual({ ok: false, error: '请先登录' })
    expect(h.myFavFolders).not.toHaveBeenCalled()
  })

  it('已登录时按当前账号的 mid 查询', async () => {
    h.checkAuth.mockResolvedValue(loggedIn(7))
    h.myFavFolders.mockResolvedValue([{ id: 1, title: '默认', count: 3 }])
    expect(await data('myFavFolders')).toEqual([{ id: 1, title: '默认', count: 3 }])
    expect(h.myFavFolders).toHaveBeenCalledWith(7)
  })

  it('检查登录失败时用当前状态', async () => {
    h.checkAuth.mockRejectedValue(new Error('断网'))
    h.getAuthState.mockReturnValue(loggedIn(42))
    await data('myFavFolders')
    expect(h.myFavFolders).toHaveBeenCalledWith(42)
  })
})

describe('settings:chooseDir', () => {
  const OPTS = { title: '选择下载目录', defaultPath: '/dl', properties: ['openDirectory', 'createDirectory'] }

  it('有主窗口时挂在窗口上，选好后写入设置', async () => {
    h.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/new'] })
    expect(await data('settings:chooseDir')).toEqual({ ...SETTINGS, downloadDir: '/new' })
    expect(h.showOpenDialog.mock.calls).toEqual([[WIN, OPTS]])
    expect(h.updateSettings).toHaveBeenCalledWith({ downloadDir: '/new' })
  })

  it('没有主窗口时单独弹出', async () => {
    h.getMainWindow.mockReturnValue(null)
    h.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/new'] })
    await data('settings:chooseDir')
    expect(h.showOpenDialog.mock.calls).toEqual([[OPTS]])
  })

  it.each([
    { canceled: true, filePaths: ['/x'] },
    { canceled: false, filePaths: [] }
  ])('取消或没选目录时原样返回设置（%o）', async (r) => {
    h.showOpenDialog.mockResolvedValue(r)
    expect(await data('settings:chooseDir')).toBe(SETTINGS)
    expect(h.updateSettings).not.toHaveBeenCalled()
  })
})

describe('mcp:regenerateToken', () => {
  it('生成 48 位十六进制的新令牌，保留 MCP 的其他设置', async () => {
    await data('mcp:regenerateToken')
    await data('mcp:regenerateToken')
    const [[a], [b]] = h.updateSettings.mock.calls
    expect(a).toEqual({ mcp: { enabled: true, port: 39231, token: expect.stringMatching(/^[0-9a-f]{48}$/) } })
    expect(a.mcp.token).not.toBe('old')
    expect(b.mcp.token).not.toBe(a.mcp.token)
  })
})

describe('app:close', () => {
  it.each([
    { action: 'quit', remember: true, saved: [[{ closeAction: 'quit' }]], quit: 1, hide: 0 },
    { action: 'quit', remember: false, saved: [], quit: 1, hide: 0 },
    { action: 'background', remember: true, saved: [[{ closeAction: 'background' }]], quit: 0, hide: 1 },
    { action: 'background', remember: false, saved: [], quit: 0, hide: 1 }
  ])('$action，记住选择：$remember', async ({ action, remember, saved, quit, hide }) => {
    await data('app:close', action, remember)
    expect(h.updateSettings.mock.calls).toEqual(saved)
    expect(h.quitConfirmed).toHaveBeenCalledTimes(quit)
    expect(h.hideMainWindow).toHaveBeenCalledTimes(hide)
  })
})

describe('模拟登录过期', () => {
  const FAKE = 'expired-for-testing'
  const REAL = { value: 'real-sessdata', expirationDate: 1_800_000_000 }

  it('把 SESSDATA 换成假值并保留原过期时间，然后重新检查、弹出登录框', async () => {
    h.jar.set('SESSDATA', REAL)
    await data('auth:simulateExpiry')
    expect(h.cookiesGet).toHaveBeenCalledWith({ domain: 'bilibili.com', name: 'SESSDATA' })
    expect(h.cookiesSet.mock.calls).toEqual([
      [
        {
          url: 'https://www.bilibili.com',
          domain: '.bilibili.com',
          path: '/',
          name: 'SESSDATA',
          value: FAKE,
          secure: true,
          httpOnly: true,
          expirationDate: REAL.expirationDate
        }
      ]
    ])
    expect(order(h.cookiesSet)).toBeLessThan(order(h.checkAuth))
    expect(order(h.checkAuth)).toBeLessThan(order(h.requireLogin))
  })

  it('连续模拟两次也不会把假值当成真实值暂存', async () => {
    h.jar.set('SESSDATA', REAL)
    await data('auth:simulateExpiry')
    await data('auth:simulateExpiry')
    expect(h.jar.get('SESSDATA')?.value).toBe(FAKE)
    h.cookiesSet.mockClear()
    h.checkAuth.mockClear()
    await mod.restoreSimulatedExpiry()
    expect(h.cookiesSet).toHaveBeenCalledOnce()
    expect(h.jar.get('SESSDATA')).toEqual(REAL)
    expect(h.checkAuth).toHaveBeenCalledOnce()
  })

  it('恢复是幂等的：恢复过一次后再调用什么都不做', async () => {
    h.jar.set('SESSDATA', REAL)
    await data('auth:simulateExpiry')
    await mod.restoreSimulatedExpiry()
    h.cookiesSet.mockClear()
    h.checkAuth.mockClear()
    await mod.restoreSimulatedExpiry()
    expect(h.cookiesSet).not.toHaveBeenCalled()
    expect(h.checkAuth).not.toHaveBeenCalled()
  })

  it('没模拟过时恢复什么都不做', async () => {
    await mod.restoreSimulatedExpiry()
    expect(h.cookiesSet).not.toHaveBeenCalled()
    expect(h.checkAuth).not.toHaveBeenCalled()
  })

  it('没有真实 SESSDATA 时也能模拟', async () => {
    await data('auth:simulateExpiry')
    expect(h.cookiesSet).toHaveBeenCalledWith(expect.objectContaining({ value: FAKE, expirationDate: undefined }))
    expect(h.requireLogin).toHaveBeenCalledOnce()
  })
})

describe('网络', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('net:test 返回请求 nav 接口的耗时，并丢弃响应体', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1_000_000)
    const cancel = vi.fn(async () => {})
    const fetch = vi.fn(async () => {
      vi.setSystemTime(1_000_250)
      return { body: { cancel } }
    })
    vi.stubGlobal('fetch', fetch)
    expect(await data('net:test')).toBe(250)
    expect(fetch).toHaveBeenCalledWith('https://api.bilibili.com/x/web-interface/nav', { signal: expect.any(AbortSignal) })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('net:test 没有响应体时照样返回耗时，连不上时报错', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ body: null })))
    expect(typeof (await data('net:test'))).toBe('number')
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('fetch failed'))))
    expect(await invoke('net:test')).toEqual({ ok: false, error: 'fetch failed' })
  })

  it('net:cdnHosts 返回节点列表，net:pingCdn 逐个测速', async () => {
    expect(await data('net:cdnHosts')).toBe(h.CDN)
    h.pingHost.mockImplementation(async (host: string) => (host === 'a.example' ? 12 : null))
    expect(await data('net:pingCdn')).toEqual([
      { host: 'a.example', ms: 12 },
      { host: 'b.example', ms: null }
    ])
  })
})

describe('直接转发的频道', () => {
  const FORWARDS: { channel: string; args: unknown[]; fn: Mock; called?: unknown[] }[] = [
    { channel: 'auth:login', args: [], fn: h.openLoginWindow },
    { channel: 'auth:listBrowsers', args: [], fn: h.listBrowserProfiles },
    { channel: 'auth:import', args: ['chrome::Default'], fn: h.importFromBrowser },
    { channel: 'auth:importCookie', args: ['SESSDATA=1'], fn: h.importCookieText },
    { channel: 'history:downloadedKeys', args: [], fn: h.downloadedKeys },
    { channel: 'history:clearDownloads', args: [], fn: h.clearDownloads },
    { channel: 'history:parses', args: [], fn: h.parseRecords },
    { channel: 'history:removeParse', args: ['BV1'], fn: h.removeParse },
    { channel: 'history:clearParses', args: [], fn: h.clearParses },
    { channel: 'dl:enqueue', args: [{ title: 't', items: [] }], fn: enqueue },
    { channel: 'dl:list', args: [], fn: manager.list },
    { channel: 'dl:pause', args: ['t1'], fn: manager.pause },
    { channel: 'dl:pauseMany', args: [['t1', 't2']], fn: manager.pauseMany },
    { channel: 'dl:pauseAll', args: [], fn: manager.pauseAll },
    { channel: 'dl:resume', args: ['t1'], fn: manager.resume },
    { channel: 'dl:resumeMany', args: [['t1', 't2']], fn: manager.resumeMany },
    { channel: 'dl:resumeAll', args: [], fn: manager.resumeAll },
    { channel: 'dl:remove', args: [['t1', 't2'], true], fn: manager.remove },
    { channel: 'dl:retry', args: ['t1'], fn: manager.resume },
    { channel: 'dl:redownload', args: ['t1'], fn: manager.redownload },
    { channel: 'dl:clearFinished', args: [true], fn: manager.clearFinished },
    { channel: 'settings:get', args: [], fn: h.getSettings },
    { channel: 'settings:set', args: [{ concurrency: 3 }], fn: h.updateSettings },
    { channel: 'subs:list', args: [], fn: subs.list },
    { channel: 'subs:add', args: [{ input: 'x' }], fn: subs.add },
    { channel: 'subs:update', args: ['s1', { enabled: false }], fn: subs.update },
    { channel: 'subs:remove', args: ['s1'], fn: subs.remove },
    { channel: 'subs:check', args: ['s1'], fn: subs.check },
    { channel: 'net:status', args: [], fn: h.networkStatus },
    { channel: 'config:export', args: [], fn: h.exportConfig, called: [WIN, subs] },
    { channel: 'config:import', args: [], fn: h.importConfig, called: [WIN, subs] },
    { channel: 'mcp:status', args: [], fn: mcp.status },
    { channel: 'update:state', args: [], fn: updater.getState },
    { channel: 'update:check', args: [], fn: updater.check, called: [true] },
    { channel: 'update:download', args: [], fn: updater.download },
    { channel: 'update:cancel', args: [], fn: updater.cancel },
    { channel: 'update:install', args: [], fn: updater.install },
    { channel: 'update:skip', args: [], fn: updater.skip },
    { channel: 'update:openPage', args: [], fn: updater.openPage },
    { channel: 'clipboard:read', args: [], fn: h.readText },
    { channel: 'clipboard:write', args: ['hello'], fn: h.writeText },
    { channel: 'shell:showInFolder', args: ['/dl/a.mp4'], fn: h.showItemInFolder },
    {
      channel: 'shell:openFullDiskAccess',
      args: [],
      fn: h.openExternal,
      called: ['x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles']
    }
  ]

  it.each(FORWARDS)('$channel', async ({ channel, args, fn, called = args }) => {
    const out = { from: channel }
    fn.mockReturnValue(out)
    expect(await data(channel, ...args)).toBe(out)
    expect(fn.mock.calls).toEqual([called])
  })
})
