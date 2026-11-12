import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { IpcDeps } from './ipc'
import type { AccountState, LoginTarget } from '@shared/types'

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
  // ./auth/*
  checkAuth: vi.fn(),
  ensureLoggedIn: vi.fn(),
  getAuthState: vi.fn(),
  logout: vi.fn(),
  requireLogin: vi.fn(),
  importFromBrowser: vi.fn(),
  listBrowserProfiles: vi.fn(),
  chooseBrowserFolder: vi.fn(),
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
  send: vi.fn(),
  // ./watermark/manual
  requireVideoTask: vi.fn(),
  prepareManual: vi.fn(),
  previewFrame: vi.fn(),
  // ./watermark/ai
  aiStatus: vi.fn(),
  aiDownload: vi.fn(),
  aiCancel: vi.fn(),
  aiRemove: vi.fn(),
  aiOn: vi.fn(),
  aiEstimate: vi.fn(),
  aiPreview: vi.fn(),
  aiRelease: vi.fn(),
  aiCloseAll: vi.fn()
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
  shell: { showItemInFolder: h.showItemInFolder }
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
  UA: 'test-agent',
  biliSession: () => ({ cookies: { get: h.cookiesGet, set: h.cookiesSet } })
}))
vi.mock('./bili/audio', () => ({ audioStreamInfo: () => h.AUDIO }))
vi.mock('./bili/http', async (original) => ({ ...await original<typeof import('./bili/http')>(), api: vi.fn() }))
vi.mock('./bili/lists', () => ({ expandLazy: h.expandLazy, loadPage: h.loadPage, myFavFolders: h.myFavFolders }))
vi.mock('./bili/playurl', () => ({ getPlayInfo: h.getPlayInfo, streamInfoFromPlay: h.streamInfoFromPlay }))
vi.mock('./bili/resolve', () => ({ resolveBatch: h.resolveBatch, resolveInput: h.resolveInput }))
vi.mock('./config', () => ({ exportConfig: h.exportConfig, importConfig: h.importConfig }))
vi.mock('./net/cdn', () => ({ cdnHosts: () => h.CDN, pingHost: h.pingHost }))
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
vi.mock('./watermark/ai', () => ({
  aiModel: () => ({ status: h.aiStatus, download: h.aiDownload, cancel: h.aiCancel, remove: h.aiRemove, on: h.aiOn }),
  aiSessions: () => ({ estimate: h.aiEstimate, preview: h.aiPreview, release: h.aiRelease, closeAll: h.aiCloseAll })
}))
vi.mock('./watermark/manual', () => ({
  requireVideoTask: h.requireVideoTask,
  prepareManual: h.prepareManual,
  previewFrame: h.previewFrame
}))

vi.mock('./auth/browserFolder', () => ({ chooseBrowserFolder: h.chooseBrowserFolder }))

const manager = {
  enqueue: vi.fn(),
  list: vi.fn(),
  pause: vi.fn(),
  pauseMany: vi.fn(),
  pauseAll: vi.fn(),
  resume: vi.fn(),
  resumeMany: vi.fn(),
  resumeAll: vi.fn(),
  remove: vi.fn(),
  redownload: vi.fn(),
  clearFinished: vi.fn(),
  startWatermark: vi.fn(),
  cancelWatermark: vi.fn()
}
const subs = { list: vi.fn(), add: vi.fn(), update: vi.fn(), remove: vi.fn(), check: vi.fn(), downloadSource: vi.fn() }
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
    h.networkStatus.mockReturnValue({ text: '直连', error: false })
    expect(await invoke('net:status')).toEqual({ ok: true, data: { text: '直连', error: false } })
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
    expect(h.handlers.size).toBe(78)
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

