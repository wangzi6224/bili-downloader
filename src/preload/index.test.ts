import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BiliApi, PagedSource } from '@shared/types'
import type { IpcDeps } from '../main/ipc'

const h = vi.hoisted(() => ({
  expose: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  /** 主进程 registerIpc 注册的频道 */
  registered: [] as string[]
}))

// preload 和主进程的 ipc.ts 都从 electron 导入，这里一起提供
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: h.expose },
  ipcRenderer: { invoke: h.invoke, on: h.on, removeListener: h.removeListener },
  ipcMain: { handle: (channel: string) => h.registered.push(channel) },
  clipboard: {},
  dialog: {},
  shell: {}
}))
// 契约测试只看注册了哪些频道，主进程的依赖都换成空函数
vi.mock('../main/auth/authGuard', () => ({ checkAuth: vi.fn(), ensureLoggedIn: vi.fn(), getAuthState: vi.fn(), requireLogin: vi.fn() }))
vi.mock('../main/auth/browserImport', () => ({ importFromBrowser: vi.fn(), listBrowserProfiles: vi.fn() }))
vi.mock('../main/auth/cookieImport', () => ({ importCookieText: vi.fn() }))
vi.mock('../main/auth/loginWindow', () => ({ openLoginWindow: vi.fn() }))
vi.mock('../main/auth/session', () => ({ biliSession: vi.fn(), clearBiliCookies: vi.fn() }))
vi.mock('../main/bili/audio', () => ({ AUDIO_STREAM_INFO: {} }))
vi.mock('../main/bili/lists', () => ({ expandLazy: vi.fn(), loadPage: vi.fn(), myFavFolders: vi.fn() }))
vi.mock('../main/bili/playurl', () => ({ getPlayInfo: vi.fn(), streamInfoFromPlay: vi.fn() }))
vi.mock('../main/bili/resolve', () => ({ resolveBatch: vi.fn(), resolveInput: vi.fn() }))
vi.mock('../main/config', () => ({ exportConfig: vi.fn(), importConfig: vi.fn() }))
vi.mock('../main/net/cdn', () => ({ CDN_HOSTS: [], pingHost: vi.fn() }))
vi.mock('../main/net/network', () => ({ networkStatus: vi.fn() }))
vi.mock('../main/history', () => ({
  clearDownloads: vi.fn(),
  clearParses: vi.fn(),
  downloadedKeys: vi.fn(),
  parseRecords: vi.fn(),
  recordParse: vi.fn(),
  removeParse: vi.fn()
}))
vi.mock('../main/quitGuard', () => ({ quitConfirmed: vi.fn() }))
vi.mock('../main/settings', () => ({ getSettings: vi.fn(), updateSettings: vi.fn() }))
vi.mock('../main/windows', () => ({ getMainWindow: vi.fn(), hideMainWindow: vi.fn(), send: vi.fn() }))

await import('./index')
// 用例之间 mock 的调用记录会被清空，这里在加载完立刻记下
const exposeCalls = h.expose.mock.calls.length
const [[exposedAs, exposed]] = h.expose.mock.calls
const api = exposed as BiliApi

type Fn = (...args: unknown[]) => unknown

/** api 里的所有函数，键是 “auth.check” 这样的路径 */
function functions(obj: object, prefix = ''): [string, Fn][] {
  return Object.entries(obj).flatMap(([k, v]): [string, Fn][] =>
    typeof v === 'function'
      ? [[`${prefix}${k}`, v as Fn]]
      : // platform 这样的普通值不走 IPC
        typeof v === 'object'
        ? functions(v as object, `${prefix}${k}.`)
        : []
  )
}

beforeEach(() => {
  h.invoke.mockReset()
  h.on.mockReset()
  h.removeListener.mockReset()
  h.invoke.mockResolvedValue({ ok: true, data: undefined })
})

describe('preload', () => {
  it('以 window.api 暴露给渲染进程', () => {
    expect(exposeCalls).toBe(1)
    expect(exposedAs).toBe('api')
  })

  it('把当前系统告诉渲染进程', () => {
    expect(api.platform).toBe(process.platform)
  })

  it('invoke 解开 { ok, data }', async () => {
    const state = { loggedIn: false, expired: true }
    h.invoke.mockResolvedValue({ ok: true, data: state })
    expect(await api.auth.check()).toBe(state)
    expect(h.invoke.mock.calls).toEqual([['auth:check']])
  })

  it('{ ok: false } 时重新抛出同样消息的 Error', async () => {
    h.invoke.mockResolvedValue({ ok: false, error: '没有识别出 B站链接' })
    const err = await api.parse('abc').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('没有识别出 B站链接')
    expect(h.invoke.mock.calls).toEqual([['parse', 'abc']])
  })

  const SOURCE: PagedSource = { type: 'fav', mediaId: 1 }
  it.each([
    { channel: 'dl:remove', call: () => api.download.remove(['a', 'b'], true), args: [['a', 'b'], true] },
    { channel: 'subs:update', call: () => api.subs.update('s1', { enabled: false }), args: ['s1', { enabled: false }] },
    { channel: 'app:close', call: () => api.app.close('quit', false), args: ['quit', false] },
    { channel: 'parseMore', call: () => api.parseMore(SOURCE, 2), args: [SOURCE, 2] }
  ])('$channel 多个参数原样透传', async ({ channel, call, args }) => {
    await call()
    expect(h.invoke.mock.calls).toEqual([[channel, ...args]])
  })

  it('on 订阅时去掉 event 参数，退订时移除同一个 listener', () => {
    const cb = vi.fn()
    const off = api.download.onUpdate(cb)
    const [[channel, listener]] = h.on.mock.calls
    expect(channel).toBe('dl:update')
    listener({ sender: {} }, 'a', 2)
    expect(cb.mock.calls).toEqual([['a', 2]])

    off()
    expect(h.removeListener.mock.calls).toEqual([['dl:update', listener]])
  })

  it('preload 调用的频道和主进程注册的频道完全一致', async () => {
    const invoked = new Set<string>()
    const events = new Set<string>()
    let invokers = 0
    for (const [path, fn] of functions(api)) {
      h.invoke.mockClear()
      h.on.mockClear()
      if (/^on[A-Z]/.test(path.split('.').pop()!)) {
        const off = fn(() => {}) as () => void
        expect(h.on, path).toHaveBeenCalledOnce()
        events.add(h.on.mock.calls[0][0])
        off()
      } else {
        await fn()
        expect(h.invoke, path).toHaveBeenCalledOnce()
        invoked.add(h.invoke.mock.calls[0][0])
        invokers++
      }
    }

    const { registerIpc } = await import('../main/ipc')
    registerIpc({ manager: {}, subs: {}, mcp: {}, updater: {}, enqueue: vi.fn() } as unknown as IpcDeps)

    expect([...invoked].sort()).toEqual([...h.registered].sort())
    expect(invoked.size).toBe(57)
    // 每个 api 函数各用一个频道，主进程也没有重复注册
    expect(invokers).toBe(invoked.size)
    expect(new Set(h.registered).size).toBe(h.registered.length)
    expect([...events].sort()).toEqual([
      'app:closeRequested',
      'auth:changed',
      'auth:required',
      'dl:update',
      'parse:progress',
      'subs:update',
      'update:prompt',
      'update:state'
    ])
  })
})