describe('多账号 IPC', () => {
  let scope: typeof import('./auth/scope')
  const a = { partition: 'account-a', mid: 7 }
  const b = { partition: 'account-b', mid: 8 }
  const snapshot: AccountState = { activeMid: 7, accounts: [], legacyCount: 0 }
  const accounts = {
    snapshot: vi.fn(() => snapshot),
    select: vi.fn(async () => snapshot),
    remove: vi.fn(),
    assignLegacy: vi.fn(),
    logout: vi.fn(),
    login: vi.fn<(fn: () => Promise<unknown>, target?: LoginTarget) => Promise<unknown>>((fn) => fn()),
    run: <T>(mid: number, fn: () => Promise<T>, background: boolean) =>
      scope.inAuthScope({ ...(mid === a.mid ? a : b), background }, fn)
  }

  beforeEach(async () => {
    scope = await import('./auth/scope')
    scope.setActiveScope(a)
    mod.registerIpc({ ...deps, accounts: accounts as unknown as IpcDeps['accounts'] })
    h.getAuthState.mockImplementation(() => loggedIn(scope.authScope().mid!))
    h.getSettings.mockReturnValue({ ...SETTINGS, defaults: {}, defaultQn: 80 })
  })

  it('登录入口把账号目标传给会话管理器，管理操作使用指定 UID', async () => {
    const target = { mode: 'reauth', mid: 8, activate: false }
    await data('auth:login', target)
    await data('auth:import', 'profile', target)
    await data('auth:importCookie', 'SESSDATA=cookie', target)
    expect(accounts.login.mock.calls.map((call) => call[1])).toEqual([target, target, target])
    expect(h.openLoginWindow).toHaveBeenCalledOnce()
    expect(h.importFromBrowser).toHaveBeenCalledWith('profile')
    expect(h.importCookieText).toHaveBeenCalledWith('SESSDATA=cookie')
    expect(await data('auth:accounts')).toEqual(snapshot)
    await data('auth:switchAccount', 8)
    await data('auth:assignLegacy', 8)
    await data('auth:removeAccount', 8)
    await data('auth:logout')
    expect(accounts.select).toHaveBeenCalledWith(8)
    expect(accounts.assignLegacy).toHaveBeenCalledWith(8)
    expect(accounts.remove).toHaveBeenCalledWith(8)
    expect(accounts.logout).toHaveBeenCalledOnce()
  })

  it('解析记录写入发起账号，删除记录时向历史模块传递账号', async () => {
    h.resolveInput.mockResolvedValue({ title: '视频', kind: 'ugc', cover: '', groups: [], defaultSelected: [] })
    await data('parse', 'BV1')
    expect(h.recordParse).toHaveBeenCalledWith(expect.objectContaining({ input: 'BV1', accountMid: a.mid }))
    await data('history:removeParse', 'BV1', a.mid)
    expect(h.removeParse).toHaveBeenCalledWith('BV1', a.mid)
  })

  it('重开其他账号的稍后再看记录只读取原账号，下载历史不分账号', async () => {
    h.resolveInput.mockImplementation(async () => ({
      title: `账号 ${scope.authScope().mid} 的稍后再看`, kind: 'ugc', cover: '', groups: [], defaultSelected: []
    }))
    expect(await data('parse', 'watchlater', b.mid)).toMatchObject({ title: '账号 8 的稍后再看' })
    expect(h.recordParse).toHaveBeenCalledWith(expect.objectContaining({ input: 'watchlater', accountMid: b.mid }))
    expect(scope.activeScope().mid).toBe(a.mid)
    await data('history:downloadedKeys')
    expect(h.downloadedKeys).toHaveBeenCalledWith()
  })

  it('原账号失效时请求该账号重登，不使用侧栏账号解析', async () => {
    const { AuthExpiredError } = await import('./bili/http')
    accounts.snapshot.mockReturnValueOnce({
      ...snapshot, accounts: [{ mid: b.mid, uname: 'B', face: '', vipActive: false, vipLabel: '', status: 'expired' }]
    })
    h.resolveInput.mockRejectedValueOnce(new AuthExpiredError())
    expect(await invoke('parse', 'watchlater', b.mid)).toMatchObject({ ok: false })
    expect(h.resolveInput).toHaveBeenCalledOnce()
    expect(h.recordParse).not.toHaveBeenCalled()
    expect(h.send).toHaveBeenCalledWith('auth:required', { mode: 'reauth', mid: b.mid, activate: false })
    expect(scope.activeScope().mid).toBe(a.mid)
  })

  it('从其他账号的本地订阅打开、翻页和下载都使用订阅所属账号', async () => {
    const source = { type: 'subscription', id: 'b' }
    const subscription = { id: 'b', accountMid: 8, input: 'watchlater' }
    subs.list.mockReturnValue([subscription])
    h.resolveInput.mockImplementation(async () => ({ owner: scope.authScope().mid }))
    h.loadPage.mockImplementation(async () => ({ owner: scope.authScope().mid }))
    h.expandLazy.mockImplementation(async (items) => items)
    enqueue.mockImplementation(async (req, verify) => {
      verify()
      expect(req.accountMid).toBe(scope.authScope().mid)
    })
    subs.downloadSource.mockImplementation(async (request) => {
      request.verifyAccount()
      return { owner: scope.authScope().mid }
    })
    expect(await data('sources:open', source)).toEqual({ result: { owner: 8 }, accountMid: 8 })
    expect(await data('parseMore', { type: 'watchlater' }, 2, 8)).toEqual({ owner: 8 })
    expect(await data('sources:prepareItems', [], 8)).toEqual({ items: [], note: undefined })
    expect(await data('sources:subscribeDownload', source)).toEqual({ owner: 8 })
    expect(subs.downloadSource).toHaveBeenCalledWith(expect.objectContaining({ accountMid: 8, subscription }))
    await data('dl:enqueue', { items: [] }, 8)
    await data('dl:enqueue', { items: [] })
    expect(enqueue.mock.calls.map(([req]) => req.accountMid)).toEqual([8, 7])
    await data('subs:add', { input: 'BV-test' }, 8)
    expect(subs.add).toHaveBeenCalledWith({ input: 'BV-test' }, 8)
  })

  it('切换期间仍以原账号读取，但丢弃迟到的明细和提交', async () => {
    const source = { type: 'account', mid: 7, target: { type: 'watchlater' } }
    h.resolveInput.mockImplementation(async () => {
      scope.setActiveScope(b)
      scope.setActiveScope(a)
      expect(scope.authScope().mid).toBe(7)
      return { items: [] }
    })
    expect(await invoke('sources:open', source)).toEqual({ ok: false, error: '账号已切换，请重新打开来源。' })
    enqueue.mockImplementation(async (_req, verify) => {
      scope.setActiveScope(b)
      verify()
    })
    expect(await invoke('dl:enqueue', { items: [] }, 7)).toEqual({ ok: false, error: '账号已切换，请重新打开来源。' })
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
    expect(h.resolveBatch).toHaveBeenCalledWith(['a', 'b'], expect.any(Function), expect.any(Function))
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

describe('sources', () => {
  const season = {
    kind: 'pgc',
    title: '电影',
    groups: [{ id: 'main', items: [{ key: 'pgc:10' }] }],
    defaultSelected: ['pgc:10']
  }
  const account = { type: 'account', mid: 7, target: { type: 'pgc', seasonId: 3 } }

  it('旧订阅只需 ID 就能打开，浏览期间不记录解析、不检查更新也不下载', async () => {
    const input = 'https://b23.tv/old'
    subs.list.mockReturnValue([{ id: 'legacy', input, seen: ['pgc:10'], enabled: false }])
    h.resolveInput.mockResolvedValue(season)
    expect(await data('sources:open', { type: 'subscription', id: 'legacy' })).toMatchObject({ result: season })
    expect(h.resolveInput).toHaveBeenCalledWith(input)
    expect(subs.check).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
    expect(h.recordParse).not.toHaveBeenCalled()
    expect(await invoke('sources:open', { type: 'subscription', id: 'removed' }))
      .toEqual({ ok: false, error: '此来源已不可用。' })
  })

  it('按当前登录账号读取收藏夹和剧集', async () => {
    h.getAuthState.mockReturnValue(loggedIn(7))
    h.myFavFolders.mockResolvedValue([{ id: 9, title: '默认收藏夹' }])
    h.resolveInput.mockResolvedValue(season)
    expect(await data('sources:listAccount', 7, 'folders', 1)).toEqual({
      items: [{ key: 'fav:9', title: '默认收藏夹', cover: undefined, target: { type: 'fav', mediaId: 9 } }],
      hasMore: false
    })
    expect(await data('sources:open', account)).toEqual({ result: season, accountMid: 7 })
    expect(h.resolveInput).toHaveBeenCalledWith('https://www.bilibili.com/bangumi/play/ss3')
  })

  it('登录过期时转发登录错误，旧账号或在途请求切换账号时丢弃结果', async () => {
    h.ensureLoggedIn.mockRejectedValueOnce(new Error('登录已过期'))
    expect(await invoke('sources:listAccount', 7, 'folders', 1)).toEqual({ ok: false, error: '登录已过期' })
    h.getAuthState.mockReturnValue(loggedIn(8))
    expect(await invoke('sources:open', account)).toMatchObject({ ok: false })
    expect(h.resolveInput).not.toHaveBeenCalled()

    h.getAuthState.mockReturnValue(loggedIn(7))
    h.resolveInput.mockImplementation(async () => {
      h.getAuthState.mockReturnValue(loggedIn(8))
      return season
    })
    expect(await invoke('sources:open', account)).toEqual({ ok: false, error: '账号已切换，请重新打开来源。' })

    h.getAuthState.mockReturnValue(loggedIn(7))
    h.myFavFolders.mockImplementation(async () => {
      h.getAuthState.mockReturnValue(loggedIn(8))
      return []
    })
    expect(await invoke('sources:listAccount', 7, 'folders', 1)).toMatchObject({ ok: false })
  })

  it('提交准备展开分 P 并返回失效条目的提示，供选择窗口按分 P 去重', async () => {
    const selected = [{ key: 'ugc:BV1', lazy: true }]
    const expanded = [{ key: 'ugc:BV1:1' }, { key: 'ugc:BV1:2' }]
    h.expandLazy.mockResolvedValue([...expanded, { key: 'ugc:BV2', unavailable: '已失效' }])
    expect(await data('sources:prepareItems', selected)).toEqual({
      items: expanded,
      note: '1 个视频无法获取（已失效）'
    })
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('旧版和新版稍后再看详情都带有账号，切号后拒绝准备和提交', async () => {
    subs.list.mockReturnValue([
      { id: 'legacy', input: 'watchlater' },
      { id: 'bound', input: 'watchlater', accountMid: 7 }
    ])
    h.getAuthState.mockReturnValue(loggedIn(7))
    h.resolveInput.mockResolvedValue(season)
    for (const id of ['legacy', 'bound']) {
      expect(await data('sources:open', { type: 'subscription', id })).toEqual({ result: season, accountMid: 7 })
    }

    h.getAuthState.mockReturnValue(loggedIn(8))
    expect(await invoke('sources:open', { type: 'subscription', id: 'bound' })).toMatchObject({ ok: false })
    expect(await invoke('sources:prepareItems', [], 7)).toMatchObject({ ok: false })
    expect(await invoke('dl:enqueue', { items: [] }, 7)).toMatchObject({ ok: false })
    expect(h.expandLazy).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()

    h.getAuthState.mockReturnValue(loggedIn(7))
    enqueue.mockImplementation(async (_req, beforeQueue) => {
      h.getAuthState.mockReturnValue(loggedIn(8))
      beforeQueue()
    })
    expect(await invoke('dl:enqueue', { items: [] }, 7)).toEqual({ ok: false, error: '账号已切换，请重新打开来源。' })
  })

  it('一键操作使用主进程下载设置和当前账号', async () => {
    h.getSettings.mockReturnValue({ ...SETTINGS, defaultQn: 80, defaults: {} })
    h.getAuthState.mockReturnValue(loggedIn(7))
    subs.downloadSource.mockImplementation(async ({ verifyAccount }) => {
      verifyAccount()
      return { count: 1 }
    })
    expect(await data('sources:subscribeDownload', { type: 'account', mid: 7, target: { type: 'watchlater' } })).toEqual({ count: 1 })
    expect(subs.downloadSource).toHaveBeenCalledWith(expect.objectContaining({
      input: 'https://www.bilibili.com/watchlater', accountMid: 7, defaults: expect.objectContaining({ qn: 80 })
    }))
    h.getAuthState.mockReturnValue(loggedIn(8))
    expect(await invoke('sources:subscribeDownload', account)).toMatchObject({ ok: false })
    expect(subs.downloadSource).toHaveBeenCalledOnce()
  })

  it('为普通订阅入口添加的稍后再看绑定当前账号', async () => {
    h.getAuthState.mockReturnValue(loggedIn(7))
    const request = { input: '稍后再看', includeExisting: true }
    await data('subs:add', request)
    expect(subs.add).toHaveBeenCalledWith(request, 7)
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

it('打开浏览器文件夹选择器时传递主窗口，并返回重新检测的结果', async () => {
  const win = { id: 1 }
  const profiles = [{ id: 'chrome::Default', browser: 'Chrome', profile: 'Default', hasBiliLogin: true }]
  h.getMainWindow.mockReturnValue(win)
  h.chooseBrowserFolder.mockResolvedValue(profiles)
  expect(await data('auth:chooseBrowserFolder', 'chrome::')).toEqual(profiles)
  expect(h.chooseBrowserFolder).toHaveBeenCalledWith('chrome::', win)
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
    { channel: 'wm:start', args: ['t1', { x: 1, y: 2, w: 30, h: 10 }], fn: manager.startWatermark, called: ['t1', { x: 1, y: 2, w: 30, h: 10 }, 'fast'] },
    { channel: 'wm:cancel', args: ['t1'], fn: manager.cancelWatermark },
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
    { channel: 'shell:showInFolder', args: ['/dl/a.mp4'], fn: h.showItemInFolder }
  ]

  it.each(FORWARDS)('$channel', async ({ channel, args, fn, called = args }) => {
    const out = { from: channel }
    fn.mockReturnValue(out)
    expect(await data(channel, ...args)).toBe(out)
    expect(fn.mock.calls).toEqual([called])
  })
})

describe('去水印', () => {
  const task = { id: 't1', status: 'done', outputPath: '/dl/a.mp4' }
  const region = { x: 1, y: 2, w: 30, h: 10 }

  beforeEach(() => {
    manager.list.mockReturnValue([{ id: 't0' }, task])
    h.requireVideoTask.mockImplementation((t) => t)
  })

  it('wm:prepare 只处理列表里的任务，交给 prepareManual', async () => {
    h.prepareManual.mockResolvedValue({ image: 'data:' })
    expect(await data('wm:prepare', 't1')).toEqual({ image: 'data:' })
    expect(h.requireVideoTask).toHaveBeenCalledWith(task)
    expect(h.prepareManual).toHaveBeenCalledWith(task)
  })

  it('wm:frame 透传时间和区域，任务不存在时报错', async () => {
    h.previewFrame.mockResolvedValue('data:img')
    expect(await data('wm:frame', 't1', 12.5, region)).toBe('data:img')
    expect(h.previewFrame).toHaveBeenCalledWith(task, 12.5, region)

    h.requireVideoTask.mockImplementation((t) => {
      if (!t) throw new Error('任务不存在')
      return t
    })
    expect(await invoke('wm:frame', 'nope', 1)).toEqual({ ok: false, error: '任务不存在' })
    expect(h.requireVideoTask).toHaveBeenLastCalledWith(undefined)
  })

  it('wm:start 用 AI 精修时先放掉预览占着的推理进程；不认识的方式按快速', async () => {
    await data('wm:start', 't1', region, 'ai')
    expect(h.aiRelease).toHaveBeenCalledWith('t1')
    expect(manager.startWatermark).toHaveBeenLastCalledWith('t1', region, 'ai')
    await data('wm:start', 't1', region, 'magic')
    expect(manager.startWatermark).toHaveBeenLastCalledWith('t1', region, 'fast')
    expect(h.aiRelease).toHaveBeenCalledTimes(1)
  })

  it('AI 模型：状态、按设置的线程数下载、取消、删除前关掉预览会话；状态变化推送给界面', async () => {
    h.aiStatus.mockReturnValue({ state: 'missing', size: 1 })
    expect(await data('wm:ai:status')).toEqual({ state: 'missing', size: 1 })
    h.getSettings.mockReturnValue({ threads: 6 })
    h.aiDownload.mockResolvedValue(undefined)
    await data('wm:ai:download')
    expect(h.aiDownload).toHaveBeenCalledWith({ threads: 6 })
    await data('wm:ai:cancel')
    expect(h.aiCancel).toHaveBeenCalled()
    h.aiRemove.mockResolvedValue(undefined)
    await data('wm:ai:remove')
    expect(h.aiCloseAll).toHaveBeenCalled()
    expect(h.aiRemove).toHaveBeenCalled()
    const [event, listener] = h.aiOn.mock.calls[0]
    expect(event).toBe('status')
    listener({ state: 'ready', size: 1 })
    expect(h.send).toHaveBeenCalledWith('wm:ai:status', { state: 'ready', size: 1 })
  })

  it('AI 估算、预览只处理列表里的任务，用它的成品文件；关闭对话框时释放', async () => {
    h.aiEstimate.mockResolvedValue({ seconds: [1, 2] })
    expect(await data('wm:ai:estimate', 't1', region)).toEqual({ seconds: [1, 2] })
    expect(h.aiEstimate).toHaveBeenCalledWith('t1', '/dl/a.mp4', region)
    h.aiPreview.mockResolvedValue('data:ai')
    expect(await data('wm:ai:preview', 't1', 3, region)).toBe('data:ai')
    expect(h.aiPreview).toHaveBeenCalledWith('t1', '/dl/a.mp4', 3, region)
    await data('wm:ai:release', 't1')
    expect(h.aiRelease).toHaveBeenCalledWith('t1')
  })

  it('去水印速度：两种方式各自的倍数和依据', async () => {
    const speed = (await data('wm:speed')) as { fast: { basis: string }; ai: { basis: string; ratio: number[] } }
    expect(speed.fast.basis).toBe('default')
    expect(speed.ai.basis).toBe('default')
    expect(speed.ai.ratio).toHaveLength(2)
  })
})
